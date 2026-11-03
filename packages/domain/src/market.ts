import type { MarketStats } from '@apart/contracts'
import {
  MARKET_MIN_COMPARABLES,
  MARKET_SURFACE_TOLERANCE,
  MARKET_YEARS,
} from '@apart/contracts'
import { isoDay } from './rent-reference.js'

/**
 * Ancrage marché (besoin N4) : statistiques des prix au m² des ventes DVF
 * comparables, fenêtre de dates et de surfaces, prix de marché estimé. Les
 * ventes elles-mêmes viennent de PostGIS (module geo) ; ici, seulement les
 * calculs.
 */

/** Quantile par interpolation linéaire (méthode 7 de Hyndman et Fan) d'une liste triée. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  const position = (sorted.length - 1) * Math.min(Math.max(q, 0), 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const a = sorted[lower] as number
  const b = sorted[upper] as number
  return a + (b - a) * (position - lower)
}

/** Médiane, quartiles, extrêmes et dispersion des prix au m² ; null sans vente. */
export function marketStats(
  pricesPerM2: readonly number[]
): MarketStats | null {
  const values = pricesPerM2
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
  if (values.length === 0) return null
  const median = quantile(values, 0.5)
  const p25 = quantile(values, 0.25)
  const p75 = quantile(values, 0.75)
  return {
    count: values.length,
    medianPricePerM2: median,
    p25PricePerM2: p25,
    p75PricePerM2: p75,
    minPricePerM2: values[0] as number,
    maxPricePerM2: values[values.length - 1] as number,
    dispersion: median > 0 ? (p75 - p25) / median : 0,
  }
}

/** Le prix de marché estimé : médiane au m² × surface, si assez de ventes. */
export function marketPrice(
  surface: number | null | undefined,
  stats: MarketStats | null,
  minCount: number = MARKET_MIN_COMPARABLES
): number | null {
  if (!stats || stats.count < minCount) return null
  if (surface === null || surface === undefined || !(surface > 0)) return null
  return stats.medianPricePerM2 * surface
}

/** Les surfaces comparables : ±25 % autour de la surface de référence. */
export function comparableSurfaceRange(
  surface: number,
  tolerance: number = MARKET_SURFACE_TOLERANCE
): [number, number] {
  return [surface * (1 - tolerance), surface * (1 + tolerance)]
}

/** La fenêtre des comparables : les trois dernières années jusqu'à la date donnée. */
export function marketWindow(
  at: Date,
  years: number = MARKET_YEARS
): { from: string; to: string } {
  const from = new Date(at.getTime())
  from.setUTCFullYear(from.getUTCFullYear() - years)
  return { from: isoDay(from), to: isoDay(at) }
}

/** L'écart du prix au m² affiché à la médiane du marché (0,08 = 8 % au-dessus). */
export function gapToMarket(
  pricePerM2: number | null | undefined,
  stats: MarketStats | null
): number | null {
  if (!stats || !(stats.medianPricePerM2 > 0)) return null
  if (pricePerM2 === null || pricePerM2 === undefined) return null
  if (!Number.isFinite(pricePerM2) || pricePerM2 <= 0) return null
  return pricePerM2 / stats.medianPricePerM2 - 1
}

/**
 * Le prix médian au m² retenu pour le critère « marché » du prix cible, à
 * partir de l'instantané enregistré sur l'annonce : null s'il manque ou s'il
 * repose sur moins de cinq ventes.
 */
export function marketPricePerM2FromContext(
  context:
    | {
        market?: { medianPricePerM2: number | null; count: number } | null
      }
    | null
    | undefined,
  minCount: number = MARKET_MIN_COMPARABLES
): number | null {
  const market = context?.market
  if (!market || market.medianPricePerM2 === null) return null
  return market.count >= minCount && market.medianPricePerM2 > 0
    ? market.medianPricePerM2
    : null
}
