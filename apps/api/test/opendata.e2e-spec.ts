/**
 * Lot 4, données ouvertes, sur un vrai PostGIS : zonage et arrêté de
 * l'encadrement (fictifs), arrêts de tram, ventes DVF, DPE de l'ADEME et
 * géocodeur scriptés. Saisir une adresse remplit le point, le DPE vérifié,
 * le plafond et l'arrêt le plus proche ; les comparables DVF sont datés.
 * Aucune valeur réelle : zones, loyers et ventes sont inventés.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import request from 'supertest'
import type {
  ListingContext,
  MarketContext,
  RentReferenceTable,
} from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { DvfSaleRow } from '../src/geo/geo.service'
import { ReferenceCacheService } from '../src/opendata/reference-cache.service'
import { RENT_REFERENCE_KIND } from '../src/opendata/rent-control.service'

const richard = e2eIdentity('richard')

/** Deux secteurs fictifs côte à côte : zone 1 à l'ouest, zone 2 à l'est de -0,57. */
const ZONE_WEST = [
  [
    [
      [-0.59, 44.83],
      [-0.57, 44.83],
      [-0.57, 44.85],
      [-0.59, 44.85],
      [-0.59, 44.83],
    ],
  ],
]
const ZONE_EAST = [
  [
    [
      [-0.57, 44.83],
      [-0.55, 44.83],
      [-0.55, 44.85],
      [-0.57, 44.85],
      [-0.57, 44.83],
    ],
  ],
]
/** Un point au cœur de la zone 1, un autre à 3 m de la limite. */
const INSIDE_WEST: [number, number] = [-0.58, 44.84]
const ON_BORDER: [number, number] = [-0.57004, 44.84]

const day = (monthsAgo: number): string => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return d.toISOString().slice(0, 10)
}

function table(): RentReferenceTable {
  const today = new Date()
  const from = new Date(today.getTime() - 90 * 86_400_000)
  const until = new Date(today.getTime() + 200 * 86_400_000)
  return {
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: from.toISOString().slice(0, 10),
    validFrom: from.toISOString().slice(0, 10),
    validUntil: until.toISOString().slice(0, 10),
    source: {
      url: null,
      file: 'arrete-fictif.xlsx',
      sha256: 'test',
      importedAt: today.toISOString(),
      crossCheck: null,
    },
    rows: [1, 2].flatMap(zone =>
      [false, true].map(furnished => ({
        zone,
        rooms: 2,
        epoch: 'before_1946' as const,
        furnished,
        referenceRent: 10 + zone,
        upperRent: 12 + zone + (furnished ? 1 : 0),
        lowerRent: 7,
      }))
    ),
  }
}

/** Six ventes fictives autour du point, entre 3 000 et 5 500 €/m², 40 à 50 m². */
function sales(): DvfSaleRow[] {
  const perM2 = [3000, 3500, 4000, 4500, 5000, 5500]
  return perM2.map((p, i) => ({
    externalId: `TEST-${i}`,
    mutationDate: day(2 + i * 3),
    mutationNature: 'Vente',
    price: p * 45,
    surface: 45,
    propertyType: 'Appartement',
    rooms: 2,
    address: `${i + 1} rue Fictive`,
    postalCode: '33000',
    commune: 'Bordeaux',
    inseeCode: '33063',
    longitude: INSIDE_WEST[0] + 0.001 * (i - 3),
    latitude: INSIDE_WEST[1],
    pricePerM2: p,
    source: 'test',
  }))
}

/** Le géocodeur : une adresse exacte au point voulu, identifiant BAN fictif. */
function geocoderAt(
  coordinates: [number, number],
  type: 'housenumber' | 'street' = 'housenumber'
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
                label:
                  type === 'street'
                    ? 'Rue Fictive 33000 Bordeaux'
                    : '1 Rue Fictive 33000 Bordeaux',
                score: 0.95,
                type,
                city: 'Bordeaux',
                citycode: '33063',
                id: '33063_9999_00001',
              },
            },
          ],
        }),
    })
}

/** L'ADEME : des DPE fictifs à l'adresse. */
function ademe(lines: Array<Record<string, unknown>>) {
  return (url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          total: lines.length,
          results: url.includes('33063_9999_00001') ? lines : [],
        }),
    })
}

const DPE_LINE = {
  numero_dpe: '2633E9999999X',
  date_etablissement_dpe: '2024-03-01',
  date_fin_validite_dpe: '2034-02-28',
  etiquette_dpe: 'D',
  etiquette_ges: 'B',
  conso_5_usages_par_m2_ep: 210,
  emission_ges_5_usages_par_m2: 12,
  surface_habitable_logement: 45,
  numero_etage_appartement: 2,
  adresse_ban: '1 Rue Fictive 33000 Bordeaux',
  complement_adresse_logement: null,
  identifiant_ban: '33063_9999_00001',
  type_batiment: 'appartement',
}

const LISTING = {
  title: 'T2 rue Fictive',
  price: 190_000,
  surface: 45,
  rooms: 2,
  floor: 2,
  constructionYear: 1900,
  location: { addressRaw: '1 rue Fictive', commune: 'Bordeaux' },
  rentalPlan: { targetRent: 700 },
}

describe('Données ouvertes (e2e)', () => {
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
    await geo.replaceRentControlZones('bordeaux', [
      {
        zone: 1,
        label: 'Secteur fictif ouest',
        irisCode: '330630001',
        inseeCode: '33063',
        geometry: { type: 'MultiPolygon', coordinates: ZONE_WEST },
        source: 'test',
      },
      {
        zone: 2,
        label: 'Secteur fictif est',
        irisCode: '330630002',
        inseeCode: '33063',
        geometry: { type: 'MultiPolygon', coordinates: ZONE_EAST },
        source: 'test',
      },
    ])
    await ctx.app
      .get(ReferenceCacheService)
      .set(RENT_REFERENCE_KIND, 'bordeaux:test', table())
    await geo.upsertTransitStops('TBM', [
      {
        externalId: '1',
        mode: 'tram',
        name: 'Arrêt fictif',
        lines: ['A'],
        longitude: -0.5815,
        latitude: 44.8405,
      },
      {
        externalId: '2',
        mode: 'bus',
        name: 'Bus fictif',
        lines: ['Lianes 1'],
        longitude: -0.5801,
        latitude: 44.8401,
      },
    ])
    await geo.upsertDvfSales(sales())
    ctx.geocoding.fetchImpl = geocoderAt(INSIDE_WEST)
    ctx.dpe.fetchImpl = ademe([DPE_LINE])
  })

  async function create(body: object = LISTING) {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(body)
      .expect(201)
    return res.body
  }

  it("saisir une adresse remplit le point, le DPE vérifié, le plafond et l'arrêt le plus proche", async () => {
    const created = await create()
    const listing = created.listing
    expect(listing.location.point.coordinates).toEqual(INSIDE_WEST)
    expect(listing.location.banId).toBe('33063_9999_00001')
    // DPE vérifié : un seul candidat à l'adresse, même surface et même étage.
    expect(listing.dpeClass).toBe('D')
    expect(listing.gesClass).toBe('B')
    expect(listing.dpeNumber).toBe('2633E9999999X')
    expect(listing.dpeDate).toBe('2024-03-01')
    expect(listing.fieldSources.dpeClass.source).toBe('open_data')
    // Plafond : zone 1, 2 pièces, avant 1946, vide → majoré fictif 13 €/m².
    expect(listing.rentalPlan.referenceRentPerM2).toBe(13)
    expect(listing.fieldSources['rentalPlan.referenceRentPerM2'].source).toBe(
      'open_data'
    )
    expect(created.evaluation.metrics.rentCap).toBe(13 * 45)
    // Arrêt de tram et médiane DVF dans l'instantané.
    expect(listing.openDataContext.transit.nearestTram.name).toBe(
      'Arrêt fictif'
    )
    expect(listing.openDataContext.market.count).toBe(6)
    expect(listing.openDataContext.market.medianPricePerM2).toBe(4250)
    // Le critère « marché » du prix cible devient calculable.
    const market = created.evaluation.targetPrice.criteria.find(
      (c: { criterion: string }) => c.criterion === 'market'
    )
    expect(market.maxPrice).toBe(4250 * 45)
    const logs = await ctx.prisma.activityLog.findMany({
      where: { listingId: listing.id, action: 'listing.enriched' },
    })
    expect(logs).toHaveLength(1)
  })

  it('le contexte de la fiche : tram, plafond, DPE et comparables datés', async () => {
    const { listing } = await create()
    const res = await request(ctx.server)
      .get(`/listings/${listing.id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    const context = res.body as ListingContext
    expect(context.transit.nearestTram?.lines).toEqual(['A'])
    expect(context.transit.nearestTram?.distanceMeters).toBeLessThan(150)
    expect(context.transit.nearestStop?.name).toBe('Bus fictif')
    expect(context.rentControl.status).toBe('ok')
    expect(context.rentControl.zone?.zone).toBe(1)
    expect(context.rentControl.monthlyCap).toBe(585)
    expect(context.dpe.verified).toBe(true)
    expect(context.dpe.validity.level).toBe('ok')
    expect(context.market.status).toBe('ok')
    expect(context.market.stats?.medianPricePerM2).toBe(4250)
    expect(context.market.comparables).toHaveLength(6)
    // Du plus récent au plus ancien, chaque vente avec sa date.
    const dates = context.market.comparables.map(c => c.mutationDate)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(context.market.marketPrice).toBe(4250 * 45)
    const market = await request(ctx.server)
      .get(`/listings/${listing.id}/market`)
      .set(ctx.auth(richard))
      .expect(200)
    expect((market.body as MarketContext).stats?.count).toBe(6)
  })

  it('une saisie manuelle du loyer de référence l’emporte sur le plafond automatique', async () => {
    const { listing } = await create()
    const patched = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({ rentalPlan: { targetRent: 700, referenceRentPerM2: 15 } })
      .expect(200)
    expect(patched.body.listing.rentalPlan.referenceRentPerM2).toBe(15)
    expect(
      patched.body.listing.fieldSources['rentalPlan.referenceRentPerM2'].source
    ).toBe('user')
    // Un nouvel enrichissement (changement de surface) ne l'écrase pas.
    const again = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({ surface: 46 })
      .expect(200)
    expect(again.body.listing.rentalPlan.referenceRentPerM2).toBe(15)
  })

  it('un plafond posé d’office est retiré quand il ne vaut plus (nouvelle adresse en limite de zone)', async () => {
    const { listing } = await create()
    expect(listing.rentalPlan.referenceRentPerM2).toBe(13)
    ctx.geocoding.fetchImpl = geocoderAt(ON_BORDER)
    const moved = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: { addressRaw: '3 rue Limite', commune: 'Bordeaux' },
      })
      .expect(200)
    expect(moved.body.listing.openDataContext.rentControl.status).toBe(
      'to_verify'
    )
    expect(moved.body.listing.rentalPlan.referenceRentPerM2).toBeNull()
    expect(
      moved.body.listing.fieldSources['rentalPlan.referenceRentPerM2']
    ).toBeUndefined()
  })

  it('adresse à la rue sans numéro : zone probable, plafond indicatif, rien d’appliqué', async () => {
    ctx.geocoding.fetchImpl = geocoderAt(INSIDE_WEST, 'street')
    const { listing } = await create({
      ...LISTING,
      location: { addressRaw: 'rue Fictive', commune: 'Bordeaux' },
    })
    expect(listing.location.precision).toBe('street')
    expect(listing.openDataContext.rentControl.status).toBe('to_verify')
    expect(listing.openDataContext.rentControl.reasons.join(' ')).toContain(
      'zone 1 probable'
    )
    expect(listing.rentalPlan.referenceRentPerM2).toBeNull()
  })

  it('sans phase 2, l’enrichissement n’en crée pas : le plafond reste au contexte', async () => {
    const { listing } = await create({ ...LISTING, rentalPlan: undefined })
    expect(listing.rentalPlan).toBeNull()
    expect(listing.openDataContext.rentControl.status).toBe('ok')
    expect(listing.openDataContext.rentControl.validUntil).not.toBeNull()
    expect(await ctx.prisma.rentalPlan.count()).toBe(0)
  })

  it('adresse en limite de zone : plafond « à vérifier », rien d’appliqué', async () => {
    ctx.geocoding.fetchImpl = geocoderAt(ON_BORDER)
    const { listing } = await create()
    expect(listing.rentalPlan.referenceRentPerM2).toBeNull()
    expect(listing.openDataContext.rentControl.status).toBe('to_verify')
    const res = await request(ctx.server)
      .get(`/listings/${listing.id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(res.body.rentControl.reasons.join(' ')).toContain('zones 1 et 2')
  })

  it('plusieurs DPE à l’adresse : proposition à valider, puis DPE retenu', async () => {
    ctx.dpe.fetchImpl = ademe([
      DPE_LINE,
      {
        ...DPE_LINE,
        numero_dpe: '2633E8888888X',
        surface_habitable_logement: 46,
        etiquette_dpe: 'E',
      },
    ])
    const { listing } = await create({ ...LISTING, floor: null })
    expect(listing.dpeClass).toBeNull()
    expect(listing.openDataContext.dpe.status).toBe('multiple')
    expect(listing.openDataContext.dpe.candidates).toHaveLength(2)
    // Un critère « DPE D au plus » : un DPE inconnu y entre (à vérifier).
    const criteria = await request(ctx.server)
      .post('/search-criteria')
      .set(ctx.auth(richard))
      .send({ name: 'DPE D au plus', filters: { dpeMax: 'D' } })
      .expect(201)
    expect(criteria.body.listingCount).toBe(1)
    expect(
      await ctx.prisma.criteriaMatch.count({ where: { listingId: listing.id } })
    ).toBe(1)
    await request(ctx.server)
      .post(`/listings/${listing.id}/dpe/verify`)
      .set(ctx.auth(richard))
      .send({ number: 'INCONNU0000X' })
      .expect(404)
    const verified = await request(ctx.server)
      .post(`/listings/${listing.id}/dpe/verify`)
      .set(ctx.auth(richard))
      .send({ number: '2633E8888888X', expectedUpdatedAt: listing.updatedAt })
      .expect(200)
    expect(verified.body.listing.dpeClass).toBe('E')
    expect(verified.body.listing.fieldSources.dpeNumber.source).toBe(
      'open_data'
    )
    // Le DPE retenu (E) fait sortir l'annonce du critère : badge et journal suivent.
    expect(verified.body.criteriaChanges.left).toEqual([
      { criteriaId: criteria.body.id, name: 'DPE D au plus' },
    ])
    expect(verified.body.criteriaMatches).toEqual([])
    expect(
      await ctx.prisma.criteriaMatch.count({ where: { listingId: listing.id } })
    ).toBe(0)
    expect(
      await ctx.prisma.activityLog.count({
        where: { listingId: listing.id, action: 'criteria.unmatched' },
      })
    ).toBe(1)
    const logs = await ctx.prisma.activityLog.findMany({
      where: { listingId: listing.id, action: 'listing.dpe_verified' },
    })
    expect(logs).toHaveLength(1)
  })

  it('ADEME en panne : l’annonce est créée, la recherche est « indisponible »', async () => {
    ctx.dpe.fetchImpl = () => Promise.reject(new Error('réseau coupé'))
    const { listing } = await create()
    expect(listing.dpeClass).toBeNull()
    expect(listing.openDataContext.dpe.status).toBe('unavailable')
    // Relance explicite, une fois l'ADEME revenue.
    ctx.dpe.fetchImpl = ademe([DPE_LINE])
    const res = await request(ctx.server)
      .post(`/listings/${listing.id}/dpe/search`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(res.body.dpe.verified).toBe(true)
  })

  it('relancer le géocodage sans cache', async () => {
    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
    const { listing } = await create()
    expect(listing.location.point).toBeNull()
    ctx.geocoding.fetchImpl = geocoderAt(INSIDE_WEST)
    const res = await request(ctx.server)
      .post(`/listings/${listing.id}/geocode`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(res.body.listing.location.point.coordinates).toEqual(INSIDE_WEST)
    expect(res.body.listing.location.precision).toBe('exact')
    expect(res.body.listing.rentalPlan.referenceRentPerM2).toBe(13)
    const empty = await create({ title: 'Sans adresse', price: 1 })
    await request(ctx.server)
      .post(`/listings/${empty.listing.id}/geocode`)
      .set(ctx.auth(richard))
      .expect(400)
  })

  it('hors Bordeaux : encadrement sans objet', async () => {
    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            features: [
              {
                geometry: { type: 'Point', coordinates: [-0.5906, 44.8083] },
                properties: {
                  label: '1 Rue Fictive 33400 Talence',
                  score: 0.9,
                  type: 'housenumber',
                  city: 'Talence',
                  citycode: '33522',
                  id: '33522_9999_00001',
                },
              },
            ],
          }),
      })
    const { listing } = await create({
      ...LISTING,
      location: { addressRaw: '1 rue Fictive', commune: 'Talence' },
    })
    expect(listing.openDataContext.rentControl.status).toBe('not_applicable')
    expect(listing.rentalPlan.referenceRentPerM2).toBeNull()
  })

  it('contexte de marché pour un point (REST) ; couches et état des imports', async () => {
    const report = await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({
        point: { type: 'Point', coordinates: INSIDE_WEST },
        surface: 45,
        rooms: 2,
        constructionYear: 1900,
        furnished: true,
      })
      .expect(200)
    expect(report.body.market.stats.count).toBe(6)
    expect(report.body.rentControl.applicable).toBe(true)
    expect(report.body.rentControl.referenceRentPerM2).toBe(14)
    expect(report.body.transit.nearestTram.name).toBe('Arrêt fictif')
    await request(ctx.server)
      .post('/market-context')
      .set(ctx.auth(richard))
      .send({})
      .expect(400)

    const trams = await request(ctx.server)
      .get('/opendata/layers/transit-stops?mode=tram')
      .set(ctx.auth(richard))
      .expect(200)
    expect(trams.body.features).toHaveLength(1)
    expect(trams.body.features[0].properties.lines).toBe('A')
    const zones = await request(ctx.server)
      .get('/opendata/layers/rent-control-zones')
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      zones.body.features.map(
        (f: { properties: { zone: number } }) => f.properties.zone
      )
    ).toEqual([1, 2])
    const dvf = await request(ctx.server)
      .get('/opendata/layers/dvf?bbox=-0.6,44.83,-0.56,44.85')
      .set(ctx.auth(richard))
      .expect(200)
    expect(dvf.body.features).toHaveLength(6)
    expect(dvf.body.features[0].properties.date).toBeDefined()
    const status = await request(ctx.server)
      .get('/opendata/status')
      .set(ctx.auth(richard))
      .expect(200)
    expect(status.body.rentControl.zones).toBe(2)
    expect(status.body.rentControl.decrees).toHaveLength(1)
    expect(status.body.transitStops).toEqual({ tram: 1, bus: 1 })
    expect(
      status.body.dvf.reduce(
        (n: number, y: { count: number }) => n + y.count,
        0
      )
    ).toBe(6)
  })

  it('les imports sont idempotents : upsert par identifiant', async () => {
    await geo.upsertDvfSales(sales())
    const count = await ctx.prisma.dvfSale.count()
    expect(count).toBe(6)
    const result = await geo.upsertTransitStops(
      'TBM',
      [
        {
          externalId: '1',
          mode: 'tram',
          name: 'Arrêt fictif renommé',
          lines: ['A', 'B'],
          longitude: -0.5815,
          latitude: 44.8405,
        },
      ],
      { pruneMissing: true }
    )
    expect(result.pruned).toBe(1)
    const stops = await ctx.prisma.transitStop.findMany()
    expect(stops).toHaveLength(1)
    expect(stops[0]?.line).toBe('A, B')
    const zones = await geo.replaceRentControlZones('bordeaux', [
      {
        zone: 3,
        label: 'Seul secteur',
        irisCode: '330630001',
        inseeCode: '33063',
        geometry: { type: 'Polygon', coordinates: ZONE_WEST[0] },
        source: 'test',
      },
    ])
    expect(zones).toEqual({ upserted: 1, pruned: 1 })
    expect(await geo.rentControlZoneCount('bordeaux')).toBe(1)
  })

  it('recherche d’adresse pour recentrer la carte : trouvé, introuvable, en panne', async () => {
    ctx.geocoding.fetchImpl = vi.fn(geocoderAt(INSIDE_WEST, 'street'))
    const found = await request(ctx.server)
      .get('/opendata/geocode')
      .query({ q: '  rue Fictive, Bordeaux ' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(found.body).toEqual({
      query: 'rue Fictive, Bordeaux',
      status: 'found',
      result: {
        point: { type: 'Point', coordinates: INSIDE_WEST },
        label: 'Rue Fictive 33000 Bordeaux',
        precision: 'street',
        commune: 'Bordeaux',
      },
    })
    // La même recherche est servie par le cache : le géocodeur n'est pas
    // rappelé, et une lecture n'écrit rien au journal (la première requête a
    // pu y rattacher le membre).
    const activityBefore = await ctx.prisma.activityLog.count()
    await request(ctx.server)
      .get('/opendata/geocode?q=rue%20Fictive%2C%20Bordeaux')
      .set(ctx.auth(richard))
      .expect(200)
    expect(ctx.geocoding.fetchImpl).toHaveBeenCalledTimes(1)
    expect(await ctx.prisma.activityLog.count()).toBe(activityBefore)
    expect(
      await ctx.prisma.referenceData.count({ where: { kind: 'geocode' } })
    ).toBe(1)

    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
    const missing = await request(ctx.server)
      .get('/opendata/geocode?q=Nulle%20part')
      .set(ctx.auth(richard))
      .expect(200)
    expect(missing.body).toEqual({
      query: 'Nulle part',
      status: 'not_found',
      result: null,
    })

    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
    const down = await request(ctx.server)
      .get('/opendata/geocode?q=Place%20Fictive')
      .set(ctx.auth(richard))
      .expect(200)
    expect(down.body.status).toBe('unavailable')

    await request(ctx.server)
      .get('/opendata/geocode?q=ab')
      .set(ctx.auth(richard))
      .expect(400)
    await request(ctx.server).get('/opendata/geocode?q=Talence').expect(401)
  })
})
