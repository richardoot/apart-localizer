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

  describe('ADR 0046 : le loyer visé estimé', () => {
    const NO_RENT = { ...LISTING, rentalPlan: undefined }
    const KEY = 'rentalPlan.targetRent'

    async function post(path: string, body: object, status: number) {
      return request(ctx.server)
        .post(path)
        .set(ctx.auth(richard))
        .send(body)
        .expect(status)
    }

    async function patch(id: string, body: object) {
      return request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send(body)
        .expect(200)
    }

    async function read(id: string) {
      const res = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      return (res.body.listing ?? res.body) as {
        surface: number
        rentalPlan: {
          targetRent: number | null
          demand: string | null
        } | null
        fieldSources: Record<string, { source: string; evidence?: string }>
      }
    }

    it('à la création sans loyer visé : la médiane × surface, « estimé », la tâche reste', async () => {
      await importAll()
      // Une annonce lue par l'IA (comme par Claude) : les tâches des champs manquants.
      const res = await post(
        '/listings',
        {
          ...NO_RENT,
          fieldSources: {
            surface: {
              source: 'ai',
              confidence: 0.9,
              recordedAt: '2030-11-13T10:00:00.000Z',
            },
          },
        },
        201
      )
      const { listing } = res.body
      // 15 €/m² × 40 m².
      expect(listing.rentalPlan.targetRent).toBe(600)
      expect(listing.fieldSources[KEY]).toMatchObject({ source: 'estimated' })
      expect(listing.fieldSources[KEY].evidence).toContain(
        'Observatoire des loyers 2030, zone 2, appartements 2 pièces'
      )
      // Les calculs se font, la tâche « Fixer le loyer visé » attend le membre.
      expect(res.body.evaluation.metrics.rent).toBe(600)
      expect(
        res.body.createdTasks.map((t: { label: string }) => t.label)
      ).toContain('Fixer le loyer visé (phase 2) à partir du marché locatif')
      // Le loyer observé ne se compare pas à sa propre estimation.
      const { rentObservatory } = await contextOf(listing.id)
      expect(rentObservatory.targetRent).toBeNull()
      expect(rentObservatory.position).toBeNull()
      // Le journal le dit.
      const log = await ctx.prisma.activityLog.findFirst({
        where: { listingId: listing.id, action: 'listing.enriched' },
        orderBy: { createdAt: 'desc' },
      })
      expect(log?.after).toMatchObject({ targetRentEstimated: 600 })
    })

    it('un loyer visé donné n’est jamais touché', async () => {
      await importAll()
      const listing = await create()
      const read1 = await read(listing.id)
      expect(read1.rentalPlan?.targetRent).toBe(700)
      expect(read1.fieldSources[KEY]).toBeUndefined()
      await patch(listing.id, { surface: 50 })
      expect((await read(listing.id)).rentalPlan?.targetRent).toBe(700)
    })

    it('l’estimation suit la surface ; renvoyée telle quelle, elle reste estimée ; changée, elle ne l’est plus', async () => {
      await importAll()
      const { body } = await post('/listings', NO_RENT, 201)
      const id = body.listing.id as string
      await patch(id, { surface: 50 })
      let now = await read(id)
      expect(now.rentalPlan?.targetRent).toBe(750)
      expect(now.fieldSources[KEY]?.source).toBe('estimated')
      // Le formulaire de la phase 2 renvoie tout : le loyer estimé reste estimé.
      await patch(id, {
        rentalPlan: { targetRent: 750, demand: 'strong' },
      })
      now = await read(id)
      expect(now.rentalPlan).toMatchObject({
        targetRent: 750,
        demand: 'strong',
      })
      expect(now.fieldSources[KEY]?.source).toBe('estimated')
      // Le membre met son loyer : il est à lui, la surface ne le change plus.
      await patch(id, {
        rentalPlan: { targetRent: 720, demand: 'strong' },
      })
      now = await read(id)
      expect(now.fieldSources[KEY]?.source).toBe('user')
      await patch(id, { surface: 45 })
      expect((await read(id)).rentalPlan?.targetRent).toBe(720)
    })

    it('rien d’estimé sans ligne pour ce nombre de pièces ni sans zone sûre', async () => {
      await importAll()
      ctx.geocoding.fetchImpl = geocoderAt(IN_BOURG, 'housenumber', '33998')
      const threeRooms = await post('/listings', { ...NO_RENT, rooms: 3 }, 201)
      expect(threeRooms.body.listing.rentalPlan).toBeNull()
      ctx.geocoding.fetchImpl = geocoderAt(NOWHERE, 'housenumber', '33997')
      const outside = await post(
        '/listings',
        { ...NO_RENT, title: 'T2 fictif hors périmètre' },
        201
      )
      expect(outside.body.listing.rentalPlan).toBeNull()
    })

    it('une adresse à la rue : estimé, zone « lue à la rue »', async () => {
      await importAll()
      ctx.geocoding.fetchImpl = geocoderAt([-0.56, 44.84], 'street')
      const { body } = await post('/listings', NO_RENT, 201)
      // Zone 3 : 13 €/m² × 40 m².
      expect(body.listing.rentalPlan.targetRent).toBe(520)
      expect(body.listing.fieldSources[KEY].evidence).toContain(
        'zone 3 (lue à la rue)'
      )
    })

    it('fusion : le loyer donné de l’absorbée remplace l’estimation de la gardée ; annulée, l’estimation revient', async () => {
      await importAll()
      const kept = (await post('/listings', NO_RENT, 201)).body.listing
      const absorbed = (
        await post(
          '/listings',
          {
            ...LISTING,
            title: 'T2 fictif vu ailleurs',
            ignoreDuplicates: true,
          },
          201
        )
      ).body.listing
      expect(kept.rentalPlan.targetRent).toBe(600)
      const preview = await request(ctx.server)
        .get(`/listings/${kept.id}/merge-preview?with=${absorbed.id}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        preview.body.fills.map((f: { field: string }) => f.field)
      ).toContain(KEY)
      const merged = await post(
        `/listings/${kept.id}/merge`,
        { absorbedId: absorbed.id },
        200
      )
      let now = await read(kept.id)
      expect(now.rentalPlan?.targetRent).toBe(700)
      expect(now.fieldSources[KEY]?.source).toBe('user')
      await post(`/listing-merges/${merged.body.merge.id}/undo`, {}, 200)
      now = await read(kept.id)
      expect(now.rentalPlan?.targetRent).toBe(600)
      expect(now.fieldSources[KEY]?.source).toBe('estimated')
    })
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
