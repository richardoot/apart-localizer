import { describe, expect, it, vi } from 'vitest'
import { RentObservatoryTableSchema } from '@apart/contracts'
import type { GeoService } from '../geo/geo.service'
import type { ReferenceCacheService } from './reference-cache.service'
import {
  RENT_OBSERVATORY_KIND,
  RentObservatoryService,
} from './rent-observatory.service'

/** Table fictive : aucune valeur réelle de l'observatoire. */
const table = (year: number, median: number) =>
  RentObservatoryTableSchema.parse({
    territory: 'bordeaux',
    observatory: 'L9900',
    year,
    observedAt: `${year}-01-01`,
    housingType: 'apartment',
    zones: [
      {
        zone: 2,
        label: 'Zone 2',
        stats: [
          {
            rooms: 2,
            medianPerM2: median,
            q1PerM2: median - 2,
            q3PerM2: median + 2,
            observations: 50,
          },
        ],
      },
    ],
    irisZones: { '339990101': 2, '339990102': 3 },
    communeZones: { '33998': 2 },
    source: {
      url: null,
      file: 'fictif.zip',
      sha256: 'abc',
      importedAt: '2030-11-11T10:00:00.000Z',
    },
  })

const point = {
  type: 'Point' as const,
  coordinates: [-0.58, 44.84] as [number, number],
}

const hit = (kind: string, code: string, distance = 0) => ({
  kind,
  code,
  name: code,
  parent: null,
  commune: 'Commune fictive',
  insee_code: '33999',
  source: 'fictif',
  distance_meters: distance,
})

function service(
  payloads: unknown[] = [table(2030, 15)],
  hits: ReturnType<typeof hit>[] = [hit('iris', '339990101')],
  counts: Record<string, number> = { quartier: 0, iris: 2, commune: 0 }
) {
  const cache = {
    all: vi.fn((kind: string) =>
      Promise.resolve(
        kind === RENT_OBSERVATORY_KIND
          ? payloads.map((payload, i) => ({ key: `k${i}`, payload }))
          : []
      )
    ),
  }
  const geo = {
    neighbourhoodsNear: vi.fn(() => Promise.resolve(hits)),
    neighbourhoodCounts: vi.fn(() => Promise.resolve(counts)),
  }
  return {
    observatory: new RentObservatoryService(
      geo as unknown as GeoService,
      cache as unknown as ReferenceCacheService
    ),
    geo,
  }
}

const base = {
  point,
  precision: 'exact' as const,
  inseeCode: '33999',
  rooms: 2,
  surface: 40,
  targetRent: 620,
  leaseType: 'unfurnished' as const,
}

describe('RentObservatoryService', () => {
  it('lit les tables importées et ignore une entrée illisible', async () => {
    const { observatory } = service([
      table(2029, 14),
      { nope: 1 },
      table(2030, 15),
    ])
    expect((await observatory.tables()).map(t => t.year)).toEqual([2029, 2030])
  })

  it('rend la médiane de la zone de l’IRIS qui contient le repère', async () => {
    const { observatory, geo } = service(
      [table(2029, 14), table(2030, 15)],
      [
        hit('quartier', 'Q1'),
        hit('iris', '339990101'),
        // Un IRIS voisin, qui ne contient pas le repère, ne compte pas.
        hit('iris', '339990102', 4),
      ]
    )
    const lookup = await observatory.lookup(base)
    expect(geo.neighbourhoodsNear).toHaveBeenCalledWith(
      point,
      0,
      'bordeaux_metropole'
    )
    expect(lookup).toMatchObject({
      status: 'ok',
      zone: { zone: 2, label: 'Zone 2' },
      year: 2030,
      medianPerM2: 15,
      monthlyMedian: 600,
      targetRent: 620,
      position: 'within',
    })
    expect(lookup.notes.join(' ')).not.toContain('ne distingue pas')
  })

  it('prend la commune du contour quand l’annonce n’en a pas', async () => {
    const { observatory } = service(
      [table(2030, 15)],
      [{ ...hit('commune', '339980000'), insee_code: '33998' }]
    )
    const lookup = await observatory.lookup({ ...base, inseeCode: null })
    expect(lookup).toMatchObject({ status: 'ok', zone: { zone: 2 } })
  })

  it('note le meublé et la colocation', async () => {
    for (const leaseType of ['furnished', 'shared'] as const) {
      const lookup = await service().observatory.lookup({ ...base, leaseType })
      expect(lookup.notes.at(-1)).toContain('ne distingue pas')
    }
  })

  it('sans repère : pas de lecture des contours, la précision ne compte pas', async () => {
    const { observatory, geo } = service()
    const lookup = await observatory.lookup({
      ...base,
      point: null,
      precision: 'commune',
      inseeCode: '33998',
    })
    expect(geo.neighbourhoodsNear).not.toHaveBeenCalled()
    expect(lookup).toMatchObject({ status: 'ok', approximate: false })
    const nothing = await observatory.lookup({
      ...base,
      point: null,
      inseeCode: null,
    })
    expect(nothing.status).toBe('to_verify')
  })

  it('aucun contour au repère : indisponible sans contours importés, sinon hors périmètre', async () => {
    const missing = service([table(2030, 15)], [], {
      quartier: 0,
      iris: 0,
      commune: 0,
    })
    const lookup = await missing.observatory.lookup(base)
    expect(missing.geo.neighbourhoodCounts).toHaveBeenCalledWith(
      'bordeaux_metropole'
    )
    expect(lookup.status).toBe('unavailable')
    expect(lookup.reasons[0]).toContain('Contours des quartiers non importés')
    const outside = service([table(2030, 15)], [])
    const far = await outside.observatory.lookup({
      ...base,
      inseeCode: '75056',
    })
    expect(far.status).toBe('not_applicable')
    // Des contours au repère : le compte des contours n'est pas relu.
    const usual = service()
    await usual.observatory.lookup(base)
    expect(usual.geo.neighbourhoodCounts).not.toHaveBeenCalled()
  })

  it('sans table importée : indisponible, aucune requête géographique', async () => {
    const { observatory, geo } = service([])
    const lookup = await observatory.lookup(base)
    expect(lookup.status).toBe('unavailable')
    expect(geo.neighbourhoodsNear).not.toHaveBeenCalled()
  })
})
