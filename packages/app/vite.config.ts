import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  server: {
    host: true,
    port: 3010,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3001',
    },
  },
  preview: {
    host: true,
    port: 3010,
  },
});
