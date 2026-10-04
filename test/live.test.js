import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  LiveTranscriber, PcmChunker, buildSetupVariants, createAssembler, extractVocabulary, floatToPcm16,
  isFatalLiveReason, liveUrl, parseServerMessage,
} from '../extension/lib/live-transcribe.js';

const require = createRequire(import.meta.url);
const { WebSocketServer, WebSocket } = require('ws');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await wait(15); } };
const quiet = () => {};

test('extractVocabulary keeps tech terms and proper nouns, drops filler words', () => {
  const v = extractVocabulary('We use Kubernetes, gRPC and Node.js with PostgreSQL. The role needs C++ and TypeScript. Kubernetes is key.', 'Senior engineer at Spotify');
  for (const w of ['Kubernetes', 'gRPC', 'Node.js', 'PostgreSQL', 'TypeScript', 'Spotify']) assert.ok(v.includes(w), w);
  assert.equal(v[0], 'Kubernetes'); // most frequent first
  for (const w of ['The', 'We', 'role', 'Senior', 'and']) assert.ok(!v.includes(w), w);
  // sentence-initial plain words are not proper nouns; mid-sentence and list items are
  const v2 = extractVocabulary('Engineering manager, Kubernetes, hiring. Experience with Terraform and Docker.\nPython and Go');
  assert.deepEqual(v2.sort(), ['Docker', 'Kubernetes', 'Terraform']);
  assert.ok(v.length <= 100);
});

test('buildSetupVariants: probing order, language and vocabulary only where supported', () => {
  const v = buildSetupVariants({ languageCode: 'es-ES', vocabulary: ['Kubernetes'] });
  assert.equal(v[0].setup.model, 'models/gemini-3.5-transcribe-live');
  assert.deepEqual(v[0].setup.generationConfig.transcriptionConfig, { languageCodes: ['es-ES'], customVocabulary: ['Kubernetes'] });
  assert.ok(v[1].setup.transcriptionConfig);
  assert.equal(v[2].version, 'v1alpha');
  assert.deepEqual(v.at(-1).setup, { model: 'models/gemini-3.5-transcribe-live' });
  // nothing to configure -> only the plain variants
  assert.ok(buildSetupVariants({}).every((x) => !JSON.stringify(x.setup).includes('transcriptionConfig')));
  assert.match(liveUrl('a b', 'v1alpha'), /v1alpha\.GenerativeService\.BidiGenerateContent\?key=a%20b$/);
});

test('PcmChunker emits 100 ms chunks of little-endian 16-bit PCM', () => {
  const c = new PcmChunker(1600);
  assert.equal(c.push(new Float32Array(1000)).length, 0);
  const out = c.push(new Float32Array(1000).fill(1));
  assert.equal(out.length, 1);
  assert.equal(Buffer.from(out[0], 'base64').length, 3200);
  const pcm = floatToPcm16(Float32Array.from([1, -1, 0]));
  assert.deepEqual([...pcm], [32767, -32768, 0]);
  assert.equal(c.push(new Float32Array(2200)).length, 1); // 600 left over + 2200 = 2800 -> one chunk, 1200 kept
});

test('parseServerMessage handles several plausible transcript shapes', () => {
  assert.equal(parseServerMessage('{"setupComplete":{}}').setupComplete, true);
  assert.equal(parseServerMessage('{"goAway":{"timeLeft":"5s"}}').goAway, true);
  assert.equal(parseServerMessage('{"error":{"message":"boom"}}').error, 'boom');
  assert.equal(parseServerMessage('not json').texts.length, 0);

  assert.deepEqual(parseServerMessage('{"serverContent":{"inputTranscription":{"text":"hello"}}}').texts, [{ text: 'hello', final: null }]);
  assert.deepEqual(parseServerMessage('{"serverContent":{"inputTranscription":{"text":"hello world","isFinal":true}}}').texts, [{ text: 'hello world', final: true }]);
  assert.deepEqual(parseServerMessage('{"transcript":"so tell me","is_final":false}').texts, [{ text: 'so tell me', final: false }]);
  assert.deepEqual(parseServerMessage('{"serverContent":{"transcription":{"text":"x","type":"FINAL"}}}').texts, [{ text: 'x', final: true }]);
  assert.equal(parseServerMessage('{"serverContent":{"turnComplete":true}}').turnComplete, true);
});

test('assembler: cumulative interim, incremental fragments, explicit final, idle flush', () => {
  const timers = [];
  const rec = { interim: [], final: [] };
  const a = createAssembler({
    onInterim: (t) => rec.interim.push(t), onFinal: (t) => rec.final.push(t),
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
  });

  a.push({ text: 'tell me', final: false });
  a.push({ text: 'tell me about', final: false });        // cumulative: replaces
  a.push({ text: 'tell me about yourself', final: true }); // final replaces pending
  assert.deepEqual(rec.interim, ['tell me', 'tell me about']);
  assert.deepEqual(rec.final, ['tell me about yourself']);

  a.push({ text: 'what is', final: null });
  a.push({ text: ' your', final: null });                  // incremental: appends
  a.push({ text: ' biggest weakness?', final: null });
  assert.equal(rec.interim.at(-1), 'what is your biggest weakness?');
  timers.at(-1)();                                         // idle timer fires
  assert.deepEqual(rec.final, ['tell me about yourself', 'what is your biggest weakness?']);

  a.push({ text: 'thanks', final: null });
  a.flush();                                               // turnComplete
  assert.equal(rec.final.at(-1), 'thanks');
  a.flush();
  assert.equal(rec.final.length, 3); // nothing pending, nothing emitted twice
});

test('isFatalLiveReason separates auth/quota from protocol errors', () => {
  assert.equal(isFatalLiveReason('API key not valid. Please pass a valid API key.'), true);
  assert.equal(isFatalLiveReason('closed 1008 RESOURCE_EXHAUSTED'), true);
  assert.equal(isFatalLiveReason('Invalid JSON payload received. Unknown name "transcriptionConfig"'), false);
});

// ---------- against a real WebSocket server ----------
async function mockServer(onConnection) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const conns = [];
  wss.on('connection', (ws, req) => {
    const conn = { ws, url: req.url, setups: [], audioChunks: 0 };
    conns.push(conn);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.setup) { conn.setups.push(m.setup); onConnection(conn, m.setup); }
      else if (m.realtimeInput?.audio) {
        conn.audioChunks++;
        assert.equal(m.realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
        conn.onAudio?.(conn.audioChunks);
      }
    });
  });
  await new Promise((r) => wss.on('listening', r));
  const port = wss.address().port;
  return { wss, conns, endpoint: (key, ver) => `ws://127.0.0.1:${port}/${ver}?key=${encodeURIComponent(key)}`, close: () => new Promise((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(r); }) };
}

const tone = () => Float32Array.from({ length: 1600 }, (_, i) => 0.3 * Math.sin(i / 7));
const opts = (srv, extra = {}) => ({ key: 'KEY', language: 'es', vocabulary: ['Kubernetes'], WebSocketImpl: WebSocket, endpoint: srv.endpoint, log: quiet, ...extra });

test('probes setup variants until one is accepted, then streams audio and returns transcripts', async () => {
  const srv = await mockServer((conn, setup) => {
    const accepted = setup.model && !setup.generationConfig && !setup.transcriptionConfig; // only the plain shapes work
    if (!accepted) { conn.ws.close(1007, `Invalid JSON payload received. Unknown name at 'setup': ${Object.keys(setup).join(',')}`); return; }
    conn.ws.send(Buffer.from(JSON.stringify({ setupComplete: {} })), { binary: true }); // Google sends binary frames
    conn.onAudio = (n) => {
      if (n === 2) conn.ws.send(Buffer.from(JSON.stringify({ serverContent: { inputTranscription: { text: 'hola' } } })), { binary: true });
      if (n === 4) conn.ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'hola, ¿qué tal?', isFinal: true } } }));
    };
  });
  const got = { interim: [], final: [] };
  const lt = new LiveTranscriber(opts(srv, { onInterim: (t) => got.interim.push(t), onFinal: (t) => got.final.push(t) }));
  await lt.start();
  assert.equal(lt.variantIndex, 3, 'first three variants are rejected, "inputAudioTranscription" accepted');
  for (let i = 0; i < 5; i++) lt.sendAudio(tone());
  await until(() => got.final.length === 1);
  assert.deepEqual(got.interim, ['hola']);
  assert.deepEqual(got.final, ['hola, ¿qué tal?']);
  assert.ok(srv.conns.some((c) => c.url.startsWith('/v1alpha')), 'the v1alpha variant was tried');
  assert.ok(srv.conns.every((c) => c.url.includes('key=KEY')));
  lt.stop();
  await srv.close();
});

test('an invalid API key fails at once, without trying the other variants', async () => {
  const srv = await mockServer((conn) => conn.ws.close(1008, 'API key not valid. Please pass a valid API key.'));
  const lt = new LiveTranscriber(opts(srv));
  await assert.rejects(lt.start(), /API key not valid/);
  assert.equal(srv.conns.length, 1);
  await srv.close();
});

test('a silent server times out per variant and reports a descriptive error', async () => {
  const srv = await mockServer(() => {});
  const lt = new LiveTranscriber(opts(srv, { vocabulary: [], language: '', connectTimeoutMs: 80 }));
  await assert.rejects(lt.start(), /no setup variant accepted \(bare model: no response within 80 ms\)/);
  await srv.close();
});

test('rotates to a fresh session without dropping audio', async () => {
  const srv = await mockServer((conn) => conn.ws.send(JSON.stringify({ setupComplete: {} })));
  const finals = [];
  const lt = new LiveTranscriber(opts(srv, { rotateMs: 250, onFinal: (t) => finals.push(t) }));
  await lt.start();
  assert.equal(srv.conns.length, 1);
  await until(() => srv.conns.length === 2, 2000);          // rotation opened the second socket
  await wait(60);
  for (let i = 0; i < 3; i++) lt.sendAudio(tone());
  await until(() => srv.conns[1].audioChunks === 3);
  assert.equal(srv.conns[0].audioChunks, 0, 'new audio goes to the new session');
  srv.conns[1].ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'after rotation', isFinal: true } } }));
  await until(() => finals.length === 1);
  lt.stop();
  await srv.close();
});

test('goAway triggers a rotation; a dropped socket reconnects and replays buffered audio', async () => {
  let n = 0;
  const srv = await mockServer((conn) => { n++; conn.ws.send(JSON.stringify({ setupComplete: {} })); });
  const lt = new LiveTranscriber(opts(srv, { rotateMs: 0 }));
  try {
    await lt.start();
    srv.conns[0].ws.send(JSON.stringify({ goAway: { timeLeft: '10s' } }));
    await until(() => srv.conns.length === 2, 2000);
    await until(() => lt.active === srv.conns[1].ws || lt.active?.url?.includes('/v1beta'), 2000);

    srv.conns[1].ws.terminate();                            // network drop on the active socket
    await until(() => lt.active === null, 2000);            // the client notices the close...
    lt.sendAudio(tone());                                   // ...so audio arriving now is buffered, not lost
    await until(() => srv.conns.length === 3, 4000);
    await until(() => srv.conns[2].audioChunks === 1, 2000);
    assert.equal(n, 3);
  } finally {
    lt.stop();
    await srv.close();
  }
});

test('repeated connection loss reports a fatal error so the caller can fall back to Whisper', async () => {
  const srv = await mockServer((conn) => {
    if (conn.setups.length && srv.conns.length === 1) conn.ws.send(JSON.stringify({ setupComplete: {} }));
    else conn.ws.close(1011, 'internal error');
  });
  let fatal = null;
  const lt = new LiveTranscriber(opts(srv, { rotateMs: 0, connectTimeoutMs: 300, onFatal: (e) => { fatal = e; } }));
  await lt.start();
  srv.conns[0].ws.close(1011, 'internal error');
  await until(() => fatal, 8000);
  assert.match(fatal.message, /connection lost|internal error/);
  lt.stop();
  await srv.close();
});
