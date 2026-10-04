import { createProvider, GEMINI_MODELS } from './llm.js';
import { GEMINI_STT_MODEL } from './lib/gemini.js';
import { isQuestion } from './lib/question.js';
import { whisperModelId, defaultSize } from './lib/stt-models.js';
import { createPhoneLink } from './lib/phone-link.js';
import { extractVocabulary } from './lib/live-transcribe.js';
import { buildAnswerMessages, buildTranslateMessages, parseReply } from './lib/prompt.js';

const KEY = 'copilot.settings';
const DEFAULTS = {
  geminiKey: '', geminiModel: GEMINI_MODELS[0], sttEngine: 'whisper', interviewerLang: 'en', answerLang: 'en',
  audioDevice: '', phoneEnabled: 'off', phoneRelay: 'localhost:3100', phoneToken: '', resume: '', job: '',
};
const FIELDS = Object.keys(DEFAULTS);
const SEGMENTED = ['interviewerLang', 'answerLang', 'sttEngine'];
const $ = (id) => document.getElementById(id);

// Firefox and the web page have no tabCapture/offscreen: capture an audio input (tab audio / virtual cable)
// and run Whisper in this page.
const IN_PAGE = !chrome.tabCapture || new URLSearchParams(location.search).has('inpage');
const TAB = '__tab__';
const CAN_SHARE_TAB = !!navigator.mediaDevices?.getDisplayMedia && /Chrome|Edg\//.test(navigator.userAgent) && !/Mobile|Android/.test(navigator.userAgent);
const CABLE = /blackhole|vb-?cable|cable output|loopback|monitor of|soundflower|voicemeeter/i;

let settings = { ...DEFAULTS };
let cardSeq = 0;
let stt = null;
let provider = null;
let providerSig = '';
let listening = false;
let history = [];
let currentAbort = null;
let chain = Promise.resolve();

const phone = createPhoneLink({
  getSettings: () => settings,
  onState: (state, detail) => {
    $('phone-status').textContent = {
      off: 'Run npm run phone, then open the printed link on your phone.',
      connecting: detail || 'Connecting to the relay…',
      connected: 'Connected. Open the link printed by npm run phone on your phone.',
      error: detail || 'Relay error.',
    }[state];
  },
});
const publish = (ui, immediate) => phone.publish({ ...ui.data }, immediate);

// ---------- helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const ICON_COPY = '<svg class="cp" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 5.5V4a1.8 1.8 0 0 0-1.8-1.8H4A1.8 1.8 0 0 0 2.2 4v4.7A1.8 1.8 0 0 0 4 10.5h1.5"/></svg>'
  + '<svg class="ok" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';

// ---------- segmented controls ----------
function setSeg(field, value) {
  const root = document.querySelector(`.seg[data-field="${field}"]`);
  const buttons = [...root.querySelectorAll('button')];
  root.dataset.count = buttons.length;
  const idx = Math.max(0, buttons.findIndex((b) => b.dataset.value === value));
  root.style.setProperty('--i', idx);
  buttons.forEach((b, i) => b.setAttribute('aria-checked', String(i === idx)));
}

function bindSeg(field) {
  const root = document.querySelector(`.seg[data-field="${field}"]`);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || settings[field] === b.dataset.value) return;
    settings[field] = b.dataset.value;
    setSeg(field, settings[field]);
    onSettingChanged(field);
  });
}

// ---------- settings ----------
function applySettingsToUi() {
  for (const f of FIELDS) {
    if (SEGMENTED.includes(f)) setSeg(f, settings[f]);
    else if (f === 'phoneEnabled') $(f).checked = settings[f] === 'on';
    else $(f).value = settings[f];
  }
  syncReveals();
}

function syncReveals() {
  $('stt-note').classList.toggle('open', settings.sttEngine !== 'whisper');
  $('phone-fields').classList.toggle('open', settings.phoneEnabled === 'on');
}

function onSettingChanged(field) {
  chrome.storage.local.set({ [KEY]: Object.fromEntries(FIELDS.map((f) => [f, settings[f]])) });
  syncReveals();
  phone.sync();
  // The speech model and language are fixed at start: stop so the next Start picks up the new language.
  if (field === 'interviewerLang' && $('btn-start').classList.contains('on')) {
    $('btn-start').click();
    setTimeout(() => setStatus('idle', 'Language changed. Press Start.'), 300);
  }
}

async function loadSettings() {
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  settings = { ...DEFAULTS, ...Object.fromEntries(FIELDS.filter((f) => f in stored).map((f) => [f, stored[f]])) };
  for (const m of GEMINI_MODELS) $('geminiModel').add(new Option(m, m));
  // 2.5 Flash was the old default and has tighter free limits than 3.5 Flash-Lite, so move people off it once.
  if (!GEMINI_MODELS.includes(settings.geminiModel) || settings.geminiModel === 'gemini-2.5-flash') settings.geminiModel = GEMINI_MODELS[0];

  if (IN_PAGE) {
    document.querySelectorAll('[data-inpage]').forEach((e) => { e.hidden = false; });
    await populateDevices(false);
  }
  applySettingsToUi();
  phone.sync();

  $('empty-steps').replaceChildren(...(IN_PAGE
    ? (CAN_SHARE_TAB
      ? ['Press Start', 'Pick the call tab', 'Tick “Also share tab audio”']
      : ['Route the call audio to a virtual cable', 'Press Start'])
    : ['Open the call tab', 'Click the extension icon there', 'Press Start']).map((t) => el('li', null, t)));
}

for (const f of FIELDS) {
  if (SEGMENTED.includes(f)) { bindSeg(f); continue; }
  $(f).addEventListener('change', () => {
    settings[f] = f === 'phoneEnabled' ? ($(f).checked ? 'on' : 'off') : $(f).value;
    onSettingChanged(f);
  });
}

// ---------- settings drawer ----------
function setDrawer(open) {
  const d = $('drawer');
  d.classList.toggle('open', open);
  d.inert = !open;
  $('btn-settings').setAttribute('aria-expanded', String(open));
  const scrim = $('scrim');
  if (open) {
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('on'));
    $('geminiKey').focus({ preventScroll: true });
  } else {
    scrim.classList.remove('on');
    setTimeout(() => { if (!d.classList.contains('open')) scrim.hidden = true; }, 220);
    $('btn-settings').focus({ preventScroll: true });
  }
}
$('btn-settings').onclick = () => setDrawer(!$('drawer').classList.contains('open'));
$('btn-close').onclick = () => setDrawer(false);
$('scrim').onclick = () => setDrawer(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('drawer').classList.contains('open')) setDrawer(false); });

// ---------- manual question ----------
function setComposer(open) {
  const f = $('composer');
  f.classList.toggle('open', open);
  f.inert = !open;
  $('btn-compose').setAttribute('aria-expanded', String(open));
  if (open) $('composer-input').focus({ preventScroll: true });
}
$('btn-compose').onclick = () => setComposer(!$('composer').classList.contains('open'));
$('composer').onsubmit = (e) => {
  e.preventDefault();
  const v = $('composer-input').value.trim();
  if (!v) return;
  $('composer-input').value = '';
  handleLine(v, undefined, true); // typed on purpose, so always answer it
};
$('composer-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { setComposer(false); $('btn-compose').focus(); } });

// ---------- audio sources ----------
async function populateDevices(askPermission) {
  if (askPermission) {
    // Labels are only exposed after the user grants audio permission once.
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    tmp?.getTracks().forEach((t) => t.stop());
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const sel = $('audioDevice');
  sel.replaceChildren(new Option('Auto: virtual cable', ''));
  if (CAN_SHARE_TAB) sel.add(new Option('Browser tab audio', TAB));
  for (const d of devices) sel.add(new Option(d.label || `Input ${sel.length}`, d.deviceId));
  const valid = (settings.audioDevice === TAB && CAN_SHARE_TAB) || devices.some((d) => d.deviceId === settings.audioDevice);
  sel.value = valid ? settings.audioDevice : '';
}
$('btn-devices').onclick = () => populateDevices(true);

// getDisplayMedia needs a user gesture, so this must be called straight from the click handler.
async function openTabAudio() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome requires a video track; it is discarded below
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('No audio was shared. Choose a browser tab and tick “Also share tab audio”.');
  }
  return stream;
}

async function openAudioInput() {
  let id = settings.audioDevice;
  if (!id) {
    await populateDevices(true);
    const match = [...$('audioDevice').options].find((o) => o.value && o.value !== TAB && CABLE.test(o.text));
    if (!match) throw new Error('No virtual audio cable found. Install BlackHole (macOS) or VB-Cable (Windows), route the call audio to it, then pick it in Settings.');
    id = match.value;
  }
  return navigator.mediaDevices.getUserMedia({
    // Processing must be off for a loopback source, or speech gets gated/ducked.
    audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
}

// ---------- engines ----------
function sttConfig() {
  const engine = settings.sttEngine;
  if (engine !== 'whisper' && !settings.geminiKey) throw new Error('Add a Gemini API key in Settings to use Gemini speech recognition.');
  const lang = settings.interviewerLang;
  return {
    model: whisperModelId(defaultSize(lang), lang),
    language: lang,
    engine,
    gemini: { key: settings.geminiKey, model: GEMINI_STT_MODEL, hint: settings.job.slice(0, 600) },
    vocabulary: engine === 'live' ? extractVocabulary(settings.job, settings.resume) : [],
  };
}

function getProvider() {
  const sig = JSON.stringify([settings.geminiKey, settings.geminiModel]);
  if (!provider || sig !== providerSig) {
    provider = createProvider(settings);
    providerSig = sig;
  }
  return provider;
}

// ---------- status ----------
function setStatus(state, text) {
  $('dot').dataset.state = state;
  const s = $('status');
  s.className = `status ${state}`;
  s.textContent = text;
  s.title = text; // the line is truncated; the tooltip keeps the full message
}

// ---------- live caption (interim text from Gemini Live) ----------
function setCaption(text) {
  const c = $('caption');
  if (text) c.textContent = text;
  c.classList.toggle('on', !!text);
}

// ---------- cards ----------
function addCard(text, isQ) {
  $('empty')?.remove();
  const card = el('article', `card${isQ ? ' q' : ''}`);
  const ru = el('p', 'ru pending');
  const en = el('p', 'en', text);
  const keys = el('ul', 'keys');
  const answers = el('ol', 'answers');
  const meta = el('p', 'meta');
  card.append(ru, en, keys, answers, meta);

  const feed = $('feed');
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  feed.append(card);
  if (nearBottom) feed.scrollTop = feed.scrollHeight;

  const ui = { card, ru, keys, answers, meta, data: { id: ++cardSeq, en: text, ru: '', isQ, keys: [], answers: [], meta: '' } };
  publish(ui, true);
  return ui;
}

function answerRow(i) {
  const b = el('button', 'answer');
  b.type = 'button';
  b.style.setProperty('--i', i);
  b.append(el('span', 'n', String(i + 1)), el('span', 't'));
  const c = el('span', 'c');
  c.innerHTML = ICON_COPY;
  b.append(c);
  b.onclick = () => {
    navigator.clipboard?.writeText(b.querySelector('.t').textContent).catch(() => {});
    b.classList.add('copied');
    setTimeout(() => b.classList.remove('copied'), 1000);
  };
  return b;
}

// Nodes are reused while the answer streams in, so entry animations play once per element, not per token.
function render(ui, parsed) {
  if (parsed.ru) {
    ui.ru.classList.remove('pending');
    if (ui.ru.textContent !== parsed.ru) ui.ru.textContent = parsed.ru;
  }
  parsed.key.forEach((k, i) => {
    let li = ui.keys.children[i];
    if (!li) ui.keys.append((li = el('li')));
    if (li.textContent !== k) li.textContent = k;
  });
  while (ui.keys.children.length > parsed.key.length) ui.keys.lastChild.remove();

  parsed.answers.forEach((a, i) => {
    let row = ui.answers.children[i];
    if (!row) ui.answers.append((row = answerRow(i)));
    const t = row.querySelector('.t');
    if (t.textContent !== a) t.textContent = a;
  });

  Object.assign(ui.data, { ru: ui.ru.classList.contains('pending') ? '' : ui.ru.textContent, keys: parsed.key, answers: parsed.answers });
  publish(ui);
}

// ---------- pipeline ----------
function handleLine(text, sttMs, forceQuestion = false) {
  const isQ = forceQuestion || isQuestion(text, settings.interviewerLang);
  const ui = addCard(text, isQ);
  const ctx = history.slice(-3);
  history.push(text);
  ui.sttMs = sttMs;
  run(text, ui, isQ, ctx);
}

function run(text, ui, answer, ctx) {
  if (answer) currentAbort?.abort();
  const ac = new AbortController();
  if (answer) currentAbort = ac;
  const messages = answer
    ? buildAnswerMessages({
      resume: settings.resume, job: settings.job, history: ctx, question: text,
      interviewerLang: settings.interviewerLang, answerLang: settings.answerLang,
    })
    : buildTranslateMessages(text, settings.interviewerLang);

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
      ui.meta.textContent = `${ui.sttMs != null ? `STT ${(ui.sttMs / 1000).toFixed(1)}s · ` : ''}LLM ${((performance.now() - t0) / 1000).toFixed(1)}s`;
      ui.data.meta = ui.meta.textContent;
      publish(ui, true);
      if (listening) setStatus('listening', 'Listening');
    } catch (e) {
      ui.ru.classList.remove('pending');
      if (ac.signal.aborted) {
        if (!ui.ru.textContent) ui.ru.textContent = 'Skipped: a newer question arrived';
        ui.data.ru = ui.ru.textContent;
      } else {
        ui.ru.textContent = '';
        ui.meta.className = 'meta err';
        ui.meta.textContent = e.message;
        ui.data.ru = '';
        ui.data.meta = e.message;
      }
      publish(ui, true);
    }
  });
}

// ---------- capture ----------
function onSttEvent(msg) {
  if (msg.type === 'status') {
    listening = msg.state === 'listening';
    setStatus(msg.state, msg.detail);
    const on = listening || msg.state === 'loading';
    $('btn-start').textContent = on ? 'Stop' : 'Start';
    $('btn-start').classList.toggle('on', on);
    $('level').parentElement.classList.toggle('on', listening);
    if (!listening) { $('level').style.transform = 'scaleX(0)'; if (!on) setCaption(''); }
  } else if (msg.type === 'interim') {
    setCaption(msg.text);
  } else if (msg.type === 'text') {
    setCaption('');
    handleLine(msg.text, msg.sttMs);
  } else if (msg.type === 'level') {
    $('level').style.transform = `scaleX(${msg.level.toFixed(3)})`;
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
    let tabStream = null;
    try {
      // Await the picker first: a cancelled share fails immediately instead of after the model download.
      if (settings.audioDevice === TAB) tabStream = await openTabAudio();
      const cfg = sttConfig();
      stt ??= (await import('./lib/stt.js')).createStt(onSttEvent);
      await stt.start({ ...cfg, getStream: tabStream ? async () => tabStream : openAudioInput });
    } catch (e) {
      tabStream?.getTracks().forEach((t) => t.stop());
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
  let res;
  try {
    res = await chrome.runtime.sendMessage({ target: 'background', type: 'capture:start', ...sttConfig() });
  } catch (e) {
    res = { ok: false, error: e.message };
  }
  if (!res?.ok) setStatus('error', res?.error || 'Failed to start');
  // Warm the answer engine while the speech model loads.
  getProvider().ready().catch((e) => setStatus('error', e.message));
};

await loadSettings();
