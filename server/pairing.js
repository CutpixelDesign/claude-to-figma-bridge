// Pairing: the plugin's WebSocket comes from a sandboxed iframe (Origin 'null'), and any web
// page can open one like it — so the hub trusts a plugin only once it shows the pairing key.
// The key is made once per computer and kept in ~/.claude-bridge/pairing-key (readable by
// this user only), so it survives restarts and every hub process shares it. The designer
// types it in the plugin window once (the hub's "not paired" error names it), and the
// plugin keeps it in figma.clientStorage. 8 characters from 31 (~40 bits), and a wrong
// guess holds every check back for a second, so it can't be guessed.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O, 1/I/L
const LENGTH = 8;
const COOLDOWN = 1000;   // ms after a wrong key before the next one is checked

const normalize = (key) => String(key ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function makeKey() {
  let key = '';
  while (key.length < LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 248) key += ALPHABET[byte % ALPHABET.length];   // 248 = 8 × 31: no modulo bias
  }
  return key;
}

function loadKey(file) {
  try {
    const key = normalize(fs.readFileSync(file, 'utf8'));
    if (key.length === LENGTH) return key;
  } catch { /* not made yet */ }
  const key = makeKey();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, `${key}\n`, { mode: 0o600, flag: 'wx' });
    return key;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    return normalize(fs.readFileSync(file, 'utf8'));   // another hub made it first
  }
}

function createPairing({ file = path.join(os.homedir(), '.claude-bridge', 'pairing-key') } = {}) {
  const key = loadKey(file);
  let nextCheck = 0;
  return {
    key,
    code: `${key.slice(0, 4)}-${key.slice(4)}`,   // how it's shown to the designer
    /** 'ok' | 'missing' | 'busy' (a wrong key was just tried: retry in a second) | 'wrong' */
    check(candidate) {
      const given = normalize(candidate);
      if (!given) return 'missing';
      const now = Date.now();
      if (now < nextCheck) return 'busy';
      const a = Buffer.from(given);
      const b = Buffer.from(key);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'ok';
      nextCheck = now + COOLDOWN;
      return 'wrong';
    },
  };
}

module.exports = { createPairing, normalize };
