import { Injectable, NotFoundException } from '@nestjs/common'
import { ListingInputSchema, PointSchema } from '@apart/contracts'
import type {
  LocationPrecision,
  Point,
  SimilarListingsResult,
  SimilarProbeFields,
} from '@apart/contracts'
import { rankSimilarListings, similarSummaryText } from '@apart/domain'
import type { SimilarProbe, SimilarRow } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import { PrismaService } from '../prisma/prisma.service'
import { DUPLICATE_ROW_SELECT, duplicateRowOf } from './duplicates.service'
import type { WorkspaceScope } from './duplicates.service'

/** Ce que la recherche lit en plus des doublons : les caractéristiques comparées. */
const SIMILAR_ROW_SELECT = {
  ...DUPLICATE_ROW_SELECT,
  rooms: true,
  floor: true,
  dpeClass: true,
  constructionYear: true,
  district: true,
  updatedAt: true,
  locationPrecision: true,
} as const

/**
 * Jusqu'où une distance compte dans la ressemblance : au-delà, deux annonces
 * ne sont plus « proches » (la note de distance est déjà nulle à 1 km).
 */
const DISTANCE_RADIUS_METERS = 3000

/** Un repère « à la commune » est son centre : sa distance ne dit rien du bien. */
function isPrecise(precision: LocationPrecision | null | undefined): boolean {
  return (
    precision !== null && precision !== undefined && precision !== 'commune'
  )
}

export interface SimilarRequest {
  listingId?: string | undefined
  draftId?: string | undefined
  /** Des caractéristiques lues sur une page (MCP) ; elles complètent l'annonce désignée. */
  fields?: SimilarProbeFields | undefined
  q?: string | undefined
  limit?: number | undefined
}

/**
 * Lot 27 (ADR 0037) : « Déjà vue ». Les annonces de l'espace, écartées
 * comprises (une annonce déjà vue a souvent été écartée), classées par
 * ressemblance avec une annonce enregistrée, un brouillon « À valider » ou
 * des caractéristiques lues. Les doublons déjà fusionnés ne sont pas
 * proposés. Quelques centaines d'annonces au plus : la comparaison se fait en
 * mémoire, par `domain` (`rankSimilarListings`) ; seule la distance vient de
 * PostGIS (module geo).
 */
@Injectable()
export class SimilarListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService
  ) {}

  async find(
    member: WorkspaceScope,
    request: SimilarRequest
  ): Promise<SimilarListingsResult> {
    const { probe, point } = await this.probe(member, request)
    const rows = await this.prisma.listing.findMany({
      where: { workspaceId: member.workspaceId, mergedIntoId: null },
      select: SIMILAR_ROW_SELECT,
    })
    const precise = new Set(
      rows.filter(row => isPrecise(row.locationPrecision)).map(row => row.id)
    )
    const distances = new Map<string, number>()
    if (point) {
      const [longitude, latitude] = point.coordinates
      const nearby = await this.geo.listingsWithinRadius(member.workspaceId, {
        longitude,
        latitude,
        radiusMeters: DISTANCE_RADIUS_METERS,
      })
      for (const row of nearby) {
        if (precise.has(row.id)) distances.set(row.id, row.distance_meters)
      }
    }
    const similarRows: SimilarRow[] = rows.map(row => ({
      ...duplicateRowOf(row),
      rooms: row.rooms,
      floor: row.floor,
      dpeClass: row.dpeClass,
      constructionYear: row.constructionYear,
      district: row.district,
      updatedAt: row.updatedAt.toISOString(),
    }))
    const ranked = rankSimilarListings(probe, similarRows, distances, {
      q: request.q,
      ...(request.limit !== undefined ? { limit: request.limit } : {}),
    })
    return {
      items: ranked.items,
      compared: ranked.compared,
      summary: similarSummaryText(ranked.items, request.q),
    }
  }

  /** Ce qu'on compare, et son repère s'il est assez précis pour mesurer une distance. */
  private async probe(
    member: WorkspaceScope,
    request: SimilarRequest
  ): Promise<{ probe: SimilarProbe; point: Point | null }> {
    const fields = request.fields ?? {}
    if (request.listingId) {
      const row = await this.prisma.listing.findFirst({
        where: { id: request.listingId, workspaceId: member.workspaceId },
        select: { ...SIMILAR_ROW_SELECT, locationGeoJson: true },
      })
      if (!row) throw new NotFoundException('Annonce introuvable')
      const base = duplicateRowOf(row)
      const point = PointSchema.safeParse(row.locationGeoJson)
      return {
        probe: {
          listingId: row.id,
          url: fields.url ?? base.url,
          links: base.links,
          address: fields.address ?? base.addressRaw ?? base.addressNormalized,
          commune: fields.commune ?? base.commune,
          district: fields.district ?? row.district,
          price: fields.price ?? base.price,
          surface: fields.surface ?? base.surface,
          rooms: fields.rooms ?? row.rooms,
          floor: fields.floor ?? row.floor,
          dpeClass: fields.dpeClass ?? row.dpeClass,
          constructionYear: fields.constructionYear ?? row.constructionYear,
          sellerType: fields.sellerType ?? base.sellerType,
          sellerName: fields.sellerName ?? base.sellerName,
          reference: fields.reference ?? base.sellerReference,
          otherSellers: base.otherSellers,
        },
        point:
          point.success && isPrecise(row.locationPrecision) ? point.data : null,
      }
    }
    if (request.draftId) {
      const draft = await this.prisma.listingDraft.findFirst({
        where: { id: request.draftId, workspaceId: member.workspaceId },
        select: { input: true, url: true },
      })
      if (!draft) throw new NotFoundException('Brouillon introuvable')
      const parsed = ListingInputSchema.safeParse(draft.input)
      if (!parsed.success) return { probe: { url: draft.url }, point: null }
      const input = parsed.data
      const location = input.location
      return {
        probe: {
          url: draft.url ?? input.url,
          address: location.addressRaw,
          commune: location.commune,
          district: location.district,
          price: input.price > 0 ? input.price : null,
          surface: input.surface,
          rooms: input.rooms,
          floor: input.floor,
          dpeClass: input.dpeClass,
          constructionYear: input.constructionYear,
          sellerType: input.sellerType,
          sellerName: input.sellerName,
          reference: input.sellerReference,
        },
        point:
          location.point && isPrecise(location.precision)
            ? location.point
            : null,
      }
    }
    return {
      probe: {
        url: fields.url,
        address: fields.address,
        commune: fields.commune,
        district: fields.district,
        price: fields.price,
        surface: fields.surface,
        rooms: fields.rooms,
        floor: fields.floor,
        dpeClass: fields.dpeClass,
        constructionYear: fields.constructionYear,
        sellerType: fields.sellerType,
        sellerName: fields.sellerName,
        reference: fields.reference,
      },
      point: null,
    }
  }
}
