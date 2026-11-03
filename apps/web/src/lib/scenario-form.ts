import { ScenarioOverridesSchema } from '@apart/contracts'
import type { LeaseType, ScenarioOverrides, TaxRegime } from '@apart/contracts'
import {
  fractionToPercentInput,
  parseNumberInput,
  percentToFraction,
} from './format'

/**
 * Le formulaire d'un scénario « et si » : des champs texte, vides tant que
 * le scénario ne change pas la valeur de base. Conversion seulement, aucun
 * calcul : la comparaison vient de `compareScenario` (domain).
 */
export interface ScenarioForm {
  price: string
  targetRent: string
  renovationTotal: string
  leaseType: LeaseType | ''
  interestRatePercent: string
  downPayment: string
  durationYears: string
  vacancyMonths: string
  rentalStartDate: string
  marginalTaxPercent: string
  taxRegime: TaxRegime | ''
  horizonYears: string
  appreciationPercent: string
}

export function emptyScenarioForm(): ScenarioForm {
  return {
    price: '',
    targetRent: '',
    renovationTotal: '',
    leaseType: '',
    interestRatePercent: '',
    downPayment: '',
    durationYears: '',
    vacancyMonths: '',
    rentalStartDate: '',
    marginalTaxPercent: '',
    taxRegime: '',
    horizonYears: '',
    appreciationPercent: '',
  }
}

/** Les surcharges du formulaire (champs remplis seulement), validées par le contrat ; null si invalides. */
export function scenarioOverridesFromForm(form: ScenarioForm): {
  overrides: ScenarioOverrides | null
  error: string | null
} {
  const num = (raw: string): number | undefined =>
    raw.trim() === '' ? undefined : (parseNumberInput(raw) ?? Number.NaN)
  const pct = (raw: string): number | undefined =>
    raw.trim() === '' ? undefined : (percentToFraction(raw) ?? Number.NaN)
  const assumptions = Object.fromEntries(
    Object.entries({
      interestRate: pct(form.interestRatePercent),
      downPayment: num(form.downPayment),
      durationYears: num(form.durationYears),
      vacancyMonths: num(form.vacancyMonths),
      rentalStartDate: form.rentalStartDate.trim() || undefined,
      marginalTaxRate: pct(form.marginalTaxPercent),
      taxRegime: form.taxRegime || undefined,
      horizonYears: num(form.horizonYears),
      appreciationRate: pct(form.appreciationPercent),
    }).filter(([, v]) => v !== undefined)
  )
  const candidate = Object.fromEntries(
    Object.entries({
      price: num(form.price),
      targetRent: num(form.targetRent),
      renovationTotal: num(form.renovationTotal),
      leaseType: form.leaseType || undefined,
      assumptions: Object.keys(assumptions).length ? assumptions : undefined,
    }).filter(([, v]) => v !== undefined)
  )
  const parsed = ScenarioOverridesSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      overrides: null,
      error: parsed.error.issues
        .map(i => `${i.path.join('.')} : ${i.message}`)
        .join(' ; '),
    }
  }
  return { overrides: parsed.data, error: null }
}

/** Le formulaire d'un scénario enregistré. */
export function scenarioFormFromOverrides(
  overrides: ScenarioOverrides
): ScenarioForm {
  const a = overrides.assumptions ?? {}
  const text = (value: number | undefined | null): string =>
    value === undefined || value === null ? '' : String(value)
  return {
    price: text(overrides.price),
    targetRent: text(overrides.targetRent),
    renovationTotal: text(overrides.renovationTotal),
    leaseType: overrides.leaseType ?? '',
    interestRatePercent:
      a.interestRate === undefined
        ? ''
        : fractionToPercentInput(a.interestRate),
    downPayment: text(a.downPayment),
    durationYears: text(a.durationYears),
    vacancyMonths: text(a.vacancyMonths),
    rentalStartDate: a.rentalStartDate ?? '',
    marginalTaxPercent:
      a.marginalTaxRate === undefined
        ? ''
        : fractionToPercentInput(a.marginalTaxRate),
    taxRegime: a.taxRegime ?? '',
    horizonYears: text(a.horizonYears),
    appreciationPercent:
      a.appreciationRate === undefined
        ? ''
        : fractionToPercentInput(a.appreciationRate),
  }
}
