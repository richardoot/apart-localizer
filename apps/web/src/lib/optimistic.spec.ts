import { describe, expect, it } from 'vitest'
import type { OpenTasks } from '@apart/contracts'
import { fakeEvaluated, fakeTask } from '@/test/fixtures'
import { withTaskDone, withoutOpenTask } from './optimistic'

describe('Lot 24 : réponses immédiates', () => {
  it('la fiche avec la tâche cochée ou rouverte ; une tâche inconnue ne change rien', () => {
    const t1 = fakeTask({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    const t2 = fakeTask({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      done: true,
    })
    const item = fakeEvaluated({}, { tasks: [t1, t2] })
    const now = new Date('2026-11-10T17:00:00.000Z')
    const done = withTaskDone(item, t1.id, true, now)
    expect(done.tasks[0]).toMatchObject({
      done: true,
      doneAt: now.toISOString(),
    })
    expect(done.tasks[1]).toBe(item.tasks[1])
    expect(withTaskDone(item, t2.id, false).tasks[1]).toMatchObject({
      done: false,
      doneAt: null,
    })
    expect(withTaskDone(item, 'inconnue', true)).toBe(item)
  })

  it('« Toutes les tâches » sans la tâche cochée, compteurs suivis, groupe vide retiré', () => {
    const task = (id: string, overdue: boolean) => ({
      ...fakeTask({ id }),
      overdue,
      openDays: overdue ? 20 : 2,
    })
    const open: OpenTasks = {
      open: 3,
      overdue: 2,
      overdueDays: 14,
      groups: [
        {
          listing: {
            id: 'l1',
            title: 'A',
            status: 'to_visit',
            stage: 'a-visiter',
            commune: null,
          },
          overdue: 1,
          tasks: [task('t1', true)],
        },
        {
          listing: {
            id: 'l2',
            title: 'B',
            status: 'to_visit',
            stage: 'a-visiter',
            commune: null,
          },
          overdue: 1,
          tasks: [task('t2', true), task('t3', false)],
        },
      ],
    }
    const without = withoutOpenTask(open, 't1')
    expect(without).toMatchObject({ open: 2, overdue: 1 })
    expect(without.groups.map(g => g.listing.id)).toEqual(['l2'])
    const second = withoutOpenTask(open, 't3')
    expect(second).toMatchObject({ open: 2, overdue: 2 })
    expect(second.groups[1]?.tasks.map(t => t.id)).toEqual(['t2'])
    expect(withoutOpenTask(open, 'inconnue')).toBe(open)
  })
})
