import { estimatedTargetRent, targetRentAction } from '@apart/domain'
import type {
  FieldProvenanceMap,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import type {
  Member,
  PrismaClient,
} from '../../apps/api/src/generated/prisma/index.js'
import { ActivityService } from '../../apps/api/src/activity/activity.service.js'
import { AssumptionsService } from '../../apps/api/src/assumptions/assumptions.service.js'
import type { GeoService } from '../../apps/api/src/geo/geo.service.js'
import { ListingEnrichmentService } from '../../apps/api/src/listings/enrichment.service.js'
import { NotificationQueueService } from '../../apps/api/src/notifications/notification-queue.service.js'
import { DpeService } from '../../apps/api/src/opendata/dpe.service.js'
import { GeocodingService } from '../../apps/api/src/opendata/geocoding.service.js'
import { MarketService } from '../../apps/api/src/opendata/market.service.js'
import { ReferenceCacheService } from '../../apps/api/src/opendata/reference-cache.service.js'
import { RentControlService } from '../../apps/api/src/opendata/rent-control.service.js'
import { RentObservatoryService } from '../../apps/api/src/opendata/rent-observatory.service.js'
import { SurroundingsService } from '../../apps/api/src/opendata/surroundings.service.js'
import { TransitService } from '../../apps/api/src/opendata/transit.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'

/**
 * Rattrapage de l'ADR 0046 : le loyer visé estimé d'après l'observatoire des
 * loyers, pour les annonces qui n'en ont pas (ou dont l'estimation a changé).
 * La simulation calcule l'estimation par le même service que l'API ;
 * l'écriture relance le recalcul de l'API (`ListingEnrichmentService`, sans
 * recherche du DPE ni réseau), qui pose l'estimation, le plafond quand la
 * phase 2 est créée, et une ligne de journal `listing.enriched` (canal
 * `system`). Un loyer visé donné par un membre, par Claude ou lu dans
 * l'annonce n'est jamais touché ; les fiches absorbées par une fusion sont
 * laissées. Idempotent : une seconde passe ne change rien.
 */

export interface RefreshTargetRentStats {
  listings: number
  /** Loyer visé donné (membre, Claude, annonce) : laissé. */
  given: number
  /** Estimation posée ou mise à jour. */
  estimated: number
  /** Estimation retirée (plus de zone sûre). */
  cleared: number
  /** Ni loyer visé ni estimation possible. */
  withoutEstimate: number
  unchanged: number
}

export async function refreshTargetRent(
  deps: { prisma: PrismaClient; geo: GeoService },
  options: {
    dryRun: boolean
    workspace?: string | undefined
    log?: (line: string) => void
  }
): Promise<RefreshTargetRentStats> {
  const log = options.log ?? (() => undefined)
  const prisma = deps.prisma as unknown as PrismaService
  const cache = new ReferenceCacheService(prisma)
  const activity = new ActivityService(prisma, new NotificationQueueService())
  // Seule la lecture des hypothèses sert au recalcul (type de location).
  const assumptions = new AssumptionsService(
    prisma,
    activity,
    null as never,
    null as never
  )
  const observatory = new RentObservatoryService(deps.geo, cache)
  const enrichment = new ListingEnrichmentService(
    prisma,
    activity,
    assumptions,
    new RentControlService(deps.geo, cache),
    new MarketService(deps.geo),
    new TransitService(deps.geo),
    new DpeService(cache),
    new GeocodingService(prisma),
    new SurroundingsService(deps.geo),
    observatory
  )
  const rows = await deps.prisma.listing.findMany({
    where: {
      mergedIntoId: null,
      ...(options.workspace ? { workspace: { name: options.workspace } } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      latitude: true,
      longitude: true,
      locationPrecision: true,
      inseeCode: true,
      rooms: true,
      surface: true,
      fieldSources: true,
      rentalPlan: { select: { targetRent: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const stats: RefreshTargetRentStats = {
    listings: rows.length,
    given: 0,
    estimated: 0,
    cleared: 0,
    withoutEstimate: 0,
    unchanged: 0,
  }
  const mark = options.dryRun ? ' [simulation]' : ''
  for (const row of rows) {
    const point: Point | null =
      row.latitude !== null && row.longitude !== null
        ? { type: 'Point', coordinates: [row.longitude, row.latitude] }
        : null
    const surface = row.surface?.toNumber() ?? null
    const current = row.rentalPlan?.targetRent?.toNumber() ?? null
    const fieldSources = (row.fieldSources ?? {}) as FieldProvenanceMap
    const lookup = await observatory.lookup({
      point,
      precision: (row.locationPrecision ?? null) as LocationPrecision | null,
      inseeCode: row.inseeCode,
      rooms: row.rooms,
      surface,
      targetRent: null,
      leaseType: null,
    })
    const estimate = estimatedTargetRent(lookup, surface)
    const action = targetRentAction({ current, fieldSources, estimate })
    if (action.kind === 'keep') {
      if (current !== null) stats.given++
      else {
        stats.withoutEstimate++
        log(
          `- ${row.title} : pas d’estimation (${lookup.reasons[0] ?? lookup.notes[0] ?? 'zone ou surface inconnue'})`
        )
      }
      continue
    }
    if (action.kind === 'set' && action.targetRent === current) {
      stats.unchanged++
      continue
    }
    if (action.kind === 'set') {
      stats.estimated++
      log(
        `- ${row.title} : loyer visé estimé ${action.targetRent} €${current !== null ? ` (au lieu de ${current} €)` : ''}${mark}`
      )
    } else {
      stats.cleared++
      log(`- ${row.title} : estimation retirée (${current} €)${mark}`)
    }
    if (options.dryRun) continue
    const system = {
      id: null,
      workspaceId: row.workspaceId,
    } as unknown as Member
    await enrichment.enrich(system, row.id, { dpe: false, channel: 'system' })
  }
  return stats
}
