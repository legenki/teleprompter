import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:   resolve(__dirname, 'web/index.html'),
        remote: resolve(__dirname, 'web/remote.html'),
      },
    },
  },
});
