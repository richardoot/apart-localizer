import type {
  MarketStats,
  MarketTrend,
  MarketTrendChange,
  MarketTrendDirection,
  MarketTrendYear,
  OpenDataStatus,
} from '@apart/contracts'
import {
  MARKET_MIN_COMPARABLES,
  MARKET_SURFACE_TOLERANCE,
  MARKET_TREND_HORIZONS,
  MARKET_TREND_MIN_SALES,
  MARKET_TREND_STABLE,
  MARKET_YEARS,
  OPEN_DATA_STATUS_LABELS,
} from '@apart/contracts'
import { formatEuros, plural } from './format.js'
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

// ---------------------------------------------------------------------------
// Lot 29 : tendance des prix de vente, année par année (ADR 0039)
// ---------------------------------------------------------------------------

/** Ce que la tendance dit toujours de ses limites. */
export const MARKET_TREND_NOTE =
  'Médianes de toutes les ventes d’appartements du rayon, toutes surfaces, en euros courants (inflation non déduite) ; un indicateur, il n’entre dans aucun calcul.'
/** La limite des ventes d'avant 2021 (DVF+ open-data du Cerema). */
export const MARKET_TREND_PARCEL_NOTE =
  'Avant 2021, les ventes sont repérées à la parcelle (DVF+ open-data du Cerema).'
/** Première année des fichiers DVF géolocalisés d'Etalab en base ; avant, le Cerema. */
export const MARKET_TREND_ADDRESS_FIRST_YEAR = 2021

export interface MarketTrendInput {
  /** Prix au m² des ventes d'appartements du rayon, par année. */
  byYear: readonly { year: number; pricesPerM2: readonly number[] }[]
  /** Années présentes en base et date de leur dernière vente (toute la métropole). */
  dataYears: readonly { year: number; lastDate?: string | null }[]
  radiusMeters: number | null
  minSales?: number
  /** Faux sans repère : pas de tendance (défaut vrai). */
  located?: boolean
  /** La réserve d'un repère approché (lot 12), ajoutée aux raisons. */
  reserve?: string | null
  /** Repère au centre de la commune : la tendance est « à vérifier ». */
  toVerify?: boolean
}

/** Une année est incomplète si ses ventes en base s'arrêtent avant décembre. */
export function isPartialDvfYear(
  year: number,
  lastDate: string | null | undefined
): boolean {
  if (!lastDate) return false
  return lastDate < `${year}-12-01`
}

/** Le sens des prix depuis une variation sur un an. */
export function trendDirection(
  change: number,
  stable: number = MARKET_TREND_STABLE
): MarketTrendDirection {
  if (Math.abs(change) < stable) return 'stable'
  return change > 0 ? 'up' : 'down'
}

/**
 * La tendance des prix : médiane au m² de chaque année en base (retenue à
 * partir de dix ventes), écarts sur un, cinq et dix ans jusqu'à la dernière
 * année complète, année du pic et écart depuis. Rien n'est extrapolé : une
 * année sans assez de ventes n'a pas de médiane, un écart dont une borne
 * manque n'est pas rendu.
 */
export function marketTrend(input: MarketTrendInput): MarketTrend {
  const minSales = input.minSales ?? MARKET_TREND_MIN_SALES
  const prices = new Map(input.byYear.map(y => [y.year, y.pricesPerM2]))
  const dataYears = [...input.dataYears].sort((a, b) => a.year - b.year)
  const years: MarketTrendYear[] = dataYears.map(({ year, lastDate }) => {
    const stats = marketStats(prices.get(year) ?? [])
    const count = stats?.count ?? 0
    return {
      year,
      count,
      medianPricePerM2:
        stats && count >= minSales ? stats.medianPricePerM2 : null,
      partial: isPartialDvfYear(year, lastDate),
    }
  })
  const base = {
    radiusMeters: input.radiusMeters,
    years,
    notes: [] as string[],
  }
  const empty = {
    ...base,
    referenceYear: null,
    changes: [] as MarketTrendChange[],
    peak: null,
    direction: null,
  }
  if (years.length === 0) {
    return {
      ...empty,
      status: 'unavailable',
      reasons: ['Aucune vente DVF importée : lance pnpm import:dvf.'],
    }
  }
  if (input.located === false) {
    return {
      ...empty,
      years: years.map(y => ({ ...y, count: 0, medianPricePerM2: null })),
      status: 'to_verify',
      reasons: ['Adresse non localisée : pas de tendance.'],
    }
  }
  const retained = years.filter(
    (y): y is MarketTrendYear & { medianPricePerM2: number } =>
      !y.partial && y.medianPricePerM2 !== null
  )
  const reference = retained[retained.length - 1]
  if (!reference) {
    return {
      ...empty,
      status: 'to_verify',
      reasons: [
        `Moins de ${minSales} ventes par an${input.radiusMeters !== null ? ` à ${input.radiusMeters} m` : ''} : tendance non retenue.`,
      ],
    }
  }
  const medianOf = new Map(retained.map(y => [y.year, y.medianPricePerM2]))
  const changes: MarketTrendChange[] = []
  for (const horizon of MARKET_TREND_HORIZONS) {
    const from = medianOf.get(reference.year - horizon)
    if (from === undefined || !(from > 0)) continue
    const ratio = reference.medianPricePerM2 / from
    changes.push({
      years: horizon,
      fromYear: reference.year - horizon,
      toYear: reference.year,
      change: ratio - 1,
      annualized: Math.pow(ratio, 1 / horizon) - 1,
    })
  }
  const top = retained.reduce((best, y) =>
    y.medianPricePerM2 > best.medianPricePerM2 ? y : best
  )
  const oneYear = changes.find(c => c.years === 1)
  const reasons: string[] = []
  if (changes.length === 0) {
    reasons.push(
      `Une seule année comparable (${reference.year}) : pas d’écart calculé.`
    )
  }
  if (input.reserve) reasons.push(input.reserve)
  const notes = [MARKET_TREND_NOTE]
  if (years.some(y => y.year < MARKET_TREND_ADDRESS_FIRST_YEAR)) {
    notes.push(MARKET_TREND_PARCEL_NOTE)
  }
  return {
    ...base,
    status: changes.length > 0 && !input.toVerify ? 'ok' : 'to_verify',
    referenceYear: reference.year,
    changes,
    peak: {
      year: top.year,
      medianPricePerM2: top.medianPricePerM2,
      changeSince: reference.medianPricePerM2 / top.medianPricePerM2 - 1,
    },
    direction: oneYear ? trendDirection(oneYear.change) : null,
    reasons,
    notes,
  }
}

/**
 * Vrai quand la dernière année complète en base a une médiane retenue : le
 * rayon suffit, inutile de l'élargir.
 */
export function trendCoversLastCompleteYear(trend: MarketTrend): boolean {
  const complete = trend.years.filter(y => !y.partial)
  const last = complete[complete.length - 1]
  return Boolean(last && last.medianPricePerM2 !== null)
}

/** Une variation signée, sans décimale au-delà de 10 % (« +3,4 % », « −12 % »). */
export function formatTrendChange(change: number): string {
  if (!Number.isFinite(change)) return '—'
  const percent = Math.abs(change) * 100
  // Arrondi d'abord : 9,99999 % s'écrit « 10 % », pas « 10,0 % ».
  const digits = Math.round(percent * 10) / 10 >= 10 ? 0 : 1
  const text = percent.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const zero = Number(percent.toFixed(digits)) === 0
  return `${zero ? '' : change > 0 ? '+' : '−'}${text} %`
}

/** « sur un an », « sur cinq ans », « sur dix ans » ; sinon le nombre. */
export function trendHorizonLabel(years: number): string {
  if (years === 1) return 'sur un an'
  if (years === 5) return 'sur cinq ans'
  if (years === 10) return 'sur dix ans'
  return `sur ${years} ans`
}

const DIRECTION_TEXT: Record<MarketTrendDirection, string> = {
  up: 'en hausse',
  down: 'en baisse',
  stable: 'stables',
}

/** « Prix en baisse sur un an », pour un titre ou une pastille. */
export function trendDirectionLabel(direction: MarketTrendDirection): string {
  return `Prix ${DIRECTION_TEXT[direction]} sur un an`
}

/** L'année incomplète la plus récente dont la médiane est retenue (« 2026, année incomplète »). */
export function latestPartialYear(
  trend: MarketTrend
): (MarketTrendYear & { medianPricePerM2: number }) | null {
  const last = trend.years[trend.years.length - 1]
  if (!last || !last.partial || last.medianPricePerM2 === null) return null
  return last as MarketTrendYear & { medianPricePerM2: number }
}

/** La tendance en une ligne, pour le connecteur MCP. */
export function marketTrendLine(trend: MarketTrend): string {
  const status: OpenDataStatus = trend.status
  const head = `Tendance des prix (${OPEN_DATA_STATUS_LABELS[status]})`
  const reference = trend.years.find(y => y.year === trend.referenceYear)
  if (!reference || reference.medianPricePerM2 === null) {
    return `${head} : ${trend.reasons.join(' ') || 'non disponible.'}`
  }
  const where =
    trend.radiusMeters !== null ? ` à moins de ${trend.radiusMeters} m` : ''
  const parts = [
    `${head} : médiane ${formatEuros(reference.medianPricePerM2)}/m² en ${reference.year} (${plural(reference.count, 'vente')} d’appartements${where}, toutes surfaces)`,
  ]
  if (trend.changes.length) {
    parts.push(
      trend.changes
        .map(
          c =>
            `${formatTrendChange(c.change)} ${trendHorizonLabel(c.years)}${c.years > 1 ? ` (${formatTrendChange(c.annualized)} par an)` : ''}`
        )
        .join(', ')
    )
  }
  if (trend.peak && trend.peak.year !== reference.year) {
    parts.push(
      `pic en ${trend.peak.year} à ${formatEuros(trend.peak.medianPricePerM2)}/m², ${formatTrendChange(trend.peak.changeSince)} depuis`
    )
  }
  const partial = latestPartialYear(trend)
  if (partial) {
    parts.push(
      `${partial.year} (année incomplète) : ${formatEuros(partial.medianPricePerM2)}/m² sur ${plural(partial.count, 'vente')}`
    )
  }
  const first = trend.years.find(y => y.medianPricePerM2 !== null)
  if (first && first.year !== reference.year) {
    parts.push(`série depuis ${first.year}`)
  }
  return [`${parts.join(' ; ')}.`, ...trend.reasons, ...trend.notes].join(' ')
}
