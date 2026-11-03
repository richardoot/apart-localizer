import { z } from 'zod'
import { AssumptionsVersionSchema } from './assumptions.js'
import {
  OfferSchema,
  OpinionSchema,
  PriceEventSchema,
  TaskSchema,
} from './collaboration.js'
import { ListingSchema } from './listing.js'
import { ListingMetricsSchema, TargetPriceSchema } from './metrics.js'
import { RentalVerdictSchema } from './enums.js'
import { ListingListQuerySchema } from './filters.js'
import { RentComparableSchema } from './rent-market.js'
import { SearchCriteriaSchema } from './search-criteria.js'
import { ScenarioSchema } from './study.js'
import { VisitSchema } from './visits.js'

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
  opinions: z.array(OpinionSchema),
  tasks: z.array(TaskSchema),
  priceEvents: z.array(PriceEventSchema),
  offers: z.array(OfferSchema),
  visits: z.array(ExportVisitSchema),
  rentComparables: z.array(RentComparableSchema),
})
export type ExportListing = z.infer<typeof ExportListingSchema>

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
})
export type ExportDocument = z.infer<typeof ExportDocumentSchema>
