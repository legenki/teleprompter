import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'fs';

// transformers.js v4 runs both WebGPU and CPU through the asyncify build.
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

function copyExtensionStatics() {
  return {
    name: 'copy-firefox-statics',
    closeBundle() {
      const out = 'dist/firefox';
      mkdirSync(`${out}/icons`, { recursive: true });
      mkdirSync(`${out}/ort`, { recursive: true });
      for (const f of ['interview.html', 'interview.css', 'pcm-worklet.js']) {
        copyFileSync(`extension/${f}`, `${out}/${f}`);
      }
      copyFileSync('extension/manifest.firefox.json', `${out}/manifest.json`);
      for (const s of [16, 48, 128]) copyFileSync(`extension/icons/icon-${s}.png`, `${out}/icons/icon-${s}.png`);
      for (const f of ORT_FILES) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
      // The bundler also emits its own copy of the wasm in the root; it is never loaded.
      for (const f of readdirSync(out)) if (f.startsWith('ort-wasm')) rmSync(`${out}/${f}`);
    }
  };
}

export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    outDir: 'dist/firefox',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        interview:  resolve(__dirname, 'extension/interview.js'),
        background: resolve(__dirname, 'extension/background.firefox.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [copyExtensionStatics()],
});
