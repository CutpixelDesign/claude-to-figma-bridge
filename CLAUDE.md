# Claude Bridge

This repo is Claude Bridge itself: a Figma plugin plus a local hub / MCP server that lets Claude control the Figma files the designer has open.

## Controlling Figma

Use the `claude-bridge` MCP tools — `figma`, `figma_batch`, `figma_screenshot`, `figma_files`, `figma_reference`. **Do not use the official Figma MCP (`use_figma` etc.)**: the designer works with the canvas open and watches every change; each bridge call is one undo step.

Before the first Figma task in a session, call `figma_reference`: it is the full action catalog plus the design and workflow rules (responsive auto-layout, tokens, batching, components, canvas layout, per-project `design.md`). Its source is `server/reference.md` — the single place those rules live.

If the MCP tools are missing (server not registered in this session), fall back to HTTP: check `curl -s http://localhost:3571/status`, start `node server/server.js &` if nothing answers, then `curl -s -X POST http://localhost:3571/command -H "Content-Type: application/json" -d '{"action": "…", …}'` (the body also takes `file`, `timeoutMs`, `saveTo`), and read `server/reference.md` directly.

## Project layout

- `src/code.js` — plugin entry: runs commands strictly one at a time, dispatches each to a handler, one undo step per command, reports the file name and the designer's activity (selection / page changes) to the UI, which adds tab visibility and clicks on the window.
- `src/handlers/*.js` — actions grouped by category; `src/lib/helpers.js`, `src/lib/layout.js` — shared helpers.
- `src/ui/App.svelte` — the plugin window (192×130 status card). Preview any state without a server: `ui.html?state=connected|processing|standby|unchosen|failed|disconnected|connecting`.
- `server/hub.js` — owns `localhost:3571`, keeps one WebSocket per open Figma file, routes each command (named `file`, or the file whose tab is in front / was used last; refuses when that would be a guess), keeps a queue per session per file and runs sessions' commands in turn, holds back view changes and parentless creates while a file is shared, serves `POST /command`, `POST /session/end`, `GET /status`, `GET /files`.
- `server/mcp.mjs` — the MCP server Claude Code starts (registered at user scope: `claude mcp add --scope user claude-bridge -- node <repo>/server/mcp.mjs`). Owns the hub, or relays to the hub of another session and takes the port over when that one exits. Each process is one session (id + name, renamed with `figma_session`).
- `server/server.js` — standalone hub for curl / scripts.
- `server/pairing.js` — the pairing key (`~/.claude-bridge/pairing-key`): a plugin gets commands only after it shows it. HTTP refuses browser requests (any `Origin`), non-JSON POSTs and foreign `Host` headers — see README → Security. Keep it that way.
- `server/reference.md` — what `figma_reference` returns. `<!-- rules -->` splits the action catalog from the working rules; `{{NOTES_DIR}}` becomes this repo's `.figma-projects`.
- `.figma-projects/{fileKey}/design.md` — private per-file design notes (git-ignored).

## Development

- `npm run build` builds `code.js` (esbuild) and `ui.html` (vite); both are committed. Figma reloads the development plugin on rebuild; window size and manifest changes need the plugin re-run.
- After changing `server/`, the running MCP server keeps the old code until the Claude Code session restarts (or the server is reconnected).
- Every action and every parameter a handler reads must be documented in `server/reference.md`.
- Errors Figma throws can be plain strings — use `errorMessage(e)` from helpers, never `e.message`.
- `figma.util.solidPaint` ignores overrides such as `opacity` — use `solidPaint` / `normalizePaint` from helpers. Text `fills` can be `figma.mixed`: check `Array.isArray` before iterating.
- Load fonts with `loadFont` from helpers, never `figma.loadFontAsync` directly: repeat loads of an already-loaded font can hang forever (it froze long text batches); `loadFont` loads each font once per plugin session.
- Hub → plugin control messages carry `__bridge` (`target`, `queue`), never `type` — commands have their own `type` params (`find_nodes`, `create_variable`…), and a `type` check once silently dropped them.
- `src/code.js` runs one command at a time with a watchdog (the caller's `timeoutMs` minus 1.5 s): a Figma call that never settles fails the command with its batch step instead of blocking the plugin. Debug slow batches with `BRIDGE_DEBUG=1 node server/server.js` — the hub logs every batch step as it starts. Batches yield to the event loop every ~50 ms so the watchdog can fire even when no step waits on Figma.
- Rebuilding reloads the plugins in Figma; wait until they reconnect (`GET /files`) before sending commands, or the first one is lost.
- Test changes live in Figma on `Test Page` and delete what the test created.
