import { describe, expect, it, vi } from 'vitest'
import { GEOCODE_CACHE_KIND, GeocodingService } from './geocoding.service'
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
    const located = await geocoding.locate({
      addressRaw: 'rue du Forum',
      commune: 'Talence',
    })
    expect(located).toEqual({
      point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      precision: 'street',
      addressNormalized: 'Rue du Forum 33400 Talence',
      banId: 'ban-1',
      commune: 'Talence',
      inseeCode: '33522',
      score: 0.9,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('rue+du+Forum%2C+Talence')
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
