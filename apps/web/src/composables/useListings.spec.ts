import { describe, expect, it, vi } from 'vitest'
import type { EvaluatedListing, OpenTasks } from '@apart/contracts'
import { fakeEvaluated, fakeTask } from '@/test/fixtures'
import { withQuery } from '@/test/with-query'

const apiMock = vi.hoisted(() => ({
  tasks: { update: vi.fn() },
  listings: { update: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { listingKeys, openTasksKey, useListingMutations } from './useListings'

const TASK = 'aaaaaaaa-0000-4000-8000-000000000001'

function seed() {
  const { result, client } = withQuery(() => useListingMutations())
  const item = fakeEvaluated(
    {},
    { tasks: [fakeTask({ id: TASK, label: 'Vérifier la cave' })] }
  )
  const open: OpenTasks = {
    open: 1,
    overdue: 0,
    overdueDays: 14,
    groups: [
      {
        listing: {
          id: item.listing.id,
          title: 'A',
          status: 'to_visit',
          stage: 'a-visiter',
          commune: null,
        },
        overdue: 0,
        tasks: [{ ...item.tasks[0]!, overdue: false, openDays: 1 }],
      },
    ],
  }
  client.setQueryData(listingKeys.detail(item.listing.id), item)
  client.setQueryData(openTasksKey, open)
  return { result, client, item, open }
}

describe('Lot 24 : une tâche cochée s’affiche tout de suite', () => {
  it('avant la réponse : la fiche cochée, retirée de « Toutes les tâches »', async () => {
    const { result, client, item } = seed()
    let answer: (v: unknown) => void = () => undefined
    apiMock.tasks.update.mockReturnValue(
      new Promise(resolve => (answer = resolve))
    )
    const pending = result.updateTask.mutateAsync({
      id: item.listing.id,
      taskId: TASK,
      update: { done: true },
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(
      client.getQueryData<EvaluatedListing>(listingKeys.detail(item.listing.id))
        ?.tasks[0]?.done
    ).toBe(true)
    expect(client.getQueryData<OpenTasks>(openTasksKey)?.groups).toEqual([])
    answer({})
    await pending
  })

  it('un refus du serveur remet l’état d’avant', async () => {
    const { result, client, item, open } = seed()
    apiMock.tasks.update.mockRejectedValue(new Error('refus'))
    await expect(
      result.updateTask.mutateAsync({
        id: item.listing.id,
        taskId: TASK,
        update: { done: true },
      })
    ).rejects.toThrow('refus')
    expect(
      client.getQueryData<EvaluatedListing>(listingKeys.detail(item.listing.id))
        ?.tasks[0]?.done
    ).toBe(false)
    expect(client.getQueryData<OpenTasks>(openTasksKey)).toEqual(open)
  })

  it('un renommage ne touche pas au cache d’avance', async () => {
    const { result, client, item } = seed()
    apiMock.tasks.update.mockResolvedValue({})
    await result.updateTask.mutateAsync({
      id: item.listing.id,
      taskId: TASK,
      update: { label: 'x' },
    })
    expect(
      client.getQueryData<EvaluatedListing>(listingKeys.detail(item.listing.id))
        ?.tasks[0]?.label
    ).toBe('Vérifier la cave')
  })
})

describe('une fiche enregistrée : tout ce que le serveur recalcule est relu', () => {
  it('repère, données ouvertes, adéquation, journal, ressemblances : marqués à relire ; la fiche reçue reste', async () => {
    const { result, client, item } = seed()
    const id = item.listing.id
    const reads = [
      ['listings', 'list', {}],
      ['listings', 'context', id],
      ['listings', 'compliance', id],
      ['listings', 'rent-comparables', id],
      ['listings', 'target-price', id],
      ['listings', 'sensitivity', id, { rows: 'price' }],
      ['listings', 'fit-history', id],
      ['listings', 'activity', id, 'history', 1],
      ['listings', 'similar', { listingId: id }],
      ['listings', 'compare', [id, 'autre']],
      ['listings', 'areas'],
      ['decisions', 'overview'],
    ] as const
    for (const key of reads) client.setQueryData(key, { stale: false })
    const saved = { ...item, listing: { ...item.listing, title: 'Relue' } }
    apiMock.listings.update.mockResolvedValue(saved)
    await result.update.mutateAsync({ id, patch: { title: 'Relue' } })
    for (const key of reads) {
      expect(client.getQueryState(key)?.isInvalidated, key.join('/')).toBe(true)
    }
    const detail = client.getQueryState(listingKeys.detail(id))
    expect(detail?.isInvalidated).toBe(false)
    expect(
      client.getQueryData<EvaluatedListing>(listingKeys.detail(id))?.listing
        .title
    ).toBe('Relue')
  })
})
