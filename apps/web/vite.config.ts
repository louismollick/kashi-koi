import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // The router plugin must run before the React plugin. It regenerates src/routeTree.gen.ts, which is committed so
  // `tsc` works without a build.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Installable, with the app shell precached. The service worker only runs in production builds (`devOptions` is
    // off), and it handles nothing but same-origin app files: Navidrome and Kashi server requests (covers, audio,
    // lyrics, analyses) are cross-origin and never go through a cache.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kashi-Koi!',
        short_name: 'Kashi-Koi',
        description: 'Learn Japanese from the lyrics of the songs you listen to.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['music', 'education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell: scripts, styles, html and images. Fonts (hundreds of unicode-range subsets) and the 19 MB
        // tokenizer dictionary are cached on first use instead.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        globIgnores: ['dict/**', 'icons/maskable-512.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/dict\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/dict/'),
            handler: 'CacheFirst',
            options: { cacheName: 'kuromoji-dictionary', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
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
