import { Injectable, NotFoundException } from '@nestjs/common'
import { DUPLICATE_TOLERANCES, PointSchema } from '@apart/contracts'
import type {
  DuplicateCandidate,
  DuplicateProbe,
  ListingInput,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../geo/geo.service'
import type { Member } from '../generated/prisma'
import { matchDuplicates } from './duplicates'
import type { DuplicateRow } from './duplicates'
import { num } from './listing.mapper'

/**
 * Cherche, dans l'espace du membre, les annonces qui ressemblent à une sonde :
 * même lien, même adresse, même commune avec prix et surface proches, ou
 * voisinage à 50 m (PostGIS, par le module geo). Quelques centaines
 * d'annonces au plus : la comparaison se fait en mémoire.
 */
/** Ce que la recherche de doublons lit de l'appelant : son espace (un membre, ou le système). */
export type WorkspaceScope = Pick<Member, 'workspaceId'>

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
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        surface: true,
        commune: true,
        url: true,
        addressRaw: true,
        addressNormalized: true,
      },
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
    const comparable: DuplicateRow[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      status: row.status,
      price: Number(row.price),
      surface: num(row.surface),
      commune: row.commune,
      url: row.url,
      addressRaw: row.addressRaw,
      addressNormalized: row.addressNormalized,
    }))
    return matchDuplicates(effective, comparable, distances)
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

/** La sonde correspondant à une annonce à créer. */
export function probeFromInput(input: ListingInput): DuplicateProbe {
  return {
    ...(input.url ? { url: input.url } : {}),
    ...(input.location.addressRaw
      ? { address: input.location.addressRaw }
      : {}),
    ...(input.location.commune ? { commune: input.location.commune } : {}),
    price: input.price,
    ...(input.surface !== null ? { surface: input.surface } : {}),
    ...(input.location.point ? { point: input.location.point } : {}),
  }
}
