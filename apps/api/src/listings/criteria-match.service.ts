import { Injectable, NotFoundException } from '@nestjs/common'
import {
  ACTIVE_LISTING_STATUSES,
  AssumptionsSchema,
  CriteriaFiltersSchema,
  DEFAULT_ASSUMPTIONS,
  criteriaToleranceOf,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  CriteriaFilters,
  CriteriaFitCause,
  CriteriaFitHistory,
  CriteriaFitLevel,
  CriteriaFitRefreshSummary,
  CriteriaMatch,
  CriteriaMatchChanges,
  EvaluatedListing,
  ListingStatus,
} from '@apart/contracts'
import {
  bestFit,
  criteriaFit,
  criteriaFitHistory,
  fitTransition,
} from '@apart/domain'
import type {
  CriteriaFitCandidate,
  CriteriaFitMeasures,
  CriteriaFitOrigin,
  CriteriaFitResult,
  CriteriaFitRule,
  CriteriaFitTrigger,
  FitTransition,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { GeoService } from '../geo/geo.service'
import type {
  CriteriaFitMeasureRow,
  CriteriaGeoDraft,
} from '../geo/geo.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  Member,
  SearchCriteria as SearchCriteriaRow,
} from '../generated/prisma'
import { evaluateListing } from './evaluate'
import { listingInclude, toListingDto } from './listing.mapper'
import type { ListingRow } from './listing.mapper'

/** Les filtres enregistrés d'un critère ; un JSON incomplet reçoit les valeurs par défaut. */
export function criteriaFiltersOf(value: unknown): CriteriaFilters {
  const parsed = CriteriaFiltersSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : CriteriaFiltersSchema.parse({})
}

/** Ce que les filtres d'un critère lisent d'une annonce évaluée. */
export function criteriaCandidateOf(
  item: Pick<EvaluatedListing, 'listing' | 'evaluation'>
): CriteriaFitCandidate {
  return {
    price: item.listing.price,
    surface: item.listing.surface,
    rooms: item.listing.rooms,
    dpeClass: item.listing.dpeClass,
    commune: item.listing.location.commune,
    verdict: item.evaluation.metrics.verdict,
  }
}

/** Un critère tel que l'adéquation le lit, avec ce que le service en garde. */
export interface FitRule extends CriteriaFitRule {
  id: string
  name: string
  /** Statuts comptés et montrés par le critère (vide = actifs) ; hors de l'adéquation. */
  statuses: readonly ListingStatus[]
}

/** La règle d'un critère enregistré. */
export function fitRuleOf(row: SearchCriteriaRow): FitRule {
  const filters = criteriaFiltersOf(row.filters)
  return {
    id: row.id,
    name: row.name,
    perimeterType: row.perimeterType,
    filters,
    tolerance: criteriaToleranceOf(row.tolerance),
    statuses: filters.statuses,
  }
}

/** Les statuts comptés par un critère : les siens, sinon les actifs. */
export function countedStatuses(
  rule: Pick<FitRule, 'statuses'>
): readonly ListingStatus[] {
  return rule.statuses.length ? rule.statuses : ACTIVE_LISTING_STATUSES
}

/** Une mesure lue en base, à la forme de `domain`. */
export function measuresOf(row: CriteriaFitMeasureRow): CriteriaFitMeasures {
  return {
    hasPoint: row.has_point,
    precision: row.precision,
    hasArea: row.has_area,
    pointDistanceMeters: row.point_distance,
    areaCovered: row.area_covered,
    areaDistanceMeters: row.area_distance,
    areaInsideShare: row.area_share,
    tramPointDistanceMeters: row.tram_point_distance,
    tramAreaDistanceMeters: row.tram_area_distance,
  }
}

const NO_MEASURE: CriteriaFitMeasures = {
  hasPoint: false,
  precision: null,
  hasArea: false,
  pointDistanceMeters: null,
  areaCovered: null,
  areaDistanceMeters: null,
  areaInsideShare: null,
  tramPointDistanceMeters: null,
  tramAreaDistanceMeters: null,
}

/** Une annonce comparée aux critères : sa ligne, son évaluation, un résultat par critère. */
export interface ComputedListing {
  row: ListingRow
  item: Pick<EvaluatedListing, 'listing' | 'evaluation'>
  /** Par identifiant de critère, dans l'ordre des règles. */
  fits: Map<string, CriteriaFitResult>
}

/** Le plan d'un recalcul pour une annonce : ce qui change, critère par critère. */
export interface ListingFitPlan {
  listingId: string
  title: string
  before: CriteriaFitLevel | null
  after: CriteriaFitLevel
  changes: {
    criteriaId: string
    name: string
    transition: FitTransition | null
    before: CriteriaFitLevel | null
    after: CriteriaFitLevel
    reasons: string[]
  }[]
}

export interface FitRefreshResult {
  summary: CriteriaFitRefreshSummary
  plans: ListingFitPlan[]
  /** Pour une seule annonce : ce que la réponse d'écriture rend. */
  changes: Map<string, CriteriaMatchChanges>
}

/** Les actions du journal lues par l'historique de l'adéquation. */
export const CRITERIA_FIT_HISTORY_ACTIONS = [
  'listing.created',
  'criteria.matched',
  'criteria.unmatched',
  'criteria.fit_changed',
]

/** Les lignes d'historique gardées au plus. */
export const CRITERIA_FIT_HISTORY_LIMIT = 50

/** Un client Prisma, celui du service ou celui d'une transaction. */
type Client = Prisma.TransactionClient | PrismaService

/**
 * Adéquation et alertes (besoins G3 à G6, lot 14, ADR 0024). Pour chaque
 * annonce et chaque critère actif, un niveau (dans les critères, à
 * confirmer, à la marge, hors critères) : mesures géographiques par PostGIS
 * (module geo), décision par `domain` (`criteriaFit`). Stocké dans
 * `criteria_matches` (une ligne par critère actif et annonce) et, pour le
 * meilleur niveau, sur l'annonce. Recalculé à chaque écriture qui peut le
 * changer : annonce (création, modification, prix, statut, repère, DPE),
 * critère (création, modification, archivage), hypothèses (verdict), et par
 * le rattrapage `pnpm refresh:criteria-fit`. Chaque changement de niveau est
 * journalisé : `criteria.matched` (entrée : de hors critères ou jamais
 * comparée à un niveau gardé ; alerte quand c'est l'annonce qui a bougé),
 * `criteria.unmatched` (sortie vers hors critères), `criteria.fit_changed`
 * (dans, à confirmer, à la marge entre eux).
 */
@Injectable()
export class CriteriaMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly activity: ActivityService
  ) {}

  /** Les hypothèses en vigueur de l'espace (sans créer de version). */
  async workspaceAssumptions(
    workspaceId: string,
    client: Client = this.prisma
  ): Promise<Assumptions> {
    const latest = await client.assumptionsVersion.findFirst({
      where: { workspaceId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { values: true },
    })
    const parsed = AssumptionsSchema.safeParse(latest?.values ?? {})
    return parsed.success ? parsed.data : DEFAULT_ASSUMPTIONS
  }

  /** Les critères actifs de l'espace, dans l'ordre de création. */
  async activeRules(
    workspaceId: string,
    client: Client = this.prisma
  ): Promise<FitRule[]> {
    const rows = await client.searchCriteria.findMany({
      where: { workspaceId, active: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(fitRuleOf)
  }

  /**
   * Compare des annonces de l'espace à des règles, sans rien écrire : les
   * critères enregistrés (`rules`, mesurés par leur géométrie en base) ou un
   * brouillon (`draft`, pour l'aperçu). Une seule requête de mesures.
   */
  async compute(
    workspaceId: string,
    options: {
      rules: readonly FitRule[]
      listingIds?: readonly string[]
      base?: Assumptions
      draft?: CriteriaGeoDraft
      client?: Client
      /** La date de l'évaluation (un plafond posé d'office expire avec son arrêté). */
      at?: Date
    }
  ): Promise<ComputedListing[]> {
    const client = options.client ?? this.prisma
    const rows = (await client.listing.findMany({
      where: {
        workspaceId,
        ...(options.listingIds ? { id: { in: [...options.listingIds] } } : {}),
      },
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
    })) as ListingRow[]
    if (rows.length === 0) return []
    const base =
      options.base ?? (await this.workspaceAssumptions(workspaceId, client))
    const needsGeo = options.rules.some(
      r => r.perimeterType !== null || r.filters.maxTramDistanceMeters !== null
    )
    const measures = new Map<string, CriteriaFitMeasures>()
    if (needsGeo) {
      const found = options.draft
        ? await this.geo.criteriaFitMeasuresDraft(workspaceId, options.draft)
        : await this.geo.criteriaFitMeasures(
            workspaceId,
            {
              criteriaIds: options.rules.map(r => r.id),
              ...(options.listingIds ? { listingIds: options.listingIds } : {}),
            },
            client
          )
      for (const m of found) {
        // Un brouillon n'a qu'une règle : sa mesure vaut pour elle.
        const key = options.draft
          ? `${m.listing_id}:${options.rules[0]?.id ?? ''}`
          : `${m.listing_id}:${m.criteria_id}`
        measures.set(key, measuresOf(m))
      }
    }
    return rows.map(row => {
      const listing = toListingDto(row)
      const evaluation = evaluateListing(listing, base, options.at)
      const item = { listing, evaluation }
      const candidate = criteriaCandidateOf(item)
      const fits = new Map<string, CriteriaFitResult>()
      for (const rule of options.rules) {
        fits.set(
          rule.id,
          criteriaFit(
            rule,
            candidate,
            measures.get(`${row.id}:${rule.id}`) ?? NO_MEASURE
          )
        )
      }
      return { row, item, fits }
    })
  }

  /**
   * Après une écriture d'une annonce : son adéquation recalculée et
   * enregistrée, les changements journalisés (une entrée alerte), et ce que
   * la réponse d'écriture en dit (`criteriaChanges`).
   */
  async refreshForListing(
    member: Member,
    listingId: string,
    channel: ActivityChannel,
    trigger: CriteriaFitTrigger = 'updated',
    options: { quiet?: boolean } = {}
  ): Promise<CriteriaMatchChanges> {
    const result = await this.refresh(member.workspaceId, {
      listingIds: [listingId],
      origin: { cause: 'listing', trigger },
      actorMemberId: member.id,
      channel,
      // Lot 21 : une décision à plusieurs a sa propre notification.
      quiet: options.quiet ?? false,
    })
    return (
      result.changes.get(listingId) ?? {
        entered: [],
        left: [],
        changed: [],
        current: [],
      }
    )
  }

  /**
   * Recalcule l'adéquation (toutes les annonces de l'espace, ou
   * `listingIds`) aux critères actifs, l'enregistre et journalise les
   * changements de niveau. Les lignes des critères archivés sont retirées.
   * Sans critère actif, toute annonce est « dans les critères ». Avec
   * `dryRun`, rien n'est écrit : le plan seulement.
   */
  async refresh(
    workspaceId: string,
    options: {
      listingIds?: readonly string[]
      origin: CriteriaFitOrigin
      actorMemberId: string | null
      channel: ActivityChannel
      base?: Assumptions
      dryRun?: boolean
      at?: Date
      /** Lot 21 : pas de notification (une décision à plusieurs a la sienne). */
      quiet?: boolean
    }
  ): Promise<FitRefreshResult> {
    const now = options.at ?? new Date()
    const rules = await this.activeRules(workspaceId)
    const computed = await this.compute(workspaceId, {
      rules,
      ...(options.listingIds ? { listingIds: options.listingIds } : {}),
      ...(options.base ? { base: options.base } : {}),
    })
    const summary: CriteriaFitRefreshSummary = {
      listings: computed.length,
      entered: 0,
      left: 0,
      changed: 0,
    }
    const plans: ListingFitPlan[] = []
    const changes = new Map<string, CriteriaMatchChanges>()
    const names = new Map(rules.map(r => [r.id, r.name]))
    for (const { row, fits } of computed) {
      const existing = new Map(
        (
          await this.prisma.criteriaMatch.findMany({
            where: { listingId: row.id },
          })
        ).map(m => [m.criteriaId, m])
      )
      const stale = [...existing.keys()].filter(id => !fits.has(id))
      const aggregateBefore = row.criteriaFitLevel
      const best = bestFit(
        rules.map(r => ({ id: r.id, ...(fits.get(r.id) as CriteriaFitResult) }))
      )
      const aggregateAfter: CriteriaFitLevel = best?.level ?? 'in'
      const plan: ListingFitPlan = {
        listingId: row.id,
        title: row.title,
        before: aggregateBefore,
        after: aggregateAfter,
        changes: rules.map(rule => {
          const fit = fits.get(rule.id) as CriteriaFitResult
          const before = existing.get(rule.id)?.level ?? null
          return {
            criteriaId: rule.id,
            name: rule.name,
            transition: fitTransition(before, fit.level),
            before,
            after: fit.level,
            reasons: fit.reasons,
          }
        }),
      }
      const moved = plan.changes.filter(c => c.transition !== null)
      if (moved.length || aggregateBefore !== aggregateAfter) plans.push(plan)
      if (options.dryRun) {
        for (const c of moved) countTransition(summary, c.transition)
        continue
      }
      // Rien à écrire (rattrapage relancé, écriture sans effet) : aucune
      // transaction, aucune ligne réécrite.
      const same = (a: unknown, b: unknown): boolean =>
        stableJson(a) === stableJson(b)
      const untouched =
        stale.length === 0 &&
        aggregateBefore === aggregateAfter &&
        rules.every(rule => {
          const fit = fits.get(rule.id) as CriteriaFitResult
          const previous = existing.get(rule.id)
          return (
            previous !== undefined &&
            previous.level === fit.level &&
            previous.approximate === fit.locationPending &&
            same(previous.reasons, fit.reasons) &&
            same(previous.checks, fit.checks)
          )
        })
      const written = untouched
        ? []
        : await this.prisma.$transaction(async tx => {
            if (stale.length) {
              await tx.criteriaMatch.deleteMany({
                where: { listingId: row.id, criteriaId: { in: stale } },
              })
            }
            const counted: typeof moved = []
            for (const rule of rules) {
              const fit = fits.get(rule.id) as CriteriaFitResult
              const previous = existing.get(rule.id)
              const change = plan.changes.find(c => c.criteriaId === rule.id)
              const data = {
                level: fit.level,
                reasons: fit.reasons as unknown as Prisma.InputJsonValue,
                checks: fit.checks as unknown as Prisma.InputJsonValue,
                approximate: fit.locationPending,
              }
              if (!previous) {
                // Seules les lignes réellement écrites ici journalisent (et
                // alertent) : deux écritures concurrentes ne le font qu'une fois.
                const inserted = await tx.criteriaMatch.createManyAndReturn({
                  data: [
                    {
                      criteriaId: rule.id,
                      listingId: row.id,
                      matchedAt: now,
                      levelChangedAt: now,
                      ...data,
                    },
                  ],
                  skipDuplicates: true,
                  select: { criteriaId: true },
                })
                if (inserted.length && change?.transition) counted.push(change)
                continue
              }
              const levelChanged = previous.level !== fit.level
              const { count } = await tx.criteriaMatch.updateMany({
                where: {
                  criteriaId: rule.id,
                  listingId: row.id,
                  level: previous.level,
                },
                data: {
                  ...data,
                  ...(levelChanged ? { levelChangedAt: now } : {}),
                  ...(change?.transition === 'entered'
                    ? { matchedAt: now }
                    : {}),
                },
              })
              if (count > 0 && change?.transition) counted.push(change)
            }
            if (aggregateBefore !== aggregateAfter) {
              // L'adéquation n'est pas une modification de l'annonce : sa date
              // de modification (garde-fou expectedUpdatedAt) ne bouge pas. Une
              // écriture concurrente de l'annonce refera ce calcul.
              await tx.listing.updateMany({
                where: {
                  id: row.id,
                  criteriaFitLevel: aggregateBefore,
                  updatedAt: row.updatedAt,
                },
                data: {
                  criteriaFitLevel: aggregateAfter,
                  criteriaFitChangedAt: now,
                  criteriaFitOrigin: originJson(options.origin),
                  updatedAt: row.updatedAt,
                },
              })
            }
            await this.journal(tx, {
              workspaceId,
              listingId: row.id,
              actorMemberId: options.actorMemberId,
              channel: options.channel,
              origin: options.origin,
              quiet: options.quiet ?? false,
              changes: counted,
              aggregate: { before: aggregateBefore, after: aggregateAfter },
              approximate: new Map(
                rules.map(r => [
                  r.id,
                  (fits.get(r.id) as CriteriaFitResult).locationPending,
                ])
              ),
            })
            return counted
          })
      for (const c of written) countTransition(summary, c.transition)
      const matchedAt = (id: string): string =>
        (written.some(c => c.criteriaId === id && c.transition === 'entered')
          ? now
          : (existing.get(id)?.matchedAt ?? now)
        ).toISOString()
      const asMatch = (id: string): CriteriaMatch => {
        const fit = fits.get(id) as CriteriaFitResult
        return {
          criteriaId: id,
          name: names.get(id) ?? '',
          matchedAt: matchedAt(id),
          approximate: fit.locationPending,
          level: fit.level,
          reasons: fit.reasons,
        }
      }
      changes.set(row.id, {
        entered: written
          .filter(c => c.transition === 'entered')
          .map(c => asMatch(c.criteriaId)),
        left: written
          .filter(c => c.transition === 'left')
          .map(c => ({
            criteriaId: c.criteriaId,
            name: c.name,
            reasons: c.reasons,
          })),
        changed: written
          .filter(c => c.transition === 'changed')
          .map(c => ({
            criteriaId: c.criteriaId,
            name: c.name,
            before: c.before as CriteriaFitLevel,
            after: c.after,
            reasons: c.reasons,
          })),
        current: rules
          .filter(r => (fits.get(r.id) as CriteriaFitResult).level !== 'out')
          .map(r => asMatch(r.id)),
      })
    }
    return { summary, plans, changes }
  }

  /**
   * L'historique de l'adéquation d'une annonce de l'espace : entrées,
   * sorties et changements de niveau datés avec leurs raisons, tirés du
   * journal ; la phrase vient de `domain` (`criteriaFitHistory`).
   */
  async history(
    member: Member,
    listingId: string
  ): Promise<CriteriaFitHistory> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    const rows = await this.prisma.activityLog.findMany({
      where: {
        listingId,
        workspaceId: member.workspaceId,
        action: { in: CRITERIA_FIT_HISTORY_ACTIONS },
      },
      orderBy: { createdAt: 'desc' },
      take: CRITERIA_FIT_HISTORY_LIMIT,
    })
    return {
      listingId,
      items: criteriaFitHistory(
        rows.map(row => ({
          action: row.action,
          before: row.before,
          after: row.after,
          createdAt: row.createdAt.toISOString(),
        }))
      ),
    }
  }

  /** Une ligne de journal par sorte de changement : entrées, sorties, autres. */
  private async journal(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string
      listingId: string
      actorMemberId: string | null
      channel: ActivityChannel
      origin: CriteriaFitOrigin
      quiet: boolean
      changes: ListingFitPlan['changes']
      aggregate: { before: CriteriaFitLevel | null; after: CriteriaFitLevel }
      approximate: Map<string, boolean>
    }
  ): Promise<void> {
    const kinds: { transition: FitTransition; action: string }[] = [
      { transition: 'entered', action: 'criteria.matched' },
      { transition: 'left', action: 'criteria.unmatched' },
      { transition: 'changed', action: 'criteria.fit_changed' },
    ]
    for (const { transition, action } of kinds) {
      const list = input.changes.filter(c => c.transition === transition)
      if (!list.length) continue
      await this.activity.record(
        {
          workspaceId: input.workspaceId,
          listingId: input.listingId,
          actorMemberId: input.actorMemberId,
          channel: input.channel,
          action,
          before: {
            criteria: list.map(c => ({
              id: c.criteriaId,
              name: c.name,
              level: c.before,
            })),
            level: input.aggregate.before,
          },
          after: {
            ...originJson(input.origin),
            ...(input.quiet ? { quiet: true } : {}),
            criteria: list.map(c => ({
              id: c.criteriaId,
              name: c.name,
              before: c.before,
              level: c.after,
              reasons: c.reasons,
              approximate: input.approximate.get(c.criteriaId) ?? false,
            })),
            level: input.aggregate.after,
          },
        },
        tx
      )
    }
  }
}

/** Un JSON aux clés triées : jsonb réordonne les clés, la comparaison ne doit pas en dépendre. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : v
  )
}

function countTransition(
  summary: CriteriaFitRefreshSummary,
  transition: FitTransition | null
): void {
  if (transition === 'entered') summary.entered += 1
  else if (transition === 'left') summary.left += 1
  else if (transition === 'changed') summary.changed += 1
}

/** Ce que le journal et l'annonce gardent de la cause. */
function originJson(origin: CriteriaFitOrigin): {
  cause: CriteriaFitCause
  trigger: string | null
  criteriaName: string | null
} {
  return {
    cause: origin.cause,
    trigger: origin.trigger ?? null,
    criteriaName: origin.criteriaName ?? null,
  }
}
