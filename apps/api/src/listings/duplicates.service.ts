import { Injectable, NotFoundException } from '@nestjs/common'
import { DUPLICATE_TOLERANCES, PointSchema } from '@apart/contracts'
import type {
  DuplicateCandidate,
  DuplicateProbe,
  ListingInput,
} from '@apart/contracts'
import { matchDuplicates, measurableZone } from '@apart/domain'
import type { DuplicateRow } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../geo/geo.service'
import type { ListingAreaRef } from '../geo/geo.service'
import type { Member } from '../generated/prisma'
import { num } from './listing.mapper'

/** Ce que la recherche de doublons lit de l'appelant : son espace (un membre, ou le système). */
export type WorkspaceScope = Pick<Member, 'workspaceId'>

/** Ce qu'une ligne d'annonce donne à la comparaison (lot 18 : liens et vendeur compris). */
export const DUPLICATE_ROW_SELECT = {
  id: true,
  title: true,
  status: true,
  price: true,
  surface: true,
  commune: true,
  url: true,
  addressRaw: true,
  addressNormalized: true,
  sellerType: true,
  sellerName: true,
  sellerReference: true,
  sellerReferenceKey: true,
  // ADR 0041 : les faits qui confirment ou contredisent un motif probable.
  rooms: true,
  floor: true,
  dpeClass: true,
  constructionYear: true,
  locationPrecision: true,
  links: { select: { normalizedUrl: true } },
  // Lot 27 : les autres agences qui vendent le même bien.
  sellers: {
    select: {
      sellerType: true,
      sellerName: true,
      sellerReference: true,
      sellerReferenceKey: true,
    },
  },
} as const

/** Une ligne Prisma (`DUPLICATE_ROW_SELECT`) vers la forme comparée par `domain`. */
export function duplicateRowOf(row: {
  id: string
  title: string
  status: DuplicateRow['status']
  price: { toString(): string } | number
  surface: Parameters<typeof num>[0]
  commune: string | null
  url: string | null
  addressRaw: string | null
  addressNormalized: string | null
  sellerType: NonNullable<DuplicateRow['sellerType']>
  sellerName: string | null
  sellerReference: string | null
  sellerReferenceKey: string | null
  links: { normalizedUrl: string }[]
  sellers?: NonNullable<DuplicateRow['otherSellers']>[number][]
  rooms?: number | null
  floor?: number | null
  dpeClass?: DuplicateRow['dpeClass']
  constructionYear?: number | null
  locationPrecision?: DuplicateRow['locationPrecision']
}): DuplicateRow {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    price: Number(row.price),
    surface: num(row.surface),
    commune: row.commune,
    url: row.url,
    addressRaw: row.addressRaw,
    addressNormalized: row.addressNormalized,
    links: row.links.map(l => l.normalizedUrl),
    sellerType: row.sellerType,
    sellerName: row.sellerName,
    sellerReference: row.sellerReference,
    sellerReferenceKey: row.sellerReferenceKey,
    otherSellers: row.sellers ?? [],
    rooms: row.rooms ?? null,
    floor: row.floor ?? null,
    dpeClass: row.dpeClass ?? null,
    constructionYear: row.constructionYear ?? null,
    locationPrecision: row.locationPrecision ?? null,
  }
}

/**
 * Cherche, dans l'espace du membre, les annonces qui ressemblent à une sonde :
 * même lien (comparé à tous les liens de chaque annonce, lot 18), même
 * agence et même référence, même adresse, même commune avec prix et surface
 * proches, ou voisinage à 50 m (PostGIS, par le module geo) ; deux lieux
 * éloignés (écart entre contours ou points, ADR 0041) écartent un doublon
 * probable. Quelques
 * centaines d'annonces au plus : la comparaison se fait en mémoire, par
 * `domain` (`matchDuplicates`).
 */
@Injectable()
export class DuplicatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService
  ) {}

  /** `area` : la zone retenue de l'annonce à créer, quand le placement l'a trouvée. */
  async find(
    member: WorkspaceScope,
    probe: DuplicateProbe,
    area: ListingAreaRef | null = null
  ): Promise<DuplicateCandidate[]> {
    const effective = probe.listingId
      ? await this.completeFromListing(member, probe)
      : probe
    const rows = await this.prisma.listing.findMany({
      // Lot 27 : un doublon fusionné ne se propose plus (ses liens et ses
      // agences sont sur la fiche qui l'a absorbé). Lot 30 : une fiche qu'un
      // membre a dite distincte de celle-ci non plus.
      where: {
        workspaceId: member.workspaceId,
        mergedIntoId: null,
        ...(probe.listingId
          ? {
              duplicatePairsA: {
                none: { verdict: 'distinct', listingBId: probe.listingId },
              },
              duplicatePairsB: {
                none: { verdict: 'distinct', listingAId: probe.listingId },
              },
            }
          : {}),
      },
      select: DUPLICATE_ROW_SELECT,
    })
    const distances = new Map<string, number>()
    if (effective.point) {
      const [longitude, latitude] = effective.point.coordinates
      const nearby = await this.geo.listingsWithinRadius(member.workspaceId, {
        longitude,
        latitude,
        radiusMeters: DUPLICATE_TOLERANCES.nearbyMeters,
      })
      for (const row of nearby) distances.set(row.id, row.distance_meters)
    }
    const zoneGaps = await this.zoneGaps(member, probe, effective, area)
    return matchDuplicates(
      effective,
      rows.map(duplicateRowOf),
      distances,
      zoneGaps
    )
  }

  /** Les doublons d'une annonce à créer : la sonde se lit dans l'entrée. */
  findForInput(
    member: WorkspaceScope,
    input: ListingInput,
    area: ListingAreaRef | null = null
  ): Promise<DuplicateCandidate[]> {
    return this.find(member, probeFromInput(input), area)
  }

  /**
   * ADR 0041 : l'écart entre le lieu de la sonde et celui de chaque annonce,
   * gardé seulement quand il se mesure des deux côtés (`measurableZone`).
   */
  private async zoneGaps(
    member: WorkspaceScope,
    probe: DuplicateProbe,
    effective: DuplicateProbe,
    area: ListingAreaRef | null
  ): Promise<Map<string, number>> {
    const gaps = new Map<string, number>()
    const from =
      probe.listingId && !probe.point
        ? { listingId: probe.listingId }
        : effective.point
          ? { point: effective.point, area }
          : null
    if (!from) return gaps
    const { originHasArea, rows } = await this.geo.listingZoneGaps(
      member.workspaceId,
      from
    )
    if (!measurableZone(effective.precision, originHasArea)) return gaps
    for (const row of rows) {
      if (measurableZone(row.precision, row.has_area)) {
        gaps.set(row.id, row.gap_meters)
      }
    }
    return gaps
  }

  /** Les champs manquants de la sonde se lisent dans l'annonce désignée, exclue des résultats. */
  private async completeFromListing(
    member: WorkspaceScope,
    probe: DuplicateProbe
  ): Promise<DuplicateProbe> {
    const row = await this.prisma.listing.findFirst({
      where: { id: probe.listingId, workspaceId: member.workspaceId },
    })
    if (!row) throw new NotFoundException('Annonce introuvable')
    const point = PointSchema.safeParse(row.locationGeoJson)
    return {
      ...probe,
      url: probe.url ?? row.url ?? undefined,
      address:
        probe.address ?? row.addressRaw ?? row.addressNormalized ?? undefined,
      commune: probe.commune ?? row.commune ?? undefined,
      price: probe.price ?? Number(row.price),
      surface: probe.surface ?? num(row.surface) ?? undefined,
      point: probe.point ?? (point.success ? point.data : undefined),
      // ADR 0041 : la précision vient avec le point de la fiche.
      ...(probe.point
        ? {}
        : row.locationPrecision
          ? { precision: row.locationPrecision }
          : {}),
      ...optional('rooms', probe.rooms ?? row.rooms),
      ...optional('floor', probe.floor ?? row.floor),
      ...optional('dpeClass', probe.dpeClass ?? row.dpeClass),
      ...optional(
        'constructionYear',
        probe.constructionYear ?? row.constructionYear
      ),
      ...(probe.sellerName || !row.sellerName
        ? {}
        : { sellerName: row.sellerName }),
      ...(probe.reference || !row.sellerReference
        ? {}
        : { reference: row.sellerReference }),
      ...(probe.sellerType || row.sellerType === 'unknown'
        ? {}
        : { sellerType: row.sellerType }),
    }
  }
}

/** `{ [key]: value }` si la valeur est connue, `{}` sinon (sonde sans clé à `undefined`). */
function optional<K extends string, V>(
  key: K,
  value: V | null | undefined
): Partial<Record<K, V>> {
  return value === null || value === undefined
    ? {}
    : ({ [key]: value } as Record<K, V>)
}

/** La sonde correspondant à une annonce à créer (lot 18 : vendeur et référence compris ; ADR 0041 : les faits qui contredisent). */
export function probeFromInput(input: ListingInput): DuplicateProbe {
  const sellerType =
    input.sellerType === 'unknown' ? undefined : input.sellerType
  return {
    ...(input.url ? { url: input.url } : {}),
    ...(input.location.addressRaw
      ? { address: input.location.addressRaw }
      : {}),
    ...(input.location.commune ? { commune: input.location.commune } : {}),
    price: input.price,
    ...(input.surface !== null ? { surface: input.surface } : {}),
    ...(input.location.point ? { point: input.location.point } : {}),
    ...(input.location.point && input.location.precision
      ? { precision: input.location.precision }
      : {}),
    ...optional('rooms', input.rooms),
    ...optional('floor', input.floor),
    ...optional('dpeClass', input.dpeClass),
    ...optional('constructionYear', input.constructionYear),
    ...(sellerType ? { sellerType } : {}),
    ...(input.sellerName ? { sellerName: input.sellerName } : {}),
    ...(input.sellerReference ? { reference: input.sellerReference } : {}),
  }
}
