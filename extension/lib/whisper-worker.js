// Runs Whisper off the main thread so the UI never freezes during inference (CPU decoding can take seconds).
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useWasmCache = false; // wasm is bundled in the extension; the Cache API rejects extension URLs
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;

async function load({ model, wasmPaths }) {
  env.backends.onnx.wasm.wasmPaths = wasmPaths;
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) postMessage({ type: 'progress', percent: Math.round(p.progress) });
  };

  const hasWebGPU = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
  try {
    if (!hasWebGPU) throw new Error('no webgpu');
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device: 'webgpu',
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback,
    });
    return 'webgpu';
  } catch (e) {
    postMessage({ type: 'progress', percent: 0, note: 'WebGPU unavailable, using CPU…' });
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback,
    });
    return 'cpu';
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const device = await load(data);
      postMessage({ type: 'loaded', id: data.id, device });
    } else if (data.type === 'run') {
      const result = await transcriber(data.samples, { chunk_length_s: 30, ...data.options });
      postMessage({ type: 'result', id: data.id, text: (result.text || '').trim() });
    }
  } catch (e) {
    postMessage({ type: 'error', id: data.id, error: e.message || String(e) });
  }
};
