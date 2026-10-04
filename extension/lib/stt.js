// Shared speech-to-text engine: audio stream -> utterances -> local Whisper -> text events.
// Used by the Chrome offscreen document and, in Firefox, directly by the interview page.
import { createWhisper } from './whisper-client.js';
import { Segmenter } from './segmenter.js';
import { isNoise } from './question.js';
import { whisperOptions } from './stt-models.js';
import { geminiTranscribe, isFatalGeminiError } from './gemini-stt.js';
import { LiveTranscriber } from './live-transcribe.js';

// send({ type: 'status' | 'text' | 'level' | 'error', ... })
export function createStt(send) {
  const whisper = createWhisper({
    onProgress: (p) => send({ type: 'status', state: 'loading', detail: p.note || `Speech model ${p.percent}%` }),
  });
  let playbackCtx = null;
  let analysisCtx = null;
  let stream = null;
  let segmenter = null;
  let queue = Promise.resolve();
  let pendingJobs = 0;
  let cfg = { engine: 'whisper', model: '', language: 'en', gemini: null };
  let geminiOff = false;
  let previous = '';
  let live = null;
  let liveDead = true;
  let liveFailure = '';

  async function loadModel(model) {
    if (whisper.isLoaded(model)) return;
    send({ type: 'status', state: 'loading', detail: `Loading speech model ${model}…` });
    await whisper.load(model);
  }

  async function whisperText(samples) {
    await loadModel(cfg.model);
    return whisper.transcribe(samples, whisperOptions(cfg.language));
  }

  async function recognize(samples) {
    if (cfg.engine === 'gemini' && !geminiOff) {
      try {
        return await geminiTranscribe(samples, cfg.gemini, previous);
      } catch (e) {
        if (isFatalGeminiError(e)) {
          geminiOff = true;
          send({ type: 'status', state: 'loading', detail: `Gemini unavailable (${e.status}), switching to local Whisper…` });
          const text = await whisperText(samples);
          send({ type: 'status', state: 'listening', detail: 'Listening (local Whisper fallback)…' });
          return text;
        }
        send({ type: 'error', error: `Gemini: ${e.message} (this phrase used local Whisper)` });
      }
    }
    return whisperText(samples);
  }

  function transcribe(samples, durationMs) {
    pendingJobs++;
    queue = queue.then(async () => {
      try {
        const t0 = performance.now();
        const text = await recognize(samples);
        if (!isNoise(text)) {
          previous = text;
          send({ type: 'text', text, audioMs: durationMs, sttMs: Math.round(performance.now() - t0) });
        }
      } catch (e) {
        send({ type: 'error', error: `Transcription failed: ${e.message}` });
      } finally {
        pendingJobs--;
      }
    });
  }

  // Gemini Live is gone (or never started): audio now goes through the local segmenter + Whisper.
  async function fallBackToWhisper(reason) {
    if (liveDead) return;
    liveDead = true;
    live?.stop();
    live = null;
    send({ type: 'error', error: `Gemini Live: ${reason}. Using on-device Whisper.` });
    send({ type: 'status', state: 'loading', detail: 'Switching to on-device Whisper…' });
    try {
      await loadModel(cfg.model);
      send({ type: 'status', state: 'listening', detail: `Listening on-device. Live: ${reason}` });
    } catch (e) {
      send({ type: 'error', error: `Whisper failed to load: ${e.message}` });
    }
  }

  async function stop() {
    live?.stop();
    live = null;
    liveDead = true;
    segmenter?.flush();
    segmenter = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    await playbackCtx?.close().catch(() => {});
    await analysisCtx?.close().catch(() => {});
    playbackCtx = analysisCtx = null;
  }

  // getStream: () => Promise<MediaStream>. playback: replay the stream (needed for muted tab capture).
  // engine: 'whisper' | 'gemini' | 'live'. With gemini/live, Whisper is only loaded if Gemini fails.
  async function start({ getStream, model, language = 'en', playback = false, engine = 'whisper', gemini = null, vocabulary = [] }) {
    await stop();
    if (engine !== 'whisper' && !gemini?.key) throw new Error('Add a Gemini API key in Settings to use Gemini speech recognition.');
    cfg = { engine, model, language, gemini: gemini && { ...gemini, language } };
    geminiOff = false;
    previous = '';
    liveFailure = '';

    if (engine === 'live') {
      send({ type: 'status', state: 'loading', detail: 'Connecting to Gemini Live…' });
      const lt = new LiveTranscriber({
        key: gemini.key,
        language,
        vocabulary,
        onInterim: (text) => send({ type: 'interim', text }),
        onFinal: (text) => {
          if (isNoise(text)) return;
          previous = text;
          send({ type: 'text', text, live: true });
        },
        // server-side errors are messages, not a state change (the session is still running)
        onStatus: (state, detail) => send(state === 'error' ? { type: 'error', error: detail } : { type: 'status', state, detail }),
        onFatal: (err) => fallBackToWhisper(err.message),
      });
      try {
        await lt.start();
        live = lt;
        liveDead = false;
      } catch (e) {
        // Say why, then carry on with on-device recognition instead of failing the whole session.
        send({ type: 'error', error: `Gemini Live: ${e.message}. Using on-device Whisper.` });
        liveFailure = e.message;
        engine = 'whisper';
        cfg.engine = 'whisper';
      }
    }
    if (engine === 'whisper') await loadModel(model);
    stream = await getStream();

    if (playback) {
      playbackCtx = new AudioContext();
      playbackCtx.createMediaStreamSource(stream).connect(playbackCtx.destination);
    }

    analysisCtx = new AudioContext({ sampleRate: 16000 });
    await analysisCtx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    const node = new AudioWorkletNode(analysisCtx, 'pcm-forwarder');
    analysisCtx.createMediaStreamSource(stream).connect(node);

    // The segmenter is also the fallback path when Gemini Live drops mid-interview.
    // Batch Gemini costs one request per utterance: wait for longer pauses to send whole questions.
    segmenter = new Segmenter({
      ...(engine === 'gemini' && { silenceMs: 1100, maxUtteranceMs: 25000 }),
      onUtterance: ({ samples, durationMs }) => transcribe(samples, durationMs),
    });

    let lastLevel = 0;
    node.port.onmessage = (e) => {
      if (live && !liveDead) live.sendAudio(e.data);
      else segmenter?.push(e.data);
      const now = performance.now();
      if (now - lastLevel > 150) {
        lastLevel = now;
        let sum = 0;
        for (const v of e.data) sum += v * v;
        send({ type: 'level', level: Math.min(1, Math.sqrt(sum / e.data.length) * 8), backlog: pendingJobs });
      }
    };

    stream.getAudioTracks()[0].addEventListener('ended', () => {
      stop();
      send({ type: 'status', state: 'idle', detail: 'Audio source ended' });
    });
    send({ type: 'status', state: 'listening', detail: live ? 'Listening (Live)' : liveFailure ? `Listening on-device. Live: ${liveFailure}` : 'Listening…' });
  }

  return { start, stop };
}
