import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Points DATABASE_URL at a dead address so nothing reaches a real server
    // by accident; the harness builds its own database per spec file.
    setupFiles: ['./test/e2e-setup.ts'],
    environment: 'node',
    // Each file creates a database on the test server and replays the
    // migrations into it before the first test runs.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
})
