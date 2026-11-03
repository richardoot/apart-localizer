import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { fakeContext } from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'
import { withQuery } from '@/test/with-query'

const apiMock = vi.hoisted(() => ({
  listings: {
    context: vi.fn(),
    searchDpe: vi.fn(),
    verifyDpe: vi.fn(),
    regeocode: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import {
  contextKeys,
  useContextMutations,
  useListingContext,
} from './useListingContext'

const ID = '11111111-1111-4111-8111-111111111111'

describe('useListingContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.listings.searchDpe.mockResolvedValue(fakeContext())
    apiMock.listings.verifyDpe.mockResolvedValue(fakeEvaluated())
    apiMock.listings.regeocode.mockResolvedValue(fakeEvaluated())
  })

  it('ne charge rien sans identifiant, puis le contexte de l’annonce', async () => {
    const id = ref<string | null>(null)
    const { result, unmount } = withQuery(() => useListingContext(id))
    await flushPromises()
    expect(apiMock.listings.context).not.toHaveBeenCalled()
    id.value = ID
    await flushPromises()
    expect(apiMock.listings.context).toHaveBeenCalledWith(ID)
    expect(result.data.value?.transit.nearestTram?.name).toBe('Arrêt fictif')
    expect(contextKeys.detail(ID)).toEqual(['listings', 'context', ID])
    unmount()
  })

  it('DPE et géocodage : appels et rafraîchissement de la fiche, du contexte, de la liste, du prix cible', async () => {
    const { result, client, unmount } = withQuery(() => useContextMutations())
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await result.searchDpe.mutateAsync(ID)
    await result.verifyDpe.mutateAsync({ id: ID, number: 'X1' })
    await result.verifyDpe.mutateAsync({
      id: ID,
      number: 'X2',
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    await result.regeocode.mutateAsync(ID)
    expect(apiMock.listings.searchDpe).toHaveBeenCalledWith(ID)
    expect(apiMock.listings.verifyDpe).toHaveBeenNthCalledWith(1, ID, {
      number: 'X1',
    })
    expect(apiMock.listings.verifyDpe).toHaveBeenNthCalledWith(2, ID, {
      number: 'X2',
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(apiMock.listings.regeocode).toHaveBeenCalledWith(ID)
    // Quatre écritures, quatre clés rafraîchies à chaque fois.
    expect(invalidate).toHaveBeenCalledTimes(16)
    expect(
      invalidate.mock.calls.map(
        ([f]) => (f as { queryKey?: readonly unknown[] })?.queryKey
      )
    ).toContainEqual(contextKeys.detail(ID))
    unmount()
  })
})
