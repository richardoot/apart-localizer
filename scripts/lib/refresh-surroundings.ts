import { ListingOpenDataContextSchema } from '@apart/contracts'
import { surroundingsDigest } from '@apart/domain'
import type {
  ListingOpenDataContext,
  LocationPrecision,
  Point,
  Surroundings,
} from '@apart/contracts'
import type {
  Prisma,
  PrismaClient,
} from '../../apps/api/src/generated/prisma/index.js'
import type { GeoService } from '../../apps/api/src/geo/geo.service.js'
import { SurroundingsService } from '../../apps/api/src/opendata/surroundings.service.js'

/**
 * Rattrapage du lot 11 : recalcule le quartier et les équipements proches
 * (`open_data_context.surroundings`) de toutes les annonces d'une base, avec
 * le même service que l'API (module geo, règles de `domain`, aucun réseau).
 * Seule la clé `surroundings` de l'instantané change ; les autres (tram,
 * plafond, marché, DPE) restent celles du dernier enrichissement. Une
 * annonce réécrite reçoit une ligne de journal `listing.enriched` (canal
 * `system`) ; une annonce dont le résultat ne change pas n'est pas touchée.
 */

export interface RefreshStats {
  listings: number
  changed: number
  unchanged: number
  withoutPoint: number
}

/** Le résultat sans sa date de calcul, pour comparer deux instantanés. */
function comparable(surroundings: Surroundings | null): string {
  if (!surroundings) return 'null'
  const { computedAt: _computedAt, ...rest } = surroundings
  return JSON.stringify(rest)
}

export async function refreshSurroundings(
  deps: { prisma: PrismaClient; geo: GeoService },
  options: {
    dryRun: boolean
    workspace?: string | undefined
    at?: Date
    log?: (line: string) => void
  }
): Promise<RefreshStats> {
  const service = new SurroundingsService(deps.geo)
  const at = options.at ?? new Date()
  const log = options.log ?? (() => undefined)
  const rows = await deps.prisma.listing.findMany({
    where: options.workspace ? { workspace: { name: options.workspace } } : {},
    select: {
      id: true,
      workspaceId: true,
      title: true,
      latitude: true,
      longitude: true,
      locationPrecision: true,
      openDataContext: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  const stats: RefreshStats = {
    listings: rows.length,
    changed: 0,
    unchanged: 0,
    withoutPoint: 0,
  }
  for (const row of rows) {
    const point: Point | null =
      row.latitude !== null && row.longitude !== null
        ? { type: 'Point', coordinates: [row.longitude, row.latitude] }
        : null
    if (!point) stats.withoutPoint++
    const surroundings = await service.at(
      point,
      (row.locationPrecision ?? null) as LocationPrecision | null,
      at
    )
    const parsed = ListingOpenDataContextSchema.safeParse(
      row.openDataContext ?? {}
    )
    const current: ListingOpenDataContext = parsed.success
      ? parsed.data
      : ListingOpenDataContextSchema.parse({})
    if (comparable(current.surroundings) === comparable(surroundings)) {
      stats.unchanged++
      continue
    }
    stats.changed++
    const summary = surroundingsDigest(surroundings)
    log(
      `- ${row.title} : ${summary.neighbourhood ?? 'quartier non disponible'}${options.dryRun ? ' [simulation]' : ''}`
    )
    if (options.dryRun) continue
    const snapshot: ListingOpenDataContext = { ...current, surroundings }
    await deps.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id: row.id },
        data: {
          openDataContext: snapshot as unknown as Prisma.InputJsonValue,
        },
      })
      await tx.activityLog.create({
        data: {
          workspaceId: row.workspaceId,
          listingId: row.id,
          channel: 'system',
          action: 'listing.enriched',
          after: {
            surroundings: summary,
            by: 'refresh:surroundings',
          } as Prisma.InputJsonValue,
        },
      })
    })
  }
  return stats
}
