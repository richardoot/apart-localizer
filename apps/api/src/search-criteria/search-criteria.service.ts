import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { CriteriaFiltersSchema } from '@apart/contracts'
import type {
  ActivityChannel,
  CriteriaFilters,
  Perimeter,
  PerimeterInput,
  SearchCriteriaInput,
  SearchCriteriaPreview,
  SearchCriteriaPreviewRequest,
  SearchCriteriaSummary,
  SearchCriteriaUpdate,
} from '@apart/contracts'
import { ActivityService } from '../activity/activity.service'
import { GeoService } from '../geo/geo.service'
import type { CriteriaGeoDraft } from '../geo/geo.service'
import { CriteriaMatchService } from '../listings/criteria-match.service'
import { ListingsService } from '../listings/listings.service'
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

/** La partie géographique d'un périmètre résolu, pour le prédicat PostGIS. */
export function draftOf(
  perimeter: Perimeter | null,
  filters: CriteriaFilters
): CriteriaGeoDraft & { filters: CriteriaFilters } {
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
    filters,
  }
}

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
 * G6) : création, lecture avec compteurs, mise à jour avec garde-fou,
 * archivage (actif = faux), suppression (REST seulement). Un périmètre
 * isochrone est calculé par la Géoplateforme et figé en polygone ; un
 * polygone dessiné est validé par PostGIS. Chaque écriture est journalisée
 * et resynchronise la table des entrées (alertes).
 */
@Injectable()
export class SearchCriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
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
    const summaries: SearchCriteriaSummary[] = []
    for (const row of rows) summaries.push(await this.summary(member, row))
    return summaries
  }

  async get(member: Member, id: string): Promise<SearchCriteriaSummary> {
    return this.summary(member, await this.findRow(member, id))
  }

  /** Aperçu sans enregistrer : périmètre résolu (isochrone calculée) et annonces retenues. */
  async preview(
    member: Member,
    request: SearchCriteriaPreviewRequest
  ): Promise<SearchCriteriaPreview> {
    const perimeter = await this.resolvePerimeter(request.perimeter)
    const { items, approximate } = await this.listings.listingsForCriteria(
      member,
      { draft: draftOf(perimeter, request.filters) }
    )
    return {
      perimeter,
      listingCount: items.length,
      approximateCount: items.filter(i => approximate.has(i.listing.id)).length,
      listingIds: items.map(i => i.listing.id),
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
            perimeterType: perimeter?.type ?? null,
            isochrone:
              perimeter?.type === 'isochrone' ? perimeter.params : null,
          },
        },
        tx
      )
      return created
    })
    await this.sync(member, row.id, input.active)
    return this.get(member, row.id)
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
        `Le critère a changé depuis votre lecture (modifié le ${updatedAt}) : relisez-le avant de le modifier`
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
    await this.sync(member, id, active)
    return this.get(member, id)
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
          `Polygone invalide (${check.reason}) : redessinez-le sans que ses côtés se croisent.`
        )
      }
      if (check.areaSquareMeters < POLYGON_MIN_M2) {
        throw new BadRequestException('Polygone trop petit (moins de 100 m²).')
      }
      if (check.areaSquareMeters > POLYGON_MAX_M2) {
        throw new BadRequestException(
          'Polygone trop grand (plus de 1 000 km²) : restez sur la métropole.'
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
            `Géocodeur de la Géoplateforme indisponible (${error instanceof Error ? error.message : String(error)}) : réessayez, ou cliquez le point de départ sur la carte.`
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

  private async sync(
    member: Member,
    id: string,
    active: boolean
  ): Promise<void> {
    if (!active) {
      await this.matches.syncCriteria(id, [])
      return
    }
    const { items, approximate } = await this.listings.listingsForCriteria(
      member,
      { criteriaId: id }
    )
    await this.matches.syncCriteria(
      id,
      items.map(i => ({
        id: i.listing.id,
        approximate: approximate.has(i.listing.id),
      }))
    )
  }

  private async summary(
    member: Member,
    row: SearchCriteriaRow
  ): Promise<SearchCriteriaSummary> {
    const { items, approximate } = await this.listings.listingsForCriteria(
      member,
      { criteriaId: row.id }
    )
    return {
      ...toSearchCriteriaDto(row),
      listingCount: items.length,
      newCount: items.filter(i => i.isNewForMe).length,
      approximateCount: items.filter(i => approximate.has(i.listing.id)).length,
    }
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
