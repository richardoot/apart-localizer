import { z } from 'zod'
import {
  CheckLevelSchema,
  DiscountClassSchema,
  DpeClassSchema,
  RentalVerdictSchema,
  TargetCriterionSchema,
  VerdictSchema,
} from './enums.js'

/**
 * Entrée financière minimale d'une annonce pour le paquet `domain` : ce que
 * `compute` a besoin de connaître. L'API la dérive d'une annonce enregistrée ;
 * le MCP `evaluate_listing` l'accepte telle quelle pour une annonce hypothétique.
 */
export const ListingFinancialsSchema = z.object({
  price: z.number().min(0).describe('Prix affiché FAI en euros'),
  buyerFees: z
    .number()
    .min(0)
    .default(0)
    .describe(
      'Honoraires à charge acquéreur en euros (0 si à charge vendeur) ; retirés de la base des frais de notaire'
    ),
  surface: z
    .number()
    .min(0)
    .default(0)
    .describe('Surface en m² (0 = inconnue)'),
  targetRent: z
    .number()
    .min(0)
    .default(0)
    .describe('Loyer visé hors charges en euros par mois'),
  rentControlled: z
    .boolean()
    .default(false)
    .describe("Commune soumise à l'encadrement des loyers"),
  referenceRentPerM2: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Loyer de référence majoré en euros par m² par mois ; plafond = × surface'
    ),
  furnitureValue: z.number().min(0).default(0).describe('Mobilier en euros'),
  renovationTotal: z
    .number()
    .min(0)
    .default(0)
    .describe(
      'Total des travaux en euros (somme des postes si les travaux sont actifs, sinon 0)'
    ),
  propertyTax: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Taxe foncière annuelle en euros ; null = estimée à un mois de loyer'
    ),
  annualCharges: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Charges de copropriété annuelles totales en euros'),
  nonRecoverableChargesMonthly: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Part non récupérable en euros par mois ; null = estimée à 25 % des charges annuelles / 12'
    ),
  dpeClass: DpeClassSchema.nullable().default(null),
})
export type ListingFinancials = z.infer<typeof ListingFinancialsSchema>
export type ListingFinancialsInput = z.input<typeof ListingFinancialsSchema>

/**
 * Un indicateur qui peut valoir NaN (surface ou coût nul) : accepté par le
 * schéma, rendu `null` en JSON par la sérialisation ; l'interface et le MCP
 * affichent « — ».
 */
const metricNumber = z.number().or(z.nan())

/** Sortie de `compute` : coût, financement, exploitation, verdict. */
export const ListingMetricsSchema = z.object({
  price: z.number().describe('Prix affiché en euros'),
  surface: z.number().describe('Surface en m²'),
  targetRent: z.number().describe('Loyer visé en euros par mois'),
  rent: z
    .number()
    .describe('Loyer retenu : min(loyer visé, plafond) en euros par mois'),
  rentControlled: z.boolean(),
  rentCap: z
    .number()
    .nullable()
    .describe("Plafond mensuel d'encadrement en euros ; null si aucun"),
  notaryFees: z.number().describe('Frais de notaire en euros'),
  renovationTotal: z.number().describe('Travaux en euros'),
  totalCost: z
    .number()
    .describe('Coût total : prix + notaire + travaux + mobilier, en euros'),
  loanAmount: z
    .number()
    .describe('Capital emprunté en euros : max(0, coût − apport)'),
  monthlyFactor: z
    .number()
    .describe('Facteur mensuel k (crédit + assurance) appliqué au capital'),
  monthlyPayment: z.number().describe('Mensualité crédit + assurance en euros'),
  propertyTax: z.number().describe('Taxe foncière annuelle retenue en euros'),
  propertyTaxEstimated: z
    .boolean()
    .describe('Taxe foncière estimée (≈) faute de saisie'),
  nonRecoverableChargesMonthly: z
    .number()
    .describe('Charges non récupérables retenues, euros par mois'),
  nonRecoverableChargesEstimated: z
    .boolean()
    .describe('Part non récupérable estimée (≈) faute de saisie'),
  annualCharges: z
    .number()
    .nullable()
    .describe('Charges annuelles totales en euros, si connues'),
  collectedRent: z
    .number()
    .describe('Loyers encaissés par an après vacance, en euros'),
  netOperating: z
    .number()
    .describe("Résultat net d'exploitation annuel en euros (avant crédit)"),
  grossYield: metricNumber.describe(
    'Rendement brut : 12 × loyer / coût total (fraction) ; NaN si coût nul'
  ),
  netYield: metricNumber.describe(
    "Rendement net : net d'exploitation / coût total (fraction) ; NaN si coût nul"
  ),
  effort: z
    .number()
    .describe(
      'Effort mensuel en euros : net / 12 − mensualité ; négatif = à sortir'
    ),
  pricePerM2: metricNumber.describe(
    'Prix au m² en euros ; NaN si surface nulle'
  ),
  rentPerM2: metricNumber.describe(
    'Loyer au m² en euros par mois ; NaN si surface nulle'
  ),
  maxCostRule220: z
    .number()
    .describe(
      'Repère 220 × loyer : coût au-delà duquel le brut passe sous ≈ 5,45 %'
    ),
  verdict: VerdictSchema,
  score: z
    .number()
    .describe(
      'Score de tri : 2000 cible | 1000 à creuser | 0, plus brut × 1000'
    ),
  failures: z
    .array(z.enum(['gross_yield', 'effort', 'dpe']))
    .describe('Critères en échec'),
  nearMisses: z
    .array(z.enum(['gross_yield', 'effort', 'dpe_unknown']))
    .describe('Critères « de peu »'),
})
export type ListingMetrics = z.infer<typeof ListingMetricsSchema>

export const RentalCheckSchema = z.object({
  key: z.enum([
    'dpe_ban',
    'rent_control',
    'market_rent',
    'co_ownership',
    'decency',
    'rental_permit',
    'demand',
    'effort',
  ]),
  level: CheckLevelSchema,
  message: z.string().describe('Explication en français'),
})
export type RentalCheck = z.infer<typeof RentalCheckSchema>

export const RentalChecksResultSchema = z.object({
  year: z.number().int().describe('Année de mise en location retenue'),
  checks: z.array(RentalCheckSchema),
  verdict: RentalVerdictSchema,
  rank: z
    .number()
    .int()
    .describe('2 compatible, 1 sous conditions, 0 incompatible'),
  unknownCount: z.number().int(),
})
export type RentalChecksResult = z.infer<typeof RentalChecksResultSchema>

export const TargetPriceCriterionSchema = z.object({
  criterion: TargetCriterionSchema,
  maxPrice: z
    .number()
    .nullable()
    .describe(
      'Prix maximal en euros pour satisfaire le critère ; null si non calculable'
    ),
  active: z.boolean().describe('Critère retenu dans le minimum'),
})
export type TargetPriceCriterion = z.infer<typeof TargetPriceCriterionSchema>

export const TargetPriceSchema = z.object({
  criteria: z.array(TargetPriceCriterionSchema),
  targetPrice: z
    .number()
    .nullable()
    .describe('Prix cible en euros : minimum des critères actifs'),
  bindingCriterion: TargetCriterionSchema.nullable().describe(
    'Critère qui donne le minimum'
  ),
  discount: z
    .number()
    .nullable()
    .describe(
      'Décote nécessaire : (prix affiché − prix cible) / prix affiché, fraction'
    ),
  discountClass: DiscountClassSchema.nullable(),
})
export type TargetPrice = z.infer<typeof TargetPriceSchema>

export const SensitivityCellSchema = z.object({
  priceFactor: z.number().describe('Multiplicateur du prix (0,85 à 1)'),
  rateDelta: z
    .number()
    .describe('Variation du taux en points de fraction (−0,005, 0, +0,005)'),
  rentFactor: z.number().describe('Multiplicateur du loyer (0,9 à 1,1)'),
  price: z.number(),
  interestRate: z.number(),
  rent: z.number(),
  grossYield: z.number(),
  effort: z.number(),
  verdict: VerdictSchema,
})
export type SensitivityCell = z.infer<typeof SensitivityCellSchema>

export const SensitivitySchema = z.object({
  cells: z.array(SensitivityCellSchema),
})
export type Sensitivity = z.infer<typeof SensitivitySchema>

/** Ce qu'une annonce « calculée » renvoie en plus de ses champs. */
export const ListingEvaluationSchema = z.object({
  metrics: ListingMetricsSchema,
  rental: RentalChecksResultSchema,
  targetPrice: TargetPriceSchema,
})
export type ListingEvaluation = z.infer<typeof ListingEvaluationSchema>
