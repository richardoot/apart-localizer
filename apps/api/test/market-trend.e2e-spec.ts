/**
 * Lot 29, tendance des prix de vente, sur un vrai PostGIS : les prix au m²
 * par année dans un rayon (module geo), puis la tendance du contexte de la
 * fiche, de `POST /market-context` et du connecteur. Aucune valeur réelle :
 * ventes inventées, années 2028 à 2031 ; aucun appel réseau.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { ListingContext, MarketContextReport } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { DvfSaleRow } from '../src/geo/geo.service'

const richard = e2eIdentity('richard')

const POINT: [number, number] = [-0.58, 44.84]
/** Environ 800 m à l'est du repère : hors des 500 m, dans les 1 000 m. */
const FAR: [number, number] = [-0.57, 44.84]

let serial = 0
function sale(
  year: number,
  pricePerM2: number,
  overrides: Partial<DvfSaleRow> = {}
): DvfSaleRow {
  serial++
  const month = String((serial % 12) + 1).padStart(2, '0')
  return {
    externalId: `TENDANCE-${serial}`,
    mutationDate: `${year}-${month}-15`,
    mutationNature: 'Vente',
    price: pricePerM2 * 40,
    surface: 40,
    propertyType: 'Appartement',
    rooms: null,
    address: null,
    postalCode: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    longitude: POINT[0] + 0.0001 * (serial % 5),
    latitude: POINT[1],
    pricePerM2,
    source: 'test',
    ...overrides,
  }
}

/** Douze ventes d'une année, toutes au même prix au m² (la médiane). */
const year = (y: number, median: number, overrides?: Partial<DvfSaleRow>) =>
  Array.from({ length: 12 }, () => sale(y, median, overrides))

function sales(): DvfSaleRow[] {
  serial = 0
  return [
    ...year(2028, 4000),
    ...year(2029, 5000),
    ...year(2030, 4500),
    // 2031 s'arrête en juin : année incomplète.
    ...Array.from({ length: 12 }, (_, i) =>
      sale(2031, 4400, { mutationDate: `2031-0${(i % 6) + 1}-10` })
    ),
    // Hors du rayon de 500 m, une VEFA et une vente très chère au loin : ignorées à 500 m.
    ...year(2030, 9000, { longitude: FAR[0], latitude: FAR[1] }),
    sale(2030, 12_000, {
      mutationNature: "Vente en l'état futur d'achèvement",
    }),
  ]
}

function geocoder() {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { type: 'Point', coordinates: POINT },
              properties: {
                label: '1 Rue Fictive 33000 Bordeaux',
                score: 0.95,
                type: 'housenumber',
                city: 'Bordeaux',
                citycode: '33063',
                id: '33063_9999_00001',
              },
            },
          ],
        }),
    })
}

interface ToolResult {
  content: { type: string; text: string }[]
  isError?: boolean
}

describe('Tendance des prix de vente (e2e)', () => {
  let ctx: E2eContext
  let geo: GeoService
  let rpcId = 1

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
    geo = ctx.app.get(GeoService)
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Richard et Chloé',
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
    await geo.upsertDvfSales(sales())
    ctx.geocoding.fetchImpl = geocoder()
  })

  it('module geo : prix au m² par année dans le rayon, années et date de la dernière vente', async () => {
    const point = { type: 'Point' as const, coordinates: POINT }
    const near = await geo.dvfPricesByYearWithinRadius({
      point,
      radiusMeters: 500,
    })
    expect(near.map(y => [y.year, y.pricesPerM2.length])).toEqual([
      [2028, 12],
      [2029, 12],
      [2030, 12],
      [2031, 12],
    ])
    // Ni la VEFA ni les ventes au loin.
    expect(near[2]?.pricesPerM2.every(p => p === 4500)).toBe(true)
    const wide = await geo.dvfPricesByYearWithinRadius({
      point,
      radiusMeters: 1000,
    })
    expect(wide.find(y => y.year === 2030)?.pricesPerM2).toHaveLength(24)
    expect(
      await geo.dvfPricesByYearWithinRadius({
        point: { type: 'Point', coordinates: [2.35, 48.85] },
        radiusMeters: 500,
      })
    ).toEqual([])
    const years = await geo.dvfYears()
    expect(years.map(y => y.year)).toEqual([2028, 2029, 2030, 2031])
    expect(years[2]).toMatchObject({ year: 2030, count: 25 })
    expect(years[3]?.lastDate).toBe('2031-06-10')
  })

  it('la fiche, le contexte d’un point et le connecteur disent la tendance', async () => {
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        title: 'T2 fictif lot 29',
        price: 180_000,
        surface: 40,
        rooms: 2,
        location: { addressRaw: '1 rue Fictive', commune: 'Bordeaux' },
      })
      .expect(201)
    const id = (created.body.listing ?? created.body).id as string
    const read = await request(ctx.server)
      .get(`/listings/${id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    const { market } = read.body as ListingContext
    const { trend } = market
    // Aucune vente dans la fenêtre des comparables (trois ans avant aujourd'hui) :
    // leur rayon s'élargit, pas celui de la tendance.
    expect(market.radiusMeters).toBe(2000)
    expect(trend).toMatchObject({
      status: 'ok',
      radiusMeters: 500,
      referenceYear: 2030,
      direction: 'down',
      peak: { year: 2029, medianPricePerM2: 5000 },
    })
    expect(trend.years).toEqual([
      { year: 2028, count: 12, medianPricePerM2: 4000, partial: false },
      { year: 2029, count: 12, medianPricePerM2: 5000, partial: false },
      { year: 2030, count: 12, medianPricePerM2: 4500, partial: false },
      { year: 2031, count: 12, medianPricePerM2: 4400, partial: true },
    ])
    expect(trend.changes.map(c => c.years)).toEqual([1])
    expect(trend.changes[0]?.change).toBeCloseTo(-0.1, 10)
    // Indicatif : rien n'est écrit sur l'annonce ni dans son instantané.
    const stored = await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })
    expect(JSON.stringify(stored.openDataContext)).not.toContain('trend')

    const report = await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({ point: { type: 'Point', coordinates: POINT }, surface: 40 })
      .expect(200)
    expect((report.body as MarketContextReport).market.trend).toEqual(trend)

    // Rayon imposé de 1 000 m : les ventes du loin entrent dans la médiane de 2030.
    const wide = await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({
        point: { type: 'Point', coordinates: POINT },
        surface: 40,
        radiusMeters: 1000,
      })
      .expect(200)
    const wideTrend = (wide.body as MarketContextReport).market.trend
    expect(wideTrend.radiusMeters).toBe(1000)
    expect(wideTrend.years[2]).toMatchObject({
      count: 24,
      medianPricePerM2: 6750,
    })

    const mcp = await request(ctx.server)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(richard))
      .send({
        jsonrpc: '2.0',
        id: rpcId++,
        method: 'tools/call',
        params: {
          name: 'get_market_context',
          arguments: { listingId: id },
        },
      })
      .expect(200)
    const result = mcp.body.result as ToolResult
    expect(result.isError).toBeFalsy()
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('Tendance des prix (Calculé) : médiane 4')
    expect(text).toContain('−10 % sur un an')
    expect(text).toContain('pic en 2029')
    expect(text).toContain('2031 (année incomplète)')
  })

  it('sans vente dans le secteur : tendance « à vérifier », rayon élargi au plus large', async () => {
    const report = await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({
        point: { type: 'Point', coordinates: [-0.3, 44.9] },
        surface: 40,
      })
      .expect(200)
    const { trend } = (report.body as MarketContextReport).market
    expect(trend).toMatchObject({
      status: 'to_verify',
      radiusMeters: 2000,
      referenceYear: null,
      changes: [],
    })
    expect(trend.reasons[0]).toContain('Moins de 10 ventes par an à 2000 m')
  })
})
