import { z } from 'zod'
import { AssumptionsOverrideSchema } from './assumptions.js'
import {
  CheckLevelSchema,
  DiscountClassSchema,
  DpeClassSchema,
  NotaryModeSchema,
  RentalVerdictSchema,
  SensitivityAxisSchema,
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
  marketPricePerM2: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Prix médian au m² des ventes DVF comparables, en euros ; null = critère « marché » non calculable'
    ),
})
export type ListingFinancials = z.infer<typeof ListingFinancialsSchema>
export type ListingFinancialsInput = z.input<typeof ListingFinancialsSchema>

/**
 * Un indicateur qui peut valoir NaN (surface ou coût nul) : accepté par le
 * schéma, rendu `null` en JSON par la sérialisation ; l'interface et le MCP
 * affichent « — ».
 */
const metricNumber = z.number().or(z.nan())

/**
 * Détail des frais de notaire. En mode « rate », seul le total est connu (les
 * postes sont null) ; en mode « scale », chaque poste est rendu. `estimated`
 * est vrai dans les deux cas : taux forfaitaire, ou forfaits de débours.
 */
export const NotaryFeesBreakdownSchema = z.object({
  mode: NotaryModeSchema,
  base: z
    .number()
    .describe(
      'Assiette en euros : net vendeur (prix moins honoraires acquéreur) moins le mobilier compris dans la vente'
    ),
  transferTax: z
    .number()
    .nullable()
    .describe(
      "Droits de mutation en euros (droit départemental, taxe communale, frais d'assiette) ; null en mode taux"
    ),
  emoluments: z
    .number()
    .nullable()
    .describe(
      'Émoluments proportionnels hors TVA, en euros ; null en mode taux'
    ),
  emolumentsVat: z
    .number()
    .nullable()
    .describe('TVA sur les émoluments, en euros ; null en mode taux'),
  securityContribution: z
    .number()
    .nullable()
    .describe(
      'Contribution de sécurité immobilière en euros ; null en mode taux'
    ),
  disbursements: z
    .number()
    .nullable()
    .describe(
      'Débours et formalités (forfait estimé) en euros ; null en mode taux'
    ),
  total: z
    .number()
    .describe('Frais de notaire retenus dans le coût tout compris, en euros'),
  estimated: z
    .boolean()
    .describe(
      'Vrai : valeur estimée (taux forfaitaire ou forfaits), affichée « ≈ »'
    ),
})
export type NotaryFeesBreakdown = z.infer<typeof NotaryFeesBreakdownSchema>

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
  notaryFeesDetail: NotaryFeesBreakdownSchema,
  renovationTotal: z.number().describe('Travaux en euros'),
  furnitureValue: z
    .number()
    .default(0)
    .describe('Mobilier en euros, compté dans le coût tout compris (lot 9)'),
  totalCost: z
    .number()
    .describe(
      'Coût tout compris : prix affiché + notaire + travaux + mobilier, en euros'
    ),
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
    'Rendement brut : 12 × loyer / coût tout compris (fraction) ; NaN si coût nul'
  ),
  netYield: metricNumber.describe(
    "Rendement net : net d'exploitation / coût tout compris (fraction) ; NaN si coût nul"
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
      'Prix affiché maximal en euros pour satisfaire le critère ; null si non calculable'
    ),
  active: z.boolean().describe('Critère retenu dans le minimum'),
  discount: z
    .number()
    .nullable()
    .describe(
      'Décote nécessaire pour ce seul critère : (prix affiché − prix maximal) / prix affiché, fraction ; négatif = marge ; null si non calculable'
    ),
  maxTotalCost: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Coût tout compris (prix + notaire + travaux + mobilier) au prix maximal du critère, en euros ; null si non calculable (lot 9)'
    ),
})
export type TargetPriceCriterion = z.infer<typeof TargetPriceCriterionSchema>

/**
 * L'annonce évaluée à un autre prix affiché (lot 9, « Et au prix cible ? ») :
 * mêmes formules que `compute`, seul le prix change.
 */
export const PriceOutcomeSchema = z.object({
  price: z.number().describe('Prix affiché retenu en euros'),
  totalCost: z
    .number()
    .describe(
      'Coût tout compris à ce prix (prix + notaire + travaux + mobilier), en euros'
    ),
  loanAmount: z.number().describe('Capital emprunté à ce prix, en euros'),
  monthlyPayment: z
    .number()
    .describe('Mensualité crédit + assurance à ce prix, en euros'),
  grossYield: metricNumber.describe(
    'Rendement brut à ce prix : 12 × loyer / coût tout compris (fraction)'
  ),
  netYield: metricNumber.describe(
    "Rendement net à ce prix : net d'exploitation / coût tout compris (fraction)"
  ),
  effort: z
    .number()
    .describe('Effort mensuel à ce prix en euros ; négatif = à sortir'),
  verdict: VerdictSchema,
  failures: z
    .array(z.enum(['gross_yield', 'effort', 'dpe']))
    .describe('Critères du verdict en échec à ce prix'),
  nearMisses: z
    .array(z.enum(['gross_yield', 'effort', 'dpe_unknown']))
    .describe('Critères du verdict « de peu » à ce prix'),
})
export type PriceOutcome = z.infer<typeof PriceOutcomeSchema>

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
  atTarget: PriceOutcomeSchema.nullable()
    .default(null)
    .describe(
      "L'annonce évaluée au prix cible : coût tout compris, mensualité, rendements, effort et verdict ; null sans prix cible (lot 9)"
    ),
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

/**
 * Tableau de sensibilité à deux entrées (lot 3) : deux axes au choix parmi
 * prix affiché, loyer, taux, apport et durée. Les pas sont des multiplicateurs
 * pour le prix et le loyer (0,85 = −15 %), des écarts absolus pour le taux
 * (en fraction : −0,005 = −0,5 point), l'apport (euros) et la durée (années).
 */
export const SensitivityRequestSchema = z
  .object({
    rowAxis: SensitivityAxisSchema.default('price').describe(
      'Axe des lignes (défaut : prix affiché)'
    ),
    colAxis: SensitivityAxisSchema.default('rent').describe(
      'Axe des colonnes (défaut : loyer)'
    ),
    includeTargetPrice: z
      .boolean()
      .default(false)
      .describe(
        'Vrai : sur l’axe du prix affiché, ajoute un pas au prix cible (repéré `isTarget`) s’il est calculable et absent de la grille (lot 9)'
      ),
    rowSteps: z
      .array(z.number())
      .min(1)
      .max(9)
      .optional()
      .describe(
        'Pas des lignes ; absent = grille par défaut de l’axe (prix : 0,85 à 1 ; loyer : 0,9 à 1,1 ; taux : ±0,005 ; apport : ±20 000 € ; durée : ±5 ans)'
      ),
    colSteps: z
      .array(z.number())
      .min(1)
      .max(9)
      .optional()
      .describe('Pas des colonnes ; absent = grille par défaut de l’axe'),
    assumptions: AssumptionsOverrideSchema.optional().describe(
      'Scénario : hypothèses remplacées champ par champ pour toute la grille'
    ),
  })
  .refine(value => value.rowAxis !== value.colAxis, {
    message: 'Les deux axes doivent être différents',
    path: ['colAxis'],
  })
export type SensitivityRequest = z.infer<typeof SensitivityRequestSchema>
export type SensitivityRequestInput = z.input<typeof SensitivityRequestSchema>

export const SensitivityStepSchema = z.object({
  step: z
    .number()
    .describe(
      'Pas appliqué : multiplicateur (prix, loyer) ou écart (taux, apport, durée)'
    ),
  value: z
    .number()
    .describe("Valeur absolue de l'axe pour cette ligne ou colonne"),
  isCurrent: z
    .boolean()
    .describe('Vrai pour le pas neutre (multiplicateur 1, écart 0)'),
  isTarget: z
    .boolean()
    .default(false)
    .describe(
      'Vrai pour le pas du prix cible (axe du prix affiché, `includeTargetPrice`) (lot 9)'
    ),
  totalCost: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Axe du prix affiché : coût tout compris (prix + notaire + travaux + mobilier) de ce pas, le même pour toute la ligne ; null pour les autres axes (lot 9)'
    ),
})
export type SensitivityStep = z.infer<typeof SensitivityStepSchema>

export const SensitivityGridCellSchema = z.object({
  price: z.number().describe('Prix affiché retenu en euros'),
  targetRent: z.number().describe('Loyer visé retenu en euros par mois'),
  rent: z.number().describe('Loyer retenu après plafond, euros par mois'),
  interestRate: z.number().describe('Taux retenu, fraction'),
  downPayment: z.number().describe('Apport retenu en euros'),
  durationYears: z.number().int().describe('Durée retenue en années'),
  totalCost: z.number().describe('Coût tout compris de la cellule, en euros'),
  monthlyPayment: z
    .number()
    .describe('Mensualité crédit + assurance de la cellule, en euros'),
  grossYield: metricNumber.describe(
    'Rendement brut de la cellule, sur le coût tout compris (fraction)'
  ),
  netYield: metricNumber.describe(
    'Rendement net de la cellule, sur le coût tout compris (fraction)'
  ),
  effort: z.number().describe('Effort mensuel de la cellule, en euros'),
  verdict: VerdictSchema,
  isCurrent: z
    .boolean()
    .describe('Vrai pour la cellule des valeurs actuelles (pas neutres)'),
})
export type SensitivityGridCell = z.infer<typeof SensitivityGridCellSchema>

export const SensitivityGridSchema = z.object({
  rowAxis: SensitivityAxisSchema,
  colAxis: SensitivityAxisSchema,
  rows: z.array(SensitivityStepSchema),
  cols: z.array(SensitivityStepSchema),
  cells: z
    .array(z.array(SensitivityGridCellSchema))
    .describe('Une liste par ligne, une cellule par colonne'),
  current: z
    .object({ row: z.number().int().min(0), col: z.number().int().min(0) })
    .nullable()
    .describe(
      'Position de la cellule des valeurs actuelles, si la grille la contient'
    ),
})
export type SensitivityGrid = z.infer<typeof SensitivityGridSchema>

/** Ce qu'une annonce « calculée » renvoie en plus de ses champs. */
export const ListingEvaluationSchema = z.object({
  metrics: ListingMetricsSchema,
  rental: RentalChecksResultSchema,
  targetPrice: TargetPriceSchema,
})
export type ListingEvaluation = z.infer<typeof ListingEvaluationSchema>
