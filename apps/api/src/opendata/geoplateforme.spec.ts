import { describe, expect, it, vi } from 'vitest'
import {
  addressQuery,
  geocodeCacheKey,
  geocodeOnce,
  precisionOf,
} from './geoplateforme'

const feature = (
  over: Record<string, unknown> = {},
  coords: [number, number] = [-0.5906, 44.8083]
) => ({
  features: [
    {
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        label: '1 Rue du Forum 33400 Talence',
        score: 0.92,
        type: 'housenumber',
        city: 'Talence',
        citycode: '33522',
        id: '33522_1234_00001',
        ...over,
      },
    },
  ],
})

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
})

describe('geocodeOnce', () => {
  it('interroge la Géoplateforme et lit le premier résultat', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve(ok(feature())))
    const result = await geocodeOnce(fetchMock, '1 rue du Forum, Talence')
    expect(result).toEqual({
      point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      precision: 'exact',
      label: '1 Rue du Forum 33400 Talence',
      city: 'Talence',
      citycode: '33522',
      banId: '33522_1234_00001',
      score: 0.92,
    })
    const url = fetchMock.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith('https://data.geopf.fr/geocodage/search/?')).toBe(
      true
    )
    expect(url).toContain('q=1+rue+du+Forum%2C+Talence')
    expect(url).toContain('limit=1')
    expect(url).not.toContain('type=municipality')
  })

  it('restreint aux communes et force la précision « commune »', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(
        ok(feature({ type: 'municipality', label: 'Talence' }, [-0.5884, 44.8]))
      )
    )
    const result = await geocodeOnce(fetchMock, 'Talence', 'municipality', {
      endpoint: 'https://geocodeur.invalid/search/',
    })
    expect(result?.precision).toBe('commune')
    const url = fetchMock.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith('https://geocodeur.invalid/search/?')).toBe(true)
    expect(url).toContain('type=municipality')
  })

  it('rend null sur un score trop bas, une liste vide ou une forme inattendue', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(feature({ score: 0.2 })))
      .mockResolvedValueOnce(ok({ features: [] }))
      .mockResolvedValueOnce(ok({ nope: true }))
    expect(await geocodeOnce(fetchMock, 'a')).toBeNull()
    expect(await geocodeOnce(fetchMock, 'b')).toBeNull()
    expect(await geocodeOnce(fetchMock, 'c')).toBeNull()
  })

  it('remonte une erreur HTTP', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
    )
    await expect(geocodeOnce(fetchMock, 'x')).rejects.toThrow('HTTP 503')
  })

  it('précision selon le type de résultat', () => {
    expect(precisionOf('housenumber')).toBe('exact')
    expect(precisionOf('street')).toBe('street')
    expect(precisionOf('locality')).toBe('district')
    expect(precisionOf('municipality')).toBe('commune')
    expect(precisionOf(undefined)).toBe('commune')
  })
})

describe('clé de cache et requête', () => {
  it('normalise la clé', () => {
    expect(geocodeCacheKey('  1 RUE  du Forum ', 'address')).toBe(
      'address:1 rue du forum'
    )
  })

  it('ajoute la commune à l’adresse quand elle n’y figure pas', () => {
    expect(addressQuery('1 rue du Forum', 'Talence')).toBe(
      '1 rue du Forum, Talence'
    )
    expect(addressQuery('1 rue du Forum, 33400 Talence', 'talence')).toBe(
      '1 rue du Forum, 33400 Talence'
    )
    expect(addressQuery('  ', 'Talence')).toBeNull()
    expect(addressQuery(null, 'Talence')).toBeNull()
    expect(addressQuery('1 rue du Forum', null)).toBe('1 rue du Forum')
  })
})
