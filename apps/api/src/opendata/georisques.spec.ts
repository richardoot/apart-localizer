import { describe, expect, it, vi } from 'vitest'
import type { Point } from '@apart/contracts'
import {
  GEORISQUES_REPORT_ENDPOINT,
  fetchGeorisquesReport,
  georisquesParams,
  georisquesReportOf,
} from './georisques'
import { GEORISQUES_CACHE_KIND, GeorisquesService } from './georisques.service'
import type { FetchLike } from './geoplateforme'
import type { ReferenceCacheService } from './reference-cache.service'
import { FAKE_GEORISQUES_REPORT } from '../../test/fixtures/georisques'

const point: Point = { type: 'Point', coordinates: [-0.5906, 44.8083] }

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

function memoryCache(initial?: { payload: unknown; fetchedAt: Date }) {
  const store = new Map<string, { payload: unknown; fetchedAt: Date }>()
  if (initial) store.set(`${GEORISQUES_CACHE_KIND}|-0.59060,44.80830`, initial)
  const cache = {
    get: vi.fn((kind: string, key: string) =>
      Promise.resolve(store.get(`${kind}|${key}`) ?? null)
    ),
    set: vi.fn((kind: string, key: string, payload: unknown) => {
      store.set(`${kind}|${key}`, { payload, fetchedAt: new Date() })
      return Promise.resolve()
    }),
  }
  return { cache: cache as unknown as ReferenceCacheService, raw: cache, store }
}

describe('client Géorisques', () => {
  it('interroge le rapport au point en longitude,latitude', async () => {
    expect(georisquesParams(point).get('latlon')).toBe('-0.590600,44.808300')
    const fetchImpl = vi.fn<FetchLike>(() => ok(FAKE_GEORISQUES_REPORT))
    const raw = await fetchGeorisquesReport(fetchImpl, point)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `${GEORISQUES_REPORT_ENDPOINT}?latlon=-0.590600%2C44.808300`
    )
    expect(raw.commune?.codeInsee).toBe('33522')
  })

  it('lance sur un échec HTTP ou une réponse illisible', async () => {
    await expect(
      fetchGeorisquesReport(
        () =>
          Promise.resolve({
            ok: false,
            status: 429,
            json: () => Promise.resolve({}),
          }),
        point,
        { endpoint: 'https://example.invalid/r' }
      )
    ).rejects.toThrow('HTTP 429')
    await expect(
      fetchGeorisquesReport(() => ok({ risques: [] }), point)
    ).rejects.toThrow('inexploitable')
  })

  it('rapport vers le contrat : aléas naturels et technologiques, niveau par le domaine', () => {
    const report = georisquesReportOf(
      FAKE_GEORISQUES_REPORT,
      point,
      new Date('2026-11-03T15:00:00Z')
    )
    expect(report).toMatchObject({
      status: 'ok',
      address: '1 Allée Fictive, 33400 Talence',
      commune: 'Talence',
      inseeCode: '33522',
      fetchedAt: '2026-11-03T15:00:00.000Z',
    })
    expect(report.reportUrl).toMatch(/^https:\/\/www\.georisques\.gouv\.fr/)
    const level = (key: string) =>
      report.hazards.find(h => h.key === key)?.level
    expect(level('inondation')).toBe('ok')
    expect(level('retraitGonflementArgile')).toBe('warn')
    expect(level('feuForet')).toBe('unknown')
    expect(level('seisme')).toBe('ok')
    expect(report.hazards.find(h => h.key === 'pollutionSols')?.family).toBe(
      'technological'
    )
    const bare = georisquesReportOf(
      {
        ...FAKE_GEORISQUES_REPORT,
        url: 'javascript:alert(1)',
        adresse: null,
        commune: null,
      },
      point,
      new Date()
    )
    expect(bare.reportUrl).toBeNull()
    expect(bare.address).toBeNull()
    expect(bare.inseeCode).toBeNull()
  })
})

describe('GeorisquesService', () => {
  it('sans point : sans objet, aucun appel', async () => {
    const { cache } = memoryCache()
    const service = new GeorisquesService(cache)
    service.fetchImpl = vi.fn<FetchLike>()
    const report = await service.report(null)
    expect(report.status).toBe('not_applicable')
    expect(service.fetchImpl).not.toHaveBeenCalled()
  })

  it('appelle une fois puis lit le cache ; un cache illisible est rafraîchi', async () => {
    const { cache, raw } = memoryCache()
    const service = new GeorisquesService(cache)
    const fetchImpl = vi.fn<FetchLike>(() => ok(FAKE_GEORISQUES_REPORT))
    service.fetchImpl = fetchImpl
    const first = await service.report(point)
    const second = await service.report(point)
    expect(first.status).toBe('ok')
    expect(second.hazards).toEqual(first.hazards)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(raw.set).toHaveBeenCalledTimes(1)
    const stale = memoryCache({
      payload: { broken: true },
      fetchedAt: new Date(),
    })
    const again = new GeorisquesService(stale.cache)
    again.fetchImpl = fetchImpl
    expect((await again.report(point)).status).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('panne : indisponible, rien en cache, jamais de risque inventé', async () => {
    const { cache, raw } = memoryCache()
    const service = new GeorisquesService(cache)
    service.fetchImpl = () => Promise.reject(new Error('timeout'))
    const report = await service.report(point)
    expect(report.status).toBe('unavailable')
    expect(report.hazards).toEqual([])
    expect(report.message).toMatch(/Géorisques indisponible \(timeout\)/)
    expect(raw.set).not.toHaveBeenCalled()
    service.fetchImpl = () => Promise.reject('texte')
    expect((await service.report(point)).message).toMatch(/texte/)
  })
})
