import type { MarketTrend } from '@apart/contracts'
import {
  formatTrendChange,
  latestPartialYear,
  trendHorizonLabel,
} from '@apart/domain'
import { formatEurosPerM2, plural } from '@/lib/format'

/**
 * Lot 29 (ADR 0039) : la géométrie et les textes du bloc « Tendance des
 * prix » de l'onglet Négocier. Pur : les médianes, les écarts et le pic
 * viennent du serveur (`domain`) ; ici, seulement où poser les points d'une
 * courbe (en pourcentage de la zone de tracé) et comment les dire.
 */

export interface TrendPoint {
  year: number
  count: number
  /** Médiane au m² ; null = moins de dix ventes, pas de point. */
  value: number | null
  partial: boolean
  /** Position en % de la largeur de la zone de tracé. */
  x: number
  /** Position en % depuis le haut ; null sans médiane. */
  y: number | null
}

export interface TrendChart {
  points: TrendPoint[]
  /** Tronçons de la courbe (viewBox 0 0 100 100) ; jamais par-dessus une année sans médiane. */
  segments: { d: string; partial: boolean }[]
  /** Graduations de l'axe des prix, de la plus haute à la plus basse. */
  ticks: { value: number; y: number }[]
  /** Années écrites sous l'axe. */
  xLabels: { year: number; x: number }[]
  /**
   * Points dont la valeur est écrite sur le graphique : l'année de référence
   * et le pic. Sous le point quand la courbe y arrive en descendant (le dessus
   * est pris par le tronçon), au-dessus sinon.
   */
  labelled: { year: number; below: boolean }[]
}

/** Un pas « rond » (100, 250, 500, 1 000…) pour six graduations au plus. */
export function tickStep(span: number): number {
  const steps = [50, 100, 250, 500, 1000, 2500, 5000]
  return steps.find(step => span / step <= 5) ?? 10_000
}

const round = (value: number): number => Math.round(value * 100) / 100

/**
 * La courbe des médianes par année. Null s'il n'y a pas deux années à
 * relier : une seule valeur se dit en une phrase, pas en graphique.
 */
export function trendChart(trend: MarketTrend): TrendChart | null {
  const valued = trend.years.filter(y => y.medianPricePerM2 !== null)
  if (valued.length < 2) return null
  const values = valued.map(y => y.medianPricePerM2 as number)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const step = tickStep(high - low)
  // L'axe ne part pas de zéro (c'est une courbe, pas des barres) : il encadre les médianes.
  const min = Math.floor(low / step) * step
  const max = Math.max(Math.ceil(high / step) * step, min + step)
  const firstYear = trend.years[0]?.year ?? 0
  const lastYear = trend.years[trend.years.length - 1]?.year ?? firstYear
  const span = Math.max(lastYear - firstYear, 1)
  const xOf = (year: number): number => round(((year - firstYear) / span) * 100)
  const yOf = (value: number): number =>
    round(((max - value) / (max - min)) * 100)
  const points: TrendPoint[] = trend.years.map(y => ({
    year: y.year,
    count: y.count,
    value: y.medianPricePerM2,
    partial: y.partial,
    x: xOf(y.year),
    y: y.medianPricePerM2 === null ? null : yOf(y.medianPricePerM2),
  }))
  const segments: TrendChart['segments'] = []
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as TrendPoint
    const to = points[i] as TrendPoint
    if (from.y === null || to.y === null) continue
    segments.push({
      d: `M${from.x} ${from.y}L${to.x} ${to.y}`,
      partial: from.partial || to.partial,
    })
  }
  const ticks: TrendChart['ticks'] = []
  for (let value = max; value >= min; value -= step) {
    ticks.push({ value, y: yOf(value) })
  }
  // Une année sur deux si la série est longue, toujours la dernière.
  const every = points.length > 8 ? 2 : 1
  const xLabels = points
    .filter((_, i) => (points.length - 1 - i) % every === 0)
    .map(p => ({ year: p.year, x: p.x }))
  const years = new Set<number>()
  if (trend.referenceYear !== null) years.add(trend.referenceYear)
  // Le pic n'est écrit que s'il est assez loin de l'année de référence pour ne pas la chevaucher.
  const peakYear = trend.peak?.year
  if (
    peakYear !== undefined &&
    [...years].every(year => Math.abs(year - peakYear) >= 3)
  ) {
    years.add(peakYear)
  }
  const labelled = [...years]
    .sort((x, y) => x - y)
    .map(year => {
      const index = points.findIndex(p => p.year === year)
      const point = points[index] as TrendPoint
      const before = points[index - 1]
      const descending =
        before?.value !== null &&
        before?.value !== undefined &&
        point.value !== null &&
        before.value > point.value
      // Pas sous un point trop bas : l'axe des années est là.
      return { year, below: descending && (point.y ?? 100) <= 75 }
    })
  return { points, segments, ticks, xLabels, labelled }
}

/** « 2022 : 4 800 €/m² · 212 ventes », la ligne lue au survol d'une année. */
export function trendYearText(year: {
  year: number
  count: number
  medianPricePerM2?: number | null
  value?: number | null
  partial: boolean
}): string {
  const value = year.medianPricePerM2 ?? year.value ?? null
  const sales = plural(year.count, 'vente')
  const name = `${year.year}${year.partial ? ' (année incomplète)' : ''}`
  return value === null
    ? `${name} : ${sales}, trop peu pour une médiane`
    : `${name} : ${formatEurosPerM2(value)} · ${sales}`
}

/** Les écarts en tuiles : « −4,5 % », « sur un an », les deux années ; le rythme annuel au-delà d'un an. */
export function trendTiles(
  trend: MarketTrend
): { key: number; value: string; label: string; detail: string }[] {
  return trend.changes.map(change => ({
    key: change.years,
    value: formatTrendChange(change.change),
    label: trendHorizonLabel(change.years),
    detail: `${change.fromYear} → ${change.toYear}${
      change.years > 1 ? `, ${formatTrendChange(change.annualized)} par an` : ''
    }`,
  }))
}

/** « Pic en 2022 à 4 800 €/m² : −13 % depuis. » ; null si le pic est l'année de référence. */
export function trendPeakText(trend: MarketTrend): string | null {
  const { peak } = trend
  if (!peak || peak.year === trend.referenceYear) return null
  return `Pic en ${peak.year} à ${formatEurosPerM2(peak.medianPricePerM2)} : ${formatTrendChange(peak.changeSince)} depuis.`
}

/** « 2026 (année incomplète) : 4 150 €/m² sur 96 ventes. » ; null sans année incomplète retenue. */
export function trendPartialText(trend: MarketTrend): string | null {
  const partial = latestPartialYear(trend)
  if (!partial) return null
  return `${partial.year} (année incomplète) : ${formatEurosPerM2(partial.medianPricePerM2)} sur ${plural(partial.count, 'vente')}.`
}
