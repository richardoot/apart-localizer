/**
 * Taux de rendement interne et valeur actuelle nette de flux annuels
 * (modèle § 7) : `flows[0]` à la date de départ (la mise, négative), puis un
 * flux par année.
 */

/** VAN : Σ flux_t / (1 + taux)^t. */
export function npv(rate: number, flows: readonly number[]): number {
  return flows.reduce((sum, flow, t) => sum + flow / Math.pow(1 + rate, t), 0)
}

function derivative(rate: number, flows: readonly number[]): number {
  return flows.reduce(
    (sum, flow, t) => sum - (t * flow) / Math.pow(1 + rate, t + 1),
    0
  )
}

/** Bornes de la recherche du TRI : −99,99 % à +1 000 % par an. */
export const IRR_LOWER = -0.9999
export const IRR_UPPER = 10

export interface IrrOptions {
  guess?: number
  tolerance?: number
  maxIterations?: number
}

/**
 * TRI : le taux qui annule la VAN. Newton depuis `guess` ; s'il diverge,
 * sort des bornes ou n'avance plus, bissection sur [−99,99 %, 1 000 %] quand
 * la VAN change de signe. Null si les flux ne changent pas de signe (pas de
 * TRI) ou si aucune racine n'est trouvée dans les bornes.
 */
export function irr(
  flows: readonly number[],
  options: IrrOptions = {}
): number | null {
  const hasPositive = flows.some(f => f > 0)
  const hasNegative = flows.some(f => f < 0)
  if (!hasPositive || !hasNegative) return null
  const tolerance = options.tolerance ?? 1e-10
  const maxIterations = options.maxIterations ?? 100
  let rate = options.guess ?? 0.05
  for (let i = 0; i < maxIterations; i++) {
    const value = npv(rate, flows)
    if (Math.abs(value) < tolerance) return rate
    const slope = derivative(rate, flows)
    if (!Number.isFinite(slope) || slope === 0) break
    const next = rate - value / slope
    if (!Number.isFinite(next) || next <= IRR_LOWER || next >= IRR_UPPER) break
    if (Math.abs(next - rate) < tolerance) return next
    rate = next
  }
  return bisection(flows, tolerance, BISECTION_ITERATIONS)
}

/** Itérations de la bissection : l'intervalle initial (≈ 11) tombe sous 1e-12 bien avant. */
const BISECTION_ITERATIONS = 200

function bisection(
  flows: readonly number[],
  tolerance: number,
  maxIterations: number
): number | null {
  let lo = IRR_LOWER
  let hi = IRR_UPPER
  let fLo = npv(lo, flows)
  const fHi = npv(hi, flows)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    return null
  }
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid, flows)
    if (Math.abs(fMid) < tolerance || hi - lo < tolerance) return mid
    if (fLo * fMid < 0) {
      hi = mid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}
