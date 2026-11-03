import type { ListingStatus, RentalVerdict, Verdict } from '@apart/contracts'

/**
 * Ce que la synthèse a besoin de connaître d'une annonce : son statut, son
 * verdict, ses indicateurs, et l'état de ses tâches. Indépendant de la forme
 * exacte de l'API pour rester testable à vide.
 */
export interface SummaryListing {
  id: string
  title: string
  status: ListingStatus
  verdict: Verdict
  rentalVerdict: RentalVerdict
  grossYield: number
  effort: number
  pricePerM2: number
  score: number
  isNewForMe: boolean
  createdAt: string
  tasks: ReadonlyArray<{ done: boolean; createdAt: string }>
}

export interface ListingSummary {
  /** Annonces aux statuts actifs (ni écartées, ni vendues, ni refusées). */
  activeCount: number
  byStatus: Record<ListingStatus, number>
  byVerdict: Record<Verdict, number>
  /** Annonces que le membre connecté n'a pas encore ouvertes. */
  newForMeCount: number
  /** Annonces à visiter. */
  toVisitCount: number
  /** Prix moyen au m² des annonces actives dont la surface est connue, euros ; null si aucune. */
  averagePricePerM2: number | null
  /** Meilleur rendement brut parmi les annonces actives ; null si aucune. */
  bestGrossYield: { id: string; title: string; grossYield: number } | null
  /** Les meilleures annonces actives par score, dans l'ordre. */
  best: SummaryListing[]
  /** Tâches ouvertes sur les annonces actives, et celles ouvertes depuis trop longtemps. */
  openTasks: number
  overdueTasks: number
}

export const ACTIVE_STATUSES: readonly ListingStatus[] = [
  'to_study',
  'to_visit',
  'visited',
  'offer_made',
  'offer_accepted',
]

/** Au-delà de ce délai, une tâche ouverte compte comme « en retard ». */
export const TASK_OVERDUE_DAYS = 14

const emptyStatus = (): Record<ListingStatus, number> => ({
  to_study: 0,
  to_visit: 0,
  visited: 0,
  offer_made: 0,
  offer_accepted: 0,
  offer_refused: 0,
  discarded: 0,
  sold_or_withdrawn: 0,
})

const emptyVerdict = (): Record<Verdict, number> => ({
  target: 0,
  to_dig: 0,
  off_target: 0,
})

export interface SummaryOptions {
  /** Nombre d'annonces dans `best` (3 par défaut). */
  bestCount?: number
  /** « Maintenant », pour le calcul des retards (injecté pour les tests). */
  now?: Date
  overdueDays?: number
}

/**
 * Les compteurs de la synthèse de l'artefact (nouvelles, suivies, dans la
 * cible, meilleur rendement, prix moyen au m², à visiter), plus les tâches
 * ouvertes et en retard. Pur : mêmes entrées, mêmes sorties.
 */
export function summarizeListings(
  listings: readonly SummaryListing[],
  options: SummaryOptions = {}
): ListingSummary {
  const bestCount = options.bestCount ?? 3
  const now = options.now ?? new Date()
  const overdueMs = (options.overdueDays ?? TASK_OVERDUE_DAYS) * 86_400_000

  const byStatus = emptyStatus()
  const byVerdict = emptyVerdict()
  let newForMeCount = 0
  let openTasks = 0
  let overdueTasks = 0
  let pricePerM2Sum = 0
  let pricePerM2Count = 0
  let bestGrossYield: ListingSummary['bestGrossYield'] = null
  const active: SummaryListing[] = []

  for (const listing of listings) {
    byStatus[listing.status] += 1
    if (listing.isNewForMe) newForMeCount += 1
    if (!ACTIVE_STATUSES.includes(listing.status)) continue
    active.push(listing)
    byVerdict[listing.verdict] += 1
    if (Number.isFinite(listing.pricePerM2)) {
      pricePerM2Sum += listing.pricePerM2
      pricePerM2Count += 1
    }
    if (
      Number.isFinite(listing.grossYield) &&
      (bestGrossYield === null ||
        listing.grossYield > bestGrossYield.grossYield)
    ) {
      bestGrossYield = {
        id: listing.id,
        title: listing.title,
        grossYield: listing.grossYield,
      }
    }
    for (const task of listing.tasks) {
      if (task.done) continue
      openTasks += 1
      const age = now.getTime() - Date.parse(task.createdAt)
      if (Number.isFinite(age) && age > overdueMs) overdueTasks += 1
    }
  }

  const best = [...active]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr'))
    .slice(0, bestCount)

  return {
    activeCount: active.length,
    byStatus,
    byVerdict,
    newForMeCount,
    toVisitCount: byStatus.to_visit,
    averagePricePerM2:
      pricePerM2Count > 0 ? pricePerM2Sum / pricePerM2Count : null,
    bestGrossYield,
    best,
    openTasks,
    overdueTasks,
  }
}
