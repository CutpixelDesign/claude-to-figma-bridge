// Standalone bridge server: `node server/server.js`, then drive Figma with
// curl -X POST http://localhost:3571/command. Claude Code normally doesn't need this —
// the claude-bridge MCP server (mcp.mjs) starts the same hub on its own.
const { createHub } = require('./hub.js');

const hub = createHub({ log: (...a) => console.log(...a) });

hub.listen().then((ok) => {
  if (!ok) {
    console.error(`Port ${hub.port} is already in use — a bridge (or the claude-bridge MCP server) is already running.`);
    process.exit(1);
  }
  console.log(`Claude Bridge server running on http://${hub.host}:${hub.port}`);
  console.log(`Waiting for Figma plugin connection... (pairing code: ${hub.pairingCode})`);
});
