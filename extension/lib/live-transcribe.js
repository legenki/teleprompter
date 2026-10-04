// Streaming speech-to-text over the Gemini Live API (gemini-3.5-transcribe-live).
//
// The public docs describe the model and its `transcription_config`, but not the exact wire format, so this client is
// deliberately defensive:
//  - it tries a short list of setup-message shapes until the server answers `setupComplete`;
//  - it extracts transcripts from any `*transcri*` field and works out whether chunks are cumulative, incremental or final;
//  - it logs the first server messages and every close code/reason (console.info, prefix "[live]") so a failure is diagnosable.

export const LIVE_MODEL = 'gemini-3.5-transcribe-live';
const HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';

export function liveUrl(key, version = 'v1beta') {
  return `${HOST}.${version}.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;
}

export const LANGUAGE_CODES = { en: 'en-US', es: 'es-ES', ru: 'ru-RU' };

// ---------- vocabulary ----------
const COMMON = new Set(['The', 'We', 'You', 'Our', 'Your', 'This', 'That', 'And', 'For', 'With', 'Are', 'Will', 'Have', 'Has',
  'Must', 'Should', 'Can', 'Who', 'What', 'About', 'Role', 'Team', 'Experience', 'Skills', 'Requirements', 'Responsibilities',
  'Benefits', 'Company', 'Job', 'Description', 'Senior', 'Junior', 'Strong', 'Good', 'Great', 'Work', 'Working', 'Years', 'Knowledge']);

// Proper nouns and tech terms from the vacancy/resume (Kubernetes, gRPC, Node.js, C++…), most frequent first.
export function extractVocabulary(...texts) {
  const counts = new Map();
  for (const text of texts) {
    const src = String(text || '');
    for (const m of src.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[.+#-][A-Za-z0-9]+)*[+#]*/g)) {
      const w = m[0];
      if (w.length < 3 || COMMON.has(w)) continue;
      const shaped = /[A-Z].*[A-Z]|[a-z][A-Z]|[0-9]|[.+#]/.test(w); // gRPC, TypeScript, Node.js, C++, S3
      // A plain Capitalised word is a proper noun only mid-sentence ("at Spotify"), not at a sentence start ("Engineering manager").
      const before = src.slice(0, m.index);
      const sentenceStart = !before.trim() || /[.!?:•*\-]\s*$/.test(before) || /\n\s*$/.test(before);
      const proper = /^[A-Z][a-z]{3,}$/.test(w) && !sentenceStart;
      if (!shaped && !proper) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([w]) => w);
}

// ---------- setup messages ----------
function transcriptionConfig(languageCode, vocabulary) {
  const c = {};
  if (languageCode) c.languageCodes = [languageCode];
  if (vocabulary?.length) c.customVocabulary = vocabulary.slice(0, 100);
  return c;
}

// Ordered by how likely they are to be accepted. Probing stops at the first `setupComplete`.
export function buildSetupVariants({ model = LIVE_MODEL, languageCode, vocabulary = [] } = {}) {
  const name = `models/${model}`;
  const tc = transcriptionConfig(languageCode, vocabulary);
  const hasTc = Object.keys(tc).length > 0;
  return [
    ...(hasTc ? [
      { name: 'generationConfig.transcriptionConfig', version: 'v1beta', setup: { model: name, generationConfig: { transcriptionConfig: tc } } },
      { name: 'setup.transcriptionConfig', version: 'v1beta', setup: { model: name, transcriptionConfig: tc } },
      { name: 'generationConfig.transcriptionConfig (v1alpha)', version: 'v1alpha', setup: { model: name, generationConfig: { transcriptionConfig: tc } } },
    ] : []),
    { name: 'inputAudioTranscription', version: 'v1beta', setup: { model: name, inputAudioTranscription: {} } },
    { name: 'bare model', version: 'v1beta', setup: { model: name } },
  ];
}

// ---------- audio ----------
export function floatToPcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToBase64(i16) {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Batches the worklet's tiny blocks into ~100 ms chunks (1600 samples at 16 kHz).
export class PcmChunker {
  constructor(size = 1600) {
    this.size = size;
    this.buf = new Float32Array(0);
  }

  push(f32) {
    const merged = new Float32Array(this.buf.length + f32.length);
    merged.set(this.buf);
    merged.set(f32, this.buf.length);
    const chunks = [];
    let o = 0;
    while (merged.length - o >= this.size) {
      chunks.push(pcm16ToBase64(floatToPcm16(merged.subarray(o, o + this.size))));
      o += this.size;
    }
    this.buf = merged.slice(o);
    return chunks;
  }
}

// ---------- server messages ----------
const finalFlag = (o) => {
  if (!o || typeof o !== 'object') return null;
  for (const k of ['isFinal', 'is_final', 'final', 'finished']) if (typeof o[k] === 'boolean') return o[k];
  const t = o.type ?? o.state ?? o.status;
  if (typeof t === 'string') {
    if (/final/i.test(t)) return true;
    if (/interim|partial/i.test(t)) return false;
  }
  return null;
};

// -> { setupComplete, goAway, turnComplete, error, texts: [{ text, final: true|false|null }] }
export function parseServerMessage(raw) {
  const out = { setupComplete: false, goAway: false, turnComplete: false, error: null, texts: [] };
  let msg;
  try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return out; }
  if (!msg || typeof msg !== 'object') return out;

  out.setupComplete = 'setupComplete' in msg || 'setup_complete' in msg;
  out.goAway = 'goAway' in msg || 'go_away' in msg;
  const sc = msg.serverContent ?? msg.server_content;
  out.turnComplete = !!(sc && (sc.turnComplete || sc.turn_complete || sc.generationComplete || sc.generation_complete));
  if (msg.error) out.error = typeof msg.error === 'string' ? msg.error : (msg.error.message || JSON.stringify(msg.error));

  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    for (const [k, v] of Object.entries(node)) {
      if (/transcri/i.test(k)) {
        if (typeof v === 'string') out.texts.push({ text: v, final: finalFlag(node) });
        else if (Array.isArray(v)) v.forEach((x) => typeof x?.text === 'string' && out.texts.push({ text: x.text, final: finalFlag(x) ?? finalFlag(node) }));
        else if (v && typeof v.text === 'string') out.texts.push({ text: v.text, final: finalFlag(v) ?? finalFlag(node) });
        else walk(v, depth + 1);
      } else {
        walk(v, depth + 1);
      }
    }
  };
  walk(msg, 0);
  return out;
}

// Turns transcript chunks into interim updates and final utterances.
//  - a chunk flagged final replaces everything pending and is emitted at once;
//  - otherwise chunks are interim: if the text extends the pending text it is a cumulative hypothesis (replace),
//    else it is an incremental fragment (append);
//  - pending text with no news for `idleMs`, or a turn-complete signal, is emitted as final.
export function createAssembler({ onInterim, onFinal, idleMs = 1200, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let pending = '';
  let timer = null;

  const clear = () => { if (timer) { clearTimer(timer); timer = null; } };
  const emitFinal = (text) => {
    clear();
    pending = '';
    const t = text.trim();
    if (t) onFinal(t);
  };
  const join = (a, b) => (!a ? b : /^[\s.,;:!?)]/.test(b) || /\s$/.test(a) ? a + b : `${a} ${b}`);

  return {
    push({ text, final }) {
      if (typeof text !== 'string') return;
      if (final === true) { emitFinal(text || pending); return; }
      if (!text.trim()) return;
      pending = pending && text.startsWith(pending) ? text : join(pending, text);
      onInterim?.(pending.trim());
      clear();
      timer = setTimer(() => emitFinal(pending), idleMs);
    },
    flush() { if (pending) emitFinal(pending); },
    reset() { clear(); pending = ''; },
  };
}

// ---------- client ----------
const FATAL = /api key|api_key|permission|unauthenticated|quota|resource.?exhausted|rate.?limit|billing|\b40[13]\b|\b429\b/i;
export const isFatalLiveReason = (s) => FATAL.test(String(s || ''));

const decodeText = async (data) => {
  if (typeof data === 'string') return data;
  if (data && typeof data.text === 'function') return data.text(); // Blob
  return new TextDecoder().decode(data); // ArrayBuffer / typed array / Buffer
};

export class LiveTranscriber {
  constructor({
    key, language = 'en', vocabulary = [], model = LIVE_MODEL, WebSocketImpl = globalThis.WebSocket,
    endpoint = liveUrl, rotateMs = 14 * 60 * 1000, connectTimeoutMs = 8000, idleMs = 1200,
    onInterim, onFinal, onStatus, onFatal, log = (...a) => console.info('[live]', ...a),
  }) {
    this.key = key;
    this.WS = WebSocketImpl;
    this.endpoint = endpoint;
    this.rotateMs = rotateMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.onStatus = onStatus;
    this.onFatal = onFatal;
    this.log = log;
    this.variants = buildSetupVariants({ model, languageCode: LANGUAGE_CODES[language] || language, vocabulary });
    this.variantIndex = -1;
    this.active = null;
    this.chunker = new PcmChunker();
    this.backlog = [];
    this.stopped = false;
    this.rotating = false;
    this.rotateTimer = null;
    this.seen = 0;
    this.assembler = createAssembler({ onInterim, onFinal, idleMs });
  }

  // Resolves once a socket is ready; rejects with a descriptive Error if every setup variant fails.
  async start() {
    const reasons = [];
    for (let i = 0; i < this.variants.length; i++) {
      const v = this.variants[i];
      this.log(`attempt ${i + 1}/${this.variants.length}: ${v.name} (${v.version})`);
      const res = await this._open(v);
      if (res.ws) {
        this.variantIndex = i;
        this.active = res.ws;
        this.log(`ready with "${v.name}"`);
        this._flushBacklog();
        this._scheduleRotate();
        return;
      }
      reasons.push(`${v.name}: ${res.reason}`);
      this.log(`variant failed: ${res.reason}`);
      if (isFatalLiveReason(res.reason)) throw new Error(res.reason);
    }
    throw new Error(`no setup variant accepted (${reasons.at(-1)})`);
  }

  // Opens one socket with one setup message. -> { ws } on setupComplete, or { reason }.
  _open(variant) {
    return new Promise((resolve) => {
      let settled = false;
      let ws;
      const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => { try { ws?.close(); } catch { /* already closed */ } done({ reason: `no response within ${this.connectTimeoutMs} ms` }); }, this.connectTimeoutMs);
      try {
        ws = new this.WS(this.endpoint(this.key, variant.version));
      } catch (e) {
        done({ reason: e.message });
        return;
      }
      let chain = Promise.resolve();
      ws.onopen = () => ws.send(JSON.stringify({ setup: variant.setup }));
      ws.onerror = () => {};
      ws.onclose = (e) => {
        if (!settled) { done({ reason: `closed ${e.code} ${e.reason || ''}`.trim() }); return; }
        this._onClosed(ws, e);
      };
      // One chain per socket keeps messages in order even though Blob decoding is asynchronous.
      ws.onmessage = (e) => {
        chain = chain.then(async () => {
          const text = await decodeText(e.data);
          if (this.seen++ < 25) this.log('<-', text.length > 600 ? `${text.slice(0, 600)}…` : text);
          const m = parseServerMessage(text);
          if (!settled) {
            if (m.error) { done({ reason: m.error }); return; }
            if (m.setupComplete) { done({ ws }); return; }
          }
          this._handle(ws, m);
        });
      };
    });
  }

  _handle(ws, m) {
    if (m.error) this.onStatus?.('error', `Gemini Live: ${m.error}`);
    for (const t of m.texts) this.assembler.push(t);
    if (m.turnComplete) this.assembler.flush();
    if (m.goAway && ws === this.active) this._rotate();
  }

  _scheduleRotate() {
    clearTimeout(this.rotateTimer);
    if (!this.rotateMs) return;
    this.rotateTimer = setTimeout(() => this._rotate(), this.rotateMs);
  }

  // Sessions are capped (15 min audio-only): open the next socket first, then swap, so no speech is dropped.
  async _rotate() {
    if (this.stopped || this.rotating) return;
    this.rotating = true;
    const old = this.active;
    this.log('rotating session');
    const res = await this._open(this.variants[this.variantIndex]);
    this.rotating = false;
    if (this.stopped) { res.ws?.close(); return; }
    if (!res.ws) {
      this.log(`rotation failed: ${res.reason}`);
      if (isFatalLiveReason(res.reason)) { this.onFatal?.(new Error(res.reason)); return; }
      this.rotateTimer = setTimeout(() => this._rotate(), 2000);
      return;
    }
    this.active = res.ws;
    this._flushBacklog();
    setTimeout(() => { try { old?.close(1000); } catch { /* already closed */ } }, 2000);
    this._scheduleRotate();
  }

  async _onClosed(ws, e) {
    if (this.stopped || ws !== this.active) return;
    this.log(`active socket closed: ${e.code} ${e.reason || ''}`);
    this.active = null;
    for (let attempt = 1; attempt <= 3 && !this.stopped; attempt++) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      const res = await this._open(this.variants[this.variantIndex]);
      if (this.stopped) { res.ws?.close(); return; }
      if (res.ws) { this.active = res.ws; this._flushBacklog(); this._scheduleRotate(); this.onStatus?.('listening', 'Listening (Live)'); return; }
      if (isFatalLiveReason(res.reason)) { this.onFatal?.(new Error(res.reason)); return; }
    }
    this.onFatal?.(new Error(`connection lost (${e.code} ${e.reason || ''})`.trim()));
  }

  _flushBacklog() {
    const q = this.backlog;
    this.backlog = [];
    for (const data of q) this._sendChunk(data);
  }

  _sendChunk(data) {
    const ws = this.active;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }));
    } else {
      this.backlog.push(data);
      if (this.backlog.length > 50) this.backlog.shift(); // keep the last ~5 s while reconnecting
    }
  }

  sendAudio(f32) {
    if (this.stopped) return;
    for (const c of this.chunker.push(f32)) this._sendChunk(c);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.rotateTimer);
    this.assembler.flush();
    try { this.active?.close(1000); } catch { /* already closed */ }
    this.active = null;
  }
}
