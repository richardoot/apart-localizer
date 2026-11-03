import { Injectable } from '@nestjs/common'
import { CriteriaFiltersSchema } from '@apart/contracts'
import type {
  ActivityChannel,
  CriteriaFilters,
  CriteriaMatch,
  CriteriaMatchChanges,
  EvaluatedListing,
} from '@apart/contracts'
import { criteriaFilterMatch } from '@apart/domain'
import type { CriteriaCandidate } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { GeoService } from '../geo/geo.service'
import { PrismaService } from '../prisma/prisma.service'
import type { Member } from '../generated/prisma'

/** Les filtres enregistrés d'un critère ; un JSON incomplet reçoit les valeurs par défaut. */
export function criteriaFiltersOf(value: unknown): CriteriaFilters {
  const parsed = CriteriaFiltersSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : CriteriaFiltersSchema.parse({})
}

/** Ce que les filtres d'un critère lisent d'une annonce évaluée. */
export function criteriaCandidateOf(item: EvaluatedListing): CriteriaCandidate {
  return {
    price: item.listing.price,
    surface: item.listing.surface,
    rooms: item.listing.rooms,
    dpeClass: item.listing.dpeClass,
    status: item.listing.status,
    commune: item.listing.location.commune,
    verdict: item.evaluation.metrics.verdict,
  }
}

/**
 * Alertes (besoin G6) : à chaque écriture d'une annonce, les critères actifs
 * qu'elle satisfait (partie géographique par PostGIS, filtres par `domain`,
 * exactement comme la liste filtrée) ; les entrées et les sorties sont
 * enregistrées dans `criteria_matches` et journalisées. Les notifications
 * push viendront au lot 6.
 */
@Injectable()
export class CriteriaMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly activity: ActivityService
  ) {}

  async refreshForListing(
    member: Member,
    item: EvaluatedListing,
    channel: ActivityChannel
  ): Promise<CriteriaMatchChanges> {
    const listingId = item.listing.id
    const [criteria, existing] = await Promise.all([
      this.prisma.searchCriteria.findMany({
        where: { workspaceId: member.workspaceId, active: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.criteriaMatch.findMany({
        where: { listingId },
        include: { criteria: { select: { name: true, active: true } } },
      }),
    ])
    const geoHits =
      criteria.length > 0
        ? new Map(
            (
              await this.geo.criteriaContainingListing(
                member.workspaceId,
                listingId
              )
            ).map(hit => [hit.criteria_id, hit.approximate])
          )
        : new Map<string, boolean>()
    const candidate = criteriaCandidateOf(item)
    const satisfied = criteria.filter(
      c =>
        geoHits.has(c.id) &&
        criteriaFilterMatch(candidate, criteriaFiltersOf(c.filters)).matches
    )
    const before = new Map(existing.map(m => [m.criteriaId, m]))
    const now = new Date()
    let entered = satisfied.filter(c => !before.has(c.id))
    let left = existing.filter(
      m => m.criteria.active && !satisfied.some(c => c.id === m.criteriaId)
    )
    const changedApproximation = satisfied.filter(c => {
      const previous = before.get(c.id)
      return previous && previous.approximate !== (geoHits.get(c.id) ?? false)
    })

    if (entered.length || left.length || changedApproximation.length) {
      await this.prisma.$transaction(async tx => {
        // Seules les lignes réellement écrites ici donnent une alerte : deux
        // écritures concurrentes de la même annonce n'alertent qu'une fois.
        if (entered.length) {
          const inserted = await tx.criteriaMatch.createManyAndReturn({
            data: entered.map(c => ({
              criteriaId: c.id,
              listingId,
              matchedAt: now,
              approximate: geoHits.get(c.id) ?? false,
            })),
            skipDuplicates: true,
            select: { criteriaId: true },
          })
          const ids = new Set(inserted.map(row => row.criteriaId))
          entered = entered.filter(c => ids.has(c.id))
        }
        if (left.length) {
          const removed: typeof left = []
          for (const m of left) {
            const { count } = await tx.criteriaMatch.deleteMany({
              where: { listingId, criteriaId: m.criteriaId },
            })
            if (count > 0) removed.push(m)
          }
          left = removed
        }
        for (const c of changedApproximation) {
          await tx.criteriaMatch.update({
            where: { criteriaId_listingId: { criteriaId: c.id, listingId } },
            data: { approximate: geoHits.get(c.id) ?? false },
          })
        }
        if (entered.length) {
          await this.activity.record(
            {
              workspaceId: member.workspaceId,
              listingId,
              actorMemberId: member.id,
              channel,
              action: 'criteria.matched',
              after: {
                criteria: entered.map(c => ({
                  id: c.id,
                  name: c.name,
                  approximate: geoHits.get(c.id) ?? false,
                })),
              },
            },
            tx
          )
        }
        if (left.length) {
          await this.activity.record(
            {
              workspaceId: member.workspaceId,
              listingId,
              actorMemberId: member.id,
              channel,
              action: 'criteria.unmatched',
              before: {
                criteria: left.map(m => ({
                  id: m.criteriaId,
                  name: m.criteria.name,
                })),
              },
            },
            tx
          )
        }
      })
    }

    const current: CriteriaMatch[] = satisfied.map(c => ({
      criteriaId: c.id,
      name: c.name,
      matchedAt: (before.get(c.id)?.matchedAt ?? now).toISOString(),
      approximate: geoHits.get(c.id) ?? false,
    }))
    return {
      entered: current.filter(m => entered.some(c => c.id === m.criteriaId)),
      left: left.map(m => ({
        criteriaId: m.criteriaId,
        name: m.criteria.name,
      })),
      current,
    }
  }

  /**
   * Après la création ou la modification d'un critère : la table des
   * entrées reflète les annonces qui le satisfont désormais, sans alerte par
   * annonce (ce n'est pas l'annonce qui a bougé). Rend les nombres.
   */
  async syncCriteria(
    criteriaId: string,
    matching: readonly { id: string; approximate: boolean }[]
  ): Promise<{ added: number; removed: number }> {
    const existing = await this.prisma.criteriaMatch.findMany({
      where: { criteriaId },
      select: { listingId: true, approximate: true },
    })
    const wanted = new Set(matching.map(m => m.id))
    const had = new Map(existing.map(m => [m.listingId, m.approximate]))
    const add = matching.filter(m => !had.has(m.id))
    const remove = [...had.keys()].filter(id => !wanted.has(id))
    // Les entrées gardées suivent la précision : sans périmètre, plus de
    // « sous réserve ».
    const kept = matching.filter(
      m => had.has(m.id) && had.get(m.id) !== m.approximate
    )
    const reflag = (approximate: boolean) =>
      this.prisma.criteriaMatch.updateMany({
        where: {
          criteriaId,
          listingId: {
            in: kept.filter(m => m.approximate === approximate).map(m => m.id),
          },
        },
        data: { approximate },
      })
    await this.prisma.$transaction([
      this.prisma.criteriaMatch.deleteMany({
        where: { criteriaId, listingId: { in: remove } },
      }),
      this.prisma.criteriaMatch.createMany({
        data: add.map(m => ({
          criteriaId,
          listingId: m.id,
          approximate: m.approximate,
        })),
        skipDuplicates: true,
      }),
      reflag(true),
      reflag(false),
    ])
    return { added: add.length, removed: remove.length }
  }
}
