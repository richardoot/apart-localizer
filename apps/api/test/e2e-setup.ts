/**
 * Runs before every e2e spec, via `setupFiles` in vitest.config.e2e.ts.
 *
 * E2E specs run against a database the harness creates on the test server
 * (TEST_DATABASE_URL, see e2e-database.ts). Nothing here must reach the
 * developer database, so DATABASE_URL is replaced by a dead address before
 * `.env` is read: dotenv does not override variables already set.
 *
 * The Supabase variables only have to pass the configuration validation:
 * SupabaseService is replaced by the harness and never calls out.
 */
import { config } from 'dotenv'
import path from 'node:path'

process.env.DATABASE_URL =
  'postgresql://e2e:e2e@127.0.0.1:1/use-createE2eDatabase-instead'
process.env.DIRECT_URL = process.env.DATABASE_URL
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'e2e-service-role-key'

config({ path: path.join(__dirname, '..', '.env') })
