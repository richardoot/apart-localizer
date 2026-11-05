import { z } from 'zod'
import { AssumptionsOverrideSchema, AssumptionsSchema } from './assumptions.js'
import {
  OfferSchema,
  OpinionSchema,
  PriceEventSchema,
  TaskSchema,
} from './collaboration.js'
import { DuplicateCandidateSchema } from './duplicates.js'
import { ListingStatusSchema } from './enums.js'
import { LISTING_PAGE_MAX } from './filters.js'
import { ListingInputSchema, ListingSchema } from './listing.js'
import {
  ListingCheckSummarySchema,
  ListingRepublicationSchema,
} from './listing-checks.js'
import {
  ListingEvaluationSchema,
  NotaryFeesBreakdownSchema,
  SensitivityGridSchema,
  TargetPriceSchema,
} from './metrics.js'
import { NegotiationBriefSchema } from './negotiation.js'
import {
  CriteriaFitCountsSchema,
  EMPTY_FIT_COUNTS,
  ListingCriteriaFitSchema,
  NO_CRITERIA_FIT,
} from './criteria-fit.js'
import {
  CriteriaMatchChangesSchema,
  CriteriaMatchSchema,
} from './search-criteria.js'
import { withoutDefaults } from './zod-utils.js'

/**
 * Une annonce « vue » : ses champs, ses calculs, et ce que le membre
 * connecté a besoin de savoir pour l'afficher (nouveau pour moi, distance au
 * point du filtre, avis, tâches, historique des prix). La même forme sert à
 * la liste, à la fiche, et aux réponses du MCP.
 */
export const EvaluatedListingSchema = z.object({
  listing: ListingSchema,
  evaluation: ListingEvaluationSchema,
  distanceMeters: z
    .number()
    .nullable()
    .default(null)
    .describe('Distance au point du filtre « près de », en mètres, sinon null'),
  isNewForMe: z
    .boolean()
    .describe("Vrai si le membre connecté n'a pas encore ouvert l'annonce"),
  opinions: z.array(OpinionSchema).default([]),
  tasks: z.array(TaskSchema).default([]),
  priceEvents: z
    .array(PriceEventSchema)
    .default([])
    .describe('Historique des prix, du plus récent au plus ancien'),
  offers: z
    .array(OfferSchema)
    .default([])
    .describe('Offres faites, de la plus récente à la plus ancienne'),
  criteriaMatches: z
    .array(CriteriaMatchSchema)
    .default([])
    .describe(
      "Critères de recherche actifs dans lesquels l'annonce est entrée (alertes)"
    ),
  criteriaFit: ListingCriteriaFitSchema.default(() => ({
    ...NO_CRITERIA_FIT,
  })).describe(
    'Adéquation aux critères actifs (lot 14) : meilleur niveau, raisons, détail par critère, « depuis », gardée malgré « hors critères »'
  ),
  criteriaChanges: CriteriaMatchChangesSchema.nullable()
    .default(null)
    .describe(
      "Après une création ou une mise à jour : critères dans lesquels l'annonce entre, dont elle sort, ou dont le niveau change ; null à la lecture"
    ),
  lastCheck: ListingCheckSummarySchema.nullable()
    .default(null)
    .describe(
      'Lot 15 : la dernière vérification sur le portail (date, canal, résultat, résumé) ; null si jamais vérifiée'
    ),
  republication: ListingRepublicationSchema.default({
    from: null,
    to: null,
  }).describe(
    'Lot 15 : annonce que celle-ci reprend et annonce qui la reprend (republication du même bien)'
  ),
})
export type EvaluatedListing = z.infer<typeof EvaluatedListingSchema>

/**
 * L'adéquation de la page de liste (lot 14) : les critères actifs, et les
 * annonces par niveau pour les autres filtres de la liste (les compteurs des
 * deux onglets ne dépendent pas de l'onglet ouvert).
 */
export const ListingListFitSchema = z.object({
  activeCriteria: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .describe(
      'Les critères actifs comparés (aucun : toutes les annonces sont « dans les critères »)'
    ),
  counts: CriteriaFitCountsSchema.describe(
    'Annonces par niveau, filtres de la liste appliqués sauf `fit`'
  ),
  kept: z
    .number()
    .int()
    .min(0)
    .describe(
      'Parmi les « hors critères », celles gardées dans l’onglet principal (offre en cours, visite prévue)'
    ),
  criteriaId: z
    .string()
    .uuid()
    .nullable()
    .describe(
      'Le critère appliqué (`criteriaId`) : les niveaux sont les siens'
    ),
})
export type ListingListFit = z.infer<typeof ListingListFitSchema>

/** Une page de la liste d'annonces. */
export const ListingListSchema = z.object({
  items: z.array(EvaluatedListingSchema),
  total: z
    .number()
    .int()
    .describe('Nombre total d’annonces qui passent les filtres'),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(LISTING_PAGE_MAX),
  pageCount: z.number().int().min(0),
  fit: ListingListFitSchema.default(() => ({
    activeCriteria: [],
    counts: { ...EMPTY_FIT_COUNTS },
    kept: 0,
    criteriaId: null,
  })),
})
export type ListingList = z.infer<typeof ListingListSchema>

/**
 * Une annonce hypothétique à évaluer sans l'enregistrer : les mêmes champs
 * qu'une création, le titre en option.
 */
export const HypotheticalListingSchema = ListingInputSchema.omit({
  status: true,
  discardReason: true,
  fieldSources: true,
  sourceText: true,
}).extend({
  title: z.string().min(1).max(300).default('Annonce hypothétique'),
})
export type HypotheticalListing = z.infer<typeof HypotheticalListingSchema>

/**
 * Demande d'évaluation : soit une annonce enregistrée (`listingId`), avec des
 * surcharges facultatives de ses champs, soit une annonce hypothétique
 * (`listing`). Dans les deux cas, `assumptions` surcharge les hypothèses en
 * vigueur pour un scénario « et si » (taux, apport, durée...).
 */
export const EvaluateRequestSchema = z
  .object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe(
        'Annonce enregistrée à évaluer ; absent = annonce hypothétique'
      ),
    listing: HypotheticalListingSchema.optional().describe(
      'Annonce hypothétique complète (sans listingId) ou champs à surcharger (avec listingId)'
    ),
    overrides: z
      .object(withoutDefaults(HypotheticalListingSchema.shape))
      .partial()
      .optional()
      .describe(
        "Avec listingId : champs de l'annonce à remplacer pour le calcul (prix négocié, loyer, travaux...)"
      ),
    assumptions: AssumptionsOverrideSchema.optional().describe(
      'Scénario : hypothèses remplacées champ par champ (taux, apport, durée...) pour ce calcul seulement'
    ),
  })
  .refine(
    value => value.listingId !== undefined || value.listing !== undefined,
    {
      message:
        'Donnez listingId (annonce enregistrée) ou listing (hypothétique)',
    }
  )
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>

export const EvaluateResultSchema = z.object({
  listing: HypotheticalListingSchema.describe(
    "L'annonce telle qu'évaluée, surcharges appliquées"
  ),
  assumptions: AssumptionsSchema.describe('Les hypothèses utilisées'),
  evaluation: ListingEvaluationSchema,
  persisted: z.boolean().describe('Faux : rien n’a été enregistré'),
})
export type EvaluateResult = z.infer<typeof EvaluateResultSchema>

/**
 * Réponse d'une création : l'annonce vue, les doublons probables trouvés au
 * moment de créer (la création n'est pas bloquée) et les tâches posées pour
 * les champs manquants d'une annonce extraite par l'IA.
 */
export const ListingCreateResultSchema = EvaluatedListingSchema.extend({
  duplicates: z
    .array(DuplicateCandidateSchema)
    .default([])
    .describe('Annonces existantes qui ressemblent à celle créée'),
  createdTasks: z
    .array(TaskSchema)
    .default([])
    .describe('Tâches créées pour les champs indispensables manquants'),
})
export type ListingCreateResult = z.infer<typeof ListingCreateResultSchema>

/** Rang d'une annonce par décote nécessaire parmi les annonces actives de l'espace. */
export const TargetPriceRankSchema = z.object({
  position: z
    .number()
    .int()
    .min(1)
    .describe(
      'Rang par décote nécessaire croissante (1 = la plus proche de sa cible)'
    ),
  total: z
    .number()
    .int()
    .min(1)
    .describe('Annonces actives dont le prix cible est calculable'),
})
export type TargetPriceRank = z.infer<typeof TargetPriceRankSchema>

/**
 * « À partir de quel prix ? » : les prix cibles par critère, le critère liant,
 * la décote et son classement, le rang parmi les annonces actives, le brief
 * de négociation et le détail des frais de notaire, pour une annonce
 * enregistrée (`listingId`) ou hypothétique (`listingId` null).
 */
export const TargetPriceReportSchema = z.object({
  listingId: z
    .string()
    .uuid()
    .nullable()
    .describe('Annonce enregistrée ; null pour une annonce hypothétique'),
  title: z.string(),
  status: ListingStatusSchema.nullable(),
  price: z.number().describe('Prix affiché en euros'),
  targetPrice: TargetPriceSchema,
  rank: TargetPriceRankSchema.nullable().describe(
    'Rang parmi les annonces actives ; null pour une annonce hypothétique ou sans prix cible'
  ),
  negotiation: NegotiationBriefSchema,
  notaryFees: NotaryFeesBreakdownSchema.describe(
    'Frais de notaire au prix affiché, détaillés en mode barème'
  ),
  assumptions: AssumptionsSchema.describe('Les hypothèses utilisées'),
  sensitivity: SensitivityGridSchema.nullable()
    .default(null)
    .describe('Tableau de sensibilité, si demandé'),
})
export type TargetPriceReport = z.infer<typeof TargetPriceReportSchema>

/** Comparaison côte à côte de 2 à 6 annonces de l'espace. */
export const CompareRequestSchema = z.object({
  listingIds: z
    .array(z.string().uuid())
    .min(2)
    .max(6)
    .describe('Identifiants des annonces à comparer (2 à 6)'),
})
export type CompareRequest = z.infer<typeof CompareRequestSchema>

const rank = (what: string) =>
  z
    .number()
    .int()
    .min(1)
    .nullable()
    .describe(`Rang (1 = meilleur) parmi les annonces comparées : ${what}`)

export const CompareRanksSchema = z.object({
  score: rank('score de verdict'),
  grossYield: rank('rendement brut'),
  netYield: rank('rendement net'),
  effort: rank('effort mensuel (le moins lourd)'),
  pricePerM2: rank('prix au m² (le plus bas)'),
  discount: rank('décote nécessaire (la plus faible)'),
})
export type CompareRanks = z.infer<typeof CompareRanksSchema>

export const CompareItemSchema = EvaluatedListingSchema.extend({
  ranks: CompareRanksSchema,
})
export type CompareItem = z.infer<typeof CompareItemSchema>

export const CompareResultSchema = z.object({
  items: z
    .array(CompareItemSchema)
    .describe('Dans l’ordre des identifiants demandés'),
  best: z
    .object({
      score: z.string().uuid().nullable(),
      grossYield: z.string().uuid().nullable(),
      netYield: z.string().uuid().nullable(),
      effort: z.string().uuid().nullable(),
      pricePerM2: z.string().uuid().nullable(),
      discount: z.string().uuid().nullable(),
    })
    .describe('Identifiant de la meilleure annonce pour chaque indicateur'),
})
export type CompareResult = z.infer<typeof CompareResultSchema>
