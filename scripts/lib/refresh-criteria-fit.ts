import { CRITERIA_FIT_LEVEL_LABELS } from '@apart/contracts'
import type { CriteriaFitLevel } from '@apart/contracts'
import { fitReasonsText } from '@apart/domain'
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import { ActivityService } from '../../apps/api/src/activity/activity.service.js'
import type { GeoService } from '../../apps/api/src/geo/geo.service.js'
import { CriteriaMatchService } from '../../apps/api/src/listings/criteria-match.service.js'
import type { ListingFitPlan } from '../../apps/api/src/listings/criteria-match.service.js'
import { NotificationQueueService } from '../../apps/api/src/notifications/notification-queue.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'

/**
 * Rattrapage du lot 14 (ADR 0024) : recalcule l'adéquation de toutes les
 * annonces aux critères actifs de leur espace, avec le service de l'API
 * (mêmes mesures PostGIS, même décision de `domain`, même écriture). À
 * lancer après la migration du lot 14, puis après un import qui change les
 * mesures (arrêts de tram, contours des quartiers) ou un replacement des
 * annonces (`relocate:listings`). Une ligne de journal par changement de
 * niveau (canal `system`, cause « rattrapage », jamais d'alerte).
 * Idempotent : un second passage ne change rien.
 */

export interface RefreshCriteriaFitStats {
  workspaces: number
  /** Espaces sans critère actif : toutes leurs annonces sont « dans les critères ». */
  withoutCriteria: number
  listings: number
  /** Annonces jamais comparées qui reçoivent leur premier niveau. */
  initialized: number
  entered: number
  left: number
  changed: number
}

const label = (level: CriteriaFitLevel | null): string =>
  level === null ? 'jamais comparée' : CRITERIA_FIT_LEVEL_LABELS[level]

/** « T3 fictif : hors critères → à confirmer (« Caudéran » : …) ». */
export function describePlan(plan: ListingFitPlan): string {
  const moved = plan.changes.filter(c => c.transition !== null)
  const detail = moved
    .map(
      c =>
        `« ${c.name} » ${label(c.before).toLowerCase()} → ${label(c.after).toLowerCase()}${c.reasons.length ? ` : ${fitReasonsText(c.reasons)}` : ''}`
    )
    .join(' ; ')
  return `- ${plan.title} : ${label(plan.before)} → ${label(plan.after)}${detail ? ` (${detail})` : ''}`
}

export async function refreshCriteriaFit(
  deps: { prisma: PrismaClient; geo: GeoService },
  options: {
    dryRun: boolean
    workspace?: string | undefined
    at?: Date
    log?: (line: string) => void
  }
): Promise<{ stats: RefreshCriteriaFitStats; plans: ListingFitPlan[] }> {
  const log = options.log ?? (() => undefined)
  const prisma = deps.prisma as unknown as PrismaService
  const service = new CriteriaMatchService(
    prisma,
    deps.geo,
    new ActivityService(prisma, new NotificationQueueService())
  )
  const workspaces = await deps.prisma.workspace.findMany({
    where: options.workspace ? { name: options.workspace } : {},
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      _count: { select: { searchCriteria: { where: { active: true } } } },
    },
  })
  const stats: RefreshCriteriaFitStats = {
    workspaces: workspaces.length,
    withoutCriteria: 0,
    listings: 0,
    initialized: 0,
    entered: 0,
    left: 0,
    changed: 0,
  }
  const plans: ListingFitPlan[] = []
  for (const workspace of workspaces) {
    const criteria = workspace._count.searchCriteria
    if (criteria === 0) stats.withoutCriteria++
    const result = await service.refresh(workspace.id, {
      origin: { cause: 'refresh' },
      actorMemberId: null,
      channel: 'system',
      dryRun: options.dryRun,
      ...(options.at ? { at: options.at } : {}),
    })
    stats.listings += result.summary.listings
    stats.entered += result.summary.entered
    stats.left += result.summary.left
    stats.changed += result.summary.changed
    const shown: ListingFitPlan[] = []
    for (const plan of result.plans) {
      plans.push(plan)
      const moved = plan.changes.some(c => c.transition !== null)
      if (plan.before === null && !moved) {
        stats.initialized++
        continue
      }
      if (plan.before === null) stats.initialized++
      shown.push(plan)
    }
    log(
      `Espace « ${workspace.name} » : ${criteria} critère(s) actif(s), ${result.summary.listings} annonce(s)${criteria === 0 ? ' (aucun critère actif : toutes « dans les critères »)' : ''}`
    )
    for (const plan of shown) {
      log(`${describePlan(plan)}${options.dryRun ? ' [simulation]' : ''}`)
    }
  }
  return { stats, plans }
}
