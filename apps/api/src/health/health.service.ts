/**
 * Whether this instance can serve a request right now: can the database be
 * reached, and does it have PostGIS. Bounded by a short timeout, because a
 * hung connection to the pooler is exactly the failure a monitor exists to
 * catch.
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export const DATABASE_TIMEOUT_MS = 3000

export interface HealthReport {
  status: 'ok' | 'error'
  checks: {
    database: { status: 'ok' | 'error'; latencyMs: number }
    postgis: { status: 'ok' | 'error'; version: string | null }
  }
  pool: { total: number; idle: number; waiting: number }
  /** The deployed commit, so a monitor's screenshot says which build failed. */
  version: string | null
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const startedAt = Date.now()
    let database: HealthReport['checks']['database']
    let postgis: HealthReport['checks']['postgis'] = {
      status: 'error',
      version: null,
    }
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`database did not answer within ${DATABASE_TIMEOUT_MS}ms`)
          ),
        DATABASE_TIMEOUT_MS
      )
    })
    try {
      const rows = await Promise.race([
        this.prisma.$queryRaw<
          { version: string }[]
        >`SELECT PostGIS_Lib_Version() AS version`,
        timeout,
      ])
      database = { status: 'ok', latencyMs: Date.now() - startedAt }
      const version = rows[0]?.version ?? null
      postgis = { status: version ? 'ok' : 'error', version }
    } catch {
      database = { status: 'error', latencyMs: Date.now() - startedAt }
    } finally {
      clearTimeout(timer)
    }
    return {
      status:
        database.status === 'ok' && postgis.status === 'ok' ? 'ok' : 'error',
      checks: { database, postgis },
      pool: this.prisma.poolStats(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    }
  }
}
