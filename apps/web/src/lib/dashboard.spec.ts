import { describe, expect, it } from 'vitest'
import { summarizeListings } from '@apart/domain'
import { fakeEvaluated, fakeTask } from '@/test/fixtures'
import { toSummaryListing } from './dashboard'

describe('synthèse', () => {
  it('traduit une annonce vue et la compte par statut, verdict et tâches', () => {
    const items = [
      fakeEvaluated(
        { id: '11111111-1111-4111-8111-111111111111' },
        { isNewForMe: true }
      ),
      fakeEvaluated(
        { id: '33333333-3333-4333-8333-333333333333', status: 'discarded' },
        { tasks: [fakeTask({ done: false })] }
      ),
    ]
    const summary = summarizeListings(items.map(toSummaryListing), {
      now: new Date('2026-12-01T00:00:00.000Z'),
    })
    expect(summary.activeCount).toBe(1)
    expect(summary.newForMeCount).toBe(1)
    expect(summary.byStatus.discarded).toBe(1)
    expect(summary.byVerdict.off_target).toBe(1)
    expect(summary.openTasks).toBe(1)
    expect(summary.overdueTasks).toBe(1)
    expect(summary.averagePricePerM2).toBeCloseTo(200_000 / 45, 6)
  })
})
