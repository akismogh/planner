import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two build targets share this config:
//
//   • Local dev (`npm start` / `npm run dev`): base '/', proxies /api to the
//     Express server on 127.0.0.1:3001. Unchanged behavior.
//
//   • GitHub Pages (`npm run build:gh`, mode === 'github'): base './' so the
//     built assets resolve correctly under https://user.github.io/<repo>/
//     regardless of the repository name. No server, no proxy needed.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Relative base for the GitHub build so it works at any sub-path.
  base: mode === 'github' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
}));
