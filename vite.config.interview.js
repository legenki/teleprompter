import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';

// transformers.js v4 runs both WebGPU and CPU through the asyncify build.
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
const OUT = 'dist/interview-web';

// The page is the extension's interview.html with the shim in front of the script.
function webPage() {
  return {
    name: 'interview-web-page',
    // 'pre': must run before Vite resolves the <script> entry, or the shim would never be bundled.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const out = html.replace('src="interview.js"', 'src="interview-web.js"');
        if (out === html) throw new Error('interview.html markup changed: web page transform no longer matches');
        return out;
      },
    },
    closeBundle() {
      mkdirSync(`${OUT}/ort`, { recursive: true });
      for (const f of ORT_FILES) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${OUT}/ort/${f}`);
      copyFileSync('extension/pcm-worklet.js', `${OUT}/pcm-worklet.js`);
      // The bundler also emits its own copy of the wasm in the root; it is never loaded.
      for (const dir of [OUT, `${OUT}/assets`]) {
        for (const f of readdirSync(dir)) if (f.startsWith('ort-wasm')) rmSync(`${dir}/${f}`);
      }
      renameSync(`${OUT}/interview.html`, `${OUT}/index.html`);
    },
  };
}

export default defineConfig({
  root: 'extension',
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    outDir: resolve(__dirname, OUT),
    emptyOutDir: true,
    rollupOptions: {
      input: { interview: resolve(__dirname, 'extension/interview.html') },
      output: { entryFileNames: 'assets/[name]-[hash].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
  plugins: [webPage()],
});
