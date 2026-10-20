#!/usr/bin/env node
// claude-bridge MCP server. Claude Code starts it over stdio; it starts the bridge hub on
// localhost:3571 so the Figma plugin can connect — no separate server to run.
// A second Claude Code session finds the port taken and relays its commands to the first
// session's hub over HTTP; if that hub goes away, the next call takes the port over.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import hubModule from './hub.js';

const { createHub } = hubModule;
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const NOTES_DIR = join(REPO, '.figma-projects');
const REFERENCE = join(HERE, 'reference.md');
const PLUGIN_WAIT_MS = 4000;   // a plugin that was just opened reconnects within 3 s
const MAX_REPLY_CHARS = 60000; // larger results go to a file — Claude Code would truncate them
const SPILL_DIR = join(tmpdir(), 'claude-bridge');

const log = (...a) => console.error('[claude-bridge]', ...a);

// This Claude Code session. Named after its project folder until figma_session renames it;
// the hub keeps a separate queue per session and tells each who else works in a file.
const SESSION = { id: randomUUID(), name: basename(process.cwd()) || 'Claude' };

// ---------- Transport: own the hub, or relay to the hub another session owns

const hub = createHub({ log });
let mode = (await hub.listen()) ? 'hub' : 'relay';
log(mode === 'hub' ? `hub listening on ${hub.host}:${hub.port}` : `port ${hub.port} taken — relaying to the running hub`);

const base = `http://${hub.host}:${hub.port}`;

async function takeOverIfFree() {
  if (mode === 'hub') return true;
  if (await hub.listen()) {
    mode = 'hub';
    log('previous hub is gone — took over the port');
    return true;
  }
  return false;
}

async function relay(command, { file, timeoutMs, saveTo }) {
  const body = JSON.stringify({ ...command, file, timeoutMs, saveTo });
  const headers = {
    'Content-Type': 'application/json',
    'X-Bridge-Session-Id': SESSION.id,
    'X-Bridge-Session-Name': encodeURIComponent(SESSION.name),
  };
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/command`, { method: 'POST', headers, body });
    } catch (e) {
      if (attempt === 0 && (await takeOverIfFree())) return run(command, { file, timeoutMs, saveTo });
      throw new Error(`Bridge hub unreachable: ${e.cause?.code ?? e.message}`);
    }
    const data = await res.json().catch(() => ({ error: `Bad response from hub (HTTP ${res.status})` }));
    // Plugin not connected yet: it may have just been opened — give it one reconnect cycle.
    if (res.status === 503 && attempt === 0) {
      await new Promise(r => setTimeout(r, PLUGIN_WAIT_MS));
      continue;
    }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    const name = res.headers.get('x-figma-file');
    let others = [];
    try { others = JSON.parse(decodeURIComponent(res.headers.get('x-figma-others') || '%5B%5D')); } catch { /* older hub */ }
    return { result: data, file: { file: name ? decodeURIComponent(name) : null, id: res.headers.get('x-figma-file-id') }, others };
  }
}

async function run(command, opts = {}) {
  if (mode === 'relay') return relay(command, opts);
  // nothing connected (or only an unpaired plugin): the hub's error says which, and names the code
  await hub.waitForPlugin(PLUGIN_WAIT_MS);
  return hub.send(command, { ...opts, session: SESSION });
}

async function files() {
  if (mode === 'hub') {
    await hub.waitForPlugin(PLUGIN_WAIT_MS);
    return hub.listFiles();
  }
  try {
    const res = await fetch(`${base}/files`);
    if (res.ok) return res.json();
    const status = await (await fetch(`${base}/status`)).json();   // an older standalone server
    return status.connected ? [{ file: '(unknown — older bridge server)', target: true }] : [];
  } catch {
    if (await takeOverIfFree()) return hub.listFiles();
    return [];
  }
}

// ---------- Results → MCP content: images become image blocks, binaries are dropped

function extractImages(value, images) {
  if (Array.isArray(value)) return value.map(v => extractImages(v, images));
  if (value && typeof value === 'object' && typeof value.base64 === 'string') {
    const { base64, ...rest } = value;
    if (/^image\/(png|jpeg)$/.test(value.mimeType)) {
      images.push({ type: 'image', data: base64, mimeType: value.mimeType });
      return { ...rest, image: `attached (#${images.length})` };
    }
    if (value.svg) return rest;   // export_node SVG: the markup is already in `svg`
    return { ...rest, base64: 'omitted — pass saveTo to write the file to disk' };
  }
  return value;
}

function reply({ result, file, others }) {
  const images = [];
  const clean = extractImages(result, images);
  let where = file?.file ? `File: "${file.file}" (${file.id})\n` : '';
  if (others && others.length) {
    where += `Shared: session ${others.map(n => `"${n}"`).join(', ')} also works in this file — view changes are skipped and creates need parentId; name this session after its task with figma_session.\n`;
  }
  const isError = !!(clean && !Array.isArray(clean) && typeof clean === 'object' && clean.error);
  let body = JSON.stringify(clean);
  if (body.length > MAX_REPLY_CHARS) body = spill(clean, body);
  return { content: [{ type: 'text', text: where + body }, ...images], isError };
}

// A result too big for the reply: write it whole to a file and answer with where it is,
// its size and a peek — nothing gets cut off silently. Read or grep the file for the rest.
function spill(value, json) {
  mkdirSync(SPILL_DIR, { recursive: true });
  const file = join(SPILL_DIR, `result-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(value, null, 1));
  const list = Array.isArray(value) ? value : Array.isArray(value?.nodes) ? value.nodes : null;
  return JSON.stringify({
    tooLargeForReply: true,
    savedTo: file,
    chars: json.length,
    ...(list ? { items: list.length, first: list.slice(0, 3) } : { keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 30) : undefined }),
    hint: 'Read or grep the file, or ask again with fields / types / summary / a smaller scope',
  });
}

function failure(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

const call = (fn) => async (args) => {
  try {
    return reply(await fn(args));
  } catch (e) {
    return failure(e);
  }
};

// ---------- Reference: the action catalog and working rules live in reference.md

function reference(section) {
  const text = readFileSync(REFERENCE, 'utf8').replaceAll('{{NOTES_DIR}}', NOTES_DIR);
  if (!section || section === 'all') return text;
  const marker = '<!-- rules -->';
  const [actions, rules] = text.split(marker);
  return section === 'actions' ? actions : rules ?? '';
}

const INSTRUCTIONS = `Claude Bridge controls the Figma files the designer has open: the Claude Bridge plugin runs in each file and this server talks to it. Use these tools for every Figma task — reading, building, editing, auditing. Prefer them over the official Figma MCP (use_figma etc.): the designer watches the canvas live and can undo each call.

Before the first Figma task in a session, call figma_reference once: it lists every action with its parameters and the design / workflow rules to follow (responsive auto-layout, tokens, batching, component conventions, canvas layout).

Essentials:
- figma runs one action ({ action, params }); figma_batch runs many in one undo step — use it whenever you make more than one change. A batch command can use an earlier result with { "$ref": "<index-or-label>.<path>" } and tag itself with "as": "<label>", so a whole screen is one batch.
- figma_screenshot returns the image directly — take one at the end to verify, not after every step.
- Keep reads small: get_layout / find_nodes / get_tree take fields (only those keys), get_layout deep takes types (only those node types) and summary: true (statistics instead of nodes — the right start for auditing a big frame). saveTo writes any result to a JSON file to process with a script; results too big for a reply are saved to a file automatically and you get its path.
- Several open files: commands go to the file the designer is looking at (its tab came to the front last) or used last (selection, page change, click on the plugin window); every result names the file it ran in. Pass "file" (a name or "#id" from figma_files) when the designer names one, and check figma_files when unsure. If the server says the target is ambiguous, ask which file.
- End by calling scroll_to_node on the result so the designer sees it (unless the file is shared — see below).
- Several sessions: each Claude session has its own queue per file and the plugin runs one command from each in turn, so batches never mix. When a result says the file is shared, call figma_session to name this session after its task, keep off the designer's view (no scroll_to_node / switch_page / set_selection — the bridge skips them), give every create a parentId (the bridge refuses creates without one) and pass pageId / scopeId to reads instead of relying on the current page. The undo history is shared.
- Per-project design notes live in ${NOTES_DIR}/<fileKey>/design.md — read the file's notes before working in it (figma_reference explains how to find the key).`;

// ---------- Tools

const server = new McpServer({ name: 'claude-bridge', version: '1.0.0' }, { instructions: INSTRUCTIONS });

const fileArg = z.string().optional().describe('Target Figma file: its name (or part of it) or "#id" from figma_files. Omit to use the file the designer is looking at / used last.');
const timeoutArg = z.number().optional().describe('Milliseconds to wait for Figma (default 60000, max 600000).');

server.registerTool('figma', {
  title: 'Run a Figma action',
  description: 'Run one Claude Bridge action in an open Figma file — e.g. { action: "get_selection" } or { action: "set_fill", params: { nodeId: "1:2", color: "#3366FF" } }. Every action and its params are listed by figma_reference. For several changes use figma_batch.',
  inputSchema: {
    action: z.string().describe('Action name, e.g. get_selection, create_frame, set_layout, apply_variable'),
    params: z.record(z.string(), z.any()).optional().describe('The action\'s parameters'),
    file: fileArg,
    saveTo: z.string().optional().describe('Absolute path: write the result to this file instead of returning it — images / PDFs as the binary file, anything else as JSON (for big reads you process with a script)'),
    timeoutMs: timeoutArg,
  },
}, call(({ action, params = {}, file, saveTo, timeoutMs }) => run({ ...params, action }, { file, saveTo, timeoutMs })));

server.registerTool('figma_batch', {
  title: 'Run several Figma actions',
  description: 'Run several actions in one round trip and one undo step. Each command is { action, ...params }, optionally "as": "<label>"; later commands can reference earlier results with { "$ref": "<index-or-label>.<path>" } (e.g. { "$ref": "card.id" }). Failed commands return { error } in place; the rest still run.',
  inputSchema: {
    commands: z.array(z.record(z.string(), z.any())).min(1).describe('Commands: [{ action, ...params, as? }]'),
    file: fileArg,
    saveTo: z.string().optional().describe('Absolute path: write the results array to this JSON file instead of returning it'),
    timeoutMs: timeoutArg,
  },
}, call(({ commands, file, saveTo, timeoutMs }) => run({ action: 'batch', commands }, { file, saveTo, timeoutMs })));

server.registerTool('figma_screenshot', {
  title: 'Screenshot a Figma node',
  description: 'PNG of a node, returned as an image. Without nodeId: the first selected layer.',
  inputSchema: {
    nodeId: z.string().optional().describe('Node to capture; default: the current selection'),
    scale: z.number().optional().describe('Export scale (default 1; use 0.5 for large screens)'),
    file: fileArg,
  },
}, call(async ({ nodeId, scale, file }) => {
  let id = nodeId;
  if (!id) {
    const sel = await run({ action: 'get_selection' }, { file });
    id = Array.isArray(sel.result) && sel.result[0] ? sel.result[0].id : null;
    if (!id) throw new Error('Nothing is selected — pass nodeId');
  }
  return run({ action: 'get_screenshot', nodeId: id, scale: scale ?? 1 }, { file });
}));

server.registerTool('figma_files', {
  title: 'List open Figma files',
  description: 'Figma files with the Claude Bridge plugin open: name, "#id", current page, which one receives commands that name no file (target: true), the sessions working in each, and how many commands are queued.',
  inputSchema: {},
}, async () => {
  try {
    const list = await files();
    const text = list.length ? JSON.stringify(list) : 'No Figma file is connected — open the Claude Bridge plugin in Figma.';
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return failure(e);
  }
});

server.registerTool('figma_session', {
  title: 'Name this session',
  description: 'Set the name other sessions and the plugin window see for this Claude session (default: the project folder). Use the task, e.g. "Layout analysis" or "Design system", when another session works in the same file.',
  inputSchema: {
    name: z.string().min(1).max(40).describe('Short name for this session'),
  },
}, async ({ name }) => {
  SESSION.name = name.trim();
  return { content: [{ type: 'text', text: `This session is now "${SESSION.name}". The hub numbers it if another live session already uses the name.` }] };
});

server.registerTool('figma_reference', {
  title: 'Claude Bridge reference',
  description: 'Every action with its parameters, plus the design and workflow rules for building in Figma. Read it once per session before the first Figma task.',
  inputSchema: {
    section: z.enum(['all', 'actions', 'rules']).optional().describe('"actions" — the action catalog, "rules" — design / workflow rules; default all'),
  },
}, async ({ section }) => ({ content: [{ type: 'text', text: reference(section) }] }));

await server.connect(new StdioServerTransport());

// Leave cleanly: tell a hub we relay to that this session is gone (so other sessions stop
// seeing the file as shared), then close our own hub if we own one.
let leaving = false;
const shutdown = async () => {
  if (leaving) return;
  leaving = true;
  if (mode === 'relay') {
    try {
      await fetch(`${base}/session/end`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session-Id': SESSION.id }, signal: AbortSignal.timeout(1000) });
    } catch { /* hub already gone */ }
  }
  hub.close();
  process.exit(0);
};
process.stdin.on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
