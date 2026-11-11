import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ListingCoverSchema } from '@apart/contracts'
import type { ListingCover, ListingCovers } from '@apart/contracts'
import { coverPhotoOf } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import type { Member } from '../generated/prisma'
import {
  PHOTO_STORAGE,
  PhotoStorageUnavailableException,
} from './photo-storage'
import type { PhotoStorage } from './photo-storage'
import { VISITS_CONFIG } from './visits.service'
import type { VisitsConfig } from './visits.service'

/**
 * Lot 25 (ADR 0035) : la photo de couverture d'une annonce. La règle (la
 * choisie, sinon la première photo prête de la première visite) est dans
 * `domain` (`coverPhotoOf`). Seules les vignettes sont signées, en un seul
 * appel au stockage pour toute une liste, à la même durée courte que les
 * photos des visites. Jamais une image de portail ; ni le MCP ni l'export
 * ne passent par ici.
 */
@Injectable()
export class ListingCoversService {
  private readonly logger = new Logger(ListingCoversService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
    @Inject(VISITS_CONFIG) private readonly config: VisitsConfig
  ) {}

  /** Les couvertures des annonces de l'espace parmi `ids` (celles qui en ont une). */
  async covers(member: Member, ids: readonly string[]): Promise<ListingCovers> {
    const wanted = [...new Set(ids)]
    if (wanted.length === 0) return { covers: [] }
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: wanted }, workspaceId: member.workspaceId },
      select: { id: true, coverPhotoId: true },
    })
    if (listings.length === 0) return { covers: [] }
    const visits = await this.prisma.visit.findMany({
      where: {
        listingId: { in: listings.map(l => l.id) },
        photos: { some: { status: 'ready' } },
      },
      select: {
        id: true,
        listingId: true,
        visitedAt: true,
        photos: {
          where: { status: 'ready', workspaceId: member.workspaceId },
          select: {
            id: true,
            visitId: true,
            status: true,
            createdAt: true,
            thumbnailPath: true,
          },
        },
      },
    })

    const chosen = listings.flatMap(listing => {
      const own = visits.filter(v => v.listingId === listing.id)
      const photos = own.flatMap(v => v.photos)
      const choice = coverPhotoOf(
        own.map(v => ({ id: v.id, visitedAt: v.visitedAt.toISOString() })),
        photos.map(p => ({
          id: p.id,
          visitId: p.visitId,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
        listing.coverPhotoId
      )
      const photo = choice ? photos.find(p => p.id === choice.photoId) : null
      return choice && photo
        ? [{ listingId: listing.id, choice, path: photo.thumbnailPath }]
        : []
    })
    if (chosen.length === 0) return { covers: [] }

    const ttl = this.config.signedUrlTtlSeconds
    let urls: Array<string | null> = chosen.map(() => null)
    let expiresAt: string | null = null
    try {
      urls = await this.storage.createSignedUrls(
        chosen.map(c => c.path),
        ttl
      )
      expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    } catch (error) {
      // Le stockage en panne n'empêche pas la liste de se lire : pas d'image.
      if (!(error instanceof PhotoStorageUnavailableException)) throw error
      this.logger.warn(error.message)
    }
    return {
      covers: chosen.map((c, index) =>
        ListingCoverSchema.parse({
          listingId: c.listingId,
          photoId: c.choice.photoId,
          visitId: c.choice.visitId,
          thumbnailUrl: urls[index] ?? null,
          urlExpiresAt: urls[index] ? expiresAt : null,
          chosen: c.choice.chosen,
        })
      ),
    }
  }

  /**
   * Choisit la couverture (une photo prête d'une visite de l'annonce) ou
   * revient à la première (null). Journalisé ; la date de modification de
   * la fiche ne bouge pas (une section en cours d'édition n'est pas mise en
   * conflit par le choix d'une photo).
   */
  async choose(
    member: Member,
    listingId: string,
    photoId: string | null
  ): Promise<ListingCover | null> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true, coverPhotoId: true, updatedAt: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    if (photoId !== null) {
      const photo = await this.prisma.visitPhoto.findFirst({
        where: { id: photoId, workspaceId: member.workspaceId },
        select: { status: true, visit: { select: { listingId: true } } },
      })
      if (!photo || photo.visit.listingId !== listingId) {
        throw new NotFoundException(
          'Photo introuvable parmi les photos de visite de cette annonce'
        )
      }
      if (photo.status !== 'ready') {
        throw new BadRequestException(
          'Cette photo n’est pas encore envoyée : attends la fin de l’envoi pour la choisir.'
        )
      }
    }
    if (listing.coverPhotoId !== photoId) {
      await this.prisma.$transaction(async tx => {
        await tx.listing.update({
          where: { id: listingId },
          data: { coverPhotoId: photoId, updatedAt: listing.updatedAt },
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId,
            actorMemberId: member.id,
            channel: 'web',
            action: 'visit.cover_chosen',
            before: { photoId: listing.coverPhotoId },
            after: { photoId },
          },
          tx
        )
      })
    }
    const { covers } = await this.covers(member, [listingId])
    return covers[0] ?? null
  }
}
