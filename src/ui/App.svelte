<script>
  import { onMount, onDestroy } from 'svelte';

  const SERVER = 'ws://localhost:3571';

  let ws = null;
  let status = 'disconnected'; // 'connected' | 'disconnected' | 'error'
  let statusText = 'Connecting to bridge...';
  let lastLog = 'Waiting...';
  let reconnectTimer = null;

  function connect() {
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }

    ws = new WebSocket(SERVER);

    ws.onopen = () => {
      status = 'connected';
      statusText = 'Connected to Claude Bridge';
      lastLog = 'Ready for commands.';
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onclose = () => {
      status = 'disconnected';
      statusText = 'Disconnected — retrying in 3s...';
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      status = 'error';
      statusText = 'Cannot reach server on :3571';
    };

    ws.onmessage = (event) => {
      const command = JSON.parse(event.data);
      lastLog = '\u25b6 ' + command.action + (command.nodeId ? ' [' + command.nodeId + ']' : '');
      parent.postMessage({ pluginMessage: command }, '*');
    };
  }

  function handleWindowMessage(event) {
    const msg = event.data?.pluginMessage;
    if (msg && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      const r = msg.result;
      lastLog = '\u2713 ' + (r?.error ? '\u26a0 ' + r.error : JSON.stringify(r).slice(0, 80));
    }
  }

  onMount(() => {
    window.addEventListener('message', handleWindowMessage);
    connect();
  });

  onDestroy(() => {
    window.removeEventListener('message', handleWindowMessage);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  });
</script>

<div class="status">
  <div class="dot" class:connected={status === 'connected'} class:error={status === 'error'}></div>
  <span class="status-text">{statusText}</span>
</div>
<div class="log">{lastLog}</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: -apple-system, sans-serif;
    padding: 16px;
    background: #1e1e1e;
    color: #fff;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #2c2c2c;
    border-radius: 8px;
    margin-bottom: 10px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #555;
    flex-shrink: 0;
    transition: background 0.2s, box-shadow 0.2s;
  }

  .dot.connected {
    background: #4caf50;
    box-shadow: 0 0 6px #4caf50;
  }

  .dot.error {
    background: #f44336;
  }

  .status-text {
    font-size: 13px;
    color: #ccc;
  }

  .log {
    font-size: 11px;
    color: #666;
    padding: 8px 14px;
    background: #2c2c2c;
    border-radius: 8px;
    min-height: 36px;
    word-break: break-all;
  }
</style>
