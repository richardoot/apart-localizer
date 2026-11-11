import type {
  Opinion,
  OpinionInputRaw,
  SignedUpload,
  Task,
  Visit,
  VisitInputRaw,
  VisitPhoto,
  VisitPhotoUpload,
  VisitPhotoUploadRequestRaw,
  VisitUpdate,
  VisitWriteResult,
} from '@apart/contracts'
import { ApiError } from './api'
import {
  opinionAlreadyApplied,
  resolveVisitRef,
  visitAlreadyApplied,
} from './outbox'
import type { OutboxData, OutboxEntry, OutboxOp, OutboxSuccess } from './outbox'
import type { OutboxStorage } from './outbox-store'

/**
 * Lot 24 (ADR 0034) : ce que fait une écriture de la file quand elle part.
 * Les appels sont ceux de l'application (mêmes routes, même journal) ; ici,
 * ce qui rend une reprise sûre : une visite commencée hors ligne n'est pas
 * créée deux fois, une écriture déjà appliquée (réponse perdue) n'est pas
 * prise pour un conflit, une photo reprend où elle en était.
 */

export interface OutboxApi {
  tasks: {
    update: (
      listingId: string,
      taskId: string,
      update: { done: boolean }
    ) => Promise<Task>
  }
  visits: {
    list: (listingId: string) => Promise<Visit[]>
    get: (listingId: string, visitId: string) => Promise<Visit>
    create: (
      listingId: string,
      input: VisitInputRaw
    ) => Promise<VisitWriteResult>
    update: (
      listingId: string,
      visitId: string,
      update: VisitUpdate
    ) => Promise<VisitWriteResult>
    requestPhotoUpload: (
      listingId: string,
      visitId: string,
      request: VisitPhotoUploadRequestRaw
    ) => Promise<VisitPhotoUpload>
    completePhoto: (
      listingId: string,
      visitId: string,
      photoId: string
    ) => Promise<VisitPhoto>
  }
  opinions: {
    upsertMine: (listingId: string, input: OpinionInputRaw) => Promise<Opinion>
    list: (listingId: string) => Promise<Opinion[]>
  }
  upload: (target: SignedUpload, body: Blob) => Promise<void>
}

export interface ExecuteContext {
  data: OutboxData
  api: OutboxApi
  storage: OutboxStorage
  /** Le membre connecté (retrouver mon avis après un conflit). */
  memberId: string | null
  /** Garde une étape de l'envoi d'une photo (reprise sans doublon). */
  saveOp: (op: OutboxOp) => Promise<void>
}

/** Une étape à refaire plus tard (une URL d'envoi périmée : nouvelle annonce). */
export class OutboxRetry extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboxRetry'
  }
}

/** Un refus qui ne vient pas du serveur (photo effacée de l'appareil). */
export class OutboxRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboxRefusal'
  }
}

const isStatus = (error: unknown, status: number): boolean =>
  error instanceof ApiError && error.status === status

const visitIdOf = (ctx: ExecuteContext, ref: string): string => {
  const id = resolveVisitRef(ctx.data, ref)
  if (!id) throw new OutboxRefusal('La visite n’est pas encore créée.')
  return id
}

export async function executeEntry(
  entry: OutboxEntry,
  ctx: ExecuteContext
): Promise<OutboxSuccess> {
  const { op } = entry
  switch (op.kind) {
    case 'task':
      await ctx.api.tasks.update(op.listingId, op.taskId, { done: op.done })
      return {}
    case 'visit-create': {
      // Une reprise : la visite a peut-être été créée, la réponse perdue.
      if (entry.attempts > 0) {
        const at = Date.parse(op.input.visitedAt)
        const existing = (await ctx.api.visits.list(op.listingId)).find(
          v => Date.parse(v.visitedAt) === at
        )
        if (existing) return { createdVisitId: existing.id }
      }
      const created = await ctx.api.visits.create(op.listingId, op.input)
      return { createdVisitId: created.visit.id }
    }
    case 'visit': {
      const visitId = visitIdOf(ctx, op.visitRef)
      try {
        const saved = await ctx.api.visits.update(op.listingId, visitId, {
          ...op.changes,
          ...(op.base ? { expectedUpdatedAt: op.base } : {}),
        })
        return { visitUpdatedAt: saved.visit.updatedAt }
      } catch (error) {
        if (!isStatus(error, 409)) throw error
        const current = await ctx.api.visits.get(op.listingId, visitId)
        if (visitAlreadyApplied(op.changes, current)) {
          return { visitUpdatedAt: current.updatedAt }
        }
        throw error
      }
    }
    case 'remark': {
      const visitId = visitIdOf(ctx, op.visitRef)
      const saved = await ctx.api.visits.update(op.listingId, visitId, {
        remark: { text: op.text, at: op.at },
      })
      return { visitUpdatedAt: saved.visit.updatedAt }
    }
    case 'opinion': {
      try {
        const saved = await ctx.api.opinions.upsertMine(op.listingId, {
          rating: op.rating,
          text: op.text,
          scores: op.scores,
          expectedUpdatedAt: op.base,
        })
        return { opinionUpdatedAt: saved.updatedAt }
      } catch (error) {
        if (!isStatus(error, 409) || !ctx.memberId) throw error
        const mine =
          (await ctx.api.opinions.list(op.listingId)).find(
            o => o.memberId === ctx.memberId
          ) ?? null
        if (opinionAlreadyApplied(op, mine) && mine) {
          return { opinionUpdatedAt: mine.updatedAt }
        }
        throw error
      }
    }
    case 'photo':
      return sendPhoto(entry, op, ctx)
  }
}

async function sendPhoto(
  entry: OutboxEntry,
  op: Extract<OutboxOp, { kind: 'photo' }>,
  ctx: ExecuteContext
): Promise<OutboxSuccess> {
  const visitId = visitIdOf(ctx, op.visitRef)
  const blobs = await ctx.storage.getBlobs(entry.id)
  let progress = op.progress
  const complete = async (photoId: string) => {
    await ctx.api.visits.completePhoto(op.listingId, visitId, photoId)
    await ctx.storage.deleteBlobs(entry.id)
    return {}
  }
  // Déjà téléversée : il ne reste qu'à terminer (sans risque de doublon).
  if (progress?.uploaded) {
    try {
      return await complete(progress.photoId)
    } catch (error) {
      // L'annonce a été nettoyée (plus de deux heures) : on recommence.
      if (!isStatus(error, 404)) throw error
      progress = null
    }
  }
  if (!blobs) {
    throw new OutboxRefusal(
      'La photo n’est plus sur l’appareil : reprends-la si tu peux.'
    )
  }
  if (progress && !progress.uploaded) {
    // Une coupure pendant l'envoi : peut-être déjà arrivée.
    try {
      return await complete(progress.photoId)
    } catch (error) {
      if (isStatus(error, 404)) progress = null
      else if (!isStatus(error, 409)) throw error
    }
  }
  if (!progress) {
    const announced = await ctx.api.visits.requestPhotoUpload(
      op.listingId,
      visitId,
      {
        contentType: op.meta.contentType,
        sizeBytes: op.meta.sizeBytes,
        width: op.meta.width,
        height: op.meta.height,
        thumbnail: op.meta.thumbnail,
      }
    )
    progress = {
      photoId: announced.photo.id,
      upload: announced.upload,
      thumbnailUpload: announced.thumbnailUpload,
      uploaded: false,
    }
    await ctx.saveOp({ ...op, progress })
  }
  try {
    await ctx.api.upload(progress.upload, blobs.photo)
    await ctx.api.upload(progress.thumbnailUpload, blobs.thumbnail)
  } catch (error) {
    // Une URL d'envoi périmée ou déjà servie : la prochaine fois, une nouvelle annonce.
    if (error instanceof ApiError && error.status < 500) {
      await ctx.saveOp({ ...op, progress: null })
      throw new OutboxRetry('L’envoi de la photo reprendra depuis le début.')
    }
    throw error
  }
  progress = { ...progress, uploaded: true }
  await ctx.saveOp({ ...op, progress })
  return complete(progress.photoId)
}
