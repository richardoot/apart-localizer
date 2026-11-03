import type {
  Assumptions,
  ListingFinancials,
  Sensitivity,
  SensitivityAxis,
  SensitivityCell,
  SensitivityGrid,
  SensitivityGridCell,
  SensitivityStep,
} from '@apart/contracts'
import { compute } from './compute.js'

export const PRICE_FACTORS: readonly number[] = [0.85, 0.9, 0.95, 1]
export const RATE_DELTAS: readonly number[] = [-0.005, 0, 0.005]
export const RENT_FACTORS: readonly number[] = [0.9, 1, 1.1]

/** Facteurs de la grille à trois entrées (prix × taux × loyer). */
export interface SensitivityFactors {
  priceFactors?: readonly number[]
  rateDeltas?: readonly number[]
  rentFactors?: readonly number[]
}

/**
 * Tableau de sensibilité (modèle § 6) : `compute` sur une grille prix × taux
 * × loyer. Chaque cellule rend le brut, l'effort et le verdict.
 */
export function sensitivity(
  input: ListingFinancials,
  a: Assumptions,
  grid: SensitivityFactors = {}
): Sensitivity {
  const priceFactors = grid.priceFactors ?? PRICE_FACTORS
  const rateDeltas = grid.rateDeltas ?? RATE_DELTAS
  const rentFactors = grid.rentFactors ?? RENT_FACTORS
  const cells: SensitivityCell[] = []
  for (const priceFactor of priceFactors) {
    for (const rateDelta of rateDeltas) {
      for (const rentFactor of rentFactors) {
        const price = input.price * priceFactor
        const interestRate = Math.max(0, a.interestRate + rateDelta)
        const targetRent = input.targetRent * rentFactor
        const metrics = compute(
          { ...input, price, targetRent },
          { ...a, interestRate }
        )
        cells.push({
          priceFactor,
          rateDelta,
          rentFactor,
          price,
          interestRate,
          rent: metrics.rent,
          grossYield: metrics.grossYield,
          effort: metrics.effort,
          verdict: metrics.verdict,
        })
      }
    }
  }
  return { cells }
}

/**
 * Pas par défaut de chaque axe du tableau à deux entrées : multiplicateurs
 * pour le prix et le loyer, écarts pour le taux (fraction), l'apport (euros)
 * et la durée (années).
 */
export const DEFAULT_AXIS_STEPS: Record<SensitivityAxis, readonly number[]> = {
  price: [0.85, 0.9, 0.95, 1],
  rent: [0.9, 1, 1.1],
  rate: [-0.005, 0, 0.005],
  downPayment: [-20_000, 0, 20_000],
  duration: [-5, 0, 5],
}

/** Le pas qui laisse la valeur actuelle inchangée. */
export const NEUTRAL_STEP: Record<SensitivityAxis, number> = {
  price: 1,
  rent: 1,
  rate: 0,
  downPayment: 0,
  duration: 0,
}

export interface SensitivityGridRequest {
  rowAxis: SensitivityAxis
  colAxis: SensitivityAxis
  rowSteps?: readonly number[] | undefined
  colSteps?: readonly number[] | undefined
}

interface Scenario {
  input: ListingFinancials
  a: Assumptions
  value: number
}

/** Applique un pas sur un axe : l'annonce ou les hypothèses modifiées, et la valeur absolue retenue. */
export function applyAxisStep(
  axis: SensitivityAxis,
  step: number,
  input: ListingFinancials,
  a: Assumptions
): Scenario {
  switch (axis) {
    case 'price': {
      const value = input.price * step
      return { input: { ...input, price: value }, a, value }
    }
    case 'rent': {
      const value = input.targetRent * step
      return { input: { ...input, targetRent: value }, a, value }
    }
    case 'rate': {
      const value = Math.max(0, a.interestRate + step)
      return { input, a: { ...a, interestRate: value }, value }
    }
    case 'downPayment': {
      const value = Math.max(0, a.downPayment + step)
      return { input, a: { ...a, downPayment: value }, value }
    }
    case 'duration': {
      const value = Math.min(
        40,
        Math.max(1, Math.round(a.durationYears + step))
      )
      return { input, a: { ...a, durationYears: value }, value }
    }
    default:
      throw new RangeError(`Axe de sensibilité inconnu : ${String(axis)}`)
  }
}

/**
 * Tableau de sensibilité à deux entrées (lot N3) : deux axes au choix, une
 * cellule par couple de pas avec le brut, le net, l'effort, la mensualité et
 * le verdict. La cellule des pas neutres est repérée (`isCurrent`).
 */
export function sensitivityGrid(
  input: ListingFinancials,
  a: Assumptions,
  request: SensitivityGridRequest
): SensitivityGrid {
  const { rowAxis, colAxis } = request
  if (rowAxis === colAxis) {
    throw new RangeError('Les deux axes du tableau doivent être différents')
  }
  const steps = (axis: SensitivityAxis, given?: readonly number[]) =>
    (given && given.length > 0 ? given : DEFAULT_AXIS_STEPS[axis]).map(
      (step): SensitivityStep => ({
        step,
        value: applyAxisStep(axis, step, input, a).value,
        isCurrent: step === NEUTRAL_STEP[axis],
      })
    )
  const rows = steps(rowAxis, request.rowSteps)
  const cols = steps(colAxis, request.colSteps)
  const cells: SensitivityGridCell[][] = rows.map(row =>
    cols.map(col => {
      const afterRow = applyAxisStep(rowAxis, row.step, input, a)
      const scenario = applyAxisStep(
        colAxis,
        col.step,
        afterRow.input,
        afterRow.a
      )
      const m = compute(scenario.input, scenario.a)
      return {
        price: scenario.input.price,
        targetRent: scenario.input.targetRent,
        rent: m.rent,
        interestRate: scenario.a.interestRate,
        downPayment: scenario.a.downPayment,
        durationYears: scenario.a.durationYears,
        totalCost: m.totalCost,
        monthlyPayment: m.monthlyPayment,
        grossYield: m.grossYield,
        netYield: m.netYield,
        effort: m.effort,
        verdict: m.verdict,
        isCurrent: row.isCurrent && col.isCurrent,
      }
    })
  )
  const rowIndex = rows.findIndex(r => r.isCurrent)
  const colIndex = cols.findIndex(c => c.isCurrent)
  return {
    rowAxis,
    colAxis,
    rows,
    cols,
    cells,
    current:
      rowIndex >= 0 && colIndex >= 0 ? { row: rowIndex, col: colIndex } : null,
  }
}
