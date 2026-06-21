import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [preact(), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/index.html',
        settings: 'src/settings/index.html',
        onboarding: 'src/onboarding/index.html',
        offscreen: 'src/offscreen/index.html',
      },
    },
  },
});
