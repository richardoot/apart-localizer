import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  // Les tests ne lisent aucun fichier .env : apps/web/.env, écrit par
  // `pnpm stack:up` (VITE_AUTH_PASSWORD=1, clés locales), ne doit pas changer
  // leur résultat ; en local comme en CI, chaque spec pose ce qu'elle teste.
  envDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.ts'],
    unstubGlobals: true,
    unstubEnvs: true,
  },
})
