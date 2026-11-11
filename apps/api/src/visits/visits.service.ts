import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  VISIT_PHOTO_MAX_BYTES,
  VISIT_PHOTO_MIME_TYPES,
  VISIT_PHOTOS_MAX,
  VISIT_THUMBNAIL_MAX_BYTES,
  VisitSchema,
} from '@apart/contracts'
import type {
  ActivityChannel,
  ListingStatus,
  Visit as VisitDto,
  VisitInput,
  VisitPhoto as VisitPhotoDto,
  VisitPhotoMimeType,
  VisitPhotoUpload,
  VisitPhotoUploadRequest,
  VisitStatus,
  VisitUpdate,
  VisitWriteResult,
} from '@apart/contracts'
import {
  appendVisitRemark,
  formatActivityDate,
  visitEditRefusal,
  visitRemarkLine,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { toTaskDto } from '../listings/listing.mapper'
import { PrismaService } from '../prisma/prisma.service'
import type { Member, Prisma, Visit, VisitPhoto } from '../generated/prisma'
import {
  PHOTO_STORAGE,
  PhotoStorageUnavailableException,
} from './photo-storage'
import type { PhotoStorage } from './photo-storage'

export const VISITS_CONFIG = Symbol('VISITS_CONFIG')

export interface VisitsConfig {
  /** Durée de validité des URL signées de lecture, en secondes. */
  signedUrlTtlSeconds: number
}

export function visitsConfig(env: NodeJS.ProcessEnv): VisitsConfig {
  const ttl = Number(env.STORAGE_SIGNED_URL_TTL_SECONDS)
  return {
    signedUrlTtlSeconds:
      Number.isInteger(ttl) && ttl >= 30 && ttl <= 3600 ? ttl : 600,
  }
}

/** Une envoi abandonné (photo annoncée, jamais terminée) est nettoyé au bout de deux heures. */
const ABANDONED_UPLOAD_MS = 2 * 3600 * 1000

const EXTENSIONS: Record<VisitPhotoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type VisitRow = Visit & { photos: VisitPhoto[] }

/**
 * Le statut que l'annonce devrait prendre après une visite, ou null si le
 * statut courant convient : « visité » après une visite faite, « à visiter »
 * quand une visite est planifiée. Proposé, jamais appliqué d'office.
 */
export function suggestedStatusAfterVisit(
  current: ListingStatus,
  visit: VisitStatus
): ListingStatus | null {
  if (visit === 'done') {
    return current === 'to_study' || current === 'to_visit' ? 'visited' : null
  }
  return current === 'to_study' ? 'to_visit' : null
}

/** Le libellé de la tâche « préparer la visite ». */
export function prepTaskLabel(visitedAt: string): string {
  return `Préparer la visite du ${formatActivityDate(visitedAt)} : documents à demander (PV d'AG, charges, taxe foncière, DPE), questions, mètre`
}

/** Le chemin d'une photo dans le bucket : un dossier par espace, annonce et visite. */
export function photoPaths(
  workspaceId: string,
  listingId: string,
  visitId: string,
  photoId: string,
  contentType: VisitPhotoMimeType,
  thumbnailType: VisitPhotoMimeType
): { photo: string; thumbnail: string } {
  const base = `${workspaceId}/${listingId}/${visitId}/${photoId}`
  return {
    photo: `${base}.${EXTENSIONS[contentType]}`,
    thumbnail: `${base}-thumb.${EXTENSIONS[thumbnailType]}`,
  }
}

function isPhotoType(value: string | null): value is VisitPhotoMimeType {
  return (VISIT_PHOTO_MIME_TYPES as readonly string[]).includes(value ?? '')
}

/**
 * Les visites (besoin S4) : CRUD, tâche de préparation, statut proposé ;
 * les photos passent par Supabase Storage (URL d'envoi signée, le
 * navigateur téléverse directement), sont vérifiées à la fin de l'envoi
 * (présence, taille, type) et ne se lisent que par des URL signées à durée
 * courte. Une photo ne se supprime que par son auteur, et jamais par le MCP.
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
    @Inject(VISITS_CONFIG) private readonly config: VisitsConfig
  ) {}

  async list(
    member: Member,
    listingId: string,
    options: { photos?: boolean } = {}
  ): Promise<VisitDto[]> {
    await this.listingOf(member, listingId)
    const rows = await this.prisma.visit.findMany({
      where: { listingId },
      include: {
        photos: { where: { status: 'ready' }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { visitedAt: 'desc' },
    })
    return this.toDtos(rows, options.photos ?? true)
  }

  /** Les visites de plusieurs annonces de l'espace, sans les photos (export). */
  async listWithoutPhotos(
    member: Member,
    listingIds: readonly string[]
  ): Promise<VisitDto[]> {
    const rows = await this.prisma.visit.findMany({
      where: {
        listingId: { in: [...listingIds] },
        listing: { workspaceId: member.workspaceId },
      },
      include: { photos: { where: { status: 'ready' } } },
      orderBy: { visitedAt: 'desc' },
    })
    return this.toDtos(rows, false)
  }

  async get(
    member: Member,
    listingId: string,
    visitId: string
  ): Promise<VisitDto> {
    const row = await this.visitOf(member, listingId, visitId)
    const [dto] = await this.toDtos([row], true)
    return dto as VisitDto
  }

  async create(
    member: Member,
    listingId: string,
    input: VisitInput,
    channel: ActivityChannel = 'web'
  ): Promise<VisitWriteResult> {
    const listing = await this.listingOf(member, listingId)
    await this.checkParticipants(member, input.participantIds)
    const wantsTask = input.createPrepTask && input.status === 'planned'
    const { visit, task } = await this.prisma.$transaction(async tx => {
      let task = null
      if (wantsTask) {
        const last = await tx.task.findFirst({
          where: { listingId },
          orderBy: { position: 'desc' },
          select: { position: true },
        })
        task = await tx.task.create({
          data: {
            listingId,
            label: prepTaskLabel(input.visitedAt),
            origin: 'visit',
            position: (last?.position ?? -1) + 1,
          },
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId,
            actorMemberId: member.id,
            channel,
            action: 'task.created',
            after: {
              taskId: task.id,
              label: task.label,
              origin: task.origin,
              assigneeId: null,
            },
          },
          tx
        )
      }
      const visit = await tx.visit.create({
        data: {
          listingId,
          visitedAt: new Date(input.visitedAt),
          status: input.status,
          participantIds: input.participantIds,
          report: input.report,
          pros: input.pros,
          cons: input.cons,
          rating: input.rating,
          prepTaskId: task?.id ?? null,
          createdById: member.id,
        },
        include: { photos: true },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'visit.created',
          after: {
            visitId: visit.id,
            visitedAt: input.visitedAt,
            status: input.status,
            participantIds: input.participantIds,
            rating: input.rating,
            report: input.report,
            pros: input.pros,
            cons: input.cons,
          },
        },
        tx
      )
      return { visit, task }
    })
    const [dto] = await this.toDtos([visit], false)
    return {
      visit: dto as VisitDto,
      createdTask: task ? toTaskDto(task) : null,
      currentStatus: listing.status,
      suggestedStatus: suggestedStatusAfterVisit(listing.status, input.status),
    }
  }

  async update(
    member: Member,
    listingId: string,
    visitId: string,
    update: VisitUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<VisitWriteResult> {
    const listing = await this.listingOf(member, listingId)
    const current = await this.visitOf(member, listingId, visitId)
    if (
      update.expectedUpdatedAt !== undefined &&
      Date.parse(update.expectedUpdatedAt) !== current.updatedAt.getTime()
    ) {
      throw new ConflictException(
        `La visite a changé depuis ta lecture (modifiée le ${current.updatedAt.toISOString()}) : relis-la`
      )
    }
    // Lot 24 : une visite faite ne se corrige que par son auteur ou un participant.
    const refusal = visitEditRefusal(current, member.id)
    if (refusal) throw new ForbiddenException(refusal)
    if (update.participantIds) {
      await this.checkParticipants(member, update.participantIds)
    }
    const { expectedUpdatedAt: _guard, remark, ...changes } = update
    const remarkLine = remark ? visitRemarkLine(remark.text, remark.at) : null
    const data: Prisma.VisitUpdateInput = {
      ...(changes.visitedAt !== undefined
        ? { visitedAt: new Date(changes.visitedAt) }
        : {}),
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.participantIds !== undefined
        ? { participantIds: changes.participantIds }
        : {}),
      ...(changes.report !== undefined ? { report: changes.report } : {}),
      ...(changes.pros !== undefined ? { pros: changes.pros } : {}),
      ...(changes.cons !== undefined ? { cons: changes.cons } : {}),
      ...(changes.rating !== undefined ? { rating: changes.rating } : {}),
    }
    const saved = await this.prisma.$transaction(async tx => {
      if (remarkLine) {
        // Lot 24 : la remarque s'ajoute au compte rendu tel qu'il est en base
        // (verrou de la ligne), sans garde-fou : deux membres peuvent en
        // ajouter en même temps ; renvoyée, elle n'est pas doublée.
        const [locked] = await tx.$queryRaw<{ report: string | null }[]>`
          SELECT report FROM "app"."visits" WHERE id = ${visitId} FOR UPDATE`
        data.report = appendVisitRemark(
          changes.report !== undefined
            ? changes.report
            : (locked?.report ?? null),
          remarkLine
        )
      }
      const visit = await tx.visit.update({
        where: { id: visitId },
        data,
        include: {
          photos: {
            where: { status: 'ready' },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'visit.updated',
          before: {
            visitId,
            visitedAt: current.visitedAt.toISOString(),
            status: current.status,
            participantIds: current.participantIds,
            report: current.report,
            pros: current.pros,
            cons: current.cons,
            rating: current.rating,
          },
          after: {
            visitId,
            ...changes,
            ...(remarkLine ? { remark: remarkLine } : {}),
          },
        },
        tx
      )
      return visit
    })
    const [dto] = await this.toDtos([saved], true)
    const becameDone = current.status !== 'done' && saved.status === 'done'
    return {
      visit: dto as VisitDto,
      createdTask: null,
      currentStatus: listing.status,
      suggestedStatus:
        becameDone || changes.status !== undefined
          ? suggestedStatusAfterVisit(listing.status, saved.status)
          : null,
    }
  }

  /**
   * Suppression d'une visite (REST seulement) : refusée tant qu'elle porte
   * des photos d'un autre membre (une photo ne se supprime que par son
   * auteur) ; les photos du membre partent du stockage avec elle.
   */
  async remove(
    member: Member,
    listingId: string,
    visitId: string
  ): Promise<void> {
    await this.listingOf(member, listingId)
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, listingId },
      include: { photos: true },
    })
    if (!visit) throw new NotFoundException('Visite introuvable')
    const others = visit.photos.filter(
      p => p.status === 'ready' && p.uploadedById !== member.id
    )
    if (others.length > 0) {
      throw new ConflictException(
        `La visite porte ${others.length > 1 ? `${others.length} photos` : 'une photo'} d'un autre membre : seul son auteur peut ${others.length > 1 ? 'les' : 'la'} supprimer.`
      )
    }
    await this.storage.remove(
      visit.photos.flatMap(p => [p.storagePath, p.thumbnailPath])
    )
    await this.prisma.$transaction(async tx => {
      await tx.visit.delete({ where: { id: visitId } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'visit.deleted',
          before: {
            visitId,
            visitedAt: visit.visitedAt.toISOString(),
            status: visit.status,
            photoCount: visit.photos.length,
          },
        },
        tx
      )
    })
  }

  /**
   * Annonce une photo : la ligne (en attente) et deux URL d'envoi signées
   * (photo et vignette). Le navigateur téléverse, puis appelle
   * `completePhoto`.
   */
  async requestPhotoUpload(
    member: Member,
    listingId: string,
    visitId: string,
    request: VisitPhotoUploadRequest
  ): Promise<VisitPhotoUpload> {
    const visit = await this.visitOf(member, listingId, visitId)
    await this.cleanAbandoned(visitId)
    const count = await this.prisma.visitPhoto.count({
      where: { visitId: visit.id },
    })
    if (count >= VISIT_PHOTOS_MAX) {
      throw new BadRequestException(
        `Une visite garde ${VISIT_PHOTOS_MAX} photos au plus.`
      )
    }
    const id = randomUUID()
    const paths = photoPaths(
      member.workspaceId,
      listingId,
      visitId,
      id,
      request.contentType,
      request.thumbnail.contentType
    )
    const row = await this.prisma.visitPhoto.create({
      data: {
        id,
        visitId,
        workspaceId: member.workspaceId,
        storagePath: paths.photo,
        thumbnailPath: paths.thumbnail,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes,
        thumbnailContentType: request.thumbnail.contentType,
        thumbnailSizeBytes: request.thumbnail.sizeBytes,
        width: request.width,
        height: request.height,
        caption: request.caption,
        uploadedById: member.id,
      },
    })
    try {
      const [upload, thumbnailUpload] = await Promise.all([
        this.storage.createSignedUploadUrl(paths.photo),
        this.storage.createSignedUploadUrl(paths.thumbnail),
      ])
      return {
        photo: this.toPhotoDto(row, null, null, null),
        upload: {
          ...upload,
          contentType: request.contentType,
          maxBytes: VISIT_PHOTO_MAX_BYTES,
        },
        thumbnailUpload: {
          ...thumbnailUpload,
          contentType: request.thumbnail.contentType,
          maxBytes: VISIT_THUMBNAIL_MAX_BYTES,
        },
      }
    } catch (error) {
      await this.prisma.visitPhoto.delete({ where: { id } })
      throw error
    }
  }

  /** Fin de l'envoi : la photo et sa vignette doivent être dans le bucket, aux bonnes taille et type. */
  async completePhoto(
    member: Member,
    listingId: string,
    visitId: string,
    photoId: string
  ): Promise<VisitPhotoDto> {
    const photo = await this.photoOf(member, listingId, visitId, photoId)
    if (photo.uploadedById !== member.id) {
      throw new ForbiddenException(
        "Seul le membre qui envoie la photo peut en terminer l'envoi."
      )
    }
    if (photo.status === 'ready') return this.withUrls(photo)
    const [main, thumb] = await Promise.all([
      this.storage.info(photo.storagePath),
      this.storage.info(photo.thumbnailPath),
    ])
    if (!main || !thumb) {
      throw new ConflictException(
        "La photo ou sa vignette n'est pas encore arrivée dans le stockage : termine l'envoi puis réessaie."
      )
    }
    const problem =
      (main.size ?? 0) > VISIT_PHOTO_MAX_BYTES
        ? 'la photo dépasse la taille permise'
        : (thumb.size ?? 0) > VISIT_THUMBNAIL_MAX_BYTES
          ? 'la vignette dépasse la taille permise'
          : main.contentType !== null && !isPhotoType(main.contentType)
            ? "la photo n'est pas une image jpeg, png ou webp"
            : thumb.contentType !== null && !isPhotoType(thumb.contentType)
              ? "la vignette n'est pas une image jpeg, png ou webp"
              : null
    if (problem) {
      await this.storage.remove([photo.storagePath, photo.thumbnailPath])
      await this.prisma.visitPhoto.delete({ where: { id: photo.id } })
      throw new BadRequestException(`Photo refusée : ${problem}.`)
    }
    const ready = await this.prisma.$transaction(async tx => {
      const saved = await tx.visitPhoto.update({
        where: { id: photo.id },
        data: {
          status: 'ready',
          readyAt: new Date(),
          sizeBytes: main.size ?? photo.sizeBytes,
          thumbnailSizeBytes: thumb.size ?? photo.thumbnailSizeBytes,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'visit.photo_added',
          after: { visitId, photoId, sizeBytes: saved.sizeBytes },
        },
        tx
      )
      return saved
    })
    return this.withUrls(ready)
  }

  /** Suppression d'une photo par son auteur (REST seulement). */
  async removePhoto(
    member: Member,
    listingId: string,
    visitId: string,
    photoId: string
  ): Promise<void> {
    const photo = await this.photoOf(member, listingId, visitId, photoId)
    if (photo.uploadedById !== member.id) {
      throw new ForbiddenException(
        "Seul l'auteur d'une photo peut la supprimer."
      )
    }
    await this.storage.remove([photo.storagePath, photo.thumbnailPath])
    await this.prisma.$transaction(async tx => {
      await tx.visitPhoto.delete({ where: { id: photo.id } })
      if (photo.status === 'ready') {
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId,
            actorMemberId: member.id,
            channel: 'web',
            action: 'visit.photo_deleted',
            before: { visitId, photoId },
          },
          tx
        )
      }
    })
  }

  private async cleanAbandoned(visitId: string): Promise<void> {
    const stale = await this.prisma.visitPhoto.findMany({
      where: {
        visitId,
        status: 'pending',
        createdAt: { lt: new Date(Date.now() - ABANDONED_UPLOAD_MS) },
      },
    })
    if (stale.length === 0) return
    try {
      await this.storage.remove(
        stale.flatMap(p => [p.storagePath, p.thumbnailPath])
      )
    } catch (error) {
      this.logger.warn(
        `Nettoyage des envois abandonnés impossible : ${error instanceof Error ? error.message : 'inconnu'}`
      )
      return
    }
    await this.prisma.visitPhoto.deleteMany({
      where: { id: { in: stale.map(p => p.id) } },
    })
  }

  private async withUrls(photo: VisitPhoto): Promise<VisitPhotoDto> {
    const ttl = this.config.signedUrlTtlSeconds
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    const [url, thumb] = await this.storage.createSignedUrls(
      [photo.storagePath, photo.thumbnailPath],
      ttl
    )
    return this.toPhotoDto(photo, url ?? null, thumb ?? null, expiresAt)
  }

  private toPhotoDto(
    photo: VisitPhoto,
    url: string | null,
    thumbnailUrl: string | null,
    urlExpiresAt: string | null
  ): VisitPhotoDto {
    return {
      id: photo.id,
      visitId: photo.visitId,
      status: photo.status,
      contentType: photo.contentType as VisitPhotoMimeType,
      sizeBytes: photo.sizeBytes,
      width: photo.width,
      height: photo.height,
      caption: photo.caption,
      uploadedById: photo.uploadedById,
      createdAt: photo.createdAt.toISOString(),
      url,
      thumbnailUrl,
      urlExpiresAt,
    }
  }

  /** Les visites du contrat ; les URL signées en un seul appel au stockage. */
  private async toDtos(rows: VisitRow[], photos: boolean): Promise<VisitDto[]> {
    const ready = rows.flatMap(r => r.photos.filter(p => p.status === 'ready'))
    const urls = new Map<string, string | null>()
    const ttl = this.config.signedUrlTtlSeconds
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    if (photos && ready.length > 0) {
      const paths = ready.flatMap(p => [p.storagePath, p.thumbnailPath])
      try {
        const signed = await this.storage.createSignedUrls(paths, ttl)
        paths.forEach((path, index) => urls.set(path, signed[index] ?? null))
      } catch (error) {
        // Le stockage en panne n'empêche pas de lire les visites.
        if (!(error instanceof PhotoStorageUnavailableException)) throw error
        this.logger.warn(error.message)
      }
    }
    return rows.map(row => {
      const rowReady = row.photos.filter(p => p.status === 'ready')
      return VisitSchema.parse({
        id: row.id,
        listingId: row.listingId,
        visitedAt: row.visitedAt.toISOString(),
        status: row.status,
        participantIds: row.participantIds,
        report: row.report,
        pros: row.pros,
        cons: row.cons,
        rating: row.rating,
        prepTaskId: row.prepTaskId,
        createdById: row.createdById,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        photoCount: rowReady.length,
        photos: photos
          ? rowReady.map(p =>
              this.toPhotoDto(
                p,
                urls.get(p.storagePath) ?? null,
                urls.get(p.thumbnailPath) ?? null,
                urls.size > 0 ? expiresAt : null
              )
            )
          : [],
      })
    })
  }

  private async listingOf(
    member: Member,
    listingId: string
  ): Promise<{ id: string; status: ListingStatus }> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true, status: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    return listing
  }

  private async visitOf(
    member: Member,
    listingId: string,
    visitId: string
  ): Promise<VisitRow> {
    await this.listingOf(member, listingId)
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, listingId },
      include: {
        photos: { where: { status: 'ready' }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!visit) throw new NotFoundException('Visite introuvable')
    return visit
  }

  private async photoOf(
    member: Member,
    listingId: string,
    visitId: string,
    photoId: string
  ): Promise<VisitPhoto> {
    await this.visitOf(member, listingId, visitId)
    const photo = await this.prisma.visitPhoto.findFirst({
      where: { id: photoId, visitId, workspaceId: member.workspaceId },
    })
    if (!photo) throw new NotFoundException('Photo introuvable')
    return photo
  }

  private async checkParticipants(
    member: Member,
    ids: readonly string[]
  ): Promise<void> {
    if (ids.length === 0) return
    // Membres actifs ou anciens membres (une visite passée peut les compter) ;
    // jamais une invitation en attente.
    const found = await this.prisma.member.count({
      where: {
        id: { in: [...ids] },
        workspaceId: member.workspaceId,
        status: { in: ['active', 'removed'] },
      },
    })
    if (found !== new Set(ids).size) {
      throw new BadRequestException(
        "Un participant n'est pas membre de l'espace"
      )
    }
  }
}
