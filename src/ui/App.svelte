<script>
  import { onMount, onDestroy } from 'svelte';

  const SERVER = 'ws://localhost:3571';
  const ADDRESS = '127.0.0.1:3571';
  const MIN_BUSY_MS = 600;   // short commands still show "Processing" long enough to notice
  const ERROR_MS = 6000;     // how long a failed command stays on screen

  let link = 'connecting';   // 'connecting' | 'online' | 'offline'
  let busy = false;
  let failed = false;
  let requests = 0;          // commands received this session
  let pending = 0;           // commands sent to Figma and not answered yet
  let current = '';          // the command running / that failed
  let last = '';             // the last command that finished
  let detail = '';           // error text of the failed command
  let elapsed = 0;           // ms the current command has been running
  let took = 0;              // ms the failed command ran
  let active = true;         // this file receives commands that name no file
  let files = 1;             // files connected to the bridge
  let targetFile = null;     // name of the file that gets commands, null when none is chosen
  let queued = 0;            // commands waiting in this file, the running one included (from the hub)
  let session = '';          // the session whose command is running
  let hello = null;          // { fileName, pageName } from the plugin, re-sent on every connect
  // Pairing (server/pairing.js): the hub runs commands only from a plugin that shows its key.
  // The key comes from clientStorage via code.js; without one (or a stale one) the window
  // asks for the code, which Claude reads out from the hub's "not paired" error.
  let key = null;            // the saved pairing key
  let keyLoaded = false;
  let paired = false;
  let pairing = false;       // the hub wants a code typed
  let code = '';             // what's typed
  let codeError = '';
  let codeInput = null;
  let lastAuth = null;       // the last key presented, re-sent when the hub says "busy"

  let ws = null;
  let reconnectTimer = null;
  let idleTimer = null;
  let errorTimer = null;
  let tick = null;
  let busySince = 0;

  function describe(command) {
    if (command.action === 'batch' && Array.isArray(command.commands)) return `batch (${command.commands.length})`;
    return command.action;
  }

  const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

  function stopTick() {
    clearInterval(tick);
    tick = null;
  }

  function connect() {
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    }
    ws = new WebSocket(SERVER);

    ws.onopen = () => {
      link = 'online';
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      paired = false;
      if (hello) ws.send(JSON.stringify({ type: 'hello', ...hello }));
      sendAuth(key, false);
    };

    ws.onclose = () => {
      link = 'offline';
      paired = false;
      busy = false;
      pending = 0;
      active = true;
      files = 1;
      stopTick();
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const command = JSON.parse(event.data);
      // Hub control messages carry `__bridge`; anything else is a command, `type` param and all.
      if (command.__bridge === 'target') {
        // the hub only tells paired plugins their target; one from before pairing never answers
        // `auth`, and sending this is how it says the plugin is in
        if (!paired) {
          paired = true;
          pairing = false;
        }
        active = command.active;
        files = command.files;
        targetFile = command.targetFile ?? null;
        return;
      }
      if (command.__bridge === 'queue') {
        queued = command.length;
        return;
      }
      if (command.__bridge === 'auth') {
        onAuth(command);
        return;
      }
      if (command.__bridge) return;   // a control message this version doesn't know — never run it
      const { _session, ...forPlugin } = command;
      session = _session && _session !== 'HTTP' ? _session : '';
      requests++;
      pending++;
      if (!busy) {
        busySince = Date.now();
        elapsed = 0;
        stopTick();
        tick = setInterval(() => { elapsed = Date.now() - busySince; }, 100);
      }
      clearTimeout(idleTimer);
      busy = true;
      failed = false;
      current = describe(forPlugin);
      parent.postMessage({ pluginMessage: forPlugin }, '*');
    };
  }

  function onAuth({ ok, reason, key: accepted }) {
    if (ok) {
      paired = true;
      pairing = false;
      codeError = '';
      if (accepted && accepted !== key) {
        key = accepted;
        parent.postMessage({ pluginMessage: { __bridge: 'save-key', key } }, '*');
      }
      reportVisibility();
      return;
    }
    if (reason === 'busy') {   // a wrong code was just tried somewhere: the hub checks again in a second
      setTimeout(() => lastAuth && sendAuth(lastAuth.key, lastAuth.typed), 1200);
      return;
    }
    if (pairing && code) codeError = 'Wrong code';
    pairing = true;
    setTimeout(() => codeInput?.focus(), 0);
  }

  function submitCode() {
    if (!code.trim()) return;
    codeError = '';
    sendAuth(code, true);
  }

  function sendAuth(k, typed) {
    lastAuth = { key: k, typed };
    sendToBridge({ type: 'auth', key: k, typed });
  }

  const sendToBridge = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // The designer is looking at this file when its tab is visible: Figma hides the plugin
  // window of background tabs. Becoming visible makes this file the target.
  function reportVisibility() {
    sendToBridge({ type: 'visibility', visible: !document.hidden, ...(hello ?? {}) });
  }

  // A click on the window makes this file the target too.
  function claim() {
    if (link === 'online' && !active) sendToBridge({ type: 'activity', ...(hello ?? {}) });
  }

  function handleWindowMessage(event) {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'key') {
      key = msg.key;
      if (!keyLoaded) {
        keyLoaded = true;
        connect();
      }
      return;
    }
    if (msg.type === 'hello') {
      hello = { fileName: msg.fileName, pageName: msg.pageName };
      sendToBridge(msg);
      return;
    }
    if (msg.type === 'activity') {
      hello = { fileName: msg.fileName, pageName: msg.pageName };
      sendToBridge(msg);
      return;
    }
    if (msg.type === 'progress') {
      sendToBridge(msg);
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
    pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    const err = msg.result && msg.result.error;
    const ran = Date.now() - busySince;
    const wait = Math.max(0, MIN_BUSY_MS - ran);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      busy = false;
      stopTick();
      last = current;
      if (err) {
        failed = true;
        detail = String(err);
        took = ran;
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { failed = false; }, ERROR_MS);
      }
    }, wait);
  }

  // Preview without a server: open ui.html?state=connected|processing|standby|unchosen|pairing|disconnected|failed|connecting
  function preview(state) {
    link = state === 'disconnected' ? 'offline' : state === 'connecting' ? 'connecting' : 'online';
    paired = state !== 'pairing';
    pairing = state === 'pairing';
    active = state !== 'standby' && state !== 'unchosen';
    files = state === 'standby' || state === 'unchosen' ? 2 : 1;
    targetFile = state === 'standby' ? 'Library Structure' : null;
    busy = state === 'processing';
    failed = state === 'failed';
    requests = state === 'processing' ? 43 : 42;
    pending = busy ? 1 : 0;
    current = busy ? 'batch (12)' : 'set_layout';
    session = busy ? 'Analysis' : '';
    queued = busy ? 2 : 0;
    last = 'set_layout';
    detail = 'Node not found: 12:345';
    elapsed = 1200;
    took = 400;
  }

  onMount(() => {
    const state = new URLSearchParams(location.search).get('state');
    if (state) return preview(state);
    window.addEventListener('message', handleWindowMessage);
    document.addEventListener('visibilitychange', reportVisibility);
    window.addEventListener('focus', reportVisibility);
    // connect once code.js hands over the saved key (or without one, if it never does)
    setTimeout(() => {
      if (!keyLoaded) {
        keyLoaded = true;
        connect();
      }
    }, 1500);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleWindowMessage);
    document.removeEventListener('visibilitychange', reportVisibility);
    window.removeEventListener('focus', reportVisibility);
    clearTimeout(reconnectTimer);
    clearTimeout(idleTimer);
    clearTimeout(errorTimer);
    stopTick();
    if (ws) ws.close();
  });

  const TITLES = {
    connected: 'Connected', processing: 'Processing...', failed: 'Command failed',
    connecting: 'Connecting...', disconnected: 'Disconnected', standby: 'Standby', pairing: 'Pair with Claude',
  };

  $: view = link === 'offline' ? 'disconnected'
    : link === 'connecting' ? 'connecting'
    : pairing && !paired ? 'pairing'
    : !paired ? 'connecting'
    : busy ? 'processing'
    : failed ? 'failed'
    : !active && files > 1 ? 'standby'
    : 'connected';
  $: title = TITLES[view];
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<main class="v-{view}" on:click={() => view !== 'pairing' && claim()} title={view === 'standby' ? 'Click to send commands to this file' : ''}>
  <div class="glow" aria-hidden="true"></div>

  <header>
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 12 18" width="7" height="10.5">
        <path d="M6 1H3.5a2.5 2.5 0 0 0 0 5H6z M6 1h2.5a2.5 2.5 0 0 1 0 5H6z M6 6H3.5a2.5 2.5 0 0 0 0 5H6z M6 11H3.5A2.5 2.5 0 1 0 6 13.5z" />
        <circle cx="8.5" cy="8.5" r="2.5" />
      </svg>
    </span>
    <h1 role="status" aria-live="polite">{title}</h1>
    <span class="indicator" aria-hidden="true"></span>
  </header>

  <p class="sub mono" title={view === 'standby' && targetFile ? `Commands go to ${targetFile}` : ''}>{view === 'processing' || view === 'failed' ? `> ${current}` : view === 'standby' ? (targetFile ? `→ ${targetFile}` : 'No file chosen yet') : view === 'pairing' ? 'Code from Claude' : ADDRESS}</p>

  <div class="row mono">
    {#if view === 'pairing'}
      <form class="pair" on:submit|preventDefault={submitCode}>
        <input
          bind:this={codeInput}
          bind:value={code}
          on:input={() => (codeError = '')}
          placeholder="XXXX-XXXX"
          maxlength="9"
          spellcheck="false"
          autocomplete="off"
          aria-label="Pairing code"
        />
        <button type="submit" disabled={!code.trim()}>Pair</button>
      </form>
    {:else if view === 'connected' || view === 'standby'}
      <span>Requests: <b>{requests}</b></span>
      <span class="chip">Idle</span>
    {:else if view === 'processing'}
      <span>Requests: <b>{requests}</b></span>
      <span class="chip chip-accent">{Math.max(queued, pending)} Queue</span>
    {:else if view === 'failed'}
      <span class="error-text" title={detail}>{detail}</span>
    {:else}
      <span>Waiting for server...</span>
    {/if}
  </div>

  <footer class="mono">
    {#if view === 'connected'}
      <span class="info" title={last}>{last ? `Last: ${last}` : 'No commands yet'}</span>
      <span class="tag"><i class="dot"></i>Active</span>
    {:else if view === 'processing'}
      <span class="info" title={session}>{session ? `${session} ${seconds(elapsed)}` : `Running ${seconds(elapsed)}`}</span>
      <span class="tag"><i class="dot"></i>Busy</span>
    {:else if view === 'failed'}
      <span class="info">After {seconds(took)}</span>
      <span class="tag">× Error</span>
    {:else if view === 'standby'}
      <span class="info">{targetFile ? 'Click to switch' : 'Click to choose'}</span>
      <span class="tag"><i class="dot hollow"></i>Standby</span>
    {:else if view === 'pairing'}
      <span class="info" class:error-text={codeError}>{codeError || 'Once per computer'}</span>
      <span class="tag"><i class="dot hollow"></i>Locked</span>
    {:else}
      <span class="info">Retry every 3 s</span>
      <span class="tag"><i class="dot hollow"></i>Offline</span>
    {/if}
  </footer>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(:root) {
    --card-top: #28282b;
    --card-bottom: #1b1b1d;
    --line: rgba(255, 255, 255, 0.07);
    --chip: rgba(255, 255, 255, 0.04);
    --chip-line: rgba(255, 255, 255, 0.12);
    --text: #f6f6f7;
    --muted: #9a9aa1;
    --dim: #5f5f66;
    --green: 52, 211, 120;
    --amber: 255, 176, 46;
    --red: 255, 77, 94;
    --grey: 120, 120, 128;
    --slate: 122, 162, 255;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  }

  :global(html), :global(body) {
    height: 100%;
    background: var(--card-bottom);
  }

  :global(body) {
    color: var(--text);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* --accent is the state color (an "r, g, b" triple), used for title, dot, tag and glow. */
  main {
    --h: 130px;
    --accent: var(--green);
    position: relative;
    width: 192px;
    height: var(--h);
    padding: 11px 15px 0;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, var(--card-top) 0%, var(--card-bottom) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .v-processing { --accent: var(--amber); }
  .v-failed { --accent: var(--red); }
  .v-disconnected,
  .v-connecting { --accent: var(--grey); }
  .v-standby { --accent: var(--slate); cursor: pointer; }
  .v-pairing { --accent: var(--amber); }

  /* Soft light from the status indicator, tinted by the state. */
  .glow {
    position: absolute;
    top: -70px;
    right: -60px;
    width: 170px;
    height: 150px;
    background: radial-gradient(closest-side, rgba(var(--accent), 0.2), transparent);
    pointer-events: none;
    transition: background 0.4s ease;
  }
  .v-disconnected .glow,
  .v-connecting .glow { opacity: 0.4; }

  header, .sub, .row, footer { position: relative; }

  .mono {
    font-family: var(--mono);
    letter-spacing: 0.01em;
  }

  /* Header: logo tile, name, status indicator */
  header {
    height: 22px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .logo {
    width: 16px;
    height: 16px;
    border: 1px solid var(--chip-line);
    border-radius: 4px;
    display: grid;
    place-items: center;
    color: #e4e4e7;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .logo svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.1;
  }

  .indicator {
    width: 7px;
    height: 7px;
    margin-right: 1px;
    border-radius: 50%;
    background: rgb(var(--accent));
    box-shadow: 0 0 0 2px rgba(var(--accent), 0.18), 0 0 8px rgba(var(--accent), 0.8);
  }

  /* State in the header, mono subline under it (aligned with the state text) */
  h1 {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 17px;
    letter-spacing: -0.005em;
    color: rgb(var(--accent));
    text-shadow: 0 0 14px rgba(var(--accent), 0.35);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    margin-top: 1px;
    padding: 0 0 10px 23px;
    border-bottom: 1px solid var(--line);
    font-size: 9.5px;
    line-height: 13px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Requests row */
  .row {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    border-bottom: 1px solid var(--line);
    font-size: 9px;
    color: var(--muted);
    white-space: nowrap;
  }

  .row b {
    font-weight: 400;
    color: var(--text);
  }

  .chip {
    padding: 2px 6px;
    border: 1px solid var(--chip-line);
    border-radius: 4px;
    background: var(--chip);
    color: var(--muted);
    font-size: 8.5px;
    line-height: 12px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .chip-accent {
    border-color: rgba(var(--accent), 0.65);
    background: rgba(var(--accent), 0.14);
    color: rgb(var(--accent));
    box-shadow: 0 0 10px rgba(var(--accent), 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .error-text {
    color: rgb(var(--red));
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer: last / current command timing + state tag */
  footer {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 8.5px;
    color: var(--muted);
    white-space: nowrap;
  }

  .info {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: rgb(var(--accent));
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px rgba(var(--accent), 0.8);
  }

  .dot.hollow {
    background: none;
    border: 1px solid currentColor;
    box-shadow: none;
  }

  /* Processing: the indicator becomes a spinner */
  .v-processing .indicator {
    width: 9px;
    height: 9px;
    margin-right: 0;
    background: none;
    border: 1.5px solid rgb(var(--accent));
    border-right-color: transparent;
    box-shadow: 0 0 8px rgba(var(--accent), 0.45);
    animation: spin 0.8s linear infinite;
  }

  /* Disconnected / connecting: quiet, grey */
  .v-disconnected h1,
  .v-connecting h1 {
    color: var(--muted);
    text-shadow: none;
  }
  .v-disconnected .sub,
  .v-connecting .sub { color: var(--dim); }
  .v-disconnected .tag,
  .v-connecting .tag { color: var(--muted); }
  .v-disconnected .indicator,
  .v-connecting .indicator {
    background: #5a5a60;
    box-shadow: none;
  }
  .v-connecting .indicator { animation: pulse 1.2s ease-in-out infinite; }

  /* Standby: connected, but another file gets the commands — a ring instead of a dot */
  .v-standby .indicator {
    background: none;
    border: 1.5px solid rgb(var(--accent));
    box-shadow: 0 0 8px rgba(var(--accent), 0.7);
  }
  .v-standby .sub { color: #c3c8de; }

  /* Pairing: the code field and its button fill the row */
  .pair {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 6px;
  }
  .pair input {
    flex: 1;
    width: 0;
    min-width: 0;
    height: 22px;
    padding: 0 7px;
    border: 1px solid var(--chip-line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    color: var(--text);
    font: inherit;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    outline: none;
  }
  .pair input:focus {
    border-color: rgba(var(--accent), 0.7);
    box-shadow: 0 0 0 2px rgba(var(--accent), 0.15);
  }
  .pair input::placeholder {
    color: var(--dim);
  }
  .pair button {
    height: 22px;
    padding: 0 9px;
    border: 1px solid rgba(var(--accent), 0.65);
    border-radius: 4px;
    background: rgba(var(--accent), 0.14);
    color: rgb(var(--accent));
    font: inherit;
    font-size: 9.5px;
    cursor: pointer;
  }
  .pair button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .v-pairing .indicator {
    background: none;
    border: 1.5px solid rgb(var(--accent));
    box-shadow: 0 0 8px rgba(var(--accent), 0.7);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    50% { opacity: 0.35; }
  }

  @media (prefers-reduced-motion: reduce) {
    .indicator { animation: none !important; }
  }
</style>
