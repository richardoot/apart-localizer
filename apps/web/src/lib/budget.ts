import { LEASE_TYPE_LABELS, TAX_REGIME_LABELS } from '@apart/contracts'
import type {
  Assumptions,
  LeaseType,
  RentMarketStats,
  RentObservatoryLookup,
  ScenarioOverrides,
} from '@apart/contracts'
import { rentalStartYear } from '@apart/domain'
import { formatEuros, formatEurosPerMonth, formatRateCompact } from './format'

/**
 * Lot 19 (ADR 0029) : les textes de l'onglet Budget. Du formatage, pas de
 * calcul : l'année de mise en location vient de `domain`
 * (`rentalStartYear`), les montants des hypothèses de l'espace.
 */

/** L'année de mise en location de l'espace : celle de la date précise, sinon `rentalYear`. */
export function budgetRentalYear(
  a: Pick<Assumptions, 'rentalStartDate' | 'rentalYear'>
): number {
  return rentalStartYear(null, a)
}

/** « location vide », « location meublée », « colocation ». */
export function leaseTypeText(a: {
  leaseType?: LeaseType | null | undefined
}): string {
  const label = LEASE_TYPE_LABELS[a.leaseType ?? 'unfurnished']
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** « frais de notaire au barème », « frais de notaire au taux de 7,5 % ». */
export function notaryText(
  a: Pick<Assumptions, 'notaryMode' | 'notaryRate'>
): string {
  return a.notaryMode === 'scale'
    ? 'frais de notaire au barème'
    : `frais de notaire au taux de ${formatRateCompact(a.notaryRate)}`
}

/**
 * Le bandeau de l'onglet : « apport 40 000 €, 3,65 % sur 25 ans, frais de
 * notaire au barème, mise en location en 2028, location vide ».
 */
export function assumptionsBanner(a: Assumptions): string {
  return [
    `apport ${formatEuros(a.downPayment)}`,
    `${formatRateCompact(a.interestRate)} sur ${a.durationYears} ans`,
    notaryText(a),
    `mise en location en ${budgetRentalYear(a)}`,
    leaseTypeText(a),
  ].join(', ')
}

/**
 * La fourchette du loyer de marché des comparables : premier et troisième
 * quartiles au m² × surface, en euros par mois ; null sans statistiques ou
 * sans surface.
 */
export function marketRange(
  stats: Pick<RentMarketStats, 'p25RentPerM2' | 'p75RentPerM2'> | null,
  surface: number | null
): { low: number; high: number } | null {
  if (!stats || surface === null || !(surface > 0)) return null
  return {
    low: stats.p25RentPerM2 * surface,
    high: stats.p75RentPerM2 * surface,
  }
}

/** Les surcharges d'un scénario, en une ligne (« prix 150 000 €, taux 3 % »). */
export function scenarioSummary(overrides: ScenarioOverrides): string {
  const parts: string[] = []
  const euros = (label: string, v: number | undefined) => {
    if (v !== undefined) parts.push(`${label} ${formatEuros(v)}`)
  }
  euros('prix', overrides.price)
  if (overrides.targetRent !== undefined) {
    parts.push(`loyer ${formatEurosPerMonth(overrides.targetRent)}`)
  }
  euros('travaux', overrides.renovationTotal)
  euros('mobilier', overrides.furnitureValue)
  euros('taxe foncière', overrides.propertyTax)
  euros('charges', overrides.annualCharges)
  if (overrides.leaseType) {
    parts.push(leaseTypeText({ leaseType: overrides.leaseType }))
  }
  const a = overrides.assumptions ?? {}
  if (a.leaseType && !overrides.leaseType) parts.push(leaseTypeText(a))
  if (a.interestRate !== undefined) {
    parts.push(`taux ${formatRateCompact(a.interestRate)}`)
  }
  euros('apport', a.downPayment)
  if (a.durationYears !== undefined) parts.push(`${a.durationYears} ans`)
  if (a.vacancyMonths !== undefined) {
    parts.push(`vacance ${a.vacancyMonths.toLocaleString('fr-FR')} mois/an`)
  }
  if (a.rentalStartDate) parts.push(`location le ${a.rentalStartDate}`)
  else if (a.rentalYear !== undefined) {
    parts.push(`location en ${a.rentalYear}`)
  }
  if (a.taxRegime) parts.push(TAX_REGIME_LABELS[a.taxRegime])
  if (a.marginalTaxRate !== undefined && a.marginalTaxRate !== null) {
    parts.push(`TMI ${formatRateCompact(a.marginalTaxRate)}`)
  }
  if (a.appreciationRate !== undefined) {
    parts.push(`revalorisation ${formatRateCompact(a.appreciationRate)}/an`)
  }
  if (a.horizonYears !== undefined) {
    parts.push(`horizon ${a.horizonYears} ans`)
  }
  return parts.join(', ')
}

/**
 * Lot 28 : le loyer observé par l'observatoire local des loyers, en deux
 * lignes (la médiane et son loyer mensuel, puis la zone et l'enquête) ; null
 * quand aucune médiane n'est lue. Indicatif : jamais un plafond.
 */
export function observedRentText(
  lookup: RentObservatoryLookup
): { perM2: string; monthly: string | null; detail: string } | null {
  if (lookup.medianPerM2 === null || lookup.zone === null) return null
  const perM2 = (value: number): string =>
    `${value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} €/m²`
  const rooms =
    lookup.rooms === null
      ? 'toutes tailles'
      : lookup.rooms === 4
        ? '4 pièces et plus'
        : lookup.rooms === 1
          ? '1 pièce'
          : `${lookup.rooms} pièces`
  const monthly =
    lookup.monthlyMedian !== null &&
    lookup.monthlyQ1 !== null &&
    lookup.monthlyQ3 !== null
      ? `${lookup.approximate ? '≈ ' : ''}${formatEurosPerMonth(lookup.monthlyMedian)} hors charges, de ${formatEuros(lookup.monthlyQ1)} à ${formatEuros(lookup.monthlyQ3)} entre les quartiles`
      : null
  const quartiles =
    lookup.q1PerM2 !== null && lookup.q3PerM2 !== null
      ? `, quartiles ${perM2(lookup.q1PerM2)} et ${perM2(lookup.q3PerM2)}`
      : ''
  return {
    perM2: perM2(lookup.medianPerM2),
    monthly,
    detail: `${lookup.zone.label}, appartements ${rooms}${quartiles}${lookup.year !== null ? `, enquête ${lookup.year}` : ''}`,
  }
}
