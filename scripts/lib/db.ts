import 'reflect-metadata'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import { GeoService } from '../../apps/api/src/geo/geo.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'

export const repoRoot = path.resolve(import.meta.dirname, '..', '..')

/** L'URL de la base : option, sinon DATABASE_URL de apps/api/.env ou de l'environnement. */
export function databaseUrlFrom(option: string | undefined): string {
  loadEnv({ path: path.join(repoRoot, 'apps/api/.env'), quiet: true })
  const url = option ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL manquant (apps/api/.env ou --database-url).')
  }
  return url
}

/** Un client Prisma et le module geo de l'API (le SQL géographique n'est écrit que là). */
export function openDatabase(url: string): {
  prisma: PrismaClient
  geo: GeoService
  close: () => Promise<void>
} {
  const pool = new Pool({ connectionString: url })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  return {
    prisma,
    geo: new GeoService(prisma as unknown as PrismaService),
    close: async () => {
      await prisma.$disconnect()
      await pool.end()
    },
  }
}

/** L'URL masquée pour les journaux. */
export function redact(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@')
}

/** Durée lisible depuis un instant. */
export function elapsed(since: number): string {
  const ms = Date.now() - since
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
