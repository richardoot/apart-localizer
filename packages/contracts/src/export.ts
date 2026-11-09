import { z } from 'zod'
import { AssumptionsVersionSchema } from './assumptions.js'
import {
  OfferSchema,
  OpinionSchema,
  PriceEventSchema,
  TaskSchema,
} from './collaboration.js'
import { ListingSchema } from './listing.js'
import { ListingCheckSchema } from './listing-checks.js'
import { ListingLinkSchema } from './listing-links.js'
import { ListingMetricsSchema, TargetPriceSchema } from './metrics.js'
import { RentalVerdictSchema } from './enums.js'
import { ListingCriteriaFitSchema } from './criteria-fit.js'
import { OpinionCriterionSchema, OpinionSummarySchema } from './opinions.js'
import { ListingListQuerySchema } from './filters.js'
import { RentComparableSchema } from './rent-market.js'
import { SearchCriteriaSchema } from './search-criteria.js'
import { ScenarioSchema } from './study.js'
import { VisitSchema } from './visits.js'
import {
  ExplorationLineSchema,
  ExplorationSummarySchema,
} from './exploration.js'
import { AgencyRequestSchema, ListingContactSchema } from './agency-requests.js'

/**
 * Export des données de l'espace (portabilité, étude du besoin § 5) : CSV
 * pour un tableur (une ligne par annonce, indicateurs calculés par
 * `domain`) et JSON complet, versionné (`format`, `version`). Réservé aux
 * membres de l'espace ; aucune photo, aucune adresse e-mail de membre.
 */

export const EXPORT_FORMAT_ID = 'apart-localizer.export'
/** Version du format JSON ; elle change à toute modification incompatible. */
export const EXPORT_FORMAT_VERSION = 1

export const ExportFormatSchema = z
  .enum(['csv', 'json'])
  .describe('csv (tableur, séparateur « ; ») ou json (export complet)')
export type ExportFormat = z.infer<typeof ExportFormatSchema>

export const ExportScopeSchema = z
  .enum(['workspace', 'selection'])
  .describe(
    "workspace : toutes les annonces de l'espace, tous statuts ; selection : les filtres de la liste (et `ids`)"
  )
export type ExportScope = z.infer<typeof ExportScopeSchema>

/** `GET /export` : format, portée, et pour une sélection les filtres de la liste. */
export const ExportQuerySchema = ListingListQuerySchema.extend({
  format: ExportFormatSchema.default('json'),
  scope: ExportScopeSchema.default('workspace'),
  ids: z.preprocess(
    value =>
      value === undefined || value === ''
        ? undefined
        : Array.isArray(value)
          ? value
          : String(value)
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
    z.array(z.string().uuid()).max(500).optional()
  ),
})
export type ExportQuery = z.infer<typeof ExportQuerySchema>

/** Une visite exportée : sans ses photos (elles restent dans le stockage privé). */
export const ExportVisitSchema = VisitSchema.omit({ photos: true })

export const ExportListingSchema = z.object({
  listing: ListingSchema,
  indicators: z
    .object({
      metrics: ListingMetricsSchema,
      rentalVerdict: RentalVerdictSchema,
      targetPrice: TargetPriceSchema,
    })
    .describe(
      "Indicateurs calculés à l'export par `domain` avec les hypothèses en vigueur ; informatifs"
    ),
  opinions: z
    .array(OpinionSchema)
    .describe(
      'Les avis visibles par le membre qui exporte (lot 20 : même règle qu’à l’écran, un avis masqué à l’aveugle n’est pas exporté), avec toutes leurs notes par critère (`scores`, critères masqués compris)'
    ),
  opinionSummary: OpinionSummarySchema.nullable()
    .default(null)
    .describe(
      'Lot 20 : la confrontation des avis visibles à l’export (note commune, désaccords, bilan) ; informative, null dans un export antérieur'
    ),
  tasks: z.array(TaskSchema),
  priceEvents: z.array(PriceEventSchema),
  offers: z.array(OfferSchema),
  visits: z.array(ExportVisitSchema),
  rentComparables: z.array(RentComparableSchema),
  checks: z
    .array(ListingCheckSchema)
    .default([])
    .describe(
      'Lot 15 : vérifications sur le portail, de la plus récente à la plus ancienne (absent dans un export antérieur)'
    ),
  criteriaFit: ListingCriteriaFitSchema.describe(
    'Adéquation aux critères actifs à l’export (lot 14) : niveau, raisons, détail par critère'
  ),
  contact: ListingContactSchema.nullable()
    .default(null)
    .describe(
      "Lot 17 : contact de l'annonceur (agence, interlocuteur, e-mail, téléphone, messagerie) ; null s'il n'y en a pas ou dans un export antérieur"
    ),
  agencyRequests: z
    .array(AgencyRequestSchema)
    .default([])
    .describe(
      "Lot 17 : demandes à l'annonceur (messages, validation, envoi, réponses), de la plus récente à la plus ancienne (absent dans un export antérieur)"
    ),
  links: z
    .array(ListingLinkSchema)
    .default([])
    .describe(
      'Lot 18 : les liens de l’annonce, un par portail (prix affiché, en ligne ou non, origine), le principal d’abord (absent dans un export antérieur : `listing.url` est alors le seul lien)'
    ),
})
export type ExportListing = z.infer<typeof ExportListingSchema>

/** Lot 16 : une exploration exportée, avec les lignes de son compte rendu (extraits courts, masqués). */
export const ExportExplorationSchema = ExplorationSummarySchema.extend({
  lines: z.array(ExplorationLineSchema),
})
export type ExportExploration = z.infer<typeof ExportExplorationSchema>

export const ExportDocumentSchema = z.object({
  format: z.literal(EXPORT_FORMAT_ID),
  version: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.string().datetime(),
  scope: ExportScopeSchema,
  workspace: z.object({ id: z.string().uuid(), name: z.string() }),
  members: z
    .array(
      z.object({
        id: z.string().uuid(),
        handle: z.string(),
        displayName: z.string(),
      })
    )
    .describe('Membres, sans adresse e-mail ni identifiant de connexion'),
  assumptions: z.object({
    current: AssumptionsVersionSchema,
    history: z
      .array(AssumptionsVersionSchema)
      .describe('Toutes les versions, de la plus récente à la plus ancienne'),
  }),
  listings: z.array(ExportListingSchema),
  searchCriteria: z.array(SearchCriteriaSchema),
  scenarios: z.array(ScenarioSchema),
  explorations: z
    .array(ExportExplorationSchema)
    .default([])
    .describe(
      'Lot 16 : explorations des portails par Claude, de la plus récente à la plus ancienne, avec leurs lignes (absent dans un export antérieur)'
    ),
  opinionCriteria: z
    .array(OpinionCriterionSchema)
    .default([])
    .describe(
      'Lot 20 : les critères des avis de l’espace, masqués compris, dans l’ordre des fiches (absent dans un export antérieur)'
    ),
  opinionSettings: z
    .object({ blind: z.boolean() })
    .default({ blind: true })
    .describe('Lot 20 : avis à l’aveugle (vrai par défaut)'),
})
export type ExportDocument = z.infer<typeof ExportDocumentSchema>
