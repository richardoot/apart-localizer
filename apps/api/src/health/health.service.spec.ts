import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_TIMEOUT_MS, HealthService } from './health.service'
import type { PrismaService } from '../prisma/prisma.service'

function service(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({
    $queryRaw: queryRaw,
    poolStats: () => ({ total: 1, idle: 1, waiting: 0 }),
  } as unknown as PrismaService)
}

describe('HealthService', () => {
  const env = process.env

  beforeEach(() => {
    vi.useFakeTimers()
    process.env = { ...env }
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env = env
  })

  it('is ok when the database answers with a PostGIS version', async () => {
    const report = await service(() =>
      Promise.resolve([{ version: '3.5.3' }])
    ).check()
    expect(report.status).toBe('ok')
    expect(report.checks.postgis).toEqual({ status: 'ok', version: '3.5.3' })
    expect(report.pool).toEqual({ total: 1, idle: 1, waiting: 0 })
  })

  it('is an error when the query fails or PostGIS is missing', async () => {
    const down = await service(() =>
      Promise.reject(new Error('refused'))
    ).check()
    expect(down.status).toBe('error')
    expect(down.checks.database.status).toBe('error')
    const noGis = await service(() =>
      Promise.resolve([{ version: null }])
    ).check()
    expect(noGis.status).toBe('error')
    expect(noGis.checks.database.status).toBe('ok')
    expect(noGis.checks.postgis.status).toBe('error')
  })

  it('gives up on a database that hangs', async () => {
    const pending = service(() => new Promise(() => undefined)).check()
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS + 1)
    const report = await pending
    expect(report.status).toBe('error')
  })

  it('names the deployed commit when Vercel says which one it is', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'df188bb0123456789abcdef'
    expect(
      (await service(() => Promise.resolve([{ version: '3.5' }])).check())
        .version
    ).toBe('df188bb')
    delete process.env.VERCEL_GIT_COMMIT_SHA
    expect(
      (await service(() => Promise.resolve([{ version: '3.5' }])).check())
        .version
    ).toBeNull()
  })
})
