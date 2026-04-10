const http = require('http');
const WebSocket = require('ws');

const PORT = 3571;
let pluginSocket = null;
const pending = new Map();
let reqId = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ connected: pluginSocket?.readyState === WebSocket.OPEN }));
    return;
  }

  if (req.method === 'POST' && req.url === '/command') {
    if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'Figma plugin not connected' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let command;
      try {
        command = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const id = ++reqId;
      command.id = id;

      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          res.writeHead(504);
          res.end(JSON.stringify({ error: 'Timeout — no response from plugin' }));
        }
      }, 15000);

      pending.set(id, { res, timeout });
      pluginSocket.send(JSON.stringify(command));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  pluginSocket = ws;
  console.log('✓ Figma plugin connected');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    const entry = pending.get(msg.id);
    if (entry) {
      clearTimeout(entry.timeout);
      pending.delete(msg.id);
      entry.res.writeHead(200);
      entry.res.end(JSON.stringify(msg.result));
    }
  });

  ws.on('close', () => {
    pluginSocket = null;
    console.log('✗ Figma plugin disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Claude Bridge server running on http://localhost:${PORT}`);
  console.log('Waiting for Figma plugin connection...');
});
