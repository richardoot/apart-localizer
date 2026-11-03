import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/with-query'

const apiMock = vi.hoisted(() => ({
  study: {
    compliance: vi.fn(),
    comparables: vi.fn(),
    addComparable: vi.fn(),
    updateComparable: vi.fn(),
    removeComparable: vi.fn(),
  },
  scenarios: {
    list: vi.fn(),
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
  studyKeys,
  useCompliance,
  useRentComparableMutations,
  useRentComparables,
  useScenarioMutations,
  useScenarios,
} from './useStudy'

const ID = '11111111-1111-4111-8111-111111111111'

describe('useStudy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.study.compliance.mockResolvedValue({ items: [] })
    apiMock.study.comparables.mockResolvedValue({ items: [], market: null })
    apiMock.study.updateComparable.mockResolvedValue({})
    apiMock.scenarios.list.mockResolvedValue([])
    apiMock.scenarios.update.mockResolvedValue({})
  })

  it('ne charge rien sans annonce, puis conformité, comparables et scénarios', async () => {
    const id = ref<string | null>(null)
    const { unmount } = withQuery(() => ({
      compliance: useCompliance(id),
      comparables: useRentComparables(id),
      scenarios: useScenarios(id),
    }))
    await flushPromises()
    expect(apiMock.study.compliance).not.toHaveBeenCalled()
    id.value = ID
    await flushPromises()
    expect(apiMock.study.compliance).toHaveBeenCalledWith(ID)
    expect(apiMock.study.comparables).toHaveBeenCalledWith(ID)
    expect(apiMock.scenarios.list).toHaveBeenCalledWith(ID)
    expect(studyKeys.compliance(ID)).toEqual(['listings', 'compliance', ID])
    unmount()
  })

  it('les écritures invalident la synthèse des comparables et les scénarios', async () => {
    const { result, client, unmount } = withQuery(() => ({
      comparables: useRentComparableMutations(ID),
      scenarios: useScenarioMutations(),
    }))
    const spy = vi.spyOn(client, 'invalidateQueries')
    await result.comparables.update.mutateAsync({
      id: 'c-1',
      patch: { rent: 710 },
    })
    expect(apiMock.study.updateComparable).toHaveBeenCalledWith(ID, 'c-1', {
      rent: 710,
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: studyKeys.comparables(ID) })
    await result.scenarios.update.mutateAsync({
      id: 's-1',
      update: { name: 'x' },
    })
    expect(apiMock.scenarios.update).toHaveBeenCalledWith('s-1', { name: 'x' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['scenarios'] })
    unmount()
  })
})
