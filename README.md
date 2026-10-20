# Claude Bridge

Figma plugin + local server that gives Claude direct, scripted control of your Figma file — read and edit designs through natural language.

## How it works

```
        Claude Code
            │  MCP (stdio) — tools: figma, figma_batch, figma_screenshot, …
            ▼
   claude-bridge MCP server  ── hub on localhost:3571 (started by Claude Code)
            │  WebSocket, one per open file
            ▼
   Claude Bridge plugin (Figma)  ×  every file where it's open
            │  Figma Plugin API
            ▼
       Your Figma files
```

Claude sends a command (e.g. *"create an auth screen"*), the hub relays it over a WebSocket to the plugin running in Figma, the plugin executes it through the Plugin API and returns the result. ~165 actions cover reading, creating, editing, variables (incl. aliases), components, styles, libraries, vectors, prototyping, export, and audits. No Figma token or cloud MCP required, and no server to start by hand: Claude Code starts the MCP server, the plugin connects to it.

**Several files.** Open the plugin in as many files as you like. Commands go to the file you're looking at — switching tabs is enough (selecting something, switching a page or clicking the plugin window also count); the others show *Standby* and name the active file. You can also name a file: *"in Landing, create…"*.

**Several Claude Code sessions** share one hub: the first owns the port, the others relay through it, and the next one takes over when the owner exits. Two chats can even work in the same file — say one analyses the layouts while the other builds a design system: each session has its own queue, the plugin runs their batches in turn so steps never mix, and while a file is shared the bridge keeps your view still (no page switches or scrolling) and refuses creates without a parent. The plugin window shows whose command is running and how many wait.

## Setup

### 1. Install and register the MCP server (once)

```bash
cd server
npm install
claude mcp add --scope user claude-bridge -- node "$(pwd)/mcp.mjs"
```

`--scope user` makes the tools available in every project. The hub listens on `http://localhost:3571` (loopback only — not exposed to your network).

### 2. Add the Figma skills (once)

```bash
cd figma-skills
node build.mjs --link
```

Links the audit skills — `cp-frame-audit` (everything at once), `cp-layout-audit`, `cp-spacing-audit`, `cp-layer-naming`, `cp-layer-cleanup`, `cp-token-audit` — into `~/.claude/skills`, so every Claude Code session can run them (*"full audit of the selected frames"*, *"проверь отступы"*). They read the selection through the bridge, report numbered issues and fix only the ones you pick.

It also creates `~/.claude-bridge/protected-names.md`: product names that contain numbers (one per line, in backticks), which the naming checks never touch. The list is per computer and never goes into git — fill it in on each machine.

### 3. Load the plugin in Figma

Figma Desktop → **Plugins → Development → Import plugin from manifest** → select `manifest.json`. Run it in a file — the card turns green (*Connected*) once a Claude Code session is running.

The first time, the card asks for a code instead (*Pair with Claude*): ask Claude to do anything in Figma and it will read you the code (it's also in `~/.claude-bridge/pairing-key`, and `node server/server.js` prints it). Type it in once; the plugin remembers it on this computer.

### 4. Talk to Claude

Open Claude Code anywhere and ask:

```
"Create a frame on a new page called test"
"Change all button labels to Sign Up"
"Build a pricing page using our existing components"
"Add a mobile variant of the dashboard"
"Audit contrast on the current page"
```

The MCP server carries its own instructions; the full action catalog and design rules are in `server/reference.md` (Claude reads it through `figma_reference`).

### Without Claude Code (scripts, curl)

```bash
node server/server.js
curl -s -X POST http://localhost:3571/command -H "Content-Type: application/json" -d '{"action":"get_selection"}'
```

The body takes `file`, `timeoutMs` and `saveTo` next to the action's params; `GET /status` and `GET /files` list connected files.

## Security

The hub listens on loopback only, but a web page open in a browser on the same computer can still reach `localhost`. So:

- **HTTP takes no requests from browsers.** Anything that carries an `Origin` header is refused (curl, scripts and the MCP server send none), POST bodies must be `Content-Type: application/json` (which a page can't send without a preflight the hub never answers), and the `Host` header must be `127.0.0.1:3571` or `localhost:3571`, against DNS rebinding.
- **Plugins pair once.** The plugin connects from a sandboxed iframe (`Origin: null`), and any page can fake that, so the hub sends commands only to a plugin that shows the pairing key: 8 characters, made once per computer and kept in `~/.claude-bridge/pairing-key` (readable by your user only). After a wrong code the hub waits a second before checking another, so the code can't be guessed. To pair again from scratch, delete that file.

## Best practices (how to prompt)

- **Everything is responsive by default.** Claude builds with auto-layout and proper `FILL`/`HUG`/`FIXED` sizing, so screens reflow when resized — you don't need to ask for it.
- **Style is Claude's call unless you set rules.** For a quick mockup, Claude picks a clean, coherent look on its own. To enforce your design instead:
  - *"use the existing components"* → Claude instances your library rather than drawing new UI
  - *"use our tokens / variables"* → Claude binds existing variables and applies your text styles
  - *"match this brand: …"* → Claude sticks to the palette and type you give it
- **Name a file's conventions once.** Per-project notes live in `.figma-projects/{fileKey}/design.md` in this repo (private, git-ignored) — Claude reads and updates them so component IDs and style decisions persist across sessions.
- **Ask for a screenshot** any time to see the result inline (*"show me a screenshot"*).
- **Big builds are cheap.** Claude batches work into 2–3 requests, so *"build the whole onboarding flow"* in one go is fine.

## Development

```bash
npm install
npm run build   # build code.js (esbuild) + ui.html (vite)
npm run watch   # rebuild on change
```

Plugin source: `src/code.js` (thin entry, dispatches to handlers) → `src/handlers/*.js` (actions grouped by category) → `src/lib/helpers.js` (shared helpers), window UI in `src/ui/App.svelte` (preview states with `ui.html?state=connected|processing|standby|unchosen|failed|disconnected|connecting`). Server: `server/hub.js` (port, plugin connections, routing) used by `server/mcp.mjs` (MCP) and `server/server.js` (standalone). After editing anything under `src/`, run `npm run build` and re-run the plugin in Figma; after editing `server/`, restart the Claude Code session (or reconnect the MCP server). New actions and params go into `server/reference.md`.

## License

[MIT](LICENSE) © 2026 Yevhenii Petrenko
