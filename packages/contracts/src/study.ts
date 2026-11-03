import { z } from 'zod'
import { AssumptionsOverrideSchema } from './assumptions.js'
import { LeaseTypeSchema, RentalVerdictSchema, VerdictSchema } from './enums.js'
import { FurnishedRentalKindSchema, TaxRegimeSchema } from './fiscal.js'

/**
 * Étude d'une annonce dans le temps (lot 5) : coût d'occupation en phase 1
 * (E3), scénarios « et si » (E4), fiscalité estimée et projection jusqu'à la
 * revente avec TRI et VAN (E6, E7). Montants en euros, taux en fractions,
 * dates en AAAA-MM-JJ. Tout chiffre fiscal est une estimation.
 */

export const STUDY_DISCLAIMER =
  'Estimation simplifiée à partir des hypothèses saisies et de paramètres fiscaux datés : ce n’est pas un conseil fiscal ni patrimonial.'

// ---------------------------------------------------------------------------
// Phase 1 : coût d'occupation
// ---------------------------------------------------------------------------

export const OccupancyReportSchema = z.object({
  listingId: z.string().uuid().nullable(),
  purchaseDate: z.string().date().describe('Date d’acquisition retenue'),
  rentalStartDate: z
    .string()
    .date()
    .describe('Date de mise en location : bascule en phase 2'),
  phase1Months: z
    .number()
    .int()
    .min(0)
    .describe('Mois d’occupation avant la mise en location'),
  monthly: z.object({
    credit: z.number().describe('Mensualité de crédit hors assurance'),
    insurance: z.number().describe('Assurance emprunteur par mois'),
    charges: z
      .number()
      .describe(
        'Charges de copropriété par mois (toutes, le propriétaire occupant les paie)'
      ),
    propertyTax: z.number().describe('Taxe foncière par mois'),
    maintenance: z.number().describe('Entretien estimé par mois'),
    total: z.number().describe('Coût mensuel d’occupation'),
  }),
  propertyTaxEstimated: z
    .boolean()
    .describe('Taxe foncière estimée (≈) faute de saisie'),
  chargesKnown: z.boolean().describe('Charges de copropriété renseignées'),
  maintenanceKnown: z
    .boolean()
    .describe('Entretien renseigné dans les hypothèses'),
  capitalMonthly: z
    .number()
    .describe(
      'Capital remboursé par mois en moyenne pendant la phase 1 (douze premiers mois si la phase 1 est nulle)'
    ),
  interestMonthly: z.number().describe('Intérêts par mois sur la même période'),
  realCostMonthly: z
    .number()
    .describe('Coût réel = coût mensuel − part de capital remboursé'),
  currentRent: z
    .number()
    .nullable()
    .describe('Loyer actuel du foyer ; null = non renseigné'),
  gapToCurrentRent: z
    .number()
    .nullable()
    .describe('Coût mensuel − loyer actuel (positif = plus cher que le loyer)'),
  realGapToCurrentRent: z
    .number()
    .nullable()
    .describe('Coût réel − loyer actuel'),
  phase1: z.object({
    paid: z.number().describe('Total payé pendant la phase 1'),
    principalRepaid: z
      .number()
      .describe('Capital remboursé pendant la phase 1'),
    interest: z.number(),
    insurance: z.number(),
    chargesTaxMaintenance: z
      .number()
      .describe('Charges, taxe foncière et entretien de la phase 1'),
    rentAvoided: z
      .number()
      .nullable()
      .describe('Loyers actuels évités pendant la phase 1 (indexés)'),
    netCost: z
      .number()
      .nullable()
      .describe(
        'Payé − capital remboursé − loyers évités : ce que la phase 1 coûte de plus que rester locataire'
      ),
  }),
  loanAmount: z.number(),
  remainingPrincipalAtSwitch: z
    .number()
    .describe('Capital restant dû à la mise en location'),
  warnings: z.array(z.string()),
})
export type OccupancyReport = z.infer<typeof OccupancyReportSchema>

// ---------------------------------------------------------------------------
// Fiscalité d'une année et plus-value
// ---------------------------------------------------------------------------

/** L'impôt estimé d'une année de location. */
export const RentalTaxYearSchema = z.object({
  regime: TaxRegimeSchema.describe('Régime appliqué cette année'),
  requestedRegime: TaxRegimeSchema.describe('Régime demandé'),
  eligible: z
    .boolean()
    .describe('Le régime demandé est applicable (plafond du micro respecté)'),
  grossRent: z.number().describe('Loyers encaissés de l’année'),
  deductions: z
    .number()
    .describe(
      'Abattement (micro) ou charges déduites (réel), hors amortissements'
    ),
  depreciation: z
    .number()
    .describe('Amortissements déduits cette année (LMNP réel)'),
  taxableIncome: z
    .number()
    .describe('Revenu imposable de l’année après reports, ≥ 0'),
  globalIncomeOffset: z
    .number()
    .describe(
      'Déficit foncier imputé sur le revenu global (réduit l’impôt sur le revenu, pas les prélèvements sociaux)'
    ),
  incomeTax: z
    .number()
    .nullable()
    .describe(
      'Impôt sur le revenu estimé (négatif = économie d’impôt) ; null si la TMI n’est pas renseignée'
    ),
  socialContributions: z.number().describe('Prélèvements sociaux estimés'),
  total: z
    .number()
    .nullable()
    .describe('Impôt total ; null si la TMI n’est pas renseignée'),
  carryForward: z
    .number()
    .describe(
      'Déficits et amortissements reportés en fin d’année (non encore utilisés)'
    ),
  notes: z.array(z.string()),
})
export type RentalTaxYear = z.infer<typeof RentalTaxYearSchema>

export const CapitalGainsResultSchema = z.object({
  exempt: z.boolean(),
  exemptionReason: z.string().nullable(),
  salePrice: z.number().describe('Prix de cession'),
  saleCosts: z.number().describe('Frais de cession déduits'),
  acquisitionPrice: z
    .number()
    .describe('Prix d’acquisition (net vendeur, honoraires acquéreur à part)'),
  acquisitionCosts: z
    .number()
    .describe('Frais d’acquisition retenus : réels ou forfait 7,5 %'),
  works: z.number().describe('Travaux retenus : réels ou forfait 15 %'),
  depreciationReintegrated: z
    .number()
    .describe(
      'Amortissements LMNP déduits, réintégrés (diminuent le prix de revient)'
    ),
  grossGain: z.number().describe('Plus-value brute, ≥ 0'),
  holdingYears: z
    .number()
    .int()
    .min(0)
    .describe('Années de détention révolues'),
  incomeTaxAllowance: z.number().describe('Abattement IR, fraction'),
  socialAllowance: z
    .number()
    .describe('Abattement prélèvements sociaux, fraction'),
  incomeTax: z.number(),
  socialContributions: z.number(),
  surtax: z.number().describe('Surtaxe sur les plus-values élevées'),
  total: z.number().describe('Impôt total sur la plus-value'),
  notes: z.array(z.string()),
})
export type CapitalGainsResult = z.infer<typeof CapitalGainsResultSchema>

// ---------------------------------------------------------------------------
// Projection annuelle, revente, TRI
// ---------------------------------------------------------------------------

export const ProjectionRequestSchema = z.object({
  horizonYears: z.coerce
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .describe('Horizon de détention en années ; absent = celui des hypothèses'),
  regime: TaxRegimeSchema.optional().describe(
    'Régime fiscal à projeter ; absent = celui des hypothèses (ou selon le bail)'
  ),
  assumptions: AssumptionsOverrideSchema.optional().describe(
    'Scénario : hypothèses remplacées champ par champ pour ce calcul seulement'
  ),
})
export type ProjectionRequest = z.infer<typeof ProjectionRequestSchema>

/** Les paramètres de requête de `GET /listings/:id/projection`. */
export const ProjectionQuerySchema = ProjectionRequestSchema.omit({
  assumptions: true,
})
export type ProjectionQuery = z.infer<typeof ProjectionQuerySchema>

export const ProjectionYearSchema = z.object({
  year: z
    .number()
    .int()
    .min(1)
    .describe('Année de détention (1 = 12 premiers mois)'),
  from: z.string().date(),
  to: z.string().date().describe('Dernier jour de l’année de détention'),
  phase1Months: z.number().int().min(0).max(12),
  phase2Months: z.number().int().min(0).max(12),
  rentAvoided: z.number().describe('Loyer actuel évité (phase 1)'),
  rentCollected: z
    .number()
    .describe('Loyers encaissés après vacance (phase 2)'),
  loanPayment: z.number().describe('Mensualités payées (crédit + assurance)'),
  interest: z.number(),
  principal: z.number(),
  insurance: z.number(),
  charges: z
    .number()
    .describe(
      'Charges de copropriété (toutes en phase 1, non récupérables en phase 2)'
    ),
  propertyTax: z.number(),
  maintenance: z.number().describe('Entretien (phase 1)'),
  fixedCosts: z.number().describe('Frais fixes de location (phase 2)'),
  cashFlowBeforeTax: z.number(),
  tax: RentalTaxYearSchema.nullable().describe(
    'Impôt de l’année ; null sans loyer'
  ),
  cashFlowAfterTax: z.number().nullable(),
  remainingPrincipal: z.number().describe('Capital restant dû en fin d’année'),
  propertyValue: z.number().describe('Valeur estimée en fin d’année'),
  netEquity: z.number().describe('Valeur − capital restant dû'),
})
export type ProjectionYear = z.infer<typeof ProjectionYearSchema>

export const ProjectionSaleSchema = z.object({
  date: z.string().date(),
  salePrice: z.number(),
  saleCosts: z.number(),
  remainingPrincipal: z.number(),
  mainResidenceAtSale: z
    .boolean()
    .describe('Le bien est encore la résidence principale au jour de la vente'),
  capitalGains: CapitalGainsResultSchema,
  netProceedsBeforeTax: z
    .number()
    .describe('Prix − frais − capital restant dû'),
  netProceeds: z.number().describe('Après impôt sur la plus-value'),
})
export type ProjectionSale = z.infer<typeof ProjectionSaleSchema>

export const ProjectionSummarySchema = z.object({
  regime: TaxRegimeSchema,
  horizonYears: z.number().int(),
  equity: z.number().describe('Mise de départ (apport engagé)'),
  irrBeforeTax: z
    .number()
    .nullable()
    .describe(
      'TRI annuel avant tout impôt (ni sur les loyers ni sur la plus-value), fraction'
    ),
  irrAfterTax: z
    .number()
    .nullable()
    .describe(
      'TRI annuel après impôt sur les loyers et sur la plus-value ; null si la TMI n’est pas renseignée'
    ),
  discountRate: z.number().describe('Taux d’actualisation de la VAN'),
  npvBeforeTax: z.number(),
  npvAfterTax: z.number().nullable(),
  netWealthBeforeTax: z
    .number()
    .describe('Enrichissement net : somme des flux, mise de départ déduite'),
  netWealthAfterTax: z.number().nullable(),
  totalRentalTax: z
    .number()
    .nullable()
    .describe('Impôts sur les loyers cumulés'),
  totalSocialContributions: z.number(),
  capitalGainsTax: z.number(),
  firstRentalYear: z
    .number()
    .int()
    .nullable()
    .describe('Première année de détention entièrement louée'),
  firstRentalYearCashFlowAfterTax: z
    .number()
    .nullable()
    .describe('Cash-flow net d’impôt de cette année, euros par an'),
  firstRentalYearMonthlyAfterTax: z
    .number()
    .nullable()
    .describe('Le même, par mois'),
})
export type ProjectionSummary = z.infer<typeof ProjectionSummarySchema>

/** Un régime fiscal comparé aux autres, sur tout l'horizon. */
export const RegimeComparisonSchema = z.object({
  regime: TaxRegimeSchema,
  eligible: z
    .boolean()
    .describe('Applicable toute la durée (plafond du micro)'),
  reason: z.string().nullable(),
  totalRentalTax: z.number().nullable(),
  totalSocialContributions: z.number(),
  capitalGainsTax: z.number(),
  irrAfterTax: z.number().nullable(),
  netWealthAfterTax: z.number().nullable(),
  firstRentalYearCashFlowAfterTax: z.number().nullable(),
})
export type RegimeComparison = z.infer<typeof RegimeComparisonSchema>

export const ProjectionParametersSchema = z.object({
  purchaseDate: z.string().date(),
  rentalStartDate: z.string().date(),
  horizonYears: z.number().int(),
  leaseType: LeaseTypeSchema,
  furnishedRentalKind: FurnishedRentalKindSchema,
  requestedRegime: TaxRegimeSchema.nullable(),
  marginalTaxRate: z.number().nullable(),
  appreciationRate: z.number(),
  rentIndexationRate: z.number(),
  resaleCostsRate: z.number(),
  discountRate: z.number(),
  currentRent: z.number().nullable(),
  maintenanceAnnual: z.number().nullable(),
  taxParametersLabel: z.string(),
  taxParametersAsOf: z.string().date(),
})
export type ProjectionParameters = z.infer<typeof ProjectionParametersSchema>

export const ProjectionReportSchema = z.object({
  listingId: z.string().uuid().nullable(),
  title: z.string(),
  parameters: ProjectionParametersSchema,
  rows: z.array(ProjectionYearSchema),
  sale: ProjectionSaleSchema,
  summary: ProjectionSummarySchema,
  regimes: z
    .array(RegimeComparisonSchema)
    .describe('Comparaison des régimes possibles pour ce bail'),
  bestRegime: TaxRegimeSchema.nullable().describe(
    'Régime applicable qui enrichit le plus (après impôts) ; null si la TMI manque'
  ),
  warnings: z.array(z.string()),
  disclaimer: z.string(),
})
export type ProjectionReport = z.infer<typeof ProjectionReportSchema>

// ---------------------------------------------------------------------------
// Scénarios « et si »
// ---------------------------------------------------------------------------

const optionalEuros = (what: string) =>
  z.number().min(0).optional().describe(`${what}, en euros`)

/**
 * Les surcharges d'un scénario : des champs de l'annonce (prix négocié, loyer,
 * travaux…) et des hypothèses (taux, apport, durée, vacance, date de mise en
 * location, TMI, régime…), remplacés pour le calcul seulement.
 */
export const ScenarioOverridesSchema = z.object({
  price: optionalEuros('Prix d’achat'),
  targetRent: optionalEuros('Loyer visé hors charges par mois'),
  renovationTotal: optionalEuros('Total des travaux'),
  furnitureValue: optionalEuros('Mobilier'),
  propertyTax: optionalEuros('Taxe foncière annuelle'),
  annualCharges: optionalEuros('Charges de copropriété annuelles'),
  leaseType: LeaseTypeSchema.optional(),
  assumptions: AssumptionsOverrideSchema.optional().describe(
    'Hypothèses remplacées champ par champ (taux en fractions)'
  ),
})
export type ScenarioOverrides = z.infer<typeof ScenarioOverridesSchema>

export const ScenarioInputSchema = z.object({
  name: z.string().trim().min(1).max(120).describe('Nom du scénario'),
  listingId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe(
      'Annonce du scénario ; null = scénario d’espace, applicable à toute annonce'
    ),
  overrides: ScenarioOverridesSchema,
  notes: z.string().max(2000).nullable().default(null),
})
export type ScenarioInput = z.infer<typeof ScenarioInputSchema>
export type ScenarioInputRaw = z.input<typeof ScenarioInputSchema>

export const ScenarioSchema = ScenarioInputSchema.extend({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Scenario = z.infer<typeof ScenarioSchema>

export const ScenarioUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  overrides: ScenarioOverridesSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Garde-fou : `updatedAt` lu avant ; refus si le scénario a changé'
    ),
})
export type ScenarioUpdate = z.infer<typeof ScenarioUpdateSchema>

export const ScenarioListQuerySchema = z.object({
  listingId: z
    .string()
    .uuid()
    .optional()
    .describe('Scénarios de cette annonce et scénarios d’espace'),
})
export type ScenarioListQuery = z.infer<typeof ScenarioListQuerySchema>

export const ScenarioEvaluateRequestSchema = z
  .object({
    scenarioId: z
      .string()
      .uuid()
      .optional()
      .describe('Scénario enregistré à appliquer'),
    overrides: ScenarioOverridesSchema.optional().describe(
      'Surcharges à appliquer sans enregistrement ; avec scenarioId, elles complètent ou remplacent champ par champ celles du scénario'
    ),
  })
  .refine(v => v.scenarioId !== undefined || v.overrides !== undefined, {
    message: 'Donnez scenarioId (scénario enregistré) ou overrides',
  })
export type ScenarioEvaluateRequest = z.infer<
  typeof ScenarioEvaluateRequestSchema
>

/** Les indicateurs d'un côté de la comparaison. */
export const ScenarioOutcomeSchema = z.object({
  totalCost: z.number(),
  loanAmount: z.number(),
  monthlyPayment: z.number(),
  rent: z.number().describe('Loyer retenu'),
  grossYield: z.number().nullable(),
  netYield: z.number().nullable(),
  effort: z.number(),
  verdict: VerdictSchema,
  rentalVerdict: RentalVerdictSchema,
  targetPrice: z.number().nullable(),
  occupancyMonthly: z
    .number()
    .describe('Coût d’occupation en phase 1, par mois'),
  occupancyRealCostMonthly: z.number(),
  gapToCurrentRent: z.number().nullable(),
  regime: TaxRegimeSchema,
  irrBeforeTax: z.number().nullable(),
  irrAfterTax: z.number().nullable(),
  npvAfterTax: z.number().nullable(),
  netWealthBeforeTax: z.number(),
  netWealthAfterTax: z.number().nullable(),
  firstRentalYearMonthlyAfterTax: z.number().nullable(),
})
export type ScenarioOutcome = z.infer<typeof ScenarioOutcomeSchema>

export const ScenarioDeltaSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.enum(['eur', 'eur_month', 'fraction']),
  base: z.number().nullable(),
  scenario: z.number().nullable(),
  delta: z.number().nullable().describe('Scénario − base'),
  better: z
    .boolean()
    .nullable()
    .describe('Vrai si le scénario est meilleur pour cet indicateur'),
})
export type ScenarioDelta = z.infer<typeof ScenarioDeltaSchema>

export const ScenarioComparisonSchema = z.object({
  listingId: z.string().uuid().nullable(),
  title: z.string(),
  scenario: z.object({
    id: z.string().uuid().nullable(),
    name: z.string().nullable(),
    overrides: ScenarioOverridesSchema,
  }),
  base: ScenarioOutcomeSchema,
  result: ScenarioOutcomeSchema,
  deltas: z.array(ScenarioDeltaSchema),
  verdictChanged: z.boolean(),
  rentalVerdictChanged: z.boolean(),
  persisted: z.boolean().describe('Faux : l’évaluation n’enregistre rien'),
  disclaimer: z.string(),
})
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>
