import type {
  Assumptions,
  ScenarioComparison,
  ScenarioDelta,
  ScenarioOutcome,
  ScenarioOverrides,
} from '@apart/contracts'
import { STUDY_DISCLAIMER } from '@apart/contracts'
import { compute, mergeAssumptions } from './compute.js'
import { yearOf } from './dates.js'
import { occupancyReport } from './occupancy.js'
import { projection } from './projection.js'
import { rentalChecks } from './rental-checks.js'
import type { StudyInput } from './study-input.js'
import { targetPrice } from './target-price.js'

/**
 * Scénarios « et si » (besoin E4) : un jeu de surcharges (prix, loyer,
 * travaux, bail, taux, apport, durée, vacance, date de mise en location,
 * TMI, régime…) appliqué à une annonce, puis comparé à la base indicateur par
 * indicateur. Rien n'est enregistré ici : l'enregistrement d'un scénario est
 * l'affaire de l'API.
 */

/**
 * Complète les surcharges d'un scénario enregistré par d'autres : les champs
 * de `extra` l'emportent, les hypothèses sont fusionnées champ par champ.
 */
export function mergeScenarioOverrides(
  base: ScenarioOverrides,
  extra: ScenarioOverrides | null | undefined
): ScenarioOverrides {
  if (!extra) return base
  const assumptions =
    base.assumptions || extra.assumptions
      ? { ...base.assumptions, ...extra.assumptions }
      : undefined
  return {
    ...base,
    ...extra,
    ...(assumptions ? { assumptions } : {}),
  }
}

/** Applique les surcharges : l'annonce et les hypothèses modifiées. */
export function applyScenario(
  input: StudyInput,
  a: Assumptions,
  overrides: ScenarioOverrides
): { input: StudyInput; assumptions: Assumptions } {
  const f = input.financials
  const financials = {
    ...f,
    ...(overrides.price !== undefined ? { price: overrides.price } : {}),
    ...(overrides.targetRent !== undefined
      ? { targetRent: overrides.targetRent }
      : {}),
    ...(overrides.renovationTotal !== undefined
      ? { renovationTotal: overrides.renovationTotal }
      : {}),
    ...(overrides.furnitureValue !== undefined
      ? { furnitureValue: overrides.furnitureValue }
      : {}),
    ...(overrides.propertyTax !== undefined
      ? { propertyTax: overrides.propertyTax }
      : {}),
    ...(overrides.annualCharges !== undefined
      ? { annualCharges: overrides.annualCharges }
      : {}),
  }
  const assumptions = mergeAssumptions(a, overrides.assumptions ?? null)
  // Une date ou une année de mise en location du scénario l'emporte sur
  // l'année de la phase 2 de l'annonce.
  const scenarioYear =
    overrides.assumptions?.rentalStartDate != null
      ? yearOf(overrides.assumptions.rentalStartDate)
      : (overrides.assumptions?.rentalYear ?? null)
  return {
    input: {
      financials,
      rental:
        scenarioYear !== null
          ? { ...input.rental, year: scenarioYear }
          : input.rental,
      leaseType: overrides.leaseType ?? input.leaseType,
    },
    assumptions,
  }
}

const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null

/** Les indicateurs d'une annonce sous des hypothèses : financement, verdicts, phase 1, projection. */
export function scenarioOutcome(
  input: StudyInput,
  a: Assumptions,
  at: Date
): ScenarioOutcome {
  const metrics = compute(input.financials, a)
  const rental = rentalChecks(input.rental, metrics, a)
  const occupancy = occupancyReport(input, a, { at })
  const report = projection(input, a, { at })
  return {
    totalCost: metrics.totalCost,
    loanAmount: metrics.loanAmount,
    monthlyPayment: metrics.monthlyPayment,
    rent: metrics.rent,
    grossYield: finite(metrics.grossYield),
    netYield: finite(metrics.netYield),
    effort: metrics.effort,
    verdict: metrics.verdict,
    rentalVerdict: rental.verdict,
    targetPrice: targetPrice(input.financials, a).targetPrice,
    occupancyMonthly: occupancy.monthly.total,
    occupancyRealCostMonthly: occupancy.realCostMonthly,
    gapToCurrentRent: occupancy.gapToCurrentRent,
    regime: report.summary.regime,
    irrBeforeTax: report.summary.irrBeforeTax,
    irrAfterTax: report.summary.irrAfterTax,
    npvAfterTax: report.summary.npvAfterTax,
    netWealthBeforeTax: report.summary.netWealthBeforeTax,
    netWealthAfterTax: report.summary.netWealthAfterTax,
    firstRentalYearMonthlyAfterTax:
      report.summary.firstRentalYearMonthlyAfterTax,
  }
}

type DeltaKey = keyof Omit<
  ScenarioOutcome,
  'verdict' | 'rentalVerdict' | 'regime'
>

/** Les indicateurs comparés : libellé, unité, sens (plus haut = mieux ?). */
export const SCENARIO_DELTAS: readonly {
  key: DeltaKey
  label: string
  unit: ScenarioDelta['unit']
  higherIsBetter: boolean
}[] = [
  { key: 'totalCost', label: 'Coût total', unit: 'eur', higherIsBetter: false },
  {
    key: 'loanAmount',
    label: 'Capital emprunté',
    unit: 'eur',
    higherIsBetter: false,
  },
  {
    key: 'monthlyPayment',
    label: 'Mensualité',
    unit: 'eur_month',
    higherIsBetter: false,
  },
  {
    key: 'rent',
    label: 'Loyer retenu',
    unit: 'eur_month',
    higherIsBetter: true,
  },
  {
    key: 'grossYield',
    label: 'Rendement brut',
    unit: 'fraction',
    higherIsBetter: true,
  },
  {
    key: 'netYield',
    label: 'Rendement net',
    unit: 'fraction',
    higherIsBetter: true,
  },
  {
    key: 'effort',
    label: 'Effort mensuel (loué)',
    unit: 'eur_month',
    higherIsBetter: true,
  },
  {
    key: 'targetPrice',
    label: 'Prix cible',
    unit: 'eur',
    higherIsBetter: true,
  },
  {
    key: 'occupancyMonthly',
    label: 'Coût d’occupation (phase 1)',
    unit: 'eur_month',
    higherIsBetter: false,
  },
  {
    key: 'occupancyRealCostMonthly',
    label: 'Coût réel (phase 1)',
    unit: 'eur_month',
    higherIsBetter: false,
  },
  {
    key: 'gapToCurrentRent',
    label: 'Écart au loyer actuel',
    unit: 'eur_month',
    higherIsBetter: false,
  },
  {
    key: 'firstRentalYearMonthlyAfterTax',
    label: 'Cash-flow net d’impôt (1re année louée)',
    unit: 'eur_month',
    higherIsBetter: true,
  },
  {
    key: 'irrBeforeTax',
    label: 'TRI avant impôt',
    unit: 'fraction',
    higherIsBetter: true,
  },
  {
    key: 'irrAfterTax',
    label: 'TRI après impôt',
    unit: 'fraction',
    higherIsBetter: true,
  },
  {
    key: 'npvAfterTax',
    label: 'VAN après impôt',
    unit: 'eur',
    higherIsBetter: true,
  },
  {
    key: 'netWealthBeforeTax',
    label: 'Enrichissement net avant impôt',
    unit: 'eur',
    higherIsBetter: true,
  },
  {
    key: 'netWealthAfterTax',
    label: 'Enrichissement net après impôt',
    unit: 'eur',
    higherIsBetter: true,
  },
]

/** Les écarts indicateur par indicateur ; `better` vaut null sans écart ou sans valeur. */
export function scenarioDeltas(
  base: ScenarioOutcome,
  scenario: ScenarioOutcome
): ScenarioDelta[] {
  return SCENARIO_DELTAS.map(({ key, label, unit, higherIsBetter }) => {
    const b = base[key]
    const s = scenario[key]
    const delta = b === null || s === null ? null : s - b
    return {
      key,
      label,
      unit,
      base: b,
      scenario: s,
      delta,
      better:
        delta === null || Math.abs(delta) < 1e-9
          ? null
          : higherIsBetter
            ? delta > 0
            : delta < 0,
    }
  })
}

export interface CompareScenarioOptions {
  at: Date
  listingId?: string | null
  title?: string
  scenario?: { id: string | null; name: string | null }
}

/** La base et le scénario côte à côte, avec les écarts et les changements de verdict. */
export function compareScenario(
  input: StudyInput,
  a: Assumptions,
  overrides: ScenarioOverrides,
  options: CompareScenarioOptions
): ScenarioComparison {
  const base = scenarioOutcome(input, a, options.at)
  const applied = applyScenario(input, a, overrides)
  const result = scenarioOutcome(applied.input, applied.assumptions, options.at)
  return {
    listingId: options.listingId ?? null,
    title: options.title ?? 'Annonce',
    scenario: {
      id: options.scenario?.id ?? null,
      name: options.scenario?.name ?? null,
      overrides,
    },
    base,
    result,
    deltas: scenarioDeltas(base, result),
    verdictChanged: base.verdict !== result.verdict,
    rentalVerdictChanged: base.rentalVerdict !== result.rentalVerdict,
    persisted: false,
    disclaimer: STUDY_DISCLAIMER,
  }
}
