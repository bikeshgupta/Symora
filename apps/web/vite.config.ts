import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  // Without this, Vite's root defaults to process.cwd() at invocation time — fine for
  // `npm run dev` (cwd is already apps/web), but `vercel dev` spawns this config's
  // devCommand from the repo root, which has no index.html. Anchoring root to this
  // config file's own directory makes it work no matter where it's invoked from.
  root: fileURLToPath(new URL('.', import.meta.url)),
  // The monorepo keeps one .env at the repo root (two levels up from apps/web, where
  // this dev server actually runs) rather than duplicating it per app — Vite only
  // looks in its own root by default, so this has to be pointed there explicitly.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Symora',
        short_name: 'Symora',
        description: 'A personal assistant that remembers what matters.',
        theme_color: '#7c3aed',
        background_color: '#fbf9f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
