/**
 * Lot 19 (ADR 0029) : plus d'hypothèses propres à une annonce, et l'année et
 * le type de location de la phase 2 réglés pour tout l'espace. Par de vrais
 * appels REST et JSON-RPC (MCP) sur PostGIS : une entrée qui envoie encore
 * `assumptionsOverride`, `rentalPlan.year` ou `rentalPlan.leaseType` est
 * acceptée et ces clés sont ignorées ; une ancienne valeur restée en base
 * n'est plus lue ; l'évaluation, la louabilité, la checklist, la projection
 * et le loyer de marché lisent l'année et le type des hypothèses. Données
 * fictives ; Géorisques et isochrones scriptés (aucun appel réseau).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ISOCHRONE_DOWN, createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')

/** L'exemple chiffré du modèle (§ 8) : coût tout compris 220 000 €. */
const EXAMPLE = {
  title: '[Exemple] T2 lot 19',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'F',
  dpeDate: '2023-05-10',
  constructionYear: 1930,
  location: {
    commune: 'Talence',
    inseeCode: '33522',
    point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
    precision: 'exact',
  },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

/** Ce que l'ancienne fiche envoyait encore, et qui ne compte plus. */
const LEGACY = {
  assumptionsOverride: { downPayment: 120_000, interestRate: 0.01 },
}
const LEGACY_PLAN = { year: 2035, leaseType: 'furnished' }

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

describe('Lot 19 : hypothèses de l’espace seulement (e2e)', () => {
  let ctx: E2eContext
  let nextId = 1

  const get = (path: string) =>
    request(ctx.server).get(path).set(ctx.auth(richard))
  const post = (path: string, body: object) =>
    request(ctx.server).post(path).set(ctx.auth(richard)).send(body)
  const patch = (path: string, body: object) =>
    request(ctx.server).patch(path).set(ctx.auth(richard)).send(body)

  async function setAssumptions(values: Record<string, unknown>) {
    const current = await get('/assumptions').expect(200)
    return request(ctx.server)
      .put('/assumptions')
      .set(ctx.auth(richard))
      .send({ values: { ...current.body.values, ...values } })
      .expect(200)
  }

  async function callTool(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await request(ctx.server)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    expect(res.status).toBe(200)
    expect(res.body.error).toBeUndefined()
    return res.body.result as ToolResult
  }

  function fenced(result: ToolResult): Record<string, unknown> {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.georisques.fetchImpl = ISOCHRONE_DOWN
    await ctx.prisma.workspace.create({
      data: {
        name: '[Exemple] Espace lot 19',
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email,
              role: 'owner',
            },
          ],
        },
      },
    })
  })

  it('REST : création et modification ignorent la surcharge, l’année et le type de location envoyés', async () => {
    const created = await post('/listings', {
      ...EXAMPLE,
      ...LEGACY,
      rentalPlan: { ...EXAMPLE.rentalPlan, ...LEGACY_PLAN },
    }).expect(201)
    const { listing, evaluation } = created.body
    expect(listing).not.toHaveProperty('assumptionsOverride')
    expect(listing.rentalPlan).not.toHaveProperty('year')
    expect(listing.rentalPlan).not.toHaveProperty('leaseType')
    expect(listing.rentalPlan.targetRent).toBe(750)
    // Apport (40 000 €) et taux (3,65 %) de l'espace, pas ceux envoyés.
    expect(evaluation.metrics.loanAmount).toBe(180_000)
    // Mise en location en 2028 (espace), pas en 2035.
    expect(evaluation.rental.year).toBe(2028)
    const row = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { assumptionsOverride: true, rentalPlan: true },
    })
    expect(row.assumptionsOverride).toBeNull()
    expect(row.rentalPlan?.year).toBeNull()
    expect(row.rentalPlan?.leaseType).toBe('unfurnished')

    const patched = await patch(`/listings/${listing.id}`, {
      ...LEGACY,
      rentalPlan: { targetRent: 800, ...LEGACY_PLAN },
      expectedUpdatedAt: listing.updatedAt,
    }).expect(200)
    expect(patched.body.listing.rentalPlan.targetRent).toBe(800)
    expect(patched.body.evaluation.metrics.loanAmount).toBe(180_000)
    const after = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { assumptionsOverride: true, rentalPlan: true },
    })
    expect(after.assumptionsOverride).toBeNull()
    expect(after.rentalPlan?.year).toBeNull()
    expect(after.rentalPlan?.leaseType).toBe('unfurnished')
    // Le journal ne garde pas de trace des clés ignorées.
    const logs = await ctx.prisma.activityLog.findMany({
      where: { listingId: listing.id, action: 'listing.updated' },
    })
    expect(JSON.stringify(logs.map(l => l.after))).not.toContain(
      'assumptionsOverride'
    )
  })

  it('une ancienne surcharge ou une ancienne année restée en base n’est plus lue', async () => {
    const created = await post('/listings', EXAMPLE).expect(201)
    const id = created.body.listing.id as string
    // Ce que des annonces antérieures au lot 19 pouvaient porter.
    await ctx.prisma.listing.update({
      where: { id },
      data: {
        assumptionsOverride: { downPayment: 150_000 },
        rentalPlan: { update: { year: 2035, leaseType: 'furnished' } },
      },
    })
    const read = await get(`/listings/${id}`).expect(200)
    expect(read.body.listing).not.toHaveProperty('assumptionsOverride')
    expect(read.body.evaluation.metrics.loanAmount).toBe(180_000)
    expect(read.body.evaluation.rental.year).toBe(2028)
    const target = await get(`/listings/${id}/target-price`).expect(200)
    expect(target.body.assumptions.downPayment).toBe(40_000)
    const projection = await get(`/listings/${id}/projection`).expect(200)
    expect(projection.body.parameters.leaseType).toBe('unfurnished')
    expect(projection.body.parameters.rentalStartDate).toBe('2028-01-01')
  })

  it('l’année et le type de location viennent des hypothèses de l’espace, versionnées', async () => {
    // Une version antérieure au lot 19 n'a pas le champ : elle se lit « vide ».
    const workspace = await ctx.prisma.workspace.findFirstOrThrow()
    const old = await get('/assumptions').expect(200)
    const { leaseType: _lease, ...withoutLease } = old.body.values
    await ctx.prisma.assumptionsVersion.create({
      data: {
        workspaceId: workspace.id,
        label: 'avant le lot 19',
        values: withoutLease,
      },
    })
    expect((await get('/assumptions').expect(200)).body.values.leaseType).toBe(
      'unfurnished'
    )

    const id = (await post('/listings', EXAMPLE).expect(201)).body.listing
      .id as string
    const saved = await setAssumptions({
      rentalYear: 2030,
      leaseType: 'furnished',
    })
    expect(saved.body.values).toMatchObject({
      rentalYear: 2030,
      leaseType: 'furnished',
    })

    const read = await get(`/listings/${id}`).expect(200)
    // DPE F : interdit en 2028, donc bloquant pour une location en 2030.
    expect(read.body.evaluation.rental.year).toBe(2030)
    const dpe = read.body.evaluation.rental.checks.find(
      (c: { key: string }) => c.key === 'dpe_ban'
    )
    expect(dpe.level).toBe('bad')
    expect(dpe.message).toContain('2030')

    const compliance = await get(`/listings/${id}/compliance`).expect(200)
    expect(compliance.body.rentalStartDate).toBe('2030-01-01')
    const projection = await get(`/listings/${id}/projection`).expect(200)
    expect(projection.body.parameters.leaseType).toBe('furnished')
    expect(projection.body.parameters.rentalStartDate).toBe('2030-01-01')
    // Meublé : le micro-BIC par défaut.
    expect(projection.body.summary.regime).toBe('micro_bic')
    const market = await get(`/listings/${id}/rent-comparables`).expect(200)
    expect(market.body.market.furnished).toBe(true)
  })

  it('MCP : create_listing et update_listing ignorent les clés retirées ; set_assumptions règle le type', async () => {
    const created = await callTool(richard, 'create_listing', {
      listing: {
        ...EXAMPLE,
        ...LEGACY,
        rentalPlan: { ...EXAMPLE.rentalPlan, ...LEGACY_PLAN },
      },
    })
    expect(created.isError).toBeUndefined()
    const item = fenced(created) as {
      listing: {
        id: string
        updatedAt: string
        rentalPlan: Record<string, unknown>
      }
      evaluation: { metrics: { loanAmount: number } }
    }
    expect(item.listing).not.toHaveProperty('assumptionsOverride')
    expect(item.listing.rentalPlan).not.toHaveProperty('year')
    expect(item.listing.rentalPlan).not.toHaveProperty('leaseType')
    expect(item.evaluation.metrics.loanAmount).toBe(180_000)

    const updated = await callTool(richard, 'update_listing', {
      listingId: item.listing.id,
      patch: {
        ...LEGACY,
        rentalPlan: { targetRent: 790, ...LEGACY_PLAN },
      },
      expectedUpdatedAt: item.listing.updatedAt,
    })
    expect(updated.isError).toBeUndefined()
    const after = fenced(updated) as {
      listing: { rentalPlan: Record<string, unknown> }
      evaluation: { metrics: { loanAmount: number } }
    }
    expect(after.listing.rentalPlan.targetRent).toBe(790)
    expect(after.listing.rentalPlan).not.toHaveProperty('leaseType')
    expect(after.evaluation.metrics.loanAmount).toBe(180_000)
    const row = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: item.listing.id },
      select: { assumptionsOverride: true, rentalPlan: true },
    })
    expect(row.assumptionsOverride).toBeNull()
    expect(row.rentalPlan?.leaseType).toBe('unfurnished')

    const set = await callTool(richard, 'set_assumptions', {
      values: { leaseType: 'shared' },
    })
    expect(set.isError).toBeUndefined()
    expect((await get('/assumptions').expect(200)).body.values.leaseType).toBe(
      'shared'
    )
    const projection = await get(
      `/listings/${item.listing.id}/projection`
    ).expect(200)
    expect(projection.body.parameters.leaseType).toBe('shared')
  })
})
