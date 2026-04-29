import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const SERVER_ORIGIN = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/credentials': SERVER_ORIGIN,
      '/stocks': SERVER_ORIGIN,
      '/themes': SERVER_ORIGIN,
      '/favorites': SERVER_ORIGIN,
      '/settings': SERVER_ORIGIN,
      '/runtime': SERVER_ORIGIN,
      '/import': SERVER_ORIGIN,
      '/master': SERVER_ORIGIN,
      '/events': {
        target: SERVER_ORIGIN,
        changeOrigin: true,
        ws: false,
      },
    },
  },
});
