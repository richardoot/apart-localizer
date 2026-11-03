import type {
  Assumptions,
  ListingFinancials,
  Sensitivity,
  SensitivityCell,
} from '@apart/contracts'
import { compute } from './compute.js'

export const PRICE_FACTORS: readonly number[] = [0.85, 0.9, 0.95, 1]
export const RATE_DELTAS: readonly number[] = [-0.005, 0, 0.005]
export const RENT_FACTORS: readonly number[] = [0.9, 1, 1.1]

export interface SensitivityGrid {
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
  grid: SensitivityGrid = {}
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
