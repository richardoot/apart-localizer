/**
 * Lot 28, loyers observés par l'observatoire local des loyers, sur un vrai
 * PostGIS : la table rangée dans `reference_data`, l'IRIS du repère lu dans
 * les contours du lot 11, puis le contexte de la fiche, `POST
 * /market-context` et le connecteur. Aucune valeur réelle : contours, zones
 * et loyers sont inventés ; aucun appel réseau.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  NEIGHBOURHOOD_TERRITORY,
  RentObservatoryTableSchema,
} from '@apart/contracts'
import type { ListingContext, MarketContextReport } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { NeighbourhoodRow } from '../src/geo/geo.service'
import { RENT_OBSERVATORY_KIND } from '../src/opendata/rent-observatory.service'

const richard = e2eIdentity('richard')

const square = (west: number, south: number, size = 0.02) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ],
  ],
})

const iris = (code: string, west: number): NeighbourhoodRow => ({
  kind: 'iris',
  code,
  name: `IRIS fictif ${code}`,
  parent: null,
  commune: 'Commune fictive',
  inseeCode: '33999',
  source: 'Contours IRIS fictifs',
  geometry: square(west, 44.83),
})

/** Deux IRIS côte à côte (limite à -0,57), dans deux zones de l'observatoire. */
const NEIGHBOURHOODS: NeighbourhoodRow[] = [
  iris('339990101', -0.59),
  iris('339990102', -0.57),
  {
    kind: 'commune',
    code: '339980000',
    name: 'Bourg fictif',
    parent: null,
    commune: 'Bourg fictif',
    inseeCode: '33998',
    source: 'Contours IRIS fictifs',
    geometry: square(-0.7, 44.9),
  },
]
const IN_ZONE_2: [number, number] = [-0.58, 44.84]
const IN_BOURG: [number, number] = [-0.69, 44.91]
const NOWHERE: [number, number] = [-0.3, 44.5]

const stats = (rooms: number | null, medianPerM2: number) => ({
  rooms,
  medianPerM2,
  q1PerM2: medianPerM2 - 2,
  q3PerM2: medianPerM2 + 2,
  observations: 120,
})

const TABLE = RentObservatoryTableSchema.parse({
  territory: 'bordeaux',
  observatory: 'L9900',
  year: 2030,
  observedAt: '2030-01-01',
  housingType: 'apartment',
  zones: [
    { zone: 2, label: 'Zone 2', stats: [stats(null, 14), stats(2, 15)] },
    { zone: 3, label: 'Zone 3', stats: [stats(null, 12), stats(2, 13)] },
    { zone: 5, label: 'Zone 5', stats: [stats(null, 10)] },
  ],
  irisZones: { '339990101': 2, '339990102': 3 },
  communeZones: { '33998': 5 },
  source: {
    url: 'https://example.invalid/Base_OP_2030_L9900.zip',
    file: 'Base_OP_2030_L9900.zip',
    sha256: 'fictif',
    importedAt: '2030-11-11T10:00:00.000Z',
  },
})

function geocoderAt(
  coordinates: [number, number],
  type: 'housenumber' | 'street' = 'housenumber',
  citycode = '33999'
) {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { type: 'Point', coordinates },
              properties: {
                label: `1 Rue Fictive ${citycode} Commune fictive`,
                score: 0.95,
                type,
                city: 'Commune fictive',
                citycode,
                id: `${citycode}_9999_00001`,
              },
            },
          ],
        }),
    })
}

const LISTING = {
  title: 'T2 fictif lot 28',
  price: 180_000,
  surface: 40,
  rooms: 2,
  location: { addressRaw: '1 rue Fictive', commune: 'Commune fictive' },
  rentalPlan: { targetRent: 700 },
}

describe('Loyers observés par l’observatoire (e2e)', () => {
  let ctx: E2eContext
  let geo: GeoService

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
    geo = ctx.app.get(GeoService)
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.referenceData.deleteMany({
      where: { kind: RENT_OBSERVATORY_KIND },
    })
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
    ctx.geocoding.fetchImpl = geocoderAt(IN_ZONE_2)
  })

  async function importAll(): Promise<void> {
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, NEIGHBOURHOODS)
    await ctx.prisma.referenceData.create({
      data: {
        kind: RENT_OBSERVATORY_KIND,
        key: 'bordeaux:2030',
        validFrom: new Date('2030-01-01T00:00:00Z'),
        payload: TABLE,
      },
    })
  }

  async function create(body: object = LISTING) {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(body)
      .expect(201)
    return res.body.listing as { id: string; openDataContext: object }
  }

  async function contextOf(id: string): Promise<ListingContext> {
    const res = await request(ctx.server)
      .get(`/listings/${id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    return res.body as ListingContext
  }

  it('sans import : « indisponible », jamais une valeur inventée', async () => {
    const listing = await create()
    const { rentObservatory } = await contextOf(listing.id)
    expect(rentObservatory).toMatchObject({
      status: 'unavailable',
      zone: null,
      medianPerM2: null,
      monthlyMedian: null,
      year: null,
    })
    expect(rentObservatory.reasons[0]).toContain('import:rent-observatory')
  })

  it('la fiche lit la médiane de la zone de son IRIS, par nombre de pièces', async () => {
    await importAll()
    const listing = await create()
    const { rentObservatory } = await contextOf(listing.id)
    expect(rentObservatory).toMatchObject({
      status: 'ok',
      zone: { zone: 2, label: 'Zone 2' },
      approximate: false,
      rooms: 2,
      medianPerM2: 15,
      q1PerM2: 13,
      q3PerM2: 17,
      observations: 120,
      monthlyMedian: 600,
      monthlyQ1: 520,
      monthlyQ3: 680,
      targetRent: 700,
      position: 'above_q3',
      year: 2030,
      observedAt: '2030-01-01',
      sourceUrl: 'https://example.invalid/Base_OP_2030_L9900.zip',
    })
    expect(rentObservatory.gapToMedian).toBeCloseTo(700 / 600 - 1, 10)
    expect(rentObservatory.notes.join(' ')).toContain(
      'un indicateur, pas un plafond'
    )
    // Un indicateur : rien n'est enregistré sur l'annonce, le loyer visé reste.
    expect(listing.openDataContext).not.toHaveProperty('rentObservatory')
    const read = await request(ctx.server)
      .get(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    const plan = (read.body.listing ?? read.body).rentalPlan
    expect(plan.targetRent).toBe(700)
    expect(plan.marketRent).toBeNull()
    expect(plan.referenceRentPerM2).toBeNull()
  })

  it('une adresse à la rue est marquée « ≈ » ; l’autre IRIS donne l’autre zone', async () => {
    await importAll()
    ctx.geocoding.fetchImpl = geocoderAt([-0.56, 44.84], 'street')
    const listing = await create()
    const { rentObservatory } = await contextOf(listing.id)
    expect(rentObservatory).toMatchObject({
      status: 'ok',
      zone: { zone: 3, label: 'Zone 3' },
      approximate: true,
      medianPerM2: 13,
    })
    expect(rentObservatory.reasons[0]).toContain('Adresse à la rue')
  })

  it('une commune entière dans une zone : la zone de la commune', async () => {
    await importAll()
    ctx.geocoding.fetchImpl = geocoderAt(IN_BOURG, 'housenumber', '33998')
    const listing = await create({ ...LISTING, rooms: 3 })
    const { rentObservatory } = await contextOf(listing.id)
    expect(rentObservatory).toMatchObject({
      status: 'ok',
      zone: { zone: 5, label: 'Zone 5' },
      rooms: null,
      medianPerM2: 10,
      monthlyMedian: 400,
    })
    expect(rentObservatory.notes[0]).toContain(
      'Aucun loyer publié pour 3 pièces'
    )
  })

  it('hors du périmètre : sans objet', async () => {
    await importAll()
    ctx.geocoding.fetchImpl = geocoderAt(NOWHERE, 'housenumber', '33997')
    const listing = await create()
    const { rentObservatory } = await contextOf(listing.id)
    expect(rentObservatory.status).toBe('not_applicable')
    expect(rentObservatory.medianPerM2).toBeNull()
  })

  it('POST /market-context rend le loyer observé d’un point, sans annonce', async () => {
    await importAll()
    const res = await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({
        point: { type: 'Point', coordinates: IN_ZONE_2 },
        surface: 50,
        rooms: 2,
      })
      .expect(200)
    const report = res.body as MarketContextReport
    expect(report.rentObservatory).toMatchObject({
      status: 'ok',
      zone: { zone: 2, label: 'Zone 2' },
      medianPerM2: 15,
      monthlyMedian: 750,
      targetRent: null,
      position: null,
    })
  })
})
