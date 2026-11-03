import { z } from 'zod'
import { DuplicateCandidateSchema } from './duplicates.js'
import { ListingInputSchema } from './listing.js'

/**
 * Brouillons d'annonces « à valider » (besoin C9) : nés d'une alerte e-mail
 * transférée au webhook entrant, ils attendent qu'un membre les valide (la
 * fiche pré-remplie s'ouvre dans « Nouvelle annonce ») ou les écarte. Rien
 * n'est téléchargé depuis les portails : seul le contenu de l'e-mail compte.
 */

/** Au plus autant d'annonces lues dans un e-mail d'alerte. */
export const INBOUND_EMAIL_MAX_LISTINGS = 10

/** Le format générique d'un e-mail entrant, que l'adaptateur du service d'e-mails produit. */
export const InboundEmailSchema = z
  .object({
    from: z.string().max(320).nullable().default(null).describe('Expéditeur'),
    to: z.string().max(2000).nullable().default(null).describe('Destinataires'),
    subject: z.string().max(1000).default('').describe('Sujet'),
    text: z
      .string()
      .max(500_000)
      .nullable()
      .default(null)
      .describe('Partie texte'),
    html: z
      .string()
      .max(2_000_000)
      .nullable()
      .default(null)
      .describe('Partie HTML'),
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .default(null)
      .describe('Date de réception ISO 8601'),
  })
  .refine(value => Boolean(value.text?.trim() || value.html?.trim()), {
    message: 'Un e-mail sans texte ni HTML ne contient aucune annonce',
  })
export type InboundEmail = z.infer<typeof InboundEmailSchema>
export type InboundEmailRaw = z.input<typeof InboundEmailSchema>

export const ListingDraftStatusSchema = z
  .enum(['pending', 'accepted', 'dismissed'])
  .describe('À valider, validé (annonce créée) ou écarté')
export type ListingDraftStatus = z.infer<typeof ListingDraftStatusSchema>

export const ListingDraftOriginSchema = z
  .enum(['email'])
  .describe('Origine du brouillon : alerte e-mail transférée')
export type ListingDraftOrigin = z.infer<typeof ListingDraftOriginSchema>

export const DraftExtractorSchema = z
  .enum(['ai', 'parser'])
  .describe(
    "Qui a lu l'e-mail : l'extraction IA, ou l'analyseur simple (lien, prix, surface)"
  )
export type DraftExtractor = z.infer<typeof DraftExtractorSchema>

export const ListingDraftSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  origin: ListingDraftOriginSchema,
  status: ListingDraftStatusSchema,
  extractedBy: DraftExtractorSchema,
  listing: ListingInputSchema.describe('La fiche pré-remplie, à valider'),
  duplicates: z
    .array(DuplicateCandidateSchema)
    .describe('Doublons probables à la réception'),
  warnings: z.array(z.string()),
  url: z.string().nullable(),
  emailSubject: z.string().nullable(),
  emailFrom: z.string().nullable(),
  receivedAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  decidedById: z.string().uuid().nullable(),
  listingId: z
    .string()
    .uuid()
    .nullable()
    .describe('Annonce créée à la validation'),
  createdAt: z.string().datetime(),
})
export type ListingDraft = z.infer<typeof ListingDraftSchema>

export const ListingDraftQuerySchema = z.object({
  status: ListingDraftStatusSchema.default('pending'),
})
export type ListingDraftQuery = z.infer<typeof ListingDraftQuerySchema>

export const ListingDraftDecisionSchema = z
  .object({
    status: z
      .enum(['accepted', 'dismissed'])
      .describe(
        'accepted : annonce créée depuis le brouillon ; dismissed : écarté'
      ),
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe("L'annonce créée à partir du brouillon (avec accepted)"),
  })
  .refine(value => value.status !== 'accepted' || value.listingId, {
    message: 'Valider un brouillon demande l’annonce créée (listingId)',
    path: ['listingId'],
  })
export type ListingDraftDecision = z.infer<typeof ListingDraftDecisionSchema>

export const InboundEmailResultSchema = z.object({
  candidates: z
    .number()
    .int()
    .min(0)
    .describe("Annonces repérées dans l'e-mail"),
  created: z.number().int().min(0).describe('Brouillons créés'),
  skipped: z
    .number()
    .int()
    .min(0)
    .describe('Annonces déjà en brouillon ou déjà suivies (même lien)'),
  draftIds: z.array(z.string().uuid()),
  extractedBy: DraftExtractorSchema,
})
export type InboundEmailResult = z.infer<typeof InboundEmailResultSchema>
