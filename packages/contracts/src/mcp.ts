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
import { MarketContextRequestSchema } from './opendata.js'
import { RentComparableInputSchema } from './rent-market.js'
import { VisitInputSchema } from './visits.js'
import {
  DEFAULT_STALE_DAYS,
  ListingCheckInputSchema,
  ListingCheckPreviewRequestSchema,
} from './listing-checks.js'
import { WhatsNewQuerySchema } from './whats-new.js'
import {
  ExplorationRecordSchema,
  SearchBriefQuerySchema,
  TriageRequestSchema,
} from './exploration.js'
import { ProjectionRequestSchema, ScenarioOverridesSchema } from './study.js'
import {
  SearchCriteriaInputSchema,
  SearchCriteriaUpdateSchema,
} from './search-criteria.js'
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

/** `list_search_criteria` : critères de l'espace avec leurs compteurs. */
export const McpListSearchCriteriaInputSchema = z.object({
  includeArchived: z
    .boolean()
    .default(false)
    .describe('Inclure les critères archivés (inactifs)'),
})
export type McpListSearchCriteriaInput = z.infer<
  typeof McpListSearchCriteriaInputSchema
>

/**
 * `create_search_criteria` : nom, filtres, périmètre (point et rayon,
 * polygone GeoJSON, ou isochrone calculée par la Géoplateforme).
 */
export const McpCreateSearchCriteriaInputSchema = SearchCriteriaInputSchema
export type McpCreateSearchCriteriaInput = z.infer<
  typeof McpCreateSearchCriteriaInputSchema
>

/** `update_search_criteria` : champs modifiés, garde-fou `expectedUpdatedAt`. */
export const McpUpdateSearchCriteriaInputSchema = z.object({
  criteriaId: z
    .string()
    .uuid()
    .describe('Identifiant du critère (voir list_search_criteria)'),
  ...SearchCriteriaUpdateSchema.shape,
})
export type McpUpdateSearchCriteriaInput = z.infer<
  typeof McpUpdateSearchCriteriaInputSchema
>

/** `get_market_context` : DVF, encadrement et desserte d'une annonce, d'une adresse ou d'un point. */
export const McpGetMarketContextInputSchema = MarketContextRequestSchema
export type McpGetMarketContextInput = z.infer<
  typeof McpGetMarketContextInputSchema
>

// ---------------------------------------------------------------------------
// Lot 5 : scénarios, projection, conformité, loyer de marché
// ---------------------------------------------------------------------------

/**
 * `evaluate_scenario` : « et si » sur une annonce enregistrée, à partir de
 * surcharges (sans enregistrement) ou d'un scénario enregistré ; `saveAs`
 * enregistre les surcharges comme scénario (portée écriture).
 */
export const McpEvaluateScenarioInputSchema = z
  .object({
    listingId,
    scenarioId: z
      .string()
      .uuid()
      .optional()
      .describe('Scénario enregistré à appliquer (voir la réponse de saveAs)'),
    overrides: ScenarioOverridesSchema.optional().describe(
      'Surcharges : price, targetRent, renovationTotal, furnitureValue, propertyTax, annualCharges, leaseType, assumptions (interestRate, downPayment, durationYears, vacancyMonths, rentalStartDate, marginalTaxRate, taxRegime, horizonYears…)'
    ),
    saveAs: z
      .object({
        name: z.string().trim().min(1).max(120).describe('Nom du scénario'),
        scope: z
          .enum(['listing', 'workspace'])
          .default('listing')
          .describe(
            'Attaché à l’annonce, ou applicable à toute annonce de l’espace'
          ),
        notes: z.string().max(2000).optional(),
      })
      .optional()
      .describe(
        'Enregistre les surcharges comme scénario (portée listings:write)'
      ),
  })
  .refine(v => v.scenarioId !== undefined || v.overrides !== undefined, {
    message: 'Donnez scenarioId (scénario enregistré) ou overrides',
  })
  .refine(v => v.saveAs === undefined || v.overrides !== undefined, {
    message: 'saveAs enregistre des overrides : donnez-les',
    path: ['saveAs'],
  })
export type McpEvaluateScenarioInput = z.infer<
  typeof McpEvaluateScenarioInputSchema
>

/** `get_projection` : fiscalité estimée, projection annuelle, revente, TRI, VAN. */
export const McpGetProjectionInputSchema = z.object({
  listingId,
  ...ProjectionRequestSchema.shape,
})
export type McpGetProjectionInput = z.infer<typeof McpGetProjectionInputSchema>

/** `get_compliance` : checklist réglementaire datée et risques Géorisques. */
export const McpGetComplianceInputSchema = z.object({ listingId })
export type McpGetComplianceInput = z.infer<typeof McpGetComplianceInputSchema>

/** `add_rent_comparable` : une annonce de location comparable saisie. */
export const McpAddRentComparableInputSchema = z.object({
  listingId,
  ...RentComparableInputSchema.shape,
})
export type McpAddRentComparableInput = z.infer<
  typeof McpAddRentComparableInputSchema
>

// ---------------------------------------------------------------------------
// Lot 6 : visites, « ce qui a changé »
// ---------------------------------------------------------------------------

/**
 * `add_visit` : une visite faite ou planifiée, sans photo (les photos se
 * téléversent depuis l'application). Les participants sont désignés par leur
 * identifiant court (« richard », « chloe »).
 */
export const McpAddVisitInputSchema = z.object({
  listingId,
  ...VisitInputSchema.omit({ participantIds: true }).shape,
  participantHandles: z
    .array(z.string().min(1).max(40))
    .max(10)
    .default([])
    .describe(
      'Participants par identifiant court (« richard », « chloe ») ; vide = aucun précisé'
    ),
})
export type McpAddVisitInput = z.infer<typeof McpAddVisitInputSchema>

/** `list_visits` : les visites d'une annonce (sans les photos). */
export const McpListVisitsInputSchema = z.object({ listingId })
export type McpListVisitsInput = z.infer<typeof McpListVisitsInputSchema>

/** `whats_new` : ce qui a changé pour le membre depuis sa dernière visite. */
export const McpWhatsNewInputSchema = WhatsNewQuerySchema
export type McpWhatsNewInput = z.infer<typeof McpWhatsNewInputSchema>

/**
 * `list_members` (lot 8) : les membres de l'espace et leur identifiant
 * court, pour `add_task` (`assigneeHandle`) et `add_visit`
 * (`participantHandles`). Lecture seule : inviter, annuler et retirer ne se
 * font que dans l'application.
 */
export const McpListMembersInputSchema = z.object({})
export type McpListMembersInput = z.infer<typeof McpListMembersInputSchema>

// ---------------------------------------------------------------------------
// Lot 15 : suivi des mises à jour des annonces
// ---------------------------------------------------------------------------

/**
 * `check_listing` (lecture, rien n'est écrit) : ce que Claude a lu sur la
 * page de l'annonce (`observed`), ou le texte de la page (`pageText`, lu par
 * l'extraction côté serveur, coût signalé) ; rend les écarts classés, le
 * statut proposé et les republications probables.
 */
export const McpCheckListingInputSchema = z
  .object({
    listingId,
    ...ListingCheckPreviewRequestSchema.shape,
  })
  .refine(
    value =>
      value.observed !== undefined ||
      (value.pageText !== undefined && value.pageText.trim().length > 0) ||
      value.images.length > 0,
    {
      message:
        'Donnez observed (valeurs lues sur la page) ou pageText (texte de la page)',
      path: ['observed'],
    }
  )
export type McpCheckListingInput = z.infer<typeof McpCheckListingInputSchema>

/**
 * `apply_listing_check` (écriture) : applique les faits lus, enregistre la
 * vérification et rend le statut proposé, jamais appliqué.
 */
export const McpApplyListingCheckInputSchema = z.object({
  listingId,
  ...ListingCheckInputSchema.shape,
})
export type McpApplyListingCheckInput = z.infer<
  typeof McpApplyListingCheckInputSchema
>

/** Arguments du prompt MCP « tournée de mise à jour » (chaînes, par protocole). */
export const McpReviewListingsPromptArgsSchema = z.object({
  staleDays: z
    .string()
    .optional()
    .describe(
      `Revérifier les annonces sans vérification depuis plus de N jours (${DEFAULT_STALE_DAYS} par défaut)`
    ),
  limit: z
    .string()
    .optional()
    .describe('Nombre d’annonces à revérifier au plus dans cette tournée'),
  notes: z
    .string()
    .optional()
    .describe(
      'Consignes du membre (« seulement Talence », « commence par les offres faites »)'
    ),
})
export type McpReviewListingsPromptArgs = z.infer<
  typeof McpReviewListingsPromptArgsSchema
>

// ---------------------------------------------------------------------------
// Lot 16 : exploration par les critères
// ---------------------------------------------------------------------------

/**
 * `get_search_brief` (lecture) : ce que Claude cherche — les critères actifs
 * marges comprises, leurs zones, les portails cochés et leurs liens de
 * recherche fabriqués sans réseau, ce qui est déjà suivi ou écarté, la
 * dernière exploration.
 */
export const McpGetSearchBriefInputSchema = SearchBriefQuerySchema
export type McpGetSearchBriefInput = z.infer<
  typeof McpGetSearchBriefInputSchema
>

/** `triage_candidates` (lecture, rien n'est écrit) : la décision pour chaque annonce lue. */
export const McpTriageCandidatesInputSchema = TriageRequestSchema
export type McpTriageCandidatesInput = z.infer<
  typeof McpTriageCandidatesInputSchema
>

/**
 * `record_exploration` (écriture) : le serveur retrie chaque annonce, crée
 * l'exploration, son compte rendu et les brouillons « À valider », applique
 * les vérifications des annonces déjà suivies ; `runKey` rend l'envoi
 * idempotent. Aucune annonce n'est ajoutée à la liste.
 */
export const McpRecordExplorationInputSchema = ExplorationRecordSchema
export type McpRecordExplorationInput = z.infer<
  typeof McpRecordExplorationInputSchema
>

/** Arguments du prompt MCP « explorer les portails » (chaînes, par protocole). */
export const McpExploreListingsPromptArgsSchema = z.object({
  criteriaId: z
    .string()
    .optional()
    .describe(
      'Un seul critère (son identifiant) ; absent = tous les critères actifs'
    ),
  portals: z
    .string()
    .optional()
    .describe(
      'Portails à parcourir, séparés par des virgules (leboncoin, seloger, bienici, pap, logicimmo) ; absent = ceux cochés dans chaque critère'
    ),
  notes: z
    .string()
    .optional()
    .describe(
      'Consignes du membre (« seulement les T3 », « commence par PAP »)'
    ),
})
export type McpExploreListingsPromptArgs = z.infer<
  typeof McpExploreListingsPromptArgsSchema
>
