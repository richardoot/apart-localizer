import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  CriteriaFiltersSchema,
  CriteriaToleranceSchema,
  EMPTY_FIT_COUNTS,
} from '@apart/contracts'
import type {
  ActivityChannel,
  CriteriaFitCounts,
  CriteriaFitRefreshSummary,
  Perimeter,
  PerimeterInput,
  SearchCriteriaInput,
  SearchCriteriaPreview,
  SearchCriteriaPreviewExample,
  SearchCriteriaPreviewRequest,
  SearchCriteriaSummary,
  SearchCriteriaUpdate,
} from '@apart/contracts'
import { fitRank } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { GeoService } from '../geo/geo.service'
import type { CriteriaGeoDraft } from '../geo/geo.service'
import {
  CriteriaMatchService,
  countedStatuses,
  fitRuleOf,
} from '../listings/criteria-match.service'
import type {
  ComputedListing,
  FitRule,
} from '../listings/criteria-match.service'
import { GeocodingService } from '../opendata/geocoding.service'
import { IsochroneService } from '../opendata/isochrone.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  Member,
  SearchCriteria as SearchCriteriaRow,
} from '../generated/prisma'
import { toSearchCriteriaDto } from './search-criteria.mapper'

/** Bornes d'un polygone dessiné : au moins 100 m², au plus 1 000 km² (la métropole en fait 578). */
export const POLYGON_MIN_M2 = 100
export const POLYGON_MAX_M2 = 1_000_000_000

/** La partie géographique d'un périmètre résolu, pour les mesures PostGIS. */
export function draftOf(perimeter: Perimeter | null): CriteriaGeoDraft {
  return {
    perimeterType: perimeter?.type ?? null,
    center:
      perimeter?.type === 'point_radius'
        ? {
            longitude: perimeter.longitude,
            latitude: perimeter.latitude,
            radiusMeters: perimeter.radiusMeters,
          }
        : null,
    polygon:
      perimeter && perimeter.type !== 'point_radius' ? perimeter.polygon : null,
  }
}

/** Le nombre d'exemples rendus par l'aperçu. */
export const PREVIEW_EXAMPLES_MAX = 20

/** L'identifiant de la règle d'un brouillon (aperçu). */
const DRAFT_ID = '00000000-0000-4000-8000-000000000000'

/** Les colonnes d'un périmètre (le polygone lui-même passe par le module geo). */
function perimeterColumns(perimeter: Perimeter | null): {
  perimeterType: Perimeter['type'] | null
  centerLatitude: number | null
  centerLongitude: number | null
  radiusMeters: number | null
  isochroneParams: Prisma.InputJsonValue | typeof Prisma.DbNull
} {
  return {
    perimeterType: perimeter?.type ?? null,
    centerLatitude:
      perimeter?.type === 'point_radius' ? perimeter.latitude : null,
    centerLongitude:
      perimeter?.type === 'point_radius' ? perimeter.longitude : null,
    radiusMeters:
      perimeter?.type === 'point_radius' ? perimeter.radiusMeters : null,
    isochroneParams:
      perimeter?.type === 'isochrone'
        ? (perimeter.params as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
  }
}

/**
 * Critères de recherche enregistrés et partagés dans l'espace (besoins G3 à
 * G6) : création, lecture avec compteurs par niveau d'adéquation (lot 14),
 * aperçu avant enregistrement, mise à jour avec garde-fou, archivage (actif
 * = faux), suppression (REST seulement). Un périmètre isochrone est calculé
 * par la Géoplateforme et figé en polygone ; un polygone dessiné est validé
 * par PostGIS. Chaque écriture est journalisée et recalcule l'adéquation des
 * annonces de l'espace (sans alerte : ce n'est pas l'annonce qui a bougé).
 */
@Injectable()
export class SearchCriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly activity: ActivityService,
    private readonly matches: CriteriaMatchService,
    private readonly isochrone: IsochroneService,
    private readonly geocoding: GeocodingService
  ) {}

  async list(
    member: Member,
    options: { includeArchived?: boolean } = {}
  ): Promise<SearchCriteriaSummary[]> {
    const rows = await this.prisma.searchCriteria.findMany({
      where: {
        workspaceId: member.workspaceId,
        ...(options.includeArchived ? {} : { active: true }),
      },
      orderBy: { createdAt: 'asc' },
    })
    return this.summaries(member, rows)
  }

  async get(member: Member, id: string): Promise<SearchCriteriaSummary> {
    const [summary] = await this.summaries(member, [
      await this.findRow(member, id),
    ])
    return summary as SearchCriteriaSummary
  }

  /**
   * Aperçu sans enregistrer : périmètre résolu (isochrone calculée) et
   * annonces par niveau d'adéquation, avec la marge saisie ; les mêmes
   * mesures et la même décision que les critères enregistrés.
   */
  async preview(
    member: Member,
    request: SearchCriteriaPreviewRequest
  ): Promise<SearchCriteriaPreview> {
    const perimeter = await this.resolvePerimeter(request.perimeter)
    const rule: FitRule = {
      id: DRAFT_ID,
      name: 'Aperçu',
      perimeterType: perimeter?.type ?? null,
      filters: request.filters,
      tolerance: request.tolerance,
      statuses: request.filters.statuses,
    }
    const computed = await this.matches.compute(member.workspaceId, {
      rules: [rule],
      draft: draftOf(perimeter),
    })
    const counted = counting(computed, rule)
    return {
      perimeter,
      listingCount: counted.kept.length,
      approximateCount: counted.approximate,
      listingIds: counted.kept.map(c => c.row.id),
      fitCounts: counted.counts,
      examples: counted.examples,
    }
  }

  async create(
    member: Member,
    input: SearchCriteriaInput,
    channel: ActivityChannel = 'web'
  ): Promise<SearchCriteriaSummary> {
    const perimeter = await this.resolvePerimeter(input.perimeter)
    // La ligne, sa géométrie et le journal ensemble : jamais un critère
    // « polygone » sans polygone.
    const row = await this.prisma.$transaction(async tx => {
      const created = await tx.searchCriteria.create({
        data: {
          workspaceId: member.workspaceId,
          createdById: member.id,
          name: input.name,
          active: input.active,
          filters: input.filters as unknown as Prisma.InputJsonValue,
          tolerance: input.tolerance as unknown as Prisma.InputJsonValue,
          portals: portalsJson(input.portals),
          ...perimeterColumns(perimeter),
        },
      })
      if (perimeter && perimeter.type !== 'point_radius') {
        await this.geo.setCriteriaPerimeter(created.id, perimeter.polygon, tx)
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'criteria.created',
          after: {
            id: created.id,
            name: input.name,
            active: input.active,
            filters: input.filters,
            tolerance: input.tolerance,
            portals: input.portals,
            perimeterType: perimeter?.type ?? null,
            isochrone:
              perimeter?.type === 'isochrone' ? perimeter.params : null,
          },
        },
        tx
      )
      return created
    })
    const fitChanges = await this.refreshFits(member, channel, input.name)
    return { ...(await this.get(member, row.id)), fitChanges }
  }

  async update(
    member: Member,
    id: string,
    patch: SearchCriteriaUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<SearchCriteriaSummary> {
    const { expectedUpdatedAt: _guard, ...changes } = patch
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Aucun champ à modifier')
    }
    // Le périmètre (isochrone : appel réseau) se résout avant la lecture qui
    // sert au garde-fou, pour ne pas élargir la fenêtre entre les deux.
    const resolved =
      changes.perimeter === undefined
        ? undefined
        : await this.resolvePerimeter(changes.perimeter)
    const conflict = (updatedAt: string): ConflictException =>
      new ConflictException(
        `Le critère a changé depuis ta lecture (modifié le ${updatedAt}) : relis-le avant de le modifier`
      )
    const row = await this.findRow(member, id)
    const before = toSearchCriteriaDto(row)
    if (
      patch.expectedUpdatedAt !== undefined &&
      Date.parse(patch.expectedUpdatedAt) !== row.updatedAt.getTime()
    ) {
      throw conflict(before.updatedAt)
    }
    const filters =
      changes.filters !== undefined
        ? CriteriaFiltersSchema.parse({ ...before.filters, ...changes.filters })
        : before.filters
    const tolerance =
      changes.tolerance !== undefined
        ? CriteriaToleranceSchema.parse({
            ...before.tolerance,
            ...changes.tolerance,
          })
        : before.tolerance
    const perimeter = resolved === undefined ? before.perimeter : resolved
    const active = changes.active ?? before.active
    await this.prisma.$transaction(async tx => {
      // Écriture conditionnée à la version lue : deux modifications
      // concurrentes ne passent pas toutes les deux.
      const written = await tx.searchCriteria.updateMany({
        where: {
          id,
          workspaceId: member.workspaceId,
          updatedAt: row.updatedAt,
        },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          active,
          filters: filters as unknown as Prisma.InputJsonValue,
          tolerance: tolerance as unknown as Prisma.InputJsonValue,
          ...(changes.portals !== undefined
            ? { portals: portalsJson(changes.portals) }
            : {}),
          ...(resolved !== undefined ? perimeterColumns(perimeter) : {}),
        },
      })
      if (written.count === 0) throw conflict(before.updatedAt)
      if (resolved !== undefined) {
        await this.geo.setCriteriaPerimeter(
          id,
          perimeter && perimeter.type !== 'point_radius'
            ? perimeter.polygon
            : null,
          tx
        )
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'criteria.updated',
          before: {
            id,
            name: before.name,
            active: before.active,
            filters: before.filters,
            tolerance: before.tolerance,
            portals: before.portals,
            perimeterType: before.perimeterType,
          },
          after: {
            id,
            ...changes,
            perimeterType: perimeter?.type ?? null,
          },
        },
        tx
      )
    })
    // Lot 16 : cocher ou décocher un portail ne change aucune adéquation.
    const onlyPortals = Object.keys(changes).every(key => key === 'portals')
    const fitChanges = onlyPortals
      ? null
      : await this.refreshFits(member, channel, changes.name ?? before.name)
    return { ...(await this.get(member, id)), fitChanges }
  }

  /** Suppression définitive (REST seulement ; le MCP archive avec `active: false`). */
  async remove(
    member: Member,
    id: string,
    channel: ActivityChannel = 'web'
  ): Promise<void> {
    const row = await this.findRow(member, id)
    await this.prisma.$transaction(async tx => {
      await tx.searchCriteria.delete({ where: { id } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'criteria.deleted',
          before: { id, name: row.name, perimeterType: row.perimeterType },
        },
        tx
      )
    })
    // Ses lignes d'adéquation partent avec lui (cascade) : le meilleur niveau
    // des annonces est recalculé.
    await this.refreshFits(member, channel, row.name)
  }

  /** Résout un périmètre demandé : point et rayon tel quel, polygone validé, isochrone calculée. */
  async resolvePerimeter(
    input: PerimeterInput | null
  ): Promise<Perimeter | null> {
    if (input === null) return null
    if (input.type === 'point_radius') return input
    if (input.type === 'polygon') {
      const check = await this.geo.checkPolygon(input.polygon)
      if (!check.valid) {
        throw new BadRequestException(
          `Polygone invalide (${check.reason}) : redessine-le sans que ses côtés se croisent.`
        )
      }
      if (check.areaSquareMeters < POLYGON_MIN_M2) {
        throw new BadRequestException('Polygone trop petit (moins de 100 m²).')
      }
      if (check.areaSquareMeters > POLYGON_MAX_M2) {
        throw new BadRequestException(
          'Polygone trop grand (plus de 1 000 km²) : reste sur la métropole.'
        )
      }
      return input
    }
    let origin = input.origin ?? null
    let originLabel: string | null = null
    if (!origin && input.address) {
      // Une panne du géocodeur n'est pas une adresse introuvable : 503.
      const located = await this.geocoding
        .geocode(input.address.trim(), 'address')
        .catch((error: unknown) => {
          throw new ServiceUnavailableException(
            `Géocodeur de la Géoplateforme indisponible (${error instanceof Error ? error.message : String(error)}) : réessaie, ou clique le point de départ sur la carte.`
          )
        })
      if (!located) {
        throw new BadRequestException(
          `Adresse de départ introuvable : « ${input.address} ».`
        )
      }
      origin = located.point
      originLabel = located.label || input.address
    }
    if (!origin) {
      throw new BadRequestException('Point de départ de l’isochrone manquant.')
    }
    const result = await this.isochrone.compute(
      origin,
      input.mode,
      input.durationMinutes
    )
    return {
      type: 'isochrone',
      polygon: result.polygon,
      params: {
        origin,
        originLabel,
        mode: input.mode,
        durationMinutes: input.durationMinutes,
        computedAt: result.computedAt,
        provider: result.provider,
        approximation:
          [result.approximation, ...result.warnings]
            .filter(Boolean)
            .join(' ') || null,
      },
    }
  }

  /**
   * L'adéquation de toutes les annonces de l'espace recalculée après
   * l'écriture d'un critère, journalisée sans alerte (cause « critère »).
   */
  private async refreshFits(
    member: Member,
    channel: ActivityChannel,
    criteriaName: string
  ): Promise<CriteriaFitRefreshSummary> {
    const { summary } = await this.matches.refresh(member.workspaceId, {
      origin: { cause: 'criteria', criteriaName },
      actorMemberId: member.id,
      channel,
    })
    return summary
  }

  /**
   * Les compteurs de critères (archivés compris, comptés à la lecture comme
   * l'aperçu) : une seule comparaison des annonces à tous les critères.
   */
  private async summaries(
    member: Member,
    rows: readonly SearchCriteriaRow[]
  ): Promise<SearchCriteriaSummary[]> {
    if (rows.length === 0) return []
    const rules = rows.map(fitRuleOf)
    const computed = await this.matches.compute(member.workspaceId, { rules })
    return rows.map((row, index) => {
      const counted = counting(computed, rules[index] as FitRule)
      return {
        ...toSearchCriteriaDto(row),
        listingCount: counted.kept.length,
        newCount: counted.kept.filter(
          c => !c.row.views.some(v => v.memberId === member.id)
        ).length,
        approximateCount: counted.approximate,
        fitCounts: counted.counts,
        fitChanges: null,
      }
    })
  }

  private async findRow(
    member: Member,
    id: string
  ): Promise<SearchCriteriaRow> {
    const row = await this.prisma.searchCriteria.findFirst({
      where: { id, workspaceId: member.workspaceId },
    })
    if (!row) throw new NotFoundException('Critère de recherche introuvable')
    return row
  }
}

/**
 * Les annonces d'un critère comptées sur ses statuts (actifs par défaut) :
 * par niveau, celles qu'il garde (dans, à confirmer, à la marge), celles à
 * confirmer à cause de la localisation, et des exemples hors « dans ».
 */
function counting(
  computed: readonly ComputedListing[],
  rule: FitRule
): {
  counts: CriteriaFitCounts
  kept: ComputedListing[]
  approximate: number
  examples: SearchCriteriaPreviewExample[]
} {
  const statuses = countedStatuses(rule)
  const counts = { ...EMPTY_FIT_COUNTS }
  const kept: ComputedListing[] = []
  const examples: SearchCriteriaPreviewExample[] = []
  let approximate = 0
  for (const c of computed) {
    if (!statuses.includes(c.row.status)) continue
    const fit = c.fits.get(rule.id)
    if (!fit) continue
    counts[fit.level] += 1
    if (fit.level !== 'out') kept.push(c)
    if (fit.level !== 'out' && fit.locationPending) approximate += 1
    if (fit.level !== 'in') {
      examples.push({
        listingId: c.row.id,
        title: c.row.title,
        level: fit.level,
        reasons: fit.reasons,
      })
    }
  }
  examples.sort((a, b) => fitRank(a.level) - fitRank(b.level))
  return {
    counts,
    kept,
    approximate,
    examples: examples.slice(0, PREVIEW_EXAMPLES_MAX),
  }
}

/** Lot 16 : les portails cochés en colonne JSON ; null (tous) : colonne vide. */
function portalsJson(
  portals: readonly string[] | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return portals && portals.length
    ? ([...portals] as unknown as Prisma.InputJsonValue)
    : Prisma.DbNull
}
