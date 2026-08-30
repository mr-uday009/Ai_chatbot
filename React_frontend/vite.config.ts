import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:3001',
      '/system-status': 'http://127.0.0.1:3001',
      '/chat': 'http://127.0.0.1:3001',
      '/access': 'http://127.0.0.1:3001',
    },
  },
});
