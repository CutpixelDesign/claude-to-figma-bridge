// Claude Bridge — Figma plugin main thread.
// Receives commands from the UI (relayed over WebSocket from the local server),
// dispatches them to the matching handler, and posts the result back.
import { handlers } from './handlers/index.js';
import { errorMessage, runState } from './lib/helpers.js';

figma.showUI(__html__, { width: 192, height: 130 });

// Tell the bridge which file this is, and when the designer works in it — with several
// files open, commands that name no file go to the one used last.
const fileInfo = () => ({ fileName: figma.root.name, pageName: figma.currentPage.name });
figma.ui.postMessage({ type: 'hello', ...fileInfo() });
const reportActivity = () => figma.ui.postMessage({ type: 'activity', ...fileInfo() });
figma.on('selectionchange', reportActivity);
figma.on('currentpagechange', reportActivity);

// The pairing key (see server/pairing.js) lives in clientStorage: the UI iframe has no
// storage of its own. It's handed to the UI at start and saved when the hub accepts one.
const KEY = 'bridgePairingKey';
figma.clientStorage.getAsync(KEY).then(
  (key) => figma.ui.postMessage({ type: 'key', key: key ?? null }),
  () => figma.ui.postMessage({ type: 'key', key: null }),
);

async function dispatch(action, params) {
  const handler = handlers[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);
  return handler(params, dispatch);
}

// Commands run strictly one after another: async handlers would otherwise interleave
// their steps on the canvas when two arrive together (two Claude sessions, a timed-out
// command still running). Each command — and its undo step — stays whole.
let queue = Promise.resolve();
figma.ui.onmessage = (msg) => {
  if (msg && msg.__bridge === 'save-key') {
    figma.clientStorage.setAsync(KEY, msg.key).catch(() => {});
    return;
  }
  queue = queue.then(() => runCommand(msg));
};

// Watchdog: a Figma call that never settles would otherwise block the queue — and every
// later command — until the plugin restarts. Past the caller's timeout (minus a margin, so
// the answer beats the hub's own timeout) the command fails with where it was stuck, the
// queue moves on, and a batch stops before its next step if the stuck call returns later.
async function runCommand(msg) {
  const { id, action, _timeoutMs, ...params } = msg;
  const run = { action, step: null, stepAction: null, aborted: false, results: null };
  runState.current = run;
  const limit = Math.max(1000, (Number(_timeoutMs) || 60000) - 1500);
  let timer;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      run.aborted = true;
      const where = run.stepAction ? `batch step ${run.step} (${run.stepAction})` : action;
      reject(new Error(`Figma didn't finish ${where} within ${limit} ms — the plugin moved on; later batch steps were not run`));
    }, limit);
  });
  let result;
  try {
    result = await Promise.race([dispatch(action, params), watchdog]);
  } catch (e) {
    result = { error: errorMessage(e) };
    // A batch stopped by the watchdog: hand back what its finished steps returned (ids of
    // created nodes…) so the caller can continue or clean up without re-reading the canvas.
    if (run.aborted && run.results) result = { ...result, stoppedAtStep: run.step, completed: run.results.slice() };
  } finally {
    clearTimeout(timer);
    if (runState.current === run) runState.current = null;
  }
  // Plugin edits share one undo step until committed — without this a single
  // Cmd+Z in Figma would revert the whole session. One command (or batch) = one step.
  figma.commitUndo();
  // A result postMessage can't clone would otherwise be lost and surface as a timeout.
  // figma.mixed and other host values are retried as plain JSON (symbols → 'mixed').
  try {
    figma.ui.postMessage({ id, result });
  } catch (e) {
    try {
      const plain = JSON.parse(JSON.stringify(result ?? null, (k, v) => (typeof v === 'symbol' ? 'mixed' : v)));
      figma.ui.postMessage({ id, result: plain });
    } catch (e2) {
      figma.ui.postMessage({ id, result: { error: `Result could not be sent: ${errorMessage(e)}` } });
    }
  }
}
