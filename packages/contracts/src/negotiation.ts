import { z } from 'zod'
import {
  DiscountClassSchema,
  NegotiationArgumentKindSchema,
  OfferResponseSchema,
  TargetCriterionSchema,
} from './enums.js'

/** Un levier de négociation factuel, prêt à être repris dans une offre. */
export const NegotiationArgumentSchema = z.object({
  kind: NegotiationArgumentKindSchema,
  text: z
    .string()
    .describe('Argument en français, chiffré quand c’est possible'),
})
export type NegotiationArgument = z.infer<typeof NegotiationArgumentSchema>

/** Un critère du prix cible, avec la décote qu'il demande à lui seul. */
export const NegotiationCriterionSchema = z.object({
  criterion: TargetCriterionSchema,
  active: z.boolean().describe('Critère retenu dans les hypothèses'),
  maxPrice: z
    .number()
    .nullable()
    .describe('Prix maximal en euros pour satisfaire ce critère'),
  discount: z
    .number()
    .nullable()
    .describe(
      'Décote nécessaire pour ce critère, fraction du prix affiché ; négatif = marge'
    ),
  discountClass: DiscountClassSchema.nullable(),
})
export type NegotiationCriterion = z.infer<typeof NegotiationCriterionSchema>

export const PriceDropsSummarySchema = z.object({
  count: z
    .number()
    .int()
    .min(0)
    .describe('Nombre de baisses constatées dans l’historique'),
  firstPrice: z
    .number()
    .nullable()
    .describe('Premier prix constaté en euros ; null sans historique'),
  totalDrop: z
    .number()
    .describe('Baisse cumulée depuis le premier prix, en euros (0 si aucune)'),
  totalDropRate: z
    .number()
    .nullable()
    .describe(
      'Baisse cumulée en fraction du premier prix ; null sans historique'
    ),
})
export type PriceDropsSummary = z.infer<typeof PriceDropsSummarySchema>

/**
 * La chaîne de republication d'une annonce (lot 15) : combien de
 * publications antérieures du même bien sont rattachées, depuis quand le
 * bien est en ligne.
 */
export const RepublicationChainSummarySchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .describe('Publications antérieures rattachées (1 = une republication)'),
  firstListingId: z
    .string()
    .uuid()
    .nullable()
    .describe('La publication d’origine'),
  firstTitle: z.string().nullable(),
  firstSeenAt: z
    .string()
    .datetime()
    .nullable()
    .describe(
      'Première publication constatée (date de publication, à défaut d’ajout) de la publication d’origine'
    ),
})
export type RepublicationChainSummary = z.infer<
  typeof RepublicationChainSummarySchema
>

export const LastOfferSummarySchema = z.object({
  amount: z.number().describe('Montant de la dernière offre en euros'),
  response: OfferResponseSchema,
  counterAmount: z.number().nullable(),
  madeAt: z.string().datetime(),
})
export type LastOfferSummary = z.infer<typeof LastOfferSummarySchema>

/**
 * Le brief de négociation : à partir du prix affiché, des prix cibles et de
 * l'historique (prix et offres), ce qu'il faut obtenir et avec quels
 * arguments. Calcul pur dans `packages/domain` (`negotiationBrief`), sans IA.
 */
export const NegotiationBriefSchema = z.object({
  listedPrice: z.number().describe('Prix affiché en euros'),
  targetPrice: z
    .number()
    .nullable()
    .describe('Prix cible en euros : le plus contraignant des critères actifs'),
  bindingCriterion: TargetCriterionSchema.nullable(),
  discount: z
    .number()
    .nullable()
    .describe('Décote nécessaire, fraction du prix affiché'),
  discountClass: DiscountClassSchema.nullable(),
  criteria: z.array(NegotiationCriterionSchema),
  suggestedOffer: z
    .number()
    .nullable()
    .describe(
      "Prix d'offre suggéré en euros : prix cible arrondi au millier inférieur, jamais au-dessus du prix affiché"
    ),
  suggestedOfferDiscount: z
    .number()
    .nullable()
    .describe(
      "Décote de l'offre suggérée par rapport au prix affiché, fraction"
    ),
  marginToTarget: z
    .number()
    .nullable()
    .describe(
      'Prix cible moins offre suggérée, en euros : marge de négociation conservée'
    ),
  daysOnline: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe(
      'Jours depuis la publication (ou depuis l’ajout si la date de publication est inconnue)'
    ),
  daysOnlineSince: z
    .enum(['published', 'added'])
    .nullable()
    .describe(
      'Origine du compte de jours : date de publication ou date d’ajout'
    ),
  priceDrops: PriceDropsSummarySchema,
  lastOffer: LastOfferSummarySchema.nullable(),
  arguments: z.array(NegotiationArgumentSchema),
  republication: RepublicationChainSummarySchema.nullable()
    .default(null)
    .describe(
      'Lot 15 : annonce republiée (même bien, publication antérieure rattachée) ; durée en ligne et baisses comptées depuis la première publication ; null sinon'
    ),
})
export type NegotiationBrief = z.infer<typeof NegotiationBriefSchema>
