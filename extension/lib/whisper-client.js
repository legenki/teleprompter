// Main-thread handle to the Whisper worker: load(model) and transcribe(samples, options) as promises.
export function createWhisper({ onProgress } = {}) {
  let worker = null;
  let seq = 0;
  let loadedModel = null;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { onProgress?.(data); return; }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.error));
      else p.resolve(data);
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || 'Whisper worker crashed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker = null;
      loadedModel = null;
    };
    return worker;
  }

  function call(message, transfer) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ensureWorker().postMessage({ ...message, id }, transfer || []);
    });
  }

  return {
    isLoaded: (model) => loadedModel === model,
    async load(model) {
      if (loadedModel === model) return;
      loadedModel = null;
      await call({
        type: 'load',
        model,
        wasmPaths: {
          mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.mjs'),
          wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.wasm'),
        },
      });
      loadedModel = model;
    },
    async transcribe(samples, options = {}) {
      const { text } = await call({ type: 'run', samples, options }, [samples.buffer]);
      return text;
    },
    dispose() {
      worker?.terminate();
      worker = null;
      loadedModel = null;
    },
  };
}
