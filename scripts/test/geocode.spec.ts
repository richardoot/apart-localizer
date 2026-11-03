import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Geocoder, precisionOf } from '../lib/geocode.js'

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

describe('Geocoder', () => {
  let dir: string
  let cacheFile: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'geocode-'))
    cacheFile = path.join(dir, 'cache.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('appelle la Géoplateforme une fois, met en cache, relit le cache', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => feature(),
    }))
    const geocoder = new Geocoder({ cacheFile, online: true, fetch: fetchMock })
    const first = await geocoder.geocode('1 rue du Forum, Talence')
    expect(first).toEqual({
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

    const again = await geocoder.geocode('1 RUE du forum, talence ')
    expect(again).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(geocoder.calls).toBe(1)

    const reloaded = new Geocoder({ cacheFile, online: false })
    expect(await reloaded.geocode('1 rue du Forum, Talence')).toEqual(first)
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toHaveProperty(
      'address:1 rue du forum, talence'
    )
  })

  it('en simulation, le cache sur disque n’est pas réécrit', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => feature(),
    }))
    const geocoder = new Geocoder({
      cacheFile,
      online: true,
      persist: false,
      fetch: fetchMock,
    })
    expect(await geocoder.geocode('1 rue du Forum, Talence')).not.toBeNull()
    expect(existsSync(cacheFile)).toBe(false)
  })

  it('en mode cache seul, ne touche jamais le réseau', async () => {
    const fetchMock = vi.fn()
    const geocoder = new Geocoder({
      cacheFile,
      online: false,
      fetch: fetchMock,
    })
    expect(await geocoder.geocode('Bordeaux', 'municipality')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restreint aux communes et force la précision « commune »', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        feature({ type: 'municipality', label: 'Talence' }, [-0.5884, 44.8047]),
    }))
    const geocoder = new Geocoder({ cacheFile, online: true, fetch: fetchMock })
    const result = await geocoder.geocode('Talence', 'municipality')
    expect(result?.precision).toBe('commune')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('type=municipality')
  })

  it('un score trop bas, une réponse vide ou inattendue donnent null (mis en cache)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => feature({ score: 0.2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nope: true }),
      })
    const geocoder = new Geocoder({ cacheFile, online: true, fetch: fetchMock })
    expect(await geocoder.geocode('a')).toBeNull()
    expect(await geocoder.geocode('b')).toBeNull()
    expect(await geocoder.geocode('c')).toBeNull()
    expect(await geocoder.geocode('a')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('remonte une erreur HTTP sans la mettre en cache', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))
    const geocoder = new Geocoder({ cacheFile, online: true, fetch: fetchMock })
    await expect(geocoder.geocode('x')).rejects.toThrow('HTTP 503')
    await expect(geocoder.geocode('x')).rejects.toThrow('HTTP 503')
  })

  it('précision selon le type de résultat', () => {
    expect(precisionOf('housenumber')).toBe('exact')
    expect(precisionOf('street')).toBe('street')
    expect(precisionOf('locality')).toBe('district')
    expect(precisionOf('municipality')).toBe('commune')
    expect(precisionOf(undefined)).toBe('commune')
  })
})
