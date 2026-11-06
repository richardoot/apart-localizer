import { z } from 'zod'
import { ListingCriteriaFitSchema } from './criteria-fit.js'
import { DuplicateCandidateSchema } from './duplicates.js'
import { ListingInputSchema } from './listing.js'
import { ExplorationPortalSchema, ListingPortalSchema } from './portals.js'

/**
 * Brouillons d'annonces « à valider » (besoin C9) : nés d'une alerte e-mail
 * transférée au webhook entrant, ou d'une exploration des portails par
 * Claude (lot 16, ADR 0026), ils attendent qu'un membre les ajoute à la
 * liste (directement, ou en passant par la fiche pré-remplie de « Nouvelle
 * annonce »), les écarte (raison facultative : un brouillon écarté n'est
 * jamais reproposé) ou, pour un doublon probable, dise si c'est la même
 * annonce (vérification lot 15 de l'annonce suivie) ou une autre. Rien n'est
 * téléchargé depuis les portails : seul ce que l'e-mail ou Claude transmet
 * compte.
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
  .enum(['pending', 'accepted', 'dismissed', 'merged'])
  .describe(
    'À valider, validé (annonce créée), écarté, ou reconnu comme une annonce déjà suivie (merged : sa fiche a été mise à jour, lot 16)'
  )
export type ListingDraftStatus = z.infer<typeof ListingDraftStatusSchema>

export const ListingDraftOriginSchema = z
  .enum(['email', 'exploration'])
  .describe(
    'Origine du brouillon : alerte e-mail transférée, ou exploration des portails par Claude (lot 16)'
  )
export type ListingDraftOrigin = z.infer<typeof ListingDraftOriginSchema>

export const DraftExtractorSchema = z
  .enum(['ai', 'parser', 'claude'])
  .describe(
    "Qui a lu l'annonce : l'extraction IA, l'analyseur simple (lien, prix, surface) d'un e-mail, ou Claude sur la page du portail (lot 16)"
  )
export type DraftExtractor = z.infer<typeof DraftExtractorSchema>

/** Longueur maximale de la raison d'un écart. */
export const DRAFT_DISMISS_REASON_MAX = 500

/** Lot 18 : le lien d'un brouillon rattaché d'office à une annonce suivie. */
export const DraftAttachmentSchema = z.object({
  listingId: z
    .string()
    .uuid()
    .describe('L’annonce suivie à laquelle le lien a été ajouté'),
  listingTitle: z.string(),
  linkId: z
    .string()
    .uuid()
    .nullable()
    .describe('Le lien ajouté ; null s’il a été retiré depuis'),
  portal: ListingPortalSchema,
  attachedAt: z.string().datetime(),
  fichePrice: z
    .number()
    .describe('Le prix de la fiche de l’annonce suivie, en euros'),
  sellerName: z.string().nullable(),
  sellerReference: z.string().nullable(),
  summary: z
    .string()
    .describe(
      '« Lien SeLoger ajouté : 219 000 € (+5 000 € : frais inclus ?) »'
    ),
})
export type DraftAttachment = z.infer<typeof DraftAttachmentSchema>

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
    .describe(
      'Annonce créée à la validation, ou annonce suivie mise à jour (merged)'
    ),
  createdAt: z.string().datetime(),
  // Lot 16 : exploration des portails par Claude.
  explorationId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe('L’exploration qui a trouvé l’annonce'),
  portal: ExplorationPortalSchema.nullable()
    .default(null)
    .describe('Le portail où Claude l’a lue'),
  excerpt: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'Ce que Claude a lu sur la page (500 caractères au plus, téléphones et e-mails masqués)'
    ),
  dismissReason: z
    .string()
    .nullable()
    .default(null)
    .describe('Raison de l’écart, si elle a été donnée'),
  distinct: z
    .boolean()
    .default(false)
    .describe(
      'Vrai si un membre a dit « c’en est une autre » : les doublons probables ne sont plus proposés'
    ),
  merge: z
    .object({
      checkId: z.string().uuid().nullable(),
      summary: z.string(),
    })
    .nullable()
    .default(null)
    .describe(
      'Pour un brouillon reconnu comme une annonce suivie : la vérification enregistrée sur sa fiche'
    ),
  fit: ListingCriteriaFitSchema.nullable()
    .default(null)
    .describe(
      'Adéquation aux critères actifs, calculée à la lecture (lot 14) ; null si non calculée'
    ),
  // Lot 18 : lien rattaché d'office (même agence, même référence).
  attachment: DraftAttachmentSchema.nullable()
    .default(null)
    .describe(
      'Lot 18 : le lien rattaché d’office à une annonce suivie (même agence, même référence) ; « Ce n’est pas la même » le détache'
    ),
  detachedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe(
      'Lot 18 : date à laquelle un membre a détaché le lien rattaché d’office (« Ce n’est pas la même ») : le brouillon est revenu « À valider »'
    ),
})
export type ListingDraft = z.infer<typeof ListingDraftSchema>

export const ListingDraftQuerySchema = z.object({
  status: ListingDraftStatusSchema.default('pending'),
  attached: z
    .preprocess(
      value =>
        value === undefined || value === ''
          ? undefined
          : value === true || value === 'true' || value === '1',
      z.boolean().optional()
    )
    .describe(
      'Lot 18 : seulement les brouillons rattachés d’office (même agence, même référence) des derniers jours, avec status=merged'
    ),
  explorationId: z
    .string()
    .uuid()
    .optional()
    .describe('Seulement les brouillons de cette exploration (lot 16)'),
})
export type ListingDraftQuery = z.infer<typeof ListingDraftQuerySchema>

export const ListingDraftDecisionSchema = z
  .object({
    status: z
      .enum(['accepted', 'dismissed', 'pending'])
      .describe(
        'accepted : annonce créée depuis le brouillon (formulaire) ; dismissed : écarté ; pending : écart annulé, le brouillon revient « À valider »'
      ),
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe("L'annonce créée à partir du brouillon (avec accepted)"),
    reason: z
      .string()
      .trim()
      .max(DRAFT_DISMISS_REASON_MAX)
      .optional()
      .describe(
        'Pourquoi le brouillon est écarté (facultatif, gardé : « rez-de-chaussée sur rue »)'
      ),
  })
  .refine(value => value.status !== 'accepted' || value.listingId, {
    message: 'Valider un brouillon demande l’annonce créée (listingId)',
    path: ['listingId'],
  })
export type ListingDraftDecision = z.infer<typeof ListingDraftDecisionSchema>

/** « C'est la même : mettre à jour la fiche » : l'annonce suivie choisie parmi les doublons probables. */
export const ListingDraftMergeSchema = z.object({
  listingId: z
    .string()
    .uuid()
    .describe(
      'L’annonce suivie qui est la même (parmi les doublons probables)'
    ),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Garde-fou : `updatedAt` de l’annonce suivie lu avant ; refus si elle a changé depuis'
    ),
})
export type ListingDraftMerge = z.infer<typeof ListingDraftMergeSchema>

/** « Ajouter celles « dans les critères » » : les brouillons dans les critères, sans doublon à trancher. */
export const ListingDraftBatchAcceptSchema = z.object({
  explorationId: z
    .string()
    .uuid()
    .optional()
    .describe('Seulement les brouillons de cette exploration ; absent = tous'),
})
export type ListingDraftBatchAccept = z.infer<
  typeof ListingDraftBatchAcceptSchema
>

/** Ce qu'un ajout direct a créé. */
export const ListingDraftAcceptResultSchema = z.object({
  draft: ListingDraftSchema,
  listingId: z.string().uuid(),
  title: z.string(),
})
export type ListingDraftAcceptResult = z.infer<
  typeof ListingDraftAcceptResultSchema
>

export const ListingDraftBatchAcceptResultSchema = z.object({
  accepted: z.array(
    z.object({
      draftId: z.string().uuid(),
      listingId: z.string().uuid(),
      title: z.string(),
    })
  ),
  skipped: z
    .number()
    .int()
    .min(0)
    .describe(
      'Brouillons laissés à valider : pas dans les critères, ou doublon probable à trancher'
    ),
})
export type ListingDraftBatchAcceptResult = z.infer<
  typeof ListingDraftBatchAcceptResultSchema
>

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
  attached: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      'Lot 18 : liens rattachés d’office à une annonce suivie (même agence, même référence), montrés dans « Liens rattachés d’office »'
    ),
})
export type InboundEmailResult = z.infer<typeof InboundEmailResultSchema>
