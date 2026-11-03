import { z } from 'zod'
import { AssumptionsOverrideSchema, AssumptionsSchema } from './assumptions.js'
import { OpinionSchema, PriceEventSchema, TaskSchema } from './collaboration.js'
import { LISTING_PAGE_MAX } from './filters.js'
import { ListingInputSchema, ListingSchema } from './listing.js'
import { ListingEvaluationSchema } from './metrics.js'
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
})
export type EvaluatedListing = z.infer<typeof EvaluatedListingSchema>

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
