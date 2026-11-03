import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import type { SearchCriteriaPreviewRequestInput } from '@apart/contracts'
import { SQUARE, fakeCriteria } from '@/test/criteria-fixtures'
import { withQuery } from '@/test/with-query'

const apiMock = vi.hoisted(() => ({
  searchCriteria: {
    list: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import {
  criteriaKeys,
  useCriteriaMutations,
  useCriteriaPreview,
  useSearchCriteriaList,
} from './useSearchCriteria'

describe('useSearchCriteria', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.searchCriteria.list.mockResolvedValue([fakeCriteria()])
    apiMock.searchCriteria.preview.mockResolvedValue({
      perimeter: { type: 'polygon', polygon: SQUARE },
      listingCount: 2,
      approximateCount: 0,
      listingIds: [],
    })
    apiMock.searchCriteria.create.mockResolvedValue(fakeCriteria())
    apiMock.searchCriteria.update.mockResolvedValue(fakeCriteria())
    apiMock.searchCriteria.remove.mockResolvedValue(undefined)
  })

  it('la liste suit le choix « archivés »', async () => {
    const archived = ref(false)
    const { result, unmount } = withQuery(() => useSearchCriteriaList(archived))
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenLastCalledWith(false)
    expect(result.data.value?.[0]?.name).toBe('Talence fictif')
    archived.value = true
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenLastCalledWith(true)
    expect(criteriaKeys.list(true)).toEqual(['search-criteria', 'list', true])
    unmount()
  })

  it('l’aperçu attend une demande, puis interroge le serveur à chaque changement', async () => {
    const request = ref<SearchCriteriaPreviewRequestInput | null>(null)
    const { result, unmount } = withQuery(() => useCriteriaPreview(request))
    await flushPromises()
    expect(apiMock.searchCriteria.preview).not.toHaveBeenCalled()
    request.value = { perimeter: { type: 'polygon', polygon: SQUARE } }
    await flushPromises()
    expect(apiMock.searchCriteria.preview).toHaveBeenCalledWith({
      perimeter: { type: 'polygon', polygon: SQUARE },
    })
    expect(result.data.value?.listingCount).toBe(2)
    request.value = { perimeter: null, filters: { priceMax: 1 } }
    await nextTick()
    await flushPromises()
    expect(apiMock.searchCriteria.preview).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('chaque écriture rafraîchit les critères et les annonces (badges)', async () => {
    const { result, client, unmount } = withQuery(() => useCriteriaMutations())
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await result.create.mutateAsync({ name: 'Nouveau' })
    await result.update.mutateAsync({
      id: 'c1',
      patch: { active: false, expectedUpdatedAt: '2026-11-03T10:00:00.000Z' },
    })
    await result.remove.mutateAsync('c1')
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith({
      name: 'Nouveau',
    })
    expect(apiMock.searchCriteria.update).toHaveBeenCalledWith('c1', {
      active: false,
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(apiMock.searchCriteria.remove).toHaveBeenCalledWith('c1')
    const keys = invalidate.mock.calls.map(
      ([filters]) => (filters as { queryKey?: readonly unknown[] })?.queryKey
    )
    expect(keys.filter(k => k?.[0] === 'search-criteria')).toHaveLength(3)
    expect(keys.filter(k => k?.[0] === 'listings')).toHaveLength(3)
    unmount()
  })
})
