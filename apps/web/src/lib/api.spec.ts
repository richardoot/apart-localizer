import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { ApiError, apiFetch } from './api'

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
