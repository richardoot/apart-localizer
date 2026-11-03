import { defineConfig } from 'vitest/config'

/**
 * Les tests des scripts qui écrivent dans un vrai Postgres + PostGIS
 * (`TEST_DATABASE_URL`, base de docker/test-db.yml) : une base jetable par
 * fichier, créée et migrée par le harnais e2e de l'API.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
