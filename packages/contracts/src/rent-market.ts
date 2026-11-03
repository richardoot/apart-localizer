import { z } from 'zod'
import { CheckLevelSchema, ListingSourceSchema } from './enums.js'
import { withoutDefaults } from './zod-utils.js'

/**
 * Loyer de marché par comparables saisis à la main (lot 5, besoin L4) : cinq
 * à dix annonces de location semblables, leur médiane au m² et la position du
 * loyer visé et du plafond d'encadrement. Aucune collecte automatique : les
 * portails ne sont jamais interrogés par le serveur.
 */

/** Comparables nécessaires pour qu'une médiane soit retenue. */
export const RENT_MARKET_MIN_COMPARABLES = 5
/** Au-delà, la saisie n'apporte plus grand-chose (indicatif). */
export const RENT_MARKET_TARGET_COMPARABLES = 10
/** Nombre maximal de comparables par annonce. */
export const RENT_COMPARABLES_MAX = 30
/** Un comparable relevé il y a plus de douze mois est signalé « ancien ». */
export const RENT_MARKET_STALE_MONTHS = 12
/** Écart au marché au-delà duquel le loyer visé expose à la vacance (comme le contrôle de louabilité). */
export const RENT_MARKET_GAP_WARN = 0.08

export const RentComparableInputSchema = z.object({
  rent: z
    .number()
    .positive()
    .max(20_000)
    .describe('Loyer hors charges en euros par mois'),
  surface: z.number().positive().max(1000).describe('Surface habitable en m²'),
  furnished: z
    .boolean()
    .default(false)
    .describe('Location meublée (vrai) ou vide (faux)'),
  rooms: z
    .number()
    .int()
    .min(1)
    .max(20)
    .nullable()
    .default(null)
    .describe('Nombre de pièces principales'),
  observedAt: z
    .string()
    .date()
    .nullable()
    .default(null)
    .describe('Date de l’annonce de location (AAAA-MM-JJ)'),
  source: ListingSourceSchema.default('autre'),
  sourceLabel: z
    .string()
    .max(200)
    .nullable()
    .default(null)
    .describe('Précision sur la source (agence, texte libre)'),
  url: z.string().url().max(2000).nullable().default(null),
  address: z
    .string()
    .max(300)
    .nullable()
    .default(null)
    .describe('Adresse ou quartier de l’annonce comparable'),
  note: z.string().max(1000).nullable().default(null),
})
export type RentComparableInput = z.infer<typeof RentComparableInputSchema>
export type RentComparableInputRaw = z.input<typeof RentComparableInputSchema>

export const RentComparableSchema = RentComparableInputSchema.extend({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type RentComparable = z.infer<typeof RentComparableSchema>

/**
 * Modification d'un comparable : champs présents seulement (sans les valeurs
 * par défaut, qui écraseraient les champs absents).
 */
export const RentComparableUpdateSchema = z
  .object(withoutDefaults(RentComparableInputSchema.shape))
  .partial()
export type RentComparableUpdate = z.infer<typeof RentComparableUpdateSchema>

/** Un comparable tel que le calcul l'a lu : retenu ou écarté, et pourquoi. */
export const RentComparableUseSchema = z.object({
  id: z.string().nullable(),
  rent: z.number(),
  surface: z.number(),
  rentPerM2: z.number().describe('Loyer au m² en euros par mois'),
  furnished: z.boolean(),
  observedAt: z.string().date().nullable(),
  included: z.boolean().describe('Retenu dans la médiane'),
  stale: z.boolean().describe('Relevé il y a plus de douze mois'),
  reason: z.string().nullable().describe('Raison de l’écart, si écarté'),
})
export type RentComparableUse = z.infer<typeof RentComparableUseSchema>

export const RentMarketStatsSchema = z.object({
  count: z.number().int().min(0),
  medianRent: z.number().describe('Loyer médian en euros par mois'),
  medianRentPerM2: z.number().describe('Loyer médian au m² en euros par mois'),
  p25RentPerM2: z.number().describe('Premier quartile au m²'),
  p75RentPerM2: z.number().describe('Troisième quartile au m²'),
  minRentPerM2: z.number(),
  maxRentPerM2: z.number(),
})
export type RentMarketStats = z.infer<typeof RentMarketStatsSchema>

/** Le loyer de marché d'une annonce d'après ses comparables. */
export const RentMarketReportSchema = z.object({
  listingId: z.string().uuid().nullable(),
  surface: z.number().nullable().describe('Surface de l’annonce en m²'),
  furnished: z
    .boolean()
    .describe(
      'L’annonce sera louée meublée : seuls les comparables meublés comptent'
    ),
  comparables: z.array(RentComparableUseSchema),
  stats: RentMarketStatsSchema.nullable().describe(
    'Statistiques des comparables retenus ; null sans comparable retenu'
  ),
  enough: z
    .boolean()
    .describe('Au moins cinq comparables retenus : la médiane est exploitable'),
  estimatedRent: z
    .number()
    .nullable()
    .describe(
      'Loyer de marché estimé = médiane au m² × surface, en euros par mois (estimé)'
    ),
  targetRent: z.number().nullable().describe('Loyer visé, euros par mois'),
  gapToMarket: z
    .number()
    .nullable()
    .describe(
      'Écart du loyer visé au loyer estimé, fraction (0,08 = 8 % au-dessus)'
    ),
  targetPercentile: z
    .number()
    .nullable()
    .describe(
      'Part des comparables retenus dont le loyer au m² est sous celui du loyer visé (0 à 1)'
    ),
  rentCap: z
    .number()
    .nullable()
    .describe('Plafond mensuel d’encadrement, s’il existe'),
  capGapToMarket: z
    .number()
    .nullable()
    .describe('Écart du plafond au loyer estimé, fraction'),
  level: CheckLevelSchema.describe(
    'ok : loyer visé cohérent ; warn : au-dessus du marché ou au-dessus du plafond ; unknown : moins de cinq comparables'
  ),
  messages: z.array(z.string()),
})
export type RentMarketReport = z.infer<typeof RentMarketReportSchema>

/** Réponse de la liste des comparables d'une annonce : les lignes et leur synthèse. */
export const RentComparableListSchema = z.object({
  items: z.array(RentComparableSchema),
  market: RentMarketReportSchema,
})
export type RentComparableList = z.infer<typeof RentComparableListSchema>

/** Réponse d'une écriture de comparable : la ligne et la synthèse à jour. */
export const RentComparableWriteResultSchema = z.object({
  comparable: RentComparableSchema,
  market: RentMarketReportSchema,
})
export type RentComparableWriteResult = z.infer<
  typeof RentComparableWriteResultSchema
>
