import { describe, expect, it } from 'vitest'
import { summarizeListings } from '../src/summary.js'
import type { SummaryListing } from '../src/summary.js'

const now = new Date('2026-11-03T12:00:00.000Z')
const daysAgo = (days: number): string =>
  new Date(now.getTime() - days * 86_400_000).toISOString()

function listing(over: Partial<SummaryListing> = {}): SummaryListing {
  return {
    id: 'a',
    title: 'A',
    status: 'to_study',
    verdict: 'off_target',
    rentalVerdict: 'conditional',
    grossYield: 0.04,
    effort: -300,
    pricePerM2: 4000,
    score: 40,
    isNewForMe: false,
    createdAt: daysAgo(1),
    tasks: [],
    ...over,
  }
}

describe('summarizeListings', () => {
  it('rend des compteurs à zéro sans annonce', () => {
    const summary = summarizeListings([], { now })
    expect(summary.activeCount).toBe(0)
    expect(summary.averagePricePerM2).toBeNull()
    expect(summary.bestGrossYield).toBeNull()
    expect(summary.best).toEqual([])
    expect(summary.byStatus.to_study).toBe(0)
    expect(summary.openTasks).toBe(0)
  })

  it('compte par statut et par verdict, les écartées hors des actives', () => {
    const summary = summarizeListings(
      [
        listing({ id: 'a', verdict: 'target', score: 2050 }),
        listing({
          id: 'b',
          status: 'to_visit',
          verdict: 'to_dig',
          score: 1040,
        }),
        listing({
          id: 'c',
          status: 'discarded',
          verdict: 'target',
          score: 2060,
        }),
        listing({ id: 'd', status: 'visited', isNewForMe: true }),
      ],
      { now }
    )
    expect(summary.activeCount).toBe(3)
    expect(summary.byStatus).toMatchObject({
      to_study: 1,
      to_visit: 1,
      visited: 1,
      discarded: 1,
    })
    // Le verdict n'est compté que pour les actives : l'écartée « cible » n'y est pas.
    expect(summary.byVerdict).toEqual({ target: 1, to_dig: 1, off_target: 1 })
    expect(summary.newForMeCount).toBe(1)
    expect(summary.toVisitCount).toBe(1)
    expect(summary.best.map(l => l.id)).toEqual(['a', 'b', 'd'])
  })

  it('moyenne du prix au m² et meilleur brut sur les actives, en ignorant NaN', () => {
    const summary = summarizeListings(
      [
        listing({ id: 'a', pricePerM2: 4000, grossYield: 0.05 }),
        listing({ id: 'b', title: 'B', pricePerM2: 5000, grossYield: 0.07 }),
        listing({ id: 'c', pricePerM2: Number.NaN, grossYield: Number.NaN }),
        listing({
          id: 'd',
          status: 'sold_or_withdrawn',
          pricePerM2: 100,
          grossYield: 0.5,
        }),
      ],
      { now, bestCount: 2 }
    )
    expect(summary.averagePricePerM2).toBe(4500)
    expect(summary.bestGrossYield).toEqual({
      id: 'b',
      title: 'B',
      grossYield: 0.07,
    })
    expect(summary.best).toHaveLength(2)
  })

  it('compte les tâches ouvertes et celles en retard (14 jours par défaut)', () => {
    const summary = summarizeListings(
      [
        listing({
          tasks: [
            { done: false, createdAt: daysAgo(1) },
            { done: false, createdAt: daysAgo(20) },
            { done: true, createdAt: daysAgo(40) },
          ],
        }),
        listing({
          id: 'x',
          status: 'discarded',
          tasks: [{ done: false, createdAt: daysAgo(90) }],
        }),
      ],
      { now }
    )
    expect(summary.openTasks).toBe(2)
    expect(summary.overdueTasks).toBe(1)
    expect(
      summarizeListings(
        [listing({ tasks: [{ done: false, createdAt: daysAgo(5) }] })],
        { now, overdueDays: 3 }
      ).overdueTasks
    ).toBe(1)
  })
})
