import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { QUERY_STALE_MS, createQueryClient } from './query'

describe('createQueryClient (ADR 0048)', () => {
  const defaults = () => createQueryClient().getDefaultOptions().queries ?? {}

  it("ne relit pas tout au retour sur l'onglet, et garde une lecture une minute", () => {
    expect(defaults().refetchOnWindowFocus).toBe(false)
    expect(defaults().staleTime).toBe(QUERY_STALE_MS)
    expect(QUERY_STALE_MS).toBe(60_000)
  })

  it('ne réessaie pas une réponse 4xx, réessaie une fois le reste', () => {
    const retry = defaults().retry as (n: number, e: unknown) => boolean
    expect(retry(0, new ApiError(404, 'absent'))).toBe(false)
    expect(retry(0, new ApiError(503, 'indisponible'))).toBe(true)
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false)
  })
})
