import { Injectable, NotFoundException } from '@nestjs/common'
import { DUPLICATE_TOLERANCES, PointSchema } from '@apart/contracts'
import type {
  DuplicateCandidate,
  DuplicateProbe,
  ListingInput,
} from '@apart/contracts'
import { matchDuplicates } from '@apart/domain'
import type { DuplicateRow } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../geo/geo.service'
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
  links: { select: { normalizedUrl: true } },
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
  }
}

/**
 * Cherche, dans l'espace du membre, les annonces qui ressemblent à une sonde :
 * même lien (comparé à tous les liens de chaque annonce, lot 18), même
 * agence et même référence, même adresse, même commune avec prix et surface
 * proches, ou voisinage à 50 m (PostGIS, par le module geo). Quelques
 * centaines d'annonces au plus : la comparaison se fait en mémoire, par
 * `domain` (`matchDuplicates`).
 */
@Injectable()
export class DuplicatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService
  ) {}

  async find(
    member: WorkspaceScope,
    probe: DuplicateProbe
  ): Promise<DuplicateCandidate[]> {
    const effective = probe.listingId
      ? await this.completeFromListing(member, probe)
      : probe
    const rows = await this.prisma.listing.findMany({
      where: { workspaceId: member.workspaceId },
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
    return matchDuplicates(effective, rows.map(duplicateRowOf), distances)
  }

  /** Les doublons d'une annonce à créer : la sonde se lit dans l'entrée. */
  findForInput(
    member: WorkspaceScope,
    input: ListingInput
  ): Promise<DuplicateCandidate[]> {
    return this.find(member, probeFromInput(input))
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
    }
  }
}

/** La sonde correspondant à une annonce à créer (lot 18 : vendeur et référence compris). */
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
    ...(sellerType ? { sellerType } : {}),
    ...(input.sellerName ? { sellerName: input.sellerName } : {}),
    ...(input.sellerReference ? { reference: input.sellerReference } : {}),
  }
}
