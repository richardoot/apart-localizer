import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/** The port is overridable so that the dev server can live next to a built one. */
const port = Number(process.env.VITE_PORT ?? 5173)

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Installable, with the app shell cached for a visit without network.
    // Lot 6: share target (a listing shared from the phone opens « Nouvelle
    // annonce ») and Web Push (public/push-handler.js, imported by the
    // generated service worker).
    // Lot 12: registered by src/lib/pwa.ts (virtual:pwa-register, immediate),
    // which reloads the page once when a new version takes over; no script
    // injected into index.html.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'apart-localizer',
        short_name: 'Apart',
        description:
          "Suivi d'annonces d'achat d'appartement : comparateur, carte, rentabilité",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3f6f6',
        theme_color: '#0e6b63',
        // GET: only what the share sheet hands over (title, text, link);
        // the page itself is never downloaded.
        share_target: {
          action: '/partager',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // API calls are never served from the cache by the shell's worker.
        navigateFallbackDenylist: [/^\/api/],
        // Push and notification clicks, in plain JS next to the shell.
        importScripts: ['/push-handler.js'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port,
    strictPort: true,
  },
})
