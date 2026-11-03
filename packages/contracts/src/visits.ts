import { z } from 'zod'
import { TaskSchema } from './collaboration.js'
import { ListingStatusSchema } from './enums.js'

/**
 * Visites (besoin S4) : date, participants, compte rendu, points positifs et
 * négatifs, note, photos. Les photos vivent dans Supabase Storage (bucket
 * privé, un dossier par espace) et ne se lisent que par des URL signées à
 * durée courte ; le navigateur les téléverse directement par une URL
 * d'envoi signée, après les avoir réduites et en avoir tiré une vignette.
 */

export const VisitStatusSchema = z
  .enum(['planned', 'done'])
  .describe('État de la visite : planifiée ou faite')
export type VisitStatus = z.infer<typeof VisitStatusSchema>

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned: 'Planifiée',
  done: 'Faite',
}

/** Types d'image acceptés pour une photo ou sa vignette. */
export const VISIT_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const VisitPhotoMimeTypeSchema = z
  .enum(VISIT_PHOTO_MIME_TYPES)
  .describe('Type MIME de l’image : jpeg, png ou webp')
export type VisitPhotoMimeType = z.infer<typeof VisitPhotoMimeTypeSchema>

/** Taille maximale d'une photo (après réduction dans le navigateur), en octets. */
export const VISIT_PHOTO_MAX_BYTES = 10 * 1024 * 1024
/** Taille maximale d'une vignette, en octets. */
export const VISIT_THUMBNAIL_MAX_BYTES = 512 * 1024
/** Nombre maximal de photos par visite. */
export const VISIT_PHOTOS_MAX = 40
/** Grand côté des photos réduites dans le navigateur, en pixels. */
export const VISIT_PHOTO_MAX_EDGE = 2048
/** Grand côté des vignettes, en pixels. */
export const VISIT_THUMBNAIL_EDGE = 360

const isoDateTime = z.iso.datetime({ offset: true })

const optionalText = (max: number, what: string) =>
  z.string().max(max).nullable().default(null).describe(what)

export const VisitInputSchema = z.object({
  visitedAt: isoDateTime.describe(
    'Date et heure de la visite, ISO 8601 (passée pour une visite faite, à venir pour une visite planifiée)'
  ),
  status: VisitStatusSchema.default('done'),
  participantIds: z
    .array(z.string().uuid())
    .max(10)
    .default([])
    .describe("Participants : identifiants des membres de l'espace présents"),
  report: optionalText(10_000, 'Compte rendu de la visite'),
  pros: optionalText(5000, 'Points positifs'),
  cons: optionalText(5000, 'Points négatifs'),
  rating: z
    .number()
    .int()
    .min(0)
    .max(5)
    .default(0)
    .describe('Note de la visite sur 5 ; 0 = pas de note'),
  createPrepTask: z
    .boolean()
    .default(false)
    .describe(
      'Visite planifiée : ajoute à la checklist la tâche « Préparer la visite » (documents à demander, points à vérifier)'
    ),
})
export type VisitInput = z.infer<typeof VisitInputSchema>
export type VisitInputRaw = z.input<typeof VisitInputSchema>

/** Mise à jour d'une visite : champs modifiés seulement. */
export const VisitUpdateSchema = z
  .object({
    visitedAt: isoDateTime.optional(),
    status: VisitStatusSchema.optional(),
    participantIds: z.array(z.string().uuid()).max(10).optional(),
    report: z.string().max(10_000).nullable().optional(),
    pros: z.string().max(5000).nullable().optional(),
    cons: z.string().max(5000).nullable().optional(),
    rating: z.number().int().min(0).max(5).optional(),
    expectedUpdatedAt: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Garde-fou optimiste : `updatedAt` lu ; refus si la visite a changé depuis'
      ),
  })
  .refine(
    value =>
      Object.keys(value).some(
        key =>
          key !== 'expectedUpdatedAt' &&
          value[key as keyof typeof value] !== undefined
      ),
    { message: 'Au moins un champ à modifier' }
  )
export type VisitUpdate = z.infer<typeof VisitUpdateSchema>

export const VisitPhotoStatusSchema = z
  .enum(['pending', 'ready'])
  .describe('Photo annoncée (envoi en cours) ou prête')
export type VisitPhotoStatus = z.infer<typeof VisitPhotoStatusSchema>

export const VisitPhotoSchema = z.object({
  id: z.string().uuid(),
  visitId: z.string().uuid(),
  status: VisitPhotoStatusSchema,
  contentType: VisitPhotoMimeTypeSchema,
  sizeBytes: z.number().int().min(0).describe('Taille de la photo en octets'),
  width: z.number().int().min(1).nullable().describe('Largeur en pixels'),
  height: z.number().int().min(1).nullable().describe('Hauteur en pixels'),
  caption: z.string().max(300).nullable(),
  uploadedById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  url: z
    .string()
    .url()
    .nullable()
    .describe(
      'URL signée de la photo, valable quelques minutes ; null si pas prête'
    ),
  thumbnailUrl: z
    .string()
    .url()
    .nullable()
    .describe('URL signée de la vignette, valable quelques minutes'),
  urlExpiresAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Fin de validité des URL signées'),
})
export type VisitPhoto = z.infer<typeof VisitPhotoSchema>

export const VisitSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  visitedAt: z.string().datetime(),
  status: VisitStatusSchema,
  participantIds: z.array(z.string().uuid()),
  report: z.string().nullable(),
  pros: z.string().nullable(),
  cons: z.string().nullable(),
  rating: z.number().int().min(0).max(5),
  prepTaskId: z
    .string()
    .uuid()
    .nullable()
    .describe('Tâche « Préparer la visite » créée avec la visite'),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  photoCount: z.number().int().min(0).describe('Photos prêtes'),
  photos: z.array(VisitPhotoSchema).default([]),
})
export type Visit = z.infer<typeof VisitSchema>

/**
 * Réponse d'une écriture de visite : la visite, la tâche de préparation
 * créée s'il y a lieu, et le statut proposé pour l'annonce (« visité » après
 * une visite faite) ; il n'est jamais appliqué d'office.
 */
export const VisitWriteResultSchema = z.object({
  visit: VisitSchema,
  createdTask: TaskSchema.nullable(),
  currentStatus: ListingStatusSchema,
  suggestedStatus: ListingStatusSchema.nullable().describe(
    'Statut proposé à la suite de cette visite ; null si le statut actuel convient'
  ),
})
export type VisitWriteResult = z.infer<typeof VisitWriteResultSchema>

/** Annonce d'une photo à téléverser : la photo réduite et sa vignette. */
export const VisitPhotoUploadRequestSchema = z.object({
  contentType: VisitPhotoMimeTypeSchema,
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(VISIT_PHOTO_MAX_BYTES)
    .describe(
      `Taille de la photo en octets (${VISIT_PHOTO_MAX_BYTES / 1024 / 1024} Mo au plus)`
    ),
  width: z.number().int().min(1).max(20_000).nullable().default(null),
  height: z.number().int().min(1).max(20_000).nullable().default(null),
  caption: z.string().trim().max(300).nullable().default(null),
  thumbnail: z.object({
    contentType: VisitPhotoMimeTypeSchema,
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(VISIT_THUMBNAIL_MAX_BYTES)
      .describe(
        `Taille de la vignette en octets (${VISIT_THUMBNAIL_MAX_BYTES / 1024} ko au plus)`
      ),
  }),
})
export type VisitPhotoUploadRequest = z.infer<
  typeof VisitPhotoUploadRequestSchema
>
export type VisitPhotoUploadRequestRaw = z.input<
  typeof VisitPhotoUploadRequestSchema
>

/** Une URL d'envoi signée (Supabase Storage) : PUT du fichier, une fois. */
export const SignedUploadSchema = z.object({
  signedUrl: z.string().url(),
  path: z.string().describe("Chemin de l'objet dans le bucket"),
  token: z.string(),
  contentType: VisitPhotoMimeTypeSchema,
  maxBytes: z.number().int().min(1),
})
export type SignedUpload = z.infer<typeof SignedUploadSchema>

export const VisitPhotoUploadSchema = z.object({
  photo: VisitPhotoSchema,
  upload: SignedUploadSchema,
  thumbnailUpload: SignedUploadSchema,
})
export type VisitPhotoUpload = z.infer<typeof VisitPhotoUploadSchema>
