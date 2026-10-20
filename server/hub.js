// The bridge hub: owns the local port, keeps a WebSocket to every open Claude Bridge
// plugin (one per Figma file), and routes each command to the right file.
// Used by server.js (standalone, for curl) and mcp.mjs (started by Claude Code).
//
// Routing: a command names a file (`file`: name or "#id"), or goes to the file the
// designer used last — plugins report their tab coming to the front, selection / page
// changes, and clicks on the plugin window. With several files open and none used yet,
// the command is refused with the list of files, so nothing lands in the wrong one.
//
// Sessions: every caller (a Claude Code session, or plain HTTP) has its own queue per
// file. Figma runs one command at a time, so the hub hands the plugin one command from
// each session in turn — a batch always runs whole, never interleaved with another
// session's. While another session has worked in the same file in the last
// SESSION_WINDOW, commands that would move the designer's view are skipped and creates
// without parentId are refused (they would land on whatever page the designer is on).
//
// Security: the port is on loopback, but a web page open in a browser on this machine can
// still reach it. So HTTP takes no browser requests at all (anything with an Origin
// header — curl, scripts and the MCP relay send none), POST bodies must be JSON (a page
// can't send that without a preflight the hub never answers), and the Host header must
// name the loopback address, against DNS rebinding. The plugin's WebSocket comes from a
// sandboxed iframe (Origin 'null'), which any page can fake, so a plugin is trusted only
// once it presents the pairing key: typed in its window once, from the hub's error that
// names it, then kept by the plugin (see pairing.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { createPairing } = require('./pairing.js');

const PORT = 3571;
const HOST = '127.0.0.1';              // loopback only — not reachable from the LAN
const MAX_BODY = 50 * 1024 * 1024;     // 50 MB — base64 image fills can be large
const DEFAULT_TIMEOUT = 60000;         // ms; override per request with "timeoutMs"
const MAX_TIMEOUT = 10 * 60 * 1000;
const SESSION_WINDOW = 2 * 60 * 1000;  // a session counts as working in a file this long after its last command

// Change the designer's page, selection or viewport — held back while the file is shared.
const VIEW_ACTIONS = new Set(['scroll_to_node', 'switch_page', 'set_selection']);
// Without parentId these create on the designer's current page.
const CREATE_ACTIONS = new Set([
  'create_frame', 'create_rectangle', 'create_ellipse', 'create_line', 'create_text', 'create_component',
  'create_instance', 'create_section', 'create_svg', 'create_polygon', 'create_star', 'create_vector',
]);

const hasParent = (c) => c.parentId !== undefined && c.parentId !== null && c.parentId !== '';

// Swap held-back commands for `noop` (keeps batch indices and "as" labels for $ref).
function guardShared(command, others) {
  const who = others.map(n => `"${n}"`).join(', ');
  const fix = (c) => {
    if (!c || typeof c !== 'object') return c;
    if (VIEW_ACTIONS.has(c.action)) {
      return { action: 'noop', as: c.as, result: { skipped: true, reason: `${c.action} skipped: session ${who} also works in this file, so the designer's view stays put` } };
    }
    const placesInstance = c.action === 'import_component' && c.instance;
    if ((CREATE_ACTIONS.has(c.action) || placesInstance) && !hasParent(c)) {
      return { action: 'noop', as: c.as, result: { error: `${c.action} needs parentId while session ${who} also works in this file — pass a page or frame id` } };
    }
    return c;
  };
  if (command.action === 'batch' && Array.isArray(command.commands)) return { ...command, commands: command.commands.map(fix) };
  return fix(command);
}

// The plugin UI runs in a sandboxed iframe: Origin 'null', or a figma.com origin. Any page
// can make a 'null' origin, which is why plugins also have to pair.
function isAllowedWsOrigin(origin) {
  if (!origin || origin === 'null') return true;
  try {
    return new URL(origin).protocol === 'https:' && /(^|\.)figma\.com$/i.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

// `saveTo`: write the result to disk and answer with the path instead of the payload.
// A base64 result (export_node, get_image, get_screenshot) is written as the binary file;
// anything else as JSON — for big reads to process with a script instead of in context.
function saveResult(result, saveTo) {
  if (!saveTo || result === undefined) return result;
  try {
    const file = path.resolve(saveTo);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (result && typeof result.base64 === 'string') {
      fs.writeFileSync(file, Buffer.from(result.base64, 'base64'));
      const { base64, svg, ...rest } = result;
      return { ...rest, savedTo: file };
    }
    if (result && result.error && !Array.isArray(result)) return result;   // keep errors visible
    const json = JSON.stringify(result, null, 1);
    fs.writeFileSync(file, json);
    const items = Array.isArray(result) ? result.length : Array.isArray(result?.nodes) ? result.nodes.length : undefined;
    return { savedTo: file, bytes: Buffer.byteLength(json), ...(items !== undefined ? { items } : {}) };
  } catch (e) {
    return { ...(result && typeof result === 'object' && !Array.isArray(result) ? result : { result }), saveError: e.message };
  }
}

function createHub({ port = PORT, host = HOST, log = (...a) => console.error(...a), pairing = createPairing() } = {}) {
  const clients = new Map();   // id → { id, ws, fileName, pageName, visible, connectedAt, lastActive, queues, turn, busy } — paired plugins only
  const unpaired = new Set();  // plugins connected but not paired yet: they get no commands
  // DNS rebinding: a page on evil.example resolved to 127.0.0.1 sends Host: evil.example
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const isLocalHost = (h) => hosts.has(String(h || '').toLowerCase());
  const pending = new Map();   // command id → { resolve, reject, timer, clientId }
  const sessions = new Map();  // session id → { id, name, requested, seen: Map<clientId, ms> }
  let nextClient = 0;
  let nextCommand = 0;

  // A caller's session: Claude Code sessions send { id, name }; plain HTTP is one shared "HTTP".
  function sessionFor(info) {
    const id = info && info.id ? String(info.id) : 'http';
    const requested = (info && info.name ? String(info.name) : id === 'http' ? 'HTTP' : 'Claude').slice(0, 40);
    let s = sessions.get(id);
    if (!s) {
      s = { id, name: null, requested: null, seen: new Map() };
      sessions.set(id, s);
    }
    if (s.requested !== requested) {
      s.requested = requested;
      s.name = uniqueName(requested, s);
    }
    return s;
  }

  // Two sessions opened in the same folder both default to its name: number the second.
  function uniqueName(base, self) {
    const taken = new Set([...sessions.values()].filter(o => o !== self && o.name).map(o => o.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  // Sessions other than `self` that ran a command in this file within SESSION_WINDOW.
  function othersIn(client, self) {
    const now = Date.now();
    return [...sessions.values()]
      .filter(o => o !== self && now - (o.seen.get(client.id) ?? 0) < SESSION_WINDOW)
      .map(o => o.name);
  }

  function endSession(id) {
    if (id && id !== 'http') sessions.delete(String(id));
  }

  const queuedIn = (client) => [...client.queues.values()].reduce((n, q) => n + q.length, 0);

  const describe = (c) => ({
    id: `#${c.id}`,
    file: c.fileName ?? '(unknown file)',
    page: c.pageName ?? null,
    visible: c.visible ?? null,
    lastActive: c.lastActive ? new Date(c.lastActive).toISOString() : null,
  });

  function listFiles() {
    const target = defaultTarget();
    return [...clients.values()].map(c => ({
      ...describe(c),
      target: c === target,
      sessions: othersIn(c, null),
      queued: queuedIn(c) + (c.busy ? 1 : 0),
    }));
  }

  // The file a command without `file` goes to, or null when that would be a guess.
  function defaultTarget() {
    const all = [...clients.values()];
    if (all.length === 1) return all[0];
    const touched = all.filter(c => c.lastActive).sort((a, b) => b.lastActive - a.lastActive);
    return touched[0] ?? null;
  }

  function pick(file) {
    const all = [...clients.values()];
    if (!all.length && unpaired.size) {
      throw new Error(`The Claude Bridge plugin is open but not paired with this computer yet — ask the designer to type the code ${pairing.code} in the plugin window`);
    }
    if (!all.length) throw new Error('Figma plugin not connected — open the Claude Bridge plugin in the Figma file (Plugins → Development → Claude Bridge)');
    const names = () => all.map(c => `"${c.fileName ?? 'unknown'}" (#${c.id})`).join(', ');
    if (file !== undefined && file !== null && file !== '') {
      const ref = String(file).trim();
      const byId = ref.match(/^#?(\d+)$/);
      if (byId && clients.has(Number(byId[1]))) return clients.get(Number(byId[1]));
      const exact = all.filter(c => c.fileName === ref);
      const loose = exact.length ? exact : all.filter(c => (c.fileName ?? '').toLowerCase().includes(ref.toLowerCase()));
      if (loose.length === 1) return loose[0];
      if (!loose.length) throw new Error(`No open Figma file matches "${ref}". Open: ${names()}`);
      throw new Error(`Several open files match "${ref}": ${loose.map(c => `"${c.fileName}" (#${c.id})`).join(', ')} — pass the #id`);
    }
    const target = defaultTarget();
    if (!target) throw new Error(`Several Figma files are open and none was used yet: ${names()}. Pass "file", or click into the file you mean`);
    return target;
  }

  // Tell every plugin whether it is the current default target, so its window can say so.
  function broadcastTargets() {
    const target = defaultTarget();
    for (const c of clients.values()) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      // Control messages carry `__bridge`, never `type`: commands have their own `type`
      // params (find_nodes, create_variable…) and must not be mistaken for control messages.
      c.ws.send(JSON.stringify({ __bridge: 'target', active: c === target, files: clients.size, targetFile: target ? target.fileName : null }));
    }
  }

  // Run one command in a file. Resolves { result, file, others } — `others` are the other
  // sessions working in that file. `session` is { id, name }; `cancel.cancelled` drops a
  // command still waiting in the queue (its caller went away).
  function send(command, { file, timeoutMs, saveTo, session, cancel } = {}) {
    let client;
    try {
      client = pick(file);
    } catch (e) {
      return Promise.reject(e);   // never throw synchronously: the HTTP handler chains .then
    }
    if (client.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Figma file "${client.fileName}" is disconnecting — try again in a moment`));
    }
    const s = sessionFor(session);
    return new Promise((resolve, reject) => {
      if (!client.queues.has(s.id)) client.queues.set(s.id, []);
      client.queues.get(s.id).push({ command, timeoutMs, saveTo, session: s, cancel, resolve, reject });
      pump(client);
    });
  }

  // Start the next command in this file: sessions take turns, one command each.
  function pump(client) {
    if (client.busy) return;
    const ids = [...client.queues.keys()];
    if (!ids.length) return notifyQueue(client);
    const start = Math.max(0, ids.indexOf(client.turn) + 1) % ids.length;
    for (let i = 0; i < ids.length; i++) {
      const sid = ids[(start + i) % ids.length];
      const queue = client.queues.get(sid);
      const job = queue.shift();
      if (!queue.length) client.queues.delete(sid);
      if (!job) continue;
      client.turn = sid;
      if (job.cancel && job.cancel.cancelled) return pump(client);
      return dispatch(client, job);
    }
    notifyQueue(client);
  }

  function dispatch(client, job) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      job.reject(new Error(`Figma file "${client.fileName}" closed before answering`));
      return pump(client);
    }
    client.busy = true;
    const s = job.session;
    const others = othersIn(client, s);
    s.seen.set(client.id, Date.now());
    const command = others.length ? guardShared(job.command, others) : job.command;
    const id = ++nextCommand;
    const limit = Math.min(Number(job.timeoutMs) || DEFAULT_TIMEOUT, MAX_TIMEOUT);
    const finish = () => {
      client.busy = false;
      pump(client);
    };
    const timer = setTimeout(() => {
      pending.delete(id);
      job.reject(new Error(`Timeout — no response from Figma after ${limit} ms (the plugin may still be running it)`));
      finish();
    }, limit);
    pending.set(id, {
      clientId: client.id,
      timer,
      resolve: (result) => {
        job.resolve({ result: saveResult(result, job.saveTo), file: describe(client), others });
        finish();
      },
      reject: job.reject,
    });
    notifyQueue(client);
    client.ws.send(JSON.stringify({ ...command, id, _session: s.name, _timeoutMs: limit }));
  }

  // The plugin window shows how many commands wait in this file (the running one included).
  function notifyQueue(client) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    client.ws.send(JSON.stringify({ __bridge: 'queue', length: queuedIn(client) + (client.busy ? 1 : 0) }));
  }

  function onPluginMessage(client, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!client.paired) return onPairingMessage(client, msg);
    if (msg.type === 'hello') {
      client.fileName = msg.fileName ?? client.fileName;
      client.pageName = msg.pageName ?? client.pageName;
      log(`✓ Figma file connected: "${client.fileName}" (#${client.id})`);
      broadcastTargets();
      return;
    }
    if (msg.type === 'visibility') {
      client.visible = !!msg.visible;
      if (msg.visible) client.lastActive = Date.now();   // its tab was brought to the front
      if (msg.pageName) client.pageName = msg.pageName;
      broadcastTargets();
      return;
    }
    if (msg.type === 'progress') {
      if (process.env.BRIDGE_DEBUG) log(`[debug] "${client.fileName}" batch step ${msg.step}: ${msg.action}`);
      return;
    }
    if (msg.type === 'activity') {
      client.lastActive = Date.now();
      if (msg.pageName) client.pageName = msg.pageName;
      if (msg.fileName) client.fileName = msg.fileName;
      broadcastTargets();
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    entry.resolve(msg.result);
  }

  // Until it pairs, a plugin may only present a key; it's told whether that worked, and
  // with the right key it joins the files that get commands.
  function onPairingMessage(client, msg) {
    if (msg.type === 'hello' || msg.type === 'activity' || msg.type === 'visibility') {
      client.fileName = msg.fileName ?? client.fileName;   // for the log line below
      return;
    }
    if (msg.type !== 'auth') return;
    const verdict = pairing.check(msg.key);
    if (verdict !== 'ok') {
      if (verdict === 'wrong' && msg.typed) log(`✗ Wrong pairing code typed in "${client.fileName ?? 'a Figma file'}"`);
      client.ws.send(JSON.stringify({ __bridge: 'auth', ok: false, reason: verdict }));
      return;
    }
    client.paired = true;
    unpaired.delete(client);
    clients.set(client.id, client);
    client.ws.send(JSON.stringify({ __bridge: 'auth', ok: true, key: pairing.key }));
    log(`✓ Figma file paired: "${client.fileName ?? 'unknown'}" (#${client.id})`);
    broadcastTargets();
  }

  function onPluginClose(client) {
    unpaired.delete(client);
    if (!client.paired) return;
    clients.delete(client.id);
    for (const queue of client.queues.values()) {
      for (const job of queue) job.reject(new Error(`Figma file "${client.fileName}" closed before running the command`));
    }
    client.queues.clear();
    for (const s of sessions.values()) s.seen.delete(client.id);
    for (const [id, entry] of pending) {
      if (entry.clientId !== client.id) continue;
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(new Error(`Figma file "${client.fileName}" closed before answering`));
    }
    log(`✗ Figma file disconnected: "${client.fileName ?? 'unknown'}" (#${client.id})`);
    broadcastTargets();
  }

  function readBody(req, res, cb) {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        aborted = true;
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => { if (!aborted) cb(body); });
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const refuse = (code, error) => {
      res.writeHead(code);
      res.end(JSON.stringify({ error }));
    };
    if (!isLocalHost(req.headers.host)) return refuse(403, 'Forbidden host');
    // browsers always send Origin on cross-site requests; curl, scripts and the MCP relay never do
    if (req.headers.origin !== undefined) return refuse(403, 'Forbidden origin');
    if (req.method === 'POST' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      return refuse(415, 'Content-Type must be application/json');
    }

    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify({ connected: clients.size > 0, files: listFiles() }));
      return;
    }

    // A Claude session that exits says so, so other sessions stop treating files as shared.
    if (req.method === 'POST' && req.url === '/session/end') {
      endSession(req.headers['x-bridge-session-id']);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === 'GET' && req.url === '/files') {
      res.writeHead(200);
      res.end(JSON.stringify(listFiles()));
      return;
    }

    if (req.method === 'POST' && req.url === '/command') {
      readBody(req, res, (body) => {
        let command;
        try {
          command = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        // Routing / transport fields stay here; the rest goes to the plugin.
        const { file, timeoutMs, saveTo, ...rest } = command;
        const decode = (v) => { try { return v ? decodeURIComponent(v) : undefined; } catch { return undefined; } };
        const session = { id: req.headers['x-bridge-session-id'], name: decode(req.headers['x-bridge-session-name']) };
        const cancel = { cancelled: false };
        let closed = false;
        res.on('close', () => { closed = true; cancel.cancelled = true; });
        send(rest, { file, timeoutMs, saveTo, session, cancel }).then(
          ({ result, file: target, others }) => {
            if (closed || res.writableEnded) return;
            res.setHeader('X-Figma-File', encodeURIComponent(target.file));
            res.setHeader('X-Figma-File-Id', target.id);
            res.setHeader('X-Figma-Others', encodeURIComponent(JSON.stringify(others)));
            res.writeHead(200);
            res.end(JSON.stringify(result));
          },
          (err) => {
            if (closed || res.writableEnded) return;
            const notConnected = /not connected/.test(err.message);
            res.writeHead(/Timeout/.test(err.message) ? 504 : notConnected ? 503 : 409);
            res.end(JSON.stringify({ error: err.message }));
          },
        );
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = new WebSocket.Server({
    server,
    verifyClient: ({ origin, req }, done) => {
      if (!isLocalHost(req.headers.host)) return done(false, 403, 'Forbidden host');
      if (unpaired.size >= 16) return done(false, 429, 'Too many unpaired connections');
      if (isAllowedWsOrigin(origin)) return done(true);
      log('✗ Rejected WebSocket from origin:', origin);
      done(false, 403, 'Forbidden origin');
    },
  });

  // ws re-emits the HTTP server's errors here; EADDRINUSE is already handled by listen(),
  // and an unhandled 'error' would crash the process.
  wss.on('error', (err) => { if (err.code !== 'EADDRINUSE') log('WebSocket server error:', err.message); });

  wss.on('connection', (ws) => {
    const client = {
      id: ++nextClient, ws, fileName: null, pageName: null, visible: null, connectedAt: Date.now(), lastActive: null,
      queues: new Map(), turn: null, busy: false, paired: false,
    };
    unpaired.add(client);
    ws.on('message', (data) => onPluginMessage(client, data));
    ws.on('close', () => onPluginClose(client));   // it presents its key first (or is asked to pair)
  });

  // Resolves true once listening, false when another hub already owns the port.
  function listen() {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE') resolve(false);
        else reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(true);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  // Wait up to `ms` for at least one plugin (they reconnect every 3 s).
  function waitForPlugin(ms) {
    if (clients.size) return Promise.resolve(true);
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (clients.size || Date.now() - started >= ms) {
          clearInterval(poll);
          resolve(clients.size > 0);
        }
      }, 100);
    });
  }

  function close() {
    for (const c of [...clients.values(), ...unpaired]) c.ws.close();
    wss.close();
    server.close();
  }

  return { listen, send, listFiles, waitForPlugin, endSession, close, port, host, pairingCode: pairing.code };
}

module.exports = { createHub, PORT, HOST };
