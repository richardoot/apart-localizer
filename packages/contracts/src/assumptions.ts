import { z } from 'zod'
import { CriteriaFitRefreshSummarySchema } from './criteria-fit.js'
import {
  NotaryModeSchema,
  TargetCriterionSchema,
  VerdictSchema,
} from './enums.js'
import { withoutDefaults } from './zod-utils.js'
import {
  DEFAULT_TAX_PARAMETERS,
  FurnishedRentalKindSchema,
  TaxParametersSchema,
  TaxRegimeSchema,
} from './fiscal.js'

const fraction = (what: string) =>
  z.number().min(0).max(1).describe(`${what}, en fraction (0,05 = 5 %)`)

/** Une tranche du barème des émoluments proportionnels du notaire. */
export const NotaryScaleBandSchema = z.object({
  upTo: z
    .number()
    .positive()
    .nullable()
    .describe(
      'Borne supérieure de la tranche en euros ; null = dernière tranche, sans limite'
    ),
  rate: fraction(
    "Taux de l'émolument appliqué à la part du prix dans la tranche"
  ),
})
export type NotaryScaleBand = z.infer<typeof NotaryScaleBandSchema>

/**
 * Barème des frais de notaire pour un logement ancien : droits de mutation,
 * émoluments proportionnels par tranches, contribution de sécurité
 * immobilière, débours. Les valeurs par défaut sont celles de la Gironde ;
 * voir `DEFAULT_NOTARY_SCALE` et le modèle de calcul § 2.
 */
export const NotaryScaleSchema = z.object({
  departmentalRate: fraction(
    "Droit départemental d'enregistrement sur le prix (4,5 % de droit commun, 5 % quand le département a relevé son taux)"
  ),
  communalRate: fraction('Taxe communale additionnelle sur le prix'),
  collectionFeeRate: fraction(
    "Frais d'assiette et de recouvrement de l'État, en fraction du droit départemental"
  ),
  emolumentBands: z
    .array(NotaryScaleBandSchema)
    .min(1)
    .describe(
      'Tranches croissantes des émoluments proportionnels (article A444-91 du code de commerce), la dernière sans borne'
    ),
  emolumentVatRate: fraction('TVA sur les émoluments'),
  securityContributionRate: fraction(
    'Contribution de sécurité immobilière, sur le prix (CGI, art. 879 et 881 K)'
  ),
  securityContributionMinimum: z
    .number()
    .min(0)
    .describe('Minimum de la contribution de sécurité immobilière, en euros'),
  disbursements: z
    .number()
    .min(0)
    .describe(
      'Débours et émoluments de formalités, forfait estimé en euros (documents d’urbanisme, cadastre, publicité foncière)'
    ),
  label: z
    .string()
    .max(200)
    .default('')
    .describe('Origine et date de relevé des valeurs, pour l’affichage'),
})
export type NotaryScale = z.infer<typeof NotaryScaleSchema>

/**
 * Barème par défaut : Gironde, relevé le 3 novembre 2026. Droit
 * départemental porté à 5 % à compter du 1er mai 2025 (loi de finances 2025,
 * art. 116 ; hausse valable jusqu'au 31 mars 2028, les primo-accédants
 * restant à 4,5 %) ; taxe communale 1,2 % ; frais d'assiette 2,37 % du droit
 * départemental ; émoluments de l'article A444-91 du code de commerce (tarif
 * en vigueur depuis le 1er janvier 2021) ; CSI 0,10 % ; débours estimés.
 * Les forfaits sont des estimations (provenance « estimated »).
 */
export const DEFAULT_NOTARY_SCALE: NotaryScale = {
  departmentalRate: 0.05,
  communalRate: 0.012,
  collectionFeeRate: 0.0237,
  emolumentBands: [
    { upTo: 6500, rate: 0.0387 },
    { upTo: 17_000, rate: 0.01596 },
    { upTo: 60_000, rate: 0.01064 },
    { upTo: null, rate: 0.00799 },
  ],
  emolumentVatRate: 0.2,
  securityContributionRate: 0.001,
  securityContributionMinimum: 15,
  disbursements: 800,
  label:
    'Gironde (droit départemental 5 % depuis le 1er mai 2025), relevé le 3 novembre 2026',
}

/**
 * Hypothèses de financement et d'exploitation. Les taux sont des fractions,
 * jamais des pourcentages : 3,65 % s'écrit 0,0365. Les montants sont en euros.
 */
export const AssumptionsSchema = z.object({
  downPayment: z
    .number()
    .min(0)
    .describe(
      'Apport personnel en euros, déduit du coût tout compris pour obtenir le capital emprunté'
    ),
  interestRate: fraction('Taux nominal annuel du crédit'),
  durationYears: z
    .number()
    .int()
    .min(1)
    .max(40)
    .describe('Durée du crédit en années'),
  insuranceRate: fraction(
    "Taux annuel d'assurance emprunteur appliqué au capital initial"
  ),
  notaryRate: fraction(
    'Taux forfaitaire de frais de notaire appliqué au net vendeur (prix moins honoraires acquéreur) ; utilisé quand notaryMode vaut « rate »'
  ),
  notaryMode: NotaryModeSchema.default('rate').describe(
    'Calcul des frais de notaire : « rate » (taux forfaitaire, défaut, parité avec l’artefact) ou « scale » (barème : droits, émoluments, CSI, débours)'
  ),
  notaryScale: NotaryScaleSchema.default(() =>
    structuredClone(DEFAULT_NOTARY_SCALE)
  ).describe(
    'Barème détaillé des frais de notaire, utilisé quand notaryMode vaut « scale » ; versionné avec les hypothèses'
  ),
  vacancyMonths: z
    .number()
    .min(0)
    .max(12)
    .describe('Vacance locative en mois par an (0,5 = quinze jours)'),
  fixedCostsAnnual: z
    .number()
    .min(0)
    .describe(
      'Frais fixes annuels en euros une fois loué : assurance PNO, CFE, comptable, entretien'
    ),
  grossYieldThreshold: fraction('Seuil de rendement brut visé'),
  netYieldThreshold: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .default(null)
    .describe(
      'Seuil de rendement net visé, en fraction ; null = critère inactif pour le prix cible'
    ),
  maxMonthlyEffort: z
    .number()
    .min(0)
    .describe(
      'Effort mensuel maximal accepté une fois loué, en euros par mois (somme à sortir de sa poche)'
    ),
  grossYieldMargin: z
    .number()
    .min(0)
    .max(1)
    .default(0.007)
    .describe(
      'Marge sous le seuil brut où le verdict est « à creuser » et non « hors cible », en fraction (0,007 = 0,7 point)'
    ),
  effortMargin: z
    .number()
    .min(0)
    .default(80)
    .describe(
      "Marge en euros par mois au-dessus de l'effort maximal où le verdict est « à creuser » et non « hors cible »"
    ),
  negotiableDiscount: z
    .number()
    .min(0)
    .max(1)
    .default(0.05)
    .describe('Décote maximale jugée négociable, en fraction (0,05 = 5 %)'),
  tightDiscount: z
    .number()
    .min(0)
    .max(1)
    .default(0.1)
    .describe(
      'Décote maximale jugée tendue, en fraction ; au-delà, hors de portée'
    ),
  targetCriteria: z
    .array(TargetCriterionSchema)
    .min(1)
    .default(['gross_yield', 'effort'])
    .describe(
      'Critères actifs pour le prix cible (défaut : brut et effort, comme le verdict)'
    ),
  rentalYear: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .default(2028)
    .describe(
      'Année de mise en location par défaut (bascule phase 1 → phase 2)'
    ),
  currentRent: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      "Loyer actuel du foyer en euros par mois, pour le coût d'occupation (phase 1)"
    ),
  maintenanceAnnual: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      "Entretien annuel estimé en euros pendant l'occupation (phase 1)"
    ),
  purchaseDate: z
    .string()
    .date()
    .nullable()
    .default(null)
    .describe(
      "Date d'acquisition prévue (AAAA-MM-JJ), début du crédit et de la phase 1 ; null = date du calcul"
    ),
  rentalStartDate: z
    .string()
    .date()
    .nullable()
    .default(null)
    .describe(
      'Date de mise en location (bascule en phase 2, AAAA-MM-JJ) ; null = 1er janvier de l’année de mise en location'
    ),
  marginalTaxRate: z
    .number()
    .min(0)
    .max(0.6)
    .nullable()
    .default(null)
    .describe(
      "Tranche marginale d'imposition du foyer, en fraction (0, 0,11, 0,30, 0,41 ou 0,45) ; null = non renseignée, l'impôt sur le revenu n'est pas estimé"
    ),
  taxRegime: TaxRegimeSchema.nullable()
    .default(null)
    .describe(
      'Régime fiscal visé ; null = selon le bail (vide : micro-foncier, meublé ou colocation : micro-BIC), réel imposé si le plafond du micro est dépassé'
    ),
  furnishedRentalKind: FurnishedRentalKindSchema.default('long_term').describe(
    'Nature de la location meublée pour le micro-BIC (meublé de longue durée par défaut)'
  ),
  horizonYears: z
    .number()
    .int()
    .min(1)
    .max(40)
    .default(15)
    .describe('Horizon de détention en années, revente à son terme'),
  appreciationRate: z
    .number()
    .min(-0.2)
    .max(0.2)
    .default(0)
    .describe(
      'Revalorisation annuelle du bien, en fraction (0,01 = 1 % par an) ; 0 = valeur constante'
    ),
  rentIndexationRate: z
    .number()
    .min(-0.1)
    .max(0.2)
    .default(0.0157)
    .describe(
      'Indexation annuelle des loyers, des charges et de la taxe foncière (IRL), en fraction ; défaut : variation de l’IRL sur un an au 3e trimestre 2026 (INSEE, 15 octobre 2026)'
    ),
  resaleCostsRate: z
    .number()
    .min(0)
    .max(0.2)
    .default(0.05)
    .describe(
      'Frais de revente (honoraires d’agence, diagnostics) en fraction du prix de vente ; estimation'
    ),
  discountRate: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .default(null)
    .describe(
      'Taux d’actualisation de la VAN, en fraction ; null = taux nominal du crédit'
    ),
  taxParameters: TaxParametersSchema.default(() =>
    structuredClone(DEFAULT_TAX_PARAMETERS)
  ).describe(
    'Paramètres fiscaux datés (prélèvements sociaux, abattements, plafonds, amortissements, plus-value) ; versionnés avec les hypothèses'
  ),
})
export type Assumptions = z.infer<typeof AssumptionsSchema>
/** Entrée avant application des valeurs par défaut. */
export type AssumptionsInput = z.input<typeof AssumptionsSchema>

/** Surcharge partielle par annonce : apport différent, taux négocié, etc. */
export const AssumptionsOverrideSchema = z
  .object(withoutDefaults(AssumptionsSchema.shape))
  .partial()
  .describe(
    "Surcharge partielle des hypothèses pour une annonce : seuls les champs présents remplacent les hypothèses de l'espace"
  )
export type AssumptionsOverride = z.infer<typeof AssumptionsOverrideSchema>

/** Hypothèses enregistrées, versionnées par date d'effet. */
export const AssumptionsVersionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  label: z.string().max(120).nullable().describe('Libellé de la version'),
  effectiveFrom: z.string().datetime().describe("Date d'effet ISO 8601"),
  createdAt: z.string().datetime(),
  values: AssumptionsSchema,
})
export type AssumptionsVersion = z.infer<typeof AssumptionsVersionSchema>

export const AssumptionsUpdateSchema = z.object({
  label: z.string().max(120).optional(),
  values: AssumptionsSchema,
  expectedVersion: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Garde-fou optimiste : identifiant de la version en vigueur lue avant la modification ; refus (409) si une autre version a été enregistrée depuis'
    ),
})
export type AssumptionsUpdate = z.infer<typeof AssumptionsUpdateSchema>

/** Une annonce dont le verdict change avec de nouvelles hypothèses. */
export const VerdictChangeSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  before: VerdictSchema,
  after: VerdictSchema,
  targetPriceBefore: z
    .number()
    .nullable()
    .describe('Prix cible avant, en euros'),
  targetPriceAfter: z
    .number()
    .nullable()
    .describe('Prix cible après, en euros'),
})
export type VerdictChange = z.infer<typeof VerdictChangeSchema>

const verdictCounts = z.object({
  target: z.number().int().min(0),
  to_dig: z.number().int().min(0),
  off_target: z.number().int().min(0),
})

/**
 * Impact d'un jeu d'hypothèses sur les annonces actives de l'espace : combien
 * changent de verdict, lesquelles, et la répartition avant et après.
 */
export const AssumptionsImpactSchema = z.object({
  total: z.number().int().min(0).describe('Annonces actives évaluées'),
  changedVerdicts: z
    .number()
    .int()
    .min(0)
    .describe('Annonces dont le verdict change'),
  changes: z.array(VerdictChangeSchema),
  byVerdictBefore: verdictCounts,
  byVerdictAfter: verdictCounts,
})
export type AssumptionsImpact = z.infer<typeof AssumptionsImpactSchema>

/** Aperçu de l'impact d'hypothèses candidates, sans enregistrement. */
export const AssumptionsPreviewRequestSchema = z.object({
  values: AssumptionsSchema,
})
export type AssumptionsPreviewRequest = z.infer<
  typeof AssumptionsPreviewRequestSchema
>

/** Réponse d'un enregistrement : la version créée et son impact sur les annonces. */
export const AssumptionsUpdateResultSchema = AssumptionsVersionSchema.extend({
  impact: AssumptionsImpactSchema,
  criteriaFit: CriteriaFitRefreshSummarySchema.nullable()
    .default(null)
    .describe(
      'Lot 14 : l’adéquation aux critères recalculée avec les nouvelles hypothèses (le verdict est un filtre des critères) ; null sans critère actif'
    ),
})
export type AssumptionsUpdateResult = z.infer<
  typeof AssumptionsUpdateResultSchema
>

/** Hypothèses par défaut d'un nouvel espace : celles de l'artefact (modèle § 8). */
export const DEFAULT_ASSUMPTIONS: Assumptions = AssumptionsSchema.parse({
  downPayment: 40_000,
  interestRate: 0.0365,
  durationYears: 25,
  insuranceRate: 0.001,
  notaryRate: 0.075,
  vacancyMonths: 0.5,
  fixedCostsAnnual: 1050,
  grossYieldThreshold: 0.055,
  maxMonthlyEffort: 150,
})
