import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { ApiError, api, apiFetch } from './api'

const fetchMock = vi.fn()

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'token-1' } },
    })
  })

  it('sends the bearer token and JSON body, parses the answer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: 1 }),
    })
    const result = await apiFetch<{ ok: number }>('/listings', {
      method: 'POST',
      json: { a: 1 },
    })
    expect(result).toEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/listings$/)
    expect((init.headers as Headers).get('Authorization')).toBe(
      'Bearer token-1'
    )
    expect((init.headers as Headers).get('Content-Type')).toBe(
      'application/json'
    )
    expect(init.body).toBe('{"a":1}')
  })

  it("surfaces the server's message and request id on failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          message: 'Internal server error',
          requestId: 'cdg1::x',
        }),
    })
    const error = await apiFetch('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(500)
    expect((error as ApiError).requestId).toBe('cdg1::x')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: ['price', 'title'] }),
    })
    await expect(apiFetch('/x')).rejects.toThrow('price, title')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error()),
    })
    await expect(apiFetch('/x')).rejects.toThrow('Erreur 502')
  })
})

describe('api (lot 4)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
  })

  it('critères, couches et contexte : chemins et méthodes', async () => {
    await api.searchCriteria.list(true)
    await api.searchCriteria.preview({ perimeter: null })
    await api.opendata.dvf([-0.7, 44.75, -0.5, 44.9])
    await api.opendata.transitStops('tram')
    await api.listings.verifyDpe('id-1', { number: 'X' })
    const calls = fetchMock.mock.calls.map(
      ([url, init]) =>
        `${(init as RequestInit).method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`
    )
    expect(calls).toEqual([
      'GET /search-criteria?includeArchived=true',
      'POST /search-criteria/preview',
      'GET /opendata/layers/dvf?bbox=-0.70000,44.75000,-0.50000,44.90000',
      'GET /opendata/layers/transit-stops?mode=tram',
      'POST /listings/id-1/dpe/verify',
    ])
  })
})

describe('api (lot 5)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
  })

  it('phase 1, projection, scénarios, comparables, conformité : chemins et méthodes', async () => {
    await api.study.occupancy('id-1')
    await api.study.projection('id-1', {
      horizonYears: 20,
      regime: 'reel_foncier',
    })
    await api.study.projection('id-1')
    await api.study.evaluateScenario('id-1', { overrides: { price: 1 } })
    await api.study.compliance('id-1')
    await api.study.comparables('id-1')
    await api.study.addComparable('id-1', { rent: 700, surface: 40 })
    await api.study.updateComparable('id-1', 'c-1', { rent: 710 })
    await api.study.removeComparable('id-1', 'c-1')
    await api.scenarios.list('id-1')
    await api.scenarios.list()
    await api.scenarios.create({ name: 'x', overrides: {} })
    await api.scenarios.update('s-1', { name: 'y' })
    await api.scenarios.remove('s-1')
    const calls = fetchMock.mock.calls.map(
      ([url, init]) =>
        `${(init as RequestInit).method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`
    )
    expect(calls).toEqual([
      'GET /listings/id-1/occupancy',
      'GET /listings/id-1/projection?horizonYears=20&regime=reel_foncier',
      'GET /listings/id-1/projection',
      'POST /listings/id-1/scenarios/evaluate',
      'GET /listings/id-1/compliance',
      'GET /listings/id-1/rent-comparables',
      'POST /listings/id-1/rent-comparables',
      'PATCH /listings/id-1/rent-comparables/c-1',
      'DELETE /listings/id-1/rent-comparables/c-1',
      'GET /scenarios?listingId=id-1',
      'GET /scenarios',
      'POST /scenarios',
      'PATCH /scenarios/s-1',
      'DELETE /scenarios/s-1',
    ])
  })
})
