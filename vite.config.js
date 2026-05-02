import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  base: '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  // Production build settings — keep esbuild minifier (Vite default, no extra
  // dep). drop:console strips logs from prod bundles. sourcemap is off in prod
  // to shave bundle download + avoid leaking source paths.
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy libs into separate chunks so route-level lazy loading
        // can actually skip them. Without this, Recharts/TipTap/framer-motion
        // all land in the single vendor chunk and ship on initial load.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts')) return 'recharts';
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'tiptap';
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('exceljs')) return 'exceljs';
          if (id.includes('marked')) return 'markdown';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router')) return 'router';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
        'pwa-icon-192x192.png',
        'pwa-icon-512x512.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Auth + state + sync: never cache, never abort.
          { urlPattern: /\/api\/auth\//, handler: 'NetworkOnly', method: 'GET' },
          { urlPattern: /\/api\/state/, handler: 'NetworkOnly', method: 'GET' },
          { urlPattern: /\/api\/sync\//, handler: 'NetworkOnly', method: 'GET' },

          // Mutations: NetworkOnly has no timeout, so the SW never aborts a
          // slow save. Workbox runtimeCaching matches a single method per
          // entry, so every verb gets its own rule.
          //
          // Intentionally NOT using Workbox BackgroundSyncPlugin here. With
          // the current full-state-blob model (PUT /api/state replaces the
          // entire user state), a queued original request body becomes stale
          // the moment the user makes another offline edit — replaying it
          // would overwrite the newer in-memory state and lose data.
          // src/lib/syncDb.js's localStorage outbox already handles offline
          // retry correctly: it uses dbRef.current (the latest state) on
          // each retry, not the snapshot from the time of the failed save.
          // Revisit BackgroundSync after the migration to per-entity tables
          // (each mutation becomes idempotent and stateless).
          { urlPattern: /\/api\//, handler: 'NetworkOnly', method: 'POST' },
          { urlPattern: /\/api\//, handler: 'NetworkOnly', method: 'PUT' },
          { urlPattern: /\/api\//, handler: 'NetworkOnly', method: 'PATCH' },
          { urlPattern: /\/api\//, handler: 'NetworkOnly', method: 'DELETE' },

          // Admin-managed changelog — stale-while-revalidate keeps the
          // changelog instant on slow networks.
          {
            urlPattern: /\/api\/updates(\?|$|\/)/,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'api-updates-cache-v1',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
            },
          },

          // All other GET /api/* — NetworkFirst with raised timeout.
          // 30 s absorbs slow Neon cold-starts and large reads while still
          // falling back to cache when the network is genuinely dead.
          // cacheName bumped to v2 so the old 10 s-timeout cache is evicted
          // on rollout instead of lingering for up to 5 min.
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-cache-v2',
              networkTimeoutSeconds: 30,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60,
              },
            },
          },
          {
            urlPattern: /\.(woff2?|ttf|otf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/hauntedxcdn\.b-cdn\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
