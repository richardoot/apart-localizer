import { TAX_REGIME_LABELS, VERDICT_LABELS } from '@apart/contracts'
import type {
  AssumptionsImpact,
  LeaseType,
  VerdictChange,
} from '@apart/contracts'
import { REFERENCE_NOTARY_PRICE } from '@apart/domain'
import type { AssumptionsDraft, SectionId } from './assumptions-form'
import {
  formatEuros,
  formatEurosPerMonth,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatRateCompact,
  formatSignedRate,
} from './format'

/**
 * Les résumés d'une ligne de la page Hypothèses (lot 13) : sommaire sur
 * ordinateur, en-têtes d'accordéon sur mobile, pastilles de la fiscalité,
 * phrases de l'impact et de l'enregistrement. Du formatage de la saisie en
 * cours, jamais de calcul : le taux effectif des frais de notaire vient de
 * `@apart/domain` (`notaryEffectiveRate`).
 */

export interface SummaryReadings {
  /** Taux effectif des frais de notaire sur le prix d'exemple ; null si le barème saisi est incomplet. */
  notaryRate: number | null
  /** Le barème saisi a les valeurs du barème par défaut. */
  scaleIsDefault: boolean
}

/** Lot 19 : le type de location de l'espace, en un mot. */
const LEASE_SHORT: Record<LeaseType, string> = {
  unfurnished: 'vide',
  furnished: 'meublée',
  shared: 'colocation',
}

const or = <T>(value: T | null, format: (v: T) => string): string =>
  value === null ? '—' : format(value)

const plural = (n: number, one: string, many: string): string =>
  n > 1 ? many : one

/** Les pastilles de la section « Fiscalité et revente » repliée. */
export function taxationPills(draft: AssumptionsDraft): string[] {
  return [
    draft.marginalTaxRate === null
      ? 'TMI non renseignée'
      : `TMI ${formatRateCompact(draft.marginalTaxRate)}`,
    draft.taxRegime === null
      ? 'régime selon le bail'
      : TAX_REGIME_LABELS[draft.taxRegime],
    `horizon ${or(draft.horizonYears, formatNumber)} ans`,
    draft.appreciationRate === 0
      ? 'bien à valeur constante'
      : `bien ${or(draft.appreciationRate, formatSignedRate)}/an`,
    `loyers ${or(draft.rentIndexationRate, formatSignedRate)}/an`,
  ]
}

/** Le résumé d'une ligne de chaque section, d'après la saisie en cours. */
export function sectionSummaries(
  draft: AssumptionsDraft,
  readings: SummaryReadings
): Record<SectionId, string> {
  const location =
    draft.rentalStartDate !== null
      ? formatMonthYear(draft.rentalStartDate)
      : `janv. ${or(draft.rentalYear, String)}`
  // Lot 19 : le type de location de l'espace.
  const lease = LEASE_SHORT[draft.leaseType]
  const vacancy =
    draft.vacancyMonths === null
      ? null
      : draft.vacancyMonths === 0
        ? 'sans vacance'
        : `${formatNumber(draft.vacancyMonths)} mois de vacance`
  const notary =
    draft.notaryMode === 'rate'
      ? `taux forfaitaire ${or(draft.notaryRate, formatRateCompact)}`
      : [
          readings.scaleIsDefault ? 'barème officiel' : 'barème personnalisé',
          readings.notaryRate === null
            ? null
            : `≈ ${formatPercent(readings.notaryRate)} à ${formatEuros(REFERENCE_NOTARY_PRICE)}`,
        ]
          .filter(Boolean)
          .join(' · ')
  const [tmi] = taxationPills(draft)
  return {
    financement: [
      or(draft.downPayment, formatEuros),
      or(draft.interestRate, formatRateCompact),
      `${or(draft.durationYears, formatNumber)} ans`,
    ].join(' · '),
    criteres: [
      `brut ≥ ${or(draft.grossYieldThreshold, formatRateCompact)}`,
      `effort ≤ ${or(draft.maxMonthlyEffort, formatEurosPerMonth)}`,
      draft.netYieldThreshold === null
        ? null
        : `net ≥ ${formatRateCompact(draft.netYieldThreshold)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    calendrier: [
      draft.purchaseDate
        ? `achat ${formatMonthYear(draft.purchaseDate)}`
        : null,
      `location ${location}, ${lease}`,
      vacancy,
    ]
      .filter(Boolean)
      .join(' · '),
    notaire: notary,
    fiscalite: `${tmi} · horizon ${or(draft.horizonYears, formatNumber)} ans · estimations`,
  }
}

/** « 1 modification non enregistrée », « 3 modifications non enregistrées ». */
export function pendingChangesLabel(count: number): string {
  if (count === 0) return 'Aucune modification non enregistrée'
  return `${count} ${plural(count, 'modification non enregistrée', 'modifications non enregistrées')}`
}

/** « ● 1 modifié », « ● 2 modifiés » pour le sommaire et les en-têtes d'accordéon. */
export function changedCountLabel(count: number): string {
  return `● ${count} ${plural(count, 'modifié', 'modifiés')}`
}

const activeListings = (n: number): string =>
  `${n} ${plural(n, 'annonce active', 'annonces actives')}`

/** La phrase de tête de l'aperçu d'impact et la répartition des verdicts avant → après. */
export function impactSummary(impact: AssumptionsImpact): {
  headline: string
  distribution: string
} {
  const { total, changedVerdicts: changed } = impact
  const unchanged = total - changed
  const headline =
    changed === 0
      ? `Avec ces changements : aucun verdict ne change sur ${activeListings(total)}.`
      : `Avec ces changements : ${changed} ${plural(changed, 'annonce change', 'annonces changent')} de verdict, ${unchanged} ${plural(unchanged, 'inchangée', 'inchangées')}.`
  const before = impact.byVerdictBefore
  const after = impact.byVerdictAfter
  const distribution = (['target', 'to_dig', 'off_target'] as const)
    .map(v => `${VERDICT_LABELS[v]} ${before[v]} → ${after[v]}`)
    .join(' · ')
  return { headline, distribution }
}

/** Une annonce dont le verdict change : « T2 : Hors cible → Cible · prix cible 199 000 € ». */
export function impactLine(change: VerdictChange): string {
  const price =
    change.targetPriceAfter === null
      ? ''
      : ` · prix cible ${formatEuros(change.targetPriceAfter)}`
  return `${change.title} : ${VERDICT_LABELS[change.before]} → ${VERDICT_LABELS[change.after]}${price}`
}

/** Le message après l'enregistrement d'une version, d'après son impact. */
export function savedMessage(impact: AssumptionsImpact): string {
  return impact.changedVerdicts === 0
    ? `Hypothèses enregistrées : aucun verdict ne change sur ${activeListings(impact.total)}.`
    : `Hypothèses enregistrées : ${impact.changedVerdicts} ${plural(impact.changedVerdicts, 'annonce', 'annonces')} sur ${impact.total} ${plural(impact.changedVerdicts, 'change', 'changent')} de verdict.`
}
