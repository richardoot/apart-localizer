import { z } from 'zod'
import { ExtractionRequestSchema } from './ai.js'
import { AssumptionsOverrideSchema } from './assumptions.js'
import { OpinionInputSchema, PriceEventInputSchema } from './collaboration.js'
import { DuplicateProbeSchema } from './duplicates.js'
import { OfferChannelSchema, OfferResponseSchema } from './enums.js'
import { ListingFiltersSchema } from './filters.js'
import {
  ListingCreateSchema,
  ListingStatusChangeSchema,
  ListingUpdateGuardsSchema,
  ListingUpdateSchema,
} from './listing.js'
import { SensitivityRequestSchema } from './metrics.js'
import {
  CompareRequestSchema,
  EvaluateRequestSchema,
  HypotheticalListingSchema,
} from './views.js'

/**
 * Entrées des outils MCP. Chaque schéma réutilise ceux de l'API : un outil
 * accepte exactement ce que le REST accepte, plus l'identifiant de l'annonce
 * et, pour les écritures, la provenance et les garde-fous.
 */

/** Portées OAuth du connecteur. */
export const MCP_SCOPE_READ = 'listings:read'
export const MCP_SCOPE_WRITE = 'listings:write'
export const MCP_SCOPES = [MCP_SCOPE_READ, MCP_SCOPE_WRITE] as const
export type McpScope = (typeof MCP_SCOPES)[number]

/** Provenance que le MCP attribue aux champs qu'il écrit. */
export const McpProvenanceSchema = z
  .enum(['ai', 'user'])
  .default('ai')
  .describe(
    "Provenance des champs écrits : « ai » quand Claude a lu l'annonce, « user » quand il relaie une valeur dictée par le membre"
  )
export type McpProvenance = z.infer<typeof McpProvenanceSchema>

const listingId = z
  .string()
  .uuid()
  .describe("Identifiant de l'annonce (uuid, voir list_listings)")

export const McpListListingsInputSchema = ListingFiltersSchema
export type McpListListingsInput = z.infer<typeof McpListListingsInputSchema>

export const McpGetListingInputSchema = z.object({ listingId })
export type McpGetListingInput = z.infer<typeof McpGetListingInputSchema>

export const McpEvaluateListingInputSchema = EvaluateRequestSchema
export type McpEvaluateListingInput = z.infer<
  typeof McpEvaluateListingInputSchema
>

export const McpCreateListingInputSchema = z.object({
  listing: ListingCreateSchema.describe(
    "L'annonce normalisée : titre et prix obligatoires, le reste si l'annonce le donne ; fieldSources pour la provenance et la confiance par champ ; ignoreDuplicates si le membre a vu les doublons et confirme"
  ),
  provenance: McpProvenanceSchema,
})
export type McpCreateListingInput = z.infer<typeof McpCreateListingInputSchema>

export const McpUpdateListingInputSchema = z.object({
  listingId,
  patch: ListingUpdateSchema.describe(
    'Champs à modifier ; les sous-objets fournis (travaux, phase 2, localisation) remplacent les existants'
  ),
  ...ListingUpdateGuardsSchema.shape,
  provenance: McpProvenanceSchema,
})
export type McpUpdateListingInput = z.infer<typeof McpUpdateListingInputSchema>

export const McpSetListingStatusInputSchema = z.object({
  listingId,
  ...ListingStatusChangeSchema.shape,
})
export type McpSetListingStatusInput = z.infer<
  typeof McpSetListingStatusInputSchema
>

export const McpAddOpinionInputSchema = z.object({
  listingId,
  ...OpinionInputSchema.shape,
})
export type McpAddOpinionInput = z.infer<typeof McpAddOpinionInputSchema>

export const McpAddTaskInputSchema = z.object({
  listingId,
  label: z.string().min(1).max(300).describe('Libellé de la tâche'),
  assigneeHandle: z
    .string()
    .max(40)
    .optional()
    .describe(
      'Membre à qui l’assigner, par son identifiant court (« richard », « chloe »)'
    ),
})
export type McpAddTaskInput = z.infer<typeof McpAddTaskInputSchema>

export const McpCompleteTaskInputSchema = z.object({
  listingId,
  taskId: z
    .string()
    .uuid()
    .describe('Identifiant de la tâche (voir get_listing)'),
  done: z
    .boolean()
    .default(true)
    .describe('Vrai = cocher (défaut), faux = décocher'),
})
export type McpCompleteTaskInput = z.infer<typeof McpCompleteTaskInputSchema>

/** `extract_listing` : texte et/ou captures vers une fiche pré-remplie, sans écriture. */
export const McpExtractListingInputSchema = ExtractionRequestSchema
export type McpExtractListingInput = z.infer<
  typeof McpExtractListingInputSchema
>

/** `find_duplicates` : par identifiant, URL, adresse, point ou trio commune + prix + surface. */
export const McpFindDuplicatesInputSchema = DuplicateProbeSchema
export type McpFindDuplicatesInput = z.infer<
  typeof McpFindDuplicatesInputSchema
>

/** Arguments du prompt MCP « analyser cette annonce » (chaînes, par protocole). */
export const McpAnalyzeListingPromptArgsSchema = z.object({
  pageText: z
    .string()
    .describe(
      "Texte de la page d'annonce lu dans le navigateur (ou texte collé, mail d'agence)"
    ),
  url: z.string().optional().describe("URL de la page d'annonce"),
  notes: z
    .string()
    .optional()
    .describe(
      'Consignes du membre : captures jointes à la conversation, valeurs déjà connues, doutes'
    ),
})
export type McpAnalyzeListingPromptArgs = z.infer<
  typeof McpAnalyzeListingPromptArgsSchema
>

/**
 * `get_target_price` : « à partir de quel prix ? », pour une annonce
 * enregistrée (rang parmi les annonces actives, historique des prix et des
 * offres dans le brief) ou hypothétique (prix cibles et brief sans historique).
 */
export const McpGetTargetPriceInputSchema = z
  .object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe('Annonce enregistrée ; absent = annonce hypothétique'),
    listing: HypotheticalListingSchema.optional().describe(
      'Annonce hypothétique (prix, surface, loyer visé dans rentalPlan.targetRent, DPE, commune, travaux…)'
    ),
    assumptions: AssumptionsOverrideSchema.optional().describe(
      'Scénario : hypothèses remplacées champ par champ pour ce calcul seulement'
    ),
    sensitivity: SensitivityRequestSchema.optional().describe(
      'Si présent, ajoute le tableau de sensibilité demandé (axes et pas)'
    ),
  })
  .refine(
    value => value.listingId !== undefined || value.listing !== undefined,
    {
      message:
        'Donnez listingId (annonce enregistrée) ou listing (hypothétique)',
    }
  )
export type McpGetTargetPriceInput = z.infer<
  typeof McpGetTargetPriceInputSchema
>

/**
 * `record_offer` : une nouvelle offre (`amount`), ou la réponse du vendeur à
 * une offre existante (`offerId`). Jamais de suppression.
 */
export const McpRecordOfferInputSchema = z
  .object({
    listingId,
    offerId: z
      .string()
      .uuid()
      .optional()
      .describe(
        'Offre existante (voir get_listing) dont on enregistre la réponse ; absent = nouvelle offre'
      ),
    amount: z
      .number()
      .min(0)
      .optional()
      .describe(
        "Montant de l'offre en euros (obligatoire pour une nouvelle offre)"
      ),
    madeAt: z
      .string()
      .datetime()
      .optional()
      .describe("Date de l'offre, ISO 8601 ; absent = maintenant"),
    channel: OfferChannelSchema.nullable()
      .optional()
      .describe('Canal de transmission de l’offre'),
    response: OfferResponseSchema.optional().describe(
      'Réponse du vendeur : pending, accepted, refused, counter_offer'
    ),
    counterAmount: z
      .number()
      .min(0)
      .nullable()
      .optional()
      .describe('Contre-proposition du vendeur en euros'),
    notes: z.string().max(5000).nullable().optional(),
    expectedResponse: OfferResponseSchema.optional().describe(
      'Garde-fou optimiste (avec offerId) : réponse actuelle attendue ; refus si différente'
    ),
  })
  .refine(value => value.offerId !== undefined || value.amount !== undefined, {
    message:
      'Donnez amount (nouvelle offre) ou offerId (réponse à une offre existante)',
  })
export type McpRecordOfferInput = z.infer<typeof McpRecordOfferInputSchema>

/** `record_price_change` : baisse ou hausse constatée sur l'annonce source. */
export const McpRecordPriceChangeInputSchema = z.object({
  listingId,
  ...PriceEventInputSchema.shape,
})
export type McpRecordPriceChangeInput = z.infer<
  typeof McpRecordPriceChangeInputSchema
>

/** `compare_listings` : 2 à 6 annonces côte à côte. */
export const McpCompareListingsInputSchema = CompareRequestSchema
export type McpCompareListingsInput = z.infer<
  typeof McpCompareListingsInputSchema
>

/**
 * `set_assumptions` : nouvelle version des hypothèses de l'espace, à partir
 * des champs modifiés seulement ; garde optimiste sur la version en vigueur.
 */
export const McpSetAssumptionsInputSchema = z.object({
  values: AssumptionsOverrideSchema.describe(
    'Champs à modifier (taux en fractions : 0,032 = 3,2 %) ; les autres gardent leur valeur en vigueur'
  ),
  label: z
    .string()
    .max(120)
    .optional()
    .describe('Libellé de la nouvelle version (« taux négocié mars »)'),
  expectedVersion: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Garde-fou optimiste : identifiant de la version en vigueur lue avec get_assumptions ; refus si une autre version a été enregistrée depuis'
    ),
})
export type McpSetAssumptionsInput = z.infer<
  typeof McpSetAssumptionsInputSchema
>
