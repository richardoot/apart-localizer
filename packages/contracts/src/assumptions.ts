import { z } from 'zod'
import { TargetCriterionSchema } from './enums.js'
import { withoutDefaults } from './zod-utils.js'

const fraction = (what: string) =>
  z.number().min(0).max(1).describe(`${what}, en fraction (0,05 = 5 %)`)

/**
 * Hypothèses de financement et d'exploitation. Les taux sont des fractions,
 * jamais des pourcentages : 3,65 % s'écrit 0,0365. Les montants sont en euros.
 */
export const AssumptionsSchema = z.object({
  downPayment: z
    .number()
    .min(0)
    .describe(
      'Apport personnel en euros, déduit du coût total pour obtenir le capital emprunté'
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
    'Taux de frais de notaire appliqué au net vendeur (prix moins honoraires acquéreur)'
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
})
export type AssumptionsUpdate = z.infer<typeof AssumptionsUpdateSchema>

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
