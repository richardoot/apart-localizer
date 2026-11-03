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
    // Share target and offline reads of the data come with later lots.
    VitePWA({
      registerType: 'autoUpdate',
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
