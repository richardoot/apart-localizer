import { describe, expect, it, vi } from 'vitest'
import { GEOCODE_CACHE_KIND, GeocodingService } from './geocoding.service'
import type { PlacementService } from './placement.service'
import type { PrismaService } from '../prisma/prisma.service'

const feature = (type: string, label: string) => ({
  features: [
    {
      geometry: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      properties: {
        label,
        score: 0.9,
        type,
        city: 'Talence',
        citycode: '33522',
        id: 'ban-1',
      },
    },
  ],
})

/** Un Prisma réduit à `referenceData`, avec un cache en mémoire. */
function fakePrisma() {
  const store = new Map<string, { payload: unknown }>()
  const prisma = {
    referenceData: {
      findUnique: vi.fn(({ where }: { where: { kind_key: { key: string } } }) =>
        Promise.resolve(store.get(where.kind_key.key) ?? null)
      ),
      upsert: vi.fn(
        ({
          where,
          create,
        }: {
          where: { kind_key: { key: string } }
          create: { payload: unknown }
        }) => {
          store.set(where.kind_key.key, { payload: create.payload })
          return Promise.resolve({})
        }
      ),
    },
  }
  return { prisma: prisma as unknown as PrismaService, store }
}

function service(fetchImpl: GeocodingService['fetchImpl']) {
  const { prisma, store } = fakePrisma()
  const geocoding = new GeocodingService(prisma)
  geocoding.fetchImpl = fetchImpl
  return { geocoding, store, prisma }
}

describe('GeocodingService', () => {
  it('appelle une fois, met en cache en base, relit le cache', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            feature('housenumber', '1 Rue du Forum 33400 Talence')
          ),
      })
    )
    const { geocoding, store, prisma } = service(fetchMock)
    const first = await geocoding.geocode('1 rue du Forum, Talence')
    expect(first?.precision).toBe('exact')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.has('address:1 rue du forum, talence')).toBe(true)
    const upsert = (prisma.referenceData.upsert as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0] as { create: { kind: string } }
    expect(upsert.create.kind).toBe(GEOCODE_CACHE_KIND)

    const again = await geocoding.geocode('1 RUE du Forum,  Talence')
    expect(again).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('met aussi en cache une absence de résultat', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
    )
    const { geocoding } = service(fetchMock)
    expect(await geocoding.geocode('nulle part')).toBeNull()
    expect(await geocoding.geocode('nulle part')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('locate : adresse exacte d’abord, avec commune et code INSEE', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(feature('street', 'Rue du Forum 33400 Talence')),
      })
    )
    const { geocoding } = service(fetchMock)
    const located = await geocoding.locate(
      {
        addressRaw: 'rue du Forum',
        commune: 'Talence',
      },
      { at: new Date('2026-11-05T10:00:00.000Z') }
    )
    expect(located).toEqual({
      point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      precision: 'street',
      addressNormalized: 'Rue du Forum 33400 Talence',
      banId: 'ban-1',
      commune: 'Talence',
      inseeCode: '33522',
      score: 0.9,
      placement: {
        method: 'address',
        precision: 'street',
        matchedText: null,
        area: null,
        toVerify: false,
        reasons: [
          'Adresse trouvée à la rue, sans numéro : Rue du Forum 33400 Talence.',
        ],
        computedAt: '2026-11-05T10:00:00.000Z',
      },
      area: null,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('rue+du+Forum%2C+Talence')
  })

  it('locate (lot 12) : sans numéro, le quartier reconnu avant la commune, sans réseau', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
    )
    const { prisma } = fakePrisma()
    const placement = {
      locateDistrict: vi.fn(() =>
        Promise.resolve({
          located: {
            point: {
              type: 'Point' as const,
              coordinates: [-0.6, 44.8] as [number, number],
            },
            placement: {
              method: 'neighbourhood_match' as const,
              precision: 'district' as const,
              matchedText: 'Forum',
              area: null,
              toVerify: false,
              reasons: [],
              computedAt: '2026-11-05T10:00:00.000Z',
            },
            area: null,
            commune: 'Talence',
            inseeCode: '33522',
          },
          reasons: [],
          inseeCode: '33522',
        })
      ),
    }
    const geocoding = new GeocodingService(
      prisma,
      placement as unknown as PlacementService
    )
    geocoding.fetchImpl = fetchMock
    const located = await geocoding.locate({
      addressRaw: null,
      commune: 'Talence',
      district: 'Forum',
    })
    expect(located?.precision).toBe('district')
    expect(located?.placement.method).toBe('neighbourhood_match')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(placement.locateDistrict).toHaveBeenCalledWith(
      { district: 'Forum', commune: 'Talence', inseeCode: null },
      expect.any(Date)
    )
  })

  it('locate (lot 12) : rien de reconnu, la commune garde les noms non reconnus ; une panne du quartier ne bloque pas', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(feature('municipality', 'Talence')),
      })
    )
    const { prisma } = fakePrisma()
    const placement = {
      locateDistrict: vi
        .fn()
        .mockResolvedValueOnce({
          located: null,
          reasons: ['« Inventé » : aucun quartier ni lieu-dit de ce nom.'],
          inseeCode: '33522',
        })
        .mockRejectedValueOnce(new Error('base indisponible')),
    }
    const geocoding = new GeocodingService(
      prisma,
      placement as unknown as PlacementService
    )
    geocoding.fetchImpl = fetchMock
    const located = await geocoding.locate({
      commune: 'Talence',
      district: 'Inventé',
    })
    expect(located?.precision).toBe('commune')
    expect(located?.placement.reasons).toEqual([
      'Aucun quartier reconnu dans « Inventé » : repère au centre de la commune.',
      '« Inventé » : aucun quartier ni lieu-dit de ce nom.',
    ])
    expect(located?.area).toEqual({
      kind: 'commune',
      territory: 'bordeaux_metropole',
      inseeCode: '33522',
    })
    const again = await geocoding.locate({
      commune: 'Talence',
      district: 'Inventé',
    })
    expect(again?.precision).toBe('commune')
  })

  it('locate : repli sur le centroïde de la commune quand l’adresse est muette', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(feature('municipality', 'Talence')),
      })
    const { geocoding } = service(fetchMock)
    const located = await geocoding.locate({
      addressRaw: 'quelque part',
      commune: 'Talence',
    })
    expect(located?.precision).toBe('commune')
    expect(located?.addressNormalized).toBeNull()
    expect(located?.banId).toBeNull()
    expect(located?.inseeCode).toBe('33522')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('type=municipality')
  })

  it('locate : rien sans adresse ni commune, et jamais d’exception sur une panne', async () => {
    const down = vi.fn(() => Promise.reject(new Error('réseau coupé')))
    const { geocoding } = service(down)
    expect(await geocoding.locate({})).toBeNull()
    expect(down).not.toHaveBeenCalled()
    expect(await geocoding.locate({ commune: 'Talence' })).toBeNull()
    expect(down).toHaveBeenCalledTimes(1)
  })
})
