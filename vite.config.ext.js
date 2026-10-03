import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'fs';

// transformers.js v4 runs both WebGPU and CPU through the asyncify build.
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

function copyExtensionStatics() {
  return {
    name: 'copy-extension-statics',
    closeBundle() {
      const out = 'dist/extension';
      mkdirSync(`${out}/icons`, { recursive: true });
      copyFileSync('extension/sidebar.html',    `${out}/sidebar.html`);
      copyFileSync('extension/fullscreen.html', `${out}/fullscreen.html`);
      copyFileSync('extension/sidebar.css',     `${out}/sidebar.css`);
      copyFileSync('extension/interview.html',  `${out}/interview.html`);
      copyFileSync('extension/interview.css',   `${out}/interview.css`);
      copyFileSync('extension/offscreen.html',  `${out}/offscreen.html`);
      copyFileSync('extension/pcm-worklet.js',  `${out}/pcm-worklet.js`);
      // onnxruntime must be served locally: MV3 forbids loading code from a CDN.
      mkdirSync(`${out}/ort`, { recursive: true });
      for (const f of ORT_FILES) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
      // The bundler also emits its own copy of the wasm next to the entry points; it is never loaded.
      for (const f of readdirSync(out)) if (f.startsWith('ort-wasm')) rmSync(`${out}/${f}`);
      copyFileSync('src/styles/app.css',        `${out}/app.css`);
      copyFileSync('extension/manifest.json',   `${out}/manifest.json`);
      copyFileSync('extension/icons/icon-16.png',  `${out}/icons/icon-16.png`);
      copyFileSync('extension/icons/icon-48.png',  `${out}/icons/icon-48.png`);
      copyFileSync('extension/icons/icon-128.png', `${out}/icons/icon-128.png`);
    }
  };
}

export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar:    resolve(__dirname, 'extension/sidebar.js'),
        fullscreen: resolve(__dirname, 'extension/fullscreen.js'),
        background: resolve(__dirname, 'extension/background.js'),
        interview:  resolve(__dirname, 'extension/interview.js'),
        offscreen:  resolve(__dirname, 'extension/offscreen.js'),
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
