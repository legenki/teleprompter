import { createProvider, GEMINI_MODELS, GROQ_MODELS, LOCAL_MODELS } from './llm.js';
import { isQuestion } from './lib/question.js';
import { buildAnswerMessages, buildTranslateMessages, parseReply } from './lib/prompt.js';

const KEY = 'copilot.settings';
const DEFAULTS = {
  provider: 'gemini', geminiKey: '', geminiModel: GEMINI_MODELS[0], groqKey: '', groqModel: GROQ_MODELS[0], localModel: LOCAL_MODELS[0],
  sttModel: 'onnx-community/whisper-base.en', audioDevice: '', style: 'short', resume: '', job: '',
};
const FIELDS = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);

// Firefox has no tabCapture/offscreen: capture an audio input (virtual cable) and run Whisper in this page.
const IN_PAGE = !chrome.tabCapture || new URLSearchParams(location.search).has('inpage');
const CABLE = /blackhole|vb-?cable|cable output|loopback|monitor of|soundflower|voicemeeter/i;

let settings = { ...DEFAULTS };
let stt = null;
let provider = null;
let providerSig = '';
let listening = false;
let history = [];
let lastLine = null;
let currentAbort = null;
let chain = Promise.resolve();

// ---------- settings ----------
async function loadSettings() {
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  settings = { ...DEFAULTS, ...stored };
  for (const [id, models] of [['geminiModel', GEMINI_MODELS], ['groqModel', GROQ_MODELS], ['localModel', LOCAL_MODELS]]) {
    for (const m of models) $(id).add(new Option(m, m));
  }
  for (const f of FIELDS) $(f).value = settings[f];
  if (IN_PAGE) {
    document.querySelectorAll('[data-inpage]').forEach((e) => { e.hidden = false; });
    if (!navigator.gpu) {
      $('provider').querySelector('option[value="local"]').remove();
      if (settings.provider === 'local') { settings.provider = 'gemini'; $('provider').value = 'gemini'; }
    }
    await populateDevices(false);
  }
  syncProviderFields();
}

async function populateDevices(askPermission) {
  if (askPermission) {
    // Labels are only exposed after the user grants audio permission once.
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    tmp?.getTracks().forEach((t) => t.stop());
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const sel = $('audioDevice');
  sel.replaceChildren(new Option('Auto: BlackHole / VB-Cable / Loopback', ''));
  for (const d of devices) sel.add(new Option(d.label || `Input ${sel.length}`, d.deviceId));
  sel.value = devices.some((d) => d.deviceId === settings.audioDevice) ? settings.audioDevice : '';
}

async function openAudioInput() {
  let id = settings.audioDevice;
  if (!id) {
    await populateDevices(true);
    const match = [...$('audioDevice').options].find((o) => o.value && CABLE.test(o.text));
    if (!match) throw new Error('No virtual audio cable found. Install BlackHole (macOS) or VB-Cable (Windows), route the call audio to it, then pick it in Settings.');
    id = match.value;
  }
  return navigator.mediaDevices.getUserMedia({
    // Processing must be off for a loopback source, or speech gets gated/ducked.
    audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
}

function saveSettings() {
  for (const f of FIELDS) settings[f] = $(f).value;
  chrome.storage.local.set({ [KEY]: settings });
  syncProviderFields();
}

function syncProviderFields() {
  document.querySelectorAll('[data-for]').forEach((el) => {
    el.hidden = el.dataset.for !== $('provider').value;
  });
}

function getProvider() {
  const sig = JSON.stringify([settings.provider, settings.geminiKey, settings.geminiModel, settings.groqKey, settings.groqModel, settings.localModel]);
  if (!provider || sig !== providerSig) {
    provider = createProvider(settings, (t) => setStatus('loading', t));
    providerSig = sig;
  }
  return provider;
}

// ---------- status / UI ----------
function setStatus(state, text) {
  const el = $('status');
  el.className = `status ${state}`;
  el.textContent = text;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function addCard(text, isQ) {
  $('empty')?.remove();
  const card = el('div', `card${isQ ? ' q' : ''}`);
  const en = el('div', 'en', text);
  const ru = el('div', 'ru', '…');
  const keys = el('div', 'keys');
  const answers = el('div', 'answers');
  const meta = el('div', 'meta');
  card.append(en, ru, keys, answers, meta);
  const feed = $('feed');
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  feed.append(card);
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
  return { card, ru, keys, answers, meta };
}

function render(ui, parsed) {
  if (parsed.ru) ui.ru.textContent = parsed.ru;
  ui.keys.replaceChildren(...parsed.key.map((k) => el('span', 'chip', k)));
  ui.answers.replaceChildren(...parsed.answers.map((a) => {
    const b = el('button', 'answer', a);
    b.onclick = () => {
      navigator.clipboard?.writeText(a).catch(() => {});
      b.classList.add('copied');
      setTimeout(() => b.classList.remove('copied'), 800);
    };
    return b;
  }));
}

// ---------- pipeline ----------
function handleLine(text) {
  const isQ = isQuestion(text);
  const ui = addCard(text, isQ);
  const ctx = history.slice(-3);
  history.push(text);
  lastLine = { text, ui, ctx };
  run(text, ui, isQ, ctx);
}

function run(text, ui, answer, ctx) {
  if (answer) currentAbort?.abort();
  const ac = new AbortController();
  if (answer) currentAbort = ac;
  const messages = answer
    ? buildAnswerMessages({ resume: settings.resume, job: settings.job, style: settings.style, history: ctx, question: text })
    : buildTranslateMessages(text);

  chain = chain.then(async () => {
    if (ac.signal.aborted) return;
    const t0 = performance.now();
    try {
      const p = getProvider();
      await p.ready();
      await p.stream(messages, {
        signal: ac.signal,
        onToken: (full) => render(ui, answer ? parseReply(full) : { ru: full.replace(/^\s*RU:\s*/i, ''), key: [], answers: [] }),
      });
      ui.meta.textContent = `LLM ${((performance.now() - t0) / 1000).toFixed(1)}s`;
      if (listening) setStatus('listening', 'Listening…');
    } catch (e) {
      if (ac.signal.aborted) { ui.ru.textContent = ui.ru.textContent === '…' ? '(superseded by a newer question)' : ui.ru.textContent; return; }
      ui.ru.textContent = '';
      ui.meta.replaceChildren(el('span', 'err', e.message));
    }
  });
}

// ---------- capture ----------
function onSttEvent(msg) {
  if (msg.type === 'status') {
    listening = msg.state === 'listening';
    setStatus(msg.state, msg.detail);
    $('btn-start').textContent = listening || msg.state === 'loading' ? 'Stop' : 'Start listening';
    $('btn-start').classList.toggle('on', listening || msg.state === 'loading');
    if (msg.state === 'idle') $('level').style.width = '0';
  } else if (msg.type === 'text') {
    handleLine(msg.text);
  } else if (msg.type === 'level') {
    $('level').style.width = `${Math.round(msg.level * 100)}%`;
  } else if (msg.type === 'error') {
    setStatus('error', msg.error);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.from === 'offscreen') onSttEvent(msg);
});

$('btn-start').onclick = async () => {
  const running = $('btn-start').classList.contains('on');
  if (IN_PAGE) {
    if (running) { await stt?.stop(); onSttEvent({ type: 'status', state: 'idle', detail: 'Stopped' }); return; }
    setStatus('loading', 'Starting…');
    getProvider().ready().catch((e) => setStatus('error', e.message));
    try {
      stt ??= (await import('./lib/stt.js')).createStt(onSttEvent);
      await stt.start({ model: settings.sttModel, getStream: openAudioInput });
    } catch (e) {
      onSttEvent({ type: 'error', error: e.message });
      onSttEvent({ type: 'status', state: 'idle', detail: 'Stopped' });
    }
    return;
  }
  if (running) {
    await chrome.runtime.sendMessage({ target: 'background', type: 'capture:stop' });
    return;
  }
  setStatus('loading', 'Starting…');
  const res = await chrome.runtime.sendMessage({ target: 'background', type: 'capture:start', model: settings.sttModel });
  if (!res?.ok) setStatus('error', res?.error || 'Failed to start');
  // Warm the answer engine while the speech model loads.
  getProvider().ready().catch((e) => setStatus('error', e.message));
};

$('btn-devices').onclick = () => populateDevices(true);
$('btn-settings').onclick = () => { $('settings').hidden = !$('settings').hidden; };
for (const f of FIELDS) $(f).addEventListener('change', saveSettings);

$('manual').onsubmit = (e) => {
  e.preventDefault();
  const v = $('manual-input').value.trim();
  if (v) handleLine(v);
  $('manual-input').value = '';
};
$('btn-last').onclick = () => {
  if (lastLine) run(lastLine.text, lastLine.ui, true, lastLine.ctx);
};

await loadSettings();
