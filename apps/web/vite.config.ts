import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // The router plugin must run before the React plugin. It regenerates src/routeTree.gen.ts, which is committed so
  // `tsc` works without a build.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path('./src'),
      // Static art (harbor, logo) is shared with the iOS app in place instead of being copied.
      '@assets': path('../mobile/assets'),
    },
  },
  server: { port: 5191, strictPort: true },
  preview: { port: 5191, strictPort: true },
});
