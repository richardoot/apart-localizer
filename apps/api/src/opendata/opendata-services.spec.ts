import { describe, expect, it, vi } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'
import type { RentReferenceTable } from '@apart/contracts'
import { DpeService, dpeQueryFor } from './dpe.service'
import type { DpeTarget } from './dpe.service'
import { IsochroneService } from './isochrone.service'
import { MarketService } from './market.service'
import { ReferenceCacheService } from './reference-cache.service'
import { RentControlService } from './rent-control.service'
import { TransitService, toStop } from './transit.service'
import type { GeoService } from '../geo/geo.service'
import type { FetchLike } from './geoplateforme'

/** Un cache en mémoire à la place de `ReferenceData`. */
function memoryCache() {
  const store = new Map<string, { payload: unknown; fetchedAt: Date }>()
  const cache = {
    get: vi.fn((kind: string, key: string, maxAgeMs?: number) => {
      const hit = store.get(`${kind}|${key}`)
      if (!hit) return Promise.resolve(null)
      if (
        maxAgeMs !== undefined &&
        Date.now() - hit.fetchedAt.getTime() > maxAgeMs
      ) {
        return Promise.resolve(null)
      }
      return Promise.resolve(hit)
    }),
    set: vi.fn((kind: string, key: string, payload: unknown) => {
      store.set(`${kind}|${key}`, { payload, fetchedAt: new Date() })
      return Promise.resolve()
    }),
    all: vi.fn((kind: string) =>
      Promise.resolve(
        [...store.entries()]
          .filter(([k]) => k.startsWith(`${kind}|`))
          .map(([k, v]) => ({ key: k, payload: v.payload }))
      )
    ),
  }
  return { cache: cache as unknown as ReferenceCacheService, store, raw: cache }
}

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
const point = {
  type: 'Point' as const,
  coordinates: [-0.58, 44.84] as [number, number],
}

describe('ReferenceCacheService', () => {
  it('lit, écrit et ignore une entrée trop vieille', async () => {
    const rows = new Map<string, { payload: unknown; fetchedAt: Date }>()
    const prisma = {
      referenceData: {
        findUnique: vi.fn(
          ({ where }: { where: { kind_key: { kind: string; key: string } } }) =>
            Promise.resolve(rows.get(where.kind_key.key) ?? null)
        ),
        upsert: vi.fn(
          ({
            where,
            create,
          }: {
            where: { kind_key: { key: string } }
            create: { payload: unknown }
          }) => {
            rows.set(where.kind_key.key, {
              payload: create.payload,
              fetchedAt: new Date(Date.now() - 10_000),
            })
            return Promise.resolve({})
          }
        ),
        findMany: vi.fn(() =>
          Promise.resolve([{ key: 'k', payload: { a: 1 } }])
        ),
      },
    }
    const cache = new ReferenceCacheService(prisma as never)
    expect(await cache.get('x', 'k')).toBeNull()
    await cache.set('x', 'k', { a: 1, skipped: undefined })
    expect((await cache.get('x', 'k'))?.payload).toEqual({ a: 1 })
    expect(await cache.get('x', 'k', 1000)).toBeNull()
    expect(await cache.all('x')).toEqual([{ key: 'k', payload: { a: 1 } }])
  })
})

describe('IsochroneService', () => {
  it('met en cache ; une panne répond 503 et ne se met pas en cache', async () => {
    const { cache, raw } = memoryCache()
    const service = new IsochroneService(cache)
    service.fetchImpl = vi.fn(() =>
      ok({
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.6, 44.8],
              [-0.59, 44.8],
              [-0.59, 44.81],
              [-0.6, 44.8],
            ],
          ],
        },
      })
    )
    const first = await service.compute(point, 'walking', 10)
    expect(first.computedAt).toBeDefined()
    await service.compute(point, 'walking', 10)
    expect(service.fetchImpl).toHaveBeenCalledTimes(1)
    expect(IsochroneService.cacheKey(point, 'walking', 10)).toBe(
      'walking:10:-0.58000,44.84000'
    )
    service.fetchImpl = () => Promise.reject(new Error('timeout'))
    await expect(service.compute(point, 'driving', 5)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(raw.set).toHaveBeenCalledTimes(1)
  })
})

describe('DpeService', () => {
  const target: DpeTarget = {
    banId: '33063_0000_00001',
    inseeCode: '33063',
    precision: 'exact',
    surface: 45,
    floor: 2,
    declaredClass: null,
  }
  const line = (number: string, surface: number) => ({
    numero_dpe: number,
    date_etablissement_dpe: '2024-01-01',
    etiquette_dpe: 'D',
    surface_habitable_logement: surface,
    numero_etage_appartement: 2,
    type_batiment: 'appartement',
  })

  it('la requête : BAN si adresse exacte, sinon commune et surface, sinon rien', () => {
    expect(dpeQueryFor(target)).toEqual({
      method: 'ban_id',
      banId: target.banId,
    })
    expect(dpeQueryFor({ ...target, precision: 'street' })).toEqual({
      method: 'commune_surface',
      inseeCode: '33063',
      surface: 45,
    })
    expect(
      dpeQueryFor({ ...target, precision: 'commune', surface: null })
    ).toBeNull()
  })

  it('un candidat clair à l’adresse est appliqué ; par commune, jamais d’office', async () => {
    const { cache } = memoryCache()
    const service = new DpeService(cache)
    service.fetchImpl = vi.fn(() => ok({ total: 1, results: [line('A1', 45)] }))
    const exact = await service.search(target)
    expect(exact.result.status).toBe('verified')
    expect(exact.apply?.number).toBe('A1')
    expect(exact.result.message).toContain('appliqué')
    const byCommune = await service.search({ ...target, precision: 'street' })
    expect(byCommune.result.status).toBe('single')
    expect(byCommune.apply).toBeNull()
    expect(byCommune.result.message).toContain('autre adresse')
    // La seconde recherche par BAN vient du cache.
    await service.search(target)
    expect(service.fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('plusieurs candidats, aucun, recherche impossible, panne', async () => {
    const { cache } = memoryCache()
    const service = new DpeService(cache)
    service.fetchImpl = () =>
      ok({ total: 2, results: [line('A1', 45), line('A2', 46)] })
    const multiple = await service.search(target)
    expect(multiple.result.status).toBe('multiple')
    expect(multiple.result.candidates.map(c => c.number)).toEqual(['A1', 'A2'])
    const none = new DpeService(memoryCache().cache)
    none.fetchImpl = () => ok({ total: 0, results: [] })
    expect((await none.search(target)).result.message).toContain('Aucun DPE')
    expect(
      (await none.search({ ...target, precision: 'district', surface: 30 }))
        .result.message
    ).toContain('commune')
    const impossible = await none.search({
      ...target,
      banId: null,
      surface: null,
    })
    expect(impossible.result.method).toBe('none')
    const down = new DpeService(memoryCache().cache)
    down.fetchImpl = () => Promise.reject(new Error('réseau'))
    const failed = await down.search(target)
    expect(failed.result.status).toBe('unavailable')
    expect(failed.result.message).toContain('réseau')
  })
})

function table(): RentReferenceTable {
  return {
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: '2026-07-06',
    validFrom: '2026-07-15',
    validUntil: '2026-11-24',
    source: {
      url: null,
      file: 'x',
      sha256: 'y',
      importedAt: '2026-07-16T00:00:00.000Z',
      crossCheck: null,
    },
    rows: [
      {
        zone: 1,
        rooms: 2,
        epoch: 'before_1946',
        furnished: false,
        referenceRent: 10,
        upperRent: 12,
        lowerRent: 7,
      },
    ],
  }
}

describe('RentControlService', () => {
  const zones = [
    {
      zone: 1,
      label: 'Z1',
      iris_code: '1',
      insee_code: '33063',
      territory: 'bordeaux',
      distance_meters: 0,
    },
  ]
  function service(found = zones) {
    const { cache, store } = memoryCache()
    store.set('rent_reference|t', { payload: table(), fetchedAt: new Date() })
    store.set('rent_reference|broken', {
      payload: { nope: 1 },
      fetchedAt: new Date(),
    })
    const geo = { rentControlZonesNear: vi.fn(() => Promise.resolve(found)) }
    return {
      rent: new RentControlService(geo as unknown as GeoService, cache),
      geo,
    }
  }
  const base = {
    point,
    precision: 'exact' as const,
    inseeCode: '33063',
    commune: 'Bordeaux',
    rentControl: 'auto' as const,
    rooms: 2,
    constructionYear: 1900,
    constructionPeriod: null,
    leaseType: 'unfurnished' as const,
    surface: 40,
    rentalYear: 2028,
  }
  const at = new Date('2026-11-03T12:00:00Z')

  it('Bordeaux : zone, arrêté en vigueur, plafond', async () => {
    const { rent } = service()
    expect(await rent.tables()).toHaveLength(1)
    const r = await rent.lookup(base, at)
    expect(r.status).toBe('ok')
    expect(r.monthlyCap).toBe(480)
    expect(r.notes.join(' ')).toContain('Mise en location prévue en 2028')
  })

  it('hors Bordeaux, forcé par la phase 2, point seul', async () => {
    const { rent, geo } = service()
    expect(
      (await rent.lookup({ ...base, inseeCode: '33522' }, at)).status
    ).toBe('not_applicable')
    expect(geo.rentControlZonesNear).not.toHaveBeenCalled()
    expect(
      (
        await rent.lookup(
          { ...base, inseeCode: '33522', rentControl: 'yes' },
          at
        )
      ).status
    ).toBe('ok')
    expect((await rent.lookup({ ...base, rentControl: 'no' }, at)).status).toBe(
      'not_applicable'
    )
    expect(
      (await rent.lookup({ ...base, inseeCode: null, commune: 'Bordeaux' }, at))
        .applicable
    ).toBe(true)
    expect(
      (await rent.lookup({ ...base, inseeCode: null, commune: null }, at))
        .applicable
    ).toBe(true)
    const outside = service([])
    expect(
      (
        await outside.rent.lookup(
          { ...base, inseeCode: null, commune: null },
          at
        )
      ).applicable
    ).toBe(false)
    expect(
      (
        await outside.rent.lookup(
          { ...base, inseeCode: null, commune: null, point: null },
          at
        )
      ).applicable
    ).toBe(false)
  })

  it('après la fin de l’arrêté : à vérifier', async () => {
    const { rent } = service()
    const r = await rent.lookup(base, new Date('2026-11-25T12:00:00Z'))
    expect(r.status).toBe('to_verify')
    expect(r.reasons[0]).toContain('25/11/2026')
  })
})

describe('MarketService', () => {
  const hit = (i: number, pricePerM2: number) => ({
    id: `s${i}`,
    mutation_date: `2024-0${(i % 9) + 1}-01`,
    price: pricePerM2 * 40,
    surface: 40,
    price_per_m2: pricePerM2,
    rooms: 2,
    address: 'rue',
    commune: 'Bordeaux',
    longitude: -0.58,
    latitude: 44.84,
    distance_meters: 100 * i,
  })
  function geo(
    byRadius: Record<number, ReturnType<typeof hit>[]>,
    years = [{ year: 2024, count: 10, lastDate: '2024-12-30' }],
    /** Lot 29 : prix au m² par année et par rayon, pour la tendance. */
    pricesByRadius: Record<
      number,
      { year: number; pricesPerM2: number[] }[]
    > = {}
  ) {
    return {
      dvfYears: vi.fn(() => Promise.resolve(years)),
      dvfSalesWithinRadius: vi.fn(
        ({ radiusMeters }: { radiusMeters: number }) =>
          Promise.resolve(byRadius[radiusMeters] ?? [])
      ),
      dvfPricesByYearWithinRadius: vi.fn(
        ({ radiusMeters }: { radiusMeters: number }) =>
          Promise.resolve(pricesByRadius[radiusMeters] ?? [])
      ),
    } as unknown as GeoService
  }
  const at = new Date('2026-11-03T12:00:00Z')

  it('élargit le rayon faute de ventes, rend médiane, prix de marché et écart', async () => {
    const five = [3000, 3500, 4000, 4500, 5000].map((p, i) => hit(i, p))
    const market = new MarketService(geo({ 500: five.slice(0, 2), 1000: five }))
    const ctx = await market.context({ point, surface: 40, price: 176_000 }, at)
    expect(ctx.status).toBe('ok')
    expect(ctx.radiusMeters).toBe(1000)
    expect(ctx.stats?.medianPricePerM2).toBe(4000)
    expect(ctx.marketPrice).toBe(160_000)
    expect(ctx.gapToMarket).toBeCloseTo(0.1, 10)
    expect(ctx.surfaceRange).toEqual([30, 50])
    expect(ctx.reasons.join(' ')).toContain("jusqu'en 2024")
    expect(ctx.comparables[0]).toMatchObject({ id: 's0', pricePerM2: 3000 })
  })

  it('sans DVF, sans point, sans surface, trop peu de ventes', async () => {
    expect(
      (await new MarketService(geo({}, [])).context({ point, surface: 40 }, at))
        .status
    ).toBe('unavailable')
    expect(
      (
        await new MarketService(geo({})).context(
          { point: null, surface: 40 },
          at
        )
      ).status
    ).toBe('to_verify')
    const few = await new MarketService(geo({ 2000: [hit(1, 4000)] })).context(
      { point, surface: null },
      at
    )
    expect(few.status).toBe('to_verify')
    expect(few.marketPrice).toBeNull()
    expect(few.reasons.join(' ')).toContain('Surface inconnue')
    expect(few.reasons.join(' ')).toContain('Moins de 5')
    const imposed = await new MarketService(geo({ 300: [] })).context(
      { point, surface: 40, radiusMeters: 300 },
      at
    )
    expect(imposed.radiusMeters).toBe(300)
  })

  describe('lot 29 : tendance des prix', () => {
    const years = [2028, 2029, 2030, 2031].map(year => ({
      year,
      count: 100,
      lastDate: year === 2031 ? '2031-06-30' : `${year}-12-30`,
    }))
    const twelve = (median: number): number[] =>
      Array.from({ length: 12 }, () => median)
    const five = [3000, 3500, 4000, 4500, 5000].map((p, i) => hit(i, p))
    const later = new Date('2031-11-03T12:00:00Z')

    it('même rayon que les comparables quand la dernière année complète a dix ventes', async () => {
      const g = geo({ 500: five }, years, {
        500: [
          { year: 2028, pricesPerM2: twelve(4000) },
          { year: 2029, pricesPerM2: twelve(5000) },
          { year: 2030, pricesPerM2: twelve(4500) },
          { year: 2031, pricesPerM2: twelve(4400) },
        ],
      })
      const ctx = await new MarketService(g).context(
        { point, surface: 40 },
        later
      )
      expect(g.dvfPricesByYearWithinRadius).toHaveBeenCalledTimes(1)
      expect(g.dvfPricesByYearWithinRadius).toHaveBeenCalledWith({
        point,
        radiusMeters: 500,
      })
      expect(ctx.trend).toMatchObject({
        status: 'ok',
        radiusMeters: 500,
        referenceYear: 2030,
        direction: 'down',
        peak: { year: 2029, medianPricePerM2: 5000 },
      })
      expect(ctx.trend.changes).toHaveLength(1)
      expect(ctx.trend.changes[0]?.change).toBeCloseTo(-0.1, 10)
      expect(ctx.trend.years.map(y => y.partial)).toEqual([
        false,
        false,
        false,
        true,
      ])
    })

    it('élargit le rayon tant que la dernière année complète manque de ventes', async () => {
      const g = geo({ 500: five }, years, {
        500: [{ year: 2029, pricesPerM2: twelve(5000) }],
        1000: [
          { year: 2029, pricesPerM2: twelve(5000) },
          { year: 2030, pricesPerM2: twelve(5200) },
        ],
      })
      const ctx = await new MarketService(g).context(
        { point, surface: 40 },
        later
      )
      expect(g.dvfPricesByYearWithinRadius).toHaveBeenCalledTimes(2)
      expect(ctx.radiusMeters).toBe(500)
      expect(ctx.trend).toMatchObject({
        radiusMeters: 1000,
        referenceYear: 2030,
        direction: 'up',
      })
    })

    it('ses rayons ne dépendent pas de ceux des comparables ; à bout de rayons, « à vérifier »', async () => {
      // Comparables à 1 000 m seulement, ventes de toutes surfaces dès 500 m.
      const local = geo({ 1000: five }, years, {
        500: [
          { year: 2029, pricesPerM2: twelve(5000) },
          { year: 2030, pricesPerM2: twelve(5000) },
        ],
      })
      const near = await new MarketService(local).context(
        { point, surface: 40 },
        later
      )
      expect(near.radiusMeters).toBe(1000)
      expect(near.trend.radiusMeters).toBe(500)

      const g = geo({ 1000: five }, years)
      const ctx = await new MarketService(g).context(
        { point, surface: 40 },
        later
      )
      expect(
        vi
          .mocked(g.dvfPricesByYearWithinRadius)
          .mock.calls.map(([q]) => q.radiusMeters)
      ).toEqual([500, 1000, 2000])
      expect(ctx.trend).toMatchObject({
        status: 'to_verify',
        radiusMeters: 2000,
        referenceYear: null,
      })
    })

    it('rayon imposé : lui seul ; repère à la commune : « à vérifier » avec sa réserve', async () => {
      const prices = {
        300: [
          { year: 2029, pricesPerM2: twelve(5000) },
          { year: 2030, pricesPerM2: twelve(5000) },
        ],
      }
      const g = geo({ 300: five }, years, prices)
      const ctx = await new MarketService(g).context(
        {
          point,
          surface: 40,
          radiusMeters: 300,
          precision: 'commune',
          approximation: {
            approximate: true,
            origin: 'centre de la commune',
            note: 'n',
          },
        },
        later
      )
      expect(g.dvfPricesByYearWithinRadius).toHaveBeenCalledTimes(1)
      expect(ctx.trend.status).toBe('to_verify')
      expect(ctx.trend.direction).toBe('stable')
      expect(ctx.trend.reasons.join(' ')).toContain('centre de la commune')
    })

    it('sans vente importée ou sans point : pas de tendance, aucune lecture', async () => {
      const none = geo({}, [])
      expect(
        (await new MarketService(none).context({ point, surface: 40 }, later))
          .trend
      ).toMatchObject({ status: 'unavailable', years: [] })
      const g = geo({}, years)
      const ctx = await new MarketService(g).context(
        { point: null, surface: 40 },
        later
      )
      expect(ctx.trend).toMatchObject({
        status: 'to_verify',
        reasons: ['Adresse non localisée : pas de tendance.'],
      })
      expect(ctx.trend.years).toHaveLength(4)
      expect(g.dvfPricesByYearWithinRadius).not.toHaveBeenCalled()
    })
  })
})

describe('TransitService', () => {
  it('tram et tous modes ; lignes découpées ; rien sans point', async () => {
    const row = {
      id: '1',
      network: 'TBM',
      line: 'A, C',
      name: 'Porte de Bourgogne',
      mode: 'tram' as const,
      longitude: -0.56,
      latitude: 44.83,
      distance_meters: 123.4,
    }
    const geo = { nearestTransitStop: vi.fn(() => Promise.resolve(row)) }
    const transit = new TransitService(geo as unknown as GeoService)
    const ctx = await transit.at(point)
    expect(ctx.nearestTram).toEqual({
      name: 'Porte de Bourgogne',
      mode: 'tram',
      lines: ['A', 'C'],
      distanceMeters: 123,
      point: { type: 'Point', coordinates: [-0.56, 44.83] },
    })
    expect(geo.nearestTransitStop).toHaveBeenCalledWith(point, 2000, 'tram')
    expect(ctx.approximate).toBe(false)
    expect(await transit.at(null)).toEqual({
      nearestTram: null,
      nearestStop: null,
      approximate: false,
      reasons: [],
    })
    expect(toStop(null)).toBeNull()
    expect(toStop({ ...row, line: null })?.lines).toEqual([])
    // Lot 12 : un repère au centre du quartier rend la desserte « ≈ ».
    const approx = await transit.at(point, {
      approximate: true,
      origin: 'centre du quartier « Fictif »',
      note: 'n',
    })
    expect(approx.approximate).toBe(true)
    expect(approx.reasons).toEqual([
      'Desserte mesurée depuis le centre du quartier « Fictif », repère approché : distances ≈.',
    ])
  })
})
