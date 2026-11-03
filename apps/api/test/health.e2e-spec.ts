import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp } from './e2e-app'
import type { E2eContext } from './e2e-app'

describe('GET /health', () => {
  let ctx: E2eContext

  beforeAll(async () => {
    ctx = await createE2eApp([])
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('answers 200 with the database and PostGIS reachable, unauthenticated', async () => {
    const res = await request(ctx.server).get('/health').expect(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.checks.database.status).toBe('ok')
    expect(res.body.checks.postgis.status).toBe('ok')
    expect(res.body.checks.postgis.version).toMatch(/^\d+\.\d+/)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('every other route wants a bearer token', async () => {
    const res = await request(ctx.server).get('/listings').expect(401)
    expect(res.body.message).toBe('Aucun jeton fourni')
    await request(ctx.server)
      .get('/listings')
      .set('Authorization', 'Bearer nope')
      .expect(401)
  })
})
