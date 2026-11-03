/**
 * A throwaway database for each e2e spec file, created on a real Postgres
 * with PostGIS (`TEST_DATABASE_URL`, by default the docker/test-db.yml server
 * on port 54329; Supabase CLI's database on 54322 works too).
 *
 * Why a real server rather than an embedded one: the schema leans on
 * PostGIS (`geography` columns, GiST indexes, ST_DWithin), which no embedded
 * Postgres ships. CI starts the same image as a service container.
 *
 * The schema is provisioned by replaying prisma/migrations in order, which
 * exercises the migration chain on every run. The client is built on
 * `@prisma/adapter-pg`, the very adapter PrismaService uses in production.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../src/generated/prisma'
import type { PrismaService } from '../src/prisma/prisma.service'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54329/postgres'

/** Migration files in application order (directory names are timestamps). */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map(name => path.join(MIGRATIONS_DIR, name, 'migration.sql'))
}

export interface E2eDatabase {
  /**
   * A client with the one addition PrismaService makes to PrismaClient —
   * `poolStats`, which the health report reads — so the app can take it in
   * PrismaService's place without noticing.
   */
  prisma: PrismaClient & { poolStats: PrismaService['poolStats'] }
  /** Where this database lives, for a process of its own to connect to. */
  connectionString: string
  /** Raw SQL against the test database. */
  query: <T = unknown>(sql: string, values?: unknown[]) => Promise<T[]>
  /** Empties every application table, for isolation between tests of one file. */
  truncateAll: () => Promise<void>
  /** Disconnects and drops the database. */
  close: () => Promise<void>
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

export async function createE2eDatabase(): Promise<E2eDatabase> {
  const adminUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL
  const name = `e2e_${process.pid}_${randomBytes(4).toString('hex')}`
  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
  } catch (error) {
    await admin.end()
    throw new Error(
      `Could not create the e2e database on ${adminUrl.replace(/:[^:@/]+@/, ':***@')}. ` +
        'Start it with `pnpm db:test:up` (or `supabase start`) and set TEST_DATABASE_URL.\n' +
        (error instanceof Error ? error.message : String(error)),
      { cause: error }
    )
  }

  const connectionString = withDatabase(adminUrl, name)
  const pool = new Pool({ connectionString })

  for (const file of migrationFiles()) {
    const sql = readFileSync(file, 'utf8')
    try {
      await pool.query(sql)
    } catch (error) {
      throw new Error(
        `Migration ${path.basename(path.dirname(file))} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      )
    }
  }

  const prisma = Object.assign(
    new PrismaClient({ adapter: new PrismaPg(pool) }),
    {
      poolStats: () => ({
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      }),
    }
  )

  return {
    prisma,
    connectionString,
    query: async <T = unknown>(
      sql: string,
      values?: unknown[]
    ): Promise<T[]> => {
      const result = await pool.query(sql, values)
      return result.rows as T[]
    },
    truncateAll: async () => {
      const rows = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename <> '_prisma_migrations'`
      )
      const tables = rows.rows.map(r => `"app"."${r.tablename}"`).join(', ')
      if (tables) await pool.query(`TRUNCATE ${tables} CASCADE`)
    },
    close: async () => {
      await prisma.$disconnect()
      await pool.end()
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
      await admin.end()
    },
  }
}
