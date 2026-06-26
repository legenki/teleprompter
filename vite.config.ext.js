import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

function copyExtensionStatics() {
  return {
    name: 'copy-extension-statics',
    closeBundle() {
      const out = 'dist/extension';
      mkdirSync(`${out}/icons`, { recursive: true });
      copyFileSync('extension/sidebar.html',    `${out}/sidebar.html`);
      copyFileSync('extension/fullscreen.html', `${out}/fullscreen.html`);
      copyFileSync('extension/sidebar.css',     `${out}/sidebar.css`);
      copyFileSync('src/styles/app.css',        `${out}/app.css`);
      copyFileSync('extension/manifest.json',   `${out}/manifest.json`);
      copyFileSync('extension/icons/icon-16.png',  `${out}/icons/icon-16.png`);
      copyFileSync('extension/icons/icon-48.png',  `${out}/icons/icon-48.png`);
      copyFileSync('extension/icons/icon-128.png', `${out}/icons/icon-128.png`);
    }
  };
}

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar:    resolve(__dirname, 'extension/sidebar.js'),
        fullscreen: resolve(__dirname, 'extension/fullscreen.js'),
        background: resolve(__dirname, 'extension/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extmd]',
      },
    },
  },
  plugins: [copyExtensionStatics()],
});
