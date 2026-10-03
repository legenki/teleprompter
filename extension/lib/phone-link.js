// Publishes interview cards to the phone relay (copilot-server.js) over WebSocket.
// publish() is cheap and safe to call on every streamed token: updates per card are throttled.

const THROTTLE_MS = 120;

export function relayUrl(relay, token) {
  const host = String(relay || '').trim().replace(/^(wss?|https?):\/\//, '').replace(/\/.*$/, '');
  if (!host) return null;
  return `ws://${host}/ws?role=pub&t=${encodeURIComponent(token || '')}`;
}

export function createPhoneLink({ getSettings, onState }) {
  let ws = null;
  let wantUrl = null;
  let retry = 1000;
  let timer = null;
  const latest = new Map(); // id -> card (last known state, replayed on reconnect)
  const timers = new Map(); // id -> throttle timer

  const set = (state, detail = '') => onState?.(state, detail);

  function open() {
    clearTimeout(timer);
    if (!wantUrl) return;
    try {
      ws = new WebSocket(wantUrl);
    } catch (e) {
      set('error', e.message);
      return;
    }
    ws.onopen = () => {
      retry = 1000;
      set('connected');
      for (const card of latest.values()) ws.send(JSON.stringify({ type: 'card', card }));
    };
    ws.onclose = (e) => {
      ws = null;
      if (!wantUrl) return;
      if (e.code === 1008) { set('error', 'Relay rejected the token'); return; }
      set('connecting', 'Relay not reachable, retrying…');
      timer = setTimeout(open, retry);
      retry = Math.min(retry * 2, 10000);
    };
    ws.onerror = () => {};
  }

  function sync() {
    const s = getSettings();
    const url = s.phoneEnabled === 'on' ? relayUrl(s.phoneRelay, s.phoneToken) : null;
    if (url === wantUrl) return;
    wantUrl = url;
    ws?.close();
    ws = null;
    if (!url) { set('off'); return; }
    set('connecting');
    open();
  }

  function send(card) {
    latest.set(card.id, card);
    if (latest.size > 40) latest.delete(latest.keys().next().value);
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'card', card }));
  }

  return {
    sync,
    publish(card, immediate = false) {
      if (!wantUrl) return;
      if (immediate) {
        clearTimeout(timers.get(card.id));
        timers.delete(card.id);
        send(card);
        return;
      }
      if (timers.has(card.id)) { latest.set(card.id, card); return; }
      send(card);
      timers.set(card.id, setTimeout(() => {
        timers.delete(card.id);
        if (latest.get(card.id) !== card) send(latest.get(card.id));
      }, THROTTLE_MS));
    },
    clear() {
      latest.clear();
      if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'clear' }));
    },
  };
}
