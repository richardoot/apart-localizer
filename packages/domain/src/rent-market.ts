import type {
  CheckLevel,
  RentComparableUse,
  RentMarketReport,
  RentMarketStats,
} from '@apart/contracts'
import {
  RENT_MARKET_GAP_WARN,
  RENT_MARKET_MIN_COMPARABLES,
  RENT_MARKET_STALE_MONTHS,
} from '@apart/contracts'
import { monthsBetween } from './dates.js'
import { formatEuros, formatPercent } from './format.js'
import { quantile } from './market.js'
import { isoDay } from './rent-reference.js'

/**
 * Loyer de marché par comparables saisis (besoin L4) : médiane et quartiles
 * des loyers au m² des annonces de location du même type (vide ou meublé),
 * loyer estimé = médiane au m² × surface, position du loyer visé et du
 * plafond d'encadrement. Pure : les comparables viennent de la base.
 */

export interface RentComparableLike {
  id?: string | null
  rent: number
  surface: number
  furnished: boolean
  observedAt: string | null
}

export interface RentMarketSubject {
  listingId?: string | null
  surface: number | null
  furnished: boolean
  targetRent: number | null
  rentCap: number | null
  at: Date
}

/** Statistiques des loyers ; null sans comparable. */
export function rentMarketStats(
  comparables: readonly { rent: number; surface: number }[]
): RentMarketStats | null {
  const valid = comparables.filter(c => c.rent > 0 && c.surface > 0)
  if (valid.length === 0) return null
  const perM2 = valid.map(c => c.rent / c.surface).sort((x, y) => x - y)
  const rents = valid.map(c => c.rent).sort((x, y) => x - y)
  return {
    count: valid.length,
    medianRent: quantile(rents, 0.5),
    medianRentPerM2: quantile(perM2, 0.5),
    p25RentPerM2: quantile(perM2, 0.25),
    p75RentPerM2: quantile(perM2, 0.75),
    minRentPerM2: perM2[0] as number,
    maxRentPerM2: perM2[perM2.length - 1] as number,
  }
}

export function rentMarket(
  comparables: readonly RentComparableLike[],
  subject: RentMarketSubject
): RentMarketReport {
  const today = isoDay(subject.at)
  const uses: RentComparableUse[] = comparables.map(c => {
    const valid = c.rent > 0 && c.surface > 0
    const sameType = c.furnished === subject.furnished
    return {
      id: c.id ?? null,
      rent: c.rent,
      surface: c.surface,
      rentPerM2: valid ? c.rent / c.surface : 0,
      furnished: c.furnished,
      observedAt: c.observedAt,
      included: valid && sameType,
      stale:
        c.observedAt !== null &&
        monthsBetween(c.observedAt, today) > RENT_MARKET_STALE_MONTHS,
      reason: !valid
        ? 'Loyer ou surface manquant.'
        : sameType
          ? null
          : subject.furnished
            ? 'Location vide : l’annonce sera louée meublée.'
            : 'Location meublée : l’annonce sera louée vide.',
    }
  })
  const included = uses.filter(u => u.included)
  const stats = rentMarketStats(included)
  const enough = included.length >= RENT_MARKET_MIN_COMPARABLES
  const surface =
    subject.surface !== null && subject.surface > 0 ? subject.surface : null
  const estimatedRent =
    stats && surface !== null ? stats.medianRentPerM2 * surface : null
  const target =
    subject.targetRent !== null && subject.targetRent > 0
      ? subject.targetRent
      : null
  const gapToMarket =
    estimatedRent !== null && target !== null
      ? target / estimatedRent - 1
      : null
  const targetPerM2 =
    target !== null && surface !== null ? target / surface : null
  const targetPercentile =
    targetPerM2 !== null && included.length > 0
      ? included.filter(u => u.rentPerM2 < targetPerM2).length / included.length
      : null
  const capGapToMarket =
    estimatedRent !== null && subject.rentCap !== null
      ? subject.rentCap / estimatedRent - 1
      : null

  const messages: string[] = []
  let level: CheckLevel = 'ok'
  if (!enough) {
    level = 'unknown'
    messages.push(
      `${included.length} comparable(s) ${subject.furnished ? 'meublé(s)' : 'vide(s)'} : il en faut au moins ${RENT_MARKET_MIN_COMPARABLES} pour une médiane fiable (10 idéalement).`
    )
  }
  if (estimatedRent !== null) {
    messages.push(
      `Loyer de marché estimé ≈ ${formatEuros(estimatedRent)} par mois (médiane ${stats ? stats.medianRentPerM2.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'} €/m²).`
    )
  } else if (stats && surface === null) {
    messages.push('Surface de l’annonce inconnue : pas de loyer estimé.')
  }
  if (gapToMarket !== null) {
    if (gapToMarket > RENT_MARKET_GAP_WARN) {
      if (enough) level = 'warn'
      messages.push(
        `Loyer visé ${formatPercent(gapToMarket)} au-dessus du marché estimé : risque de vacance.`
      )
    } else {
      messages.push(
        `Loyer visé ${gapToMarket >= 0 ? `${formatPercent(gapToMarket)} au-dessus` : `${formatPercent(-gapToMarket)} en dessous`} du marché estimé.`
      )
    }
  }
  if (target !== null && subject.rentCap !== null && target > subject.rentCap) {
    level = level === 'unknown' ? 'unknown' : 'warn'
    messages.push(
      `Loyer visé au-dessus du plafond d’encadrement (${formatEuros(subject.rentCap)}) : le plafond s’impose.`
    )
  }
  const stale = uses.filter(u => u.stale).length
  if (stale > 0) {
    messages.push(
      `${stale} comparable(s) relevé(s) il y a plus de ${RENT_MARKET_STALE_MONTHS} mois : à actualiser.`
    )
  }
  const excluded = uses.filter(u => !u.included).length
  if (excluded > 0) {
    messages.push(
      `${excluded} comparable(s) écarté(s) (type de location ou saisie incomplète).`
    )
  }
  return {
    listingId: subject.listingId ?? null,
    surface,
    furnished: subject.furnished,
    comparables: uses,
    stats,
    enough,
    estimatedRent,
    targetRent: target,
    gapToMarket,
    targetPercentile,
    rentCap: subject.rentCap,
    capGapToMarket,
    level,
    messages,
  }
}
