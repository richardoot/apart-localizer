import {
  LISTING_CHECK_OUTCOME_LABELS,
  CRITERIA_FIT_LEVEL_LABELS,
  LISTING_STATUS_LABELS,
  RENTAL_VERDICT_LABELS,
  VERDICT_LABELS,
} from '@apart/contracts'
import type { EvaluatedListing } from '@apart/contracts'
import { fitReasonsText, keptLabel, precisionBadge } from '@apart/domain'

/**
 * Le CSV pour un tableur français : séparateur « ; », UTF-8 avec BOM (Excel
 * le lit sans mélanger les accents), virgule décimale, dates ISO, en-têtes
 * en français. Les indicateurs viennent de l'évaluation faite par `domain`.
 * Fonctions pures.
 */

export const CSV_SEPARATOR = ';'
export const UTF8_BOM = '﻿'

export type CsvCell = string | number | boolean | null | undefined

/** Un nombre à la française, sans séparateur de milliers ; vide si non fini. */
export function csvNumber(
  value: number | null | undefined,
  digits = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return ''
  const rounded = Number(value.toFixed(digits))
  return String(rounded).replace('.', ',')
}

/**
 * Une cellule échappée : guillemets si elle contient le séparateur, un
 * guillemet ou un saut de ligne ; une apostrophe devant un texte qui
 * commencerait par = + - @ (injection de formule dans le tableur).
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') return csvNumber(value)
  let text = value
  // Un nombre déjà mis en forme (effort négatif) n'est pas une formule.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(,\d+)?$/.test(text)) {
    text = `'${text}`
  }
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: readonly string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map(row =>
    row.map(cell => csvCell(cell)).join(CSV_SEPARATOR)
  )
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

const pct = (fraction: number | null | undefined): string =>
  fraction === null || fraction === undefined || !Number.isFinite(fraction)
    ? ''
    : csvNumber(fraction * 100)
const day = (iso: string | null | undefined): string => iso?.slice(0, 10) ?? ''

export const LISTING_CSV_COLUMNS = [
  'Titre',
  'Statut',
  'Portail',
  'Lien',
  'Commune',
  'Quartier',
  'Adresse',
  'Repère',
  'Prix (€)',
  "Honoraires d'agence (€)",
  'Surface Carrez (m²)',
  'Pièces',
  'Chambres',
  'Étage',
  'Ascenseur',
  'Année de construction',
  'DPE',
  'GES',
  'Charges annuelles (€)',
  'Taxe foncière (€)',
  'Loyer visé (€/mois)',
  'Loyer retenu (€/mois)',
  'Prix au m² (€)',
  'Frais de notaire (€)',
  'Travaux (€)',
  'Coût total (€)',
  'Mensualité (€)',
  'Rendement brut (%)',
  'Rendement net (%)',
  'Effort mensuel (€)',
  'Verdict',
  'Location',
  'Prix cible (€)',
  'Décote nécessaire (%)',
  'Note moyenne (/5)',
  'Tâches ouvertes',
  'Visites',
  'Dernière offre (€)',
  'Ajoutée le',
  'Modifiée le',
  'Identifiant',
  // Lot 15, en fin de ligne pour ne décaler aucune colonne.
  'Vérifiée le',
  'Vue en ligne le',
  'Dernière vérification',
  // Lot 14, en fin de ligne pour ne pas décaler les colonnes existantes.
  'Adéquation',
  'Raisons de l’adéquation',
] as const

/** Une ligne par annonce, dans l'ordre de `LISTING_CSV_COLUMNS`. */
export function listingCsvRow(
  item: EvaluatedListing,
  visitCount: number
): CsvCell[] {
  const l = item.listing
  const m = item.evaluation.metrics
  const target = item.evaluation.targetPrice
  const rated = item.opinions.filter(o => o.rating > 0)
  const average = rated.length
    ? rated.reduce((sum, o) => sum + o.rating, 0) / rated.length
    : null
  return [
    l.title,
    LISTING_STATUS_LABELS[l.status],
    l.source,
    l.url,
    l.location.commune,
    l.location.district,
    l.location.addressNormalized ?? l.location.addressRaw,
    // Lot 12 : « Adresse exacte », « À la rue », « Au quartier (X) », « Commune seulement ».
    precisionBadge(l.location).label,
    csvNumber(l.price),
    csvNumber(l.feesAmount),
    csvNumber(l.surface),
    l.rooms,
    l.bedrooms,
    l.floorLabel ?? l.floor,
    l.elevator,
    l.constructionYear,
    l.dpeClass,
    l.gesClass,
    csvNumber(l.annualCharges),
    csvNumber(l.propertyTax),
    csvNumber(m.targetRent),
    csvNumber(m.rent),
    csvNumber(m.pricePerM2, 0),
    csvNumber(m.notaryFees, 0),
    csvNumber(m.renovationTotal, 0),
    csvNumber(m.totalCost, 0),
    csvNumber(m.monthlyPayment),
    pct(m.grossYield),
    pct(m.netYield),
    csvNumber(m.effort),
    VERDICT_LABELS[m.verdict],
    RENTAL_VERDICT_LABELS[item.evaluation.rental.verdict],
    csvNumber(target.targetPrice, 0),
    pct(target.discount),
    average === null ? '' : csvNumber(average, 1),
    item.tasks.filter(t => !t.done).length,
    visitCount,
    item.offers[0] ? csvNumber(item.offers[0].amount, 0) : '',
    day(l.createdAt),
    day(l.updatedAt),
    l.id,
    day(l.lastCheckedAt),
    day(l.lastSeenOnlineAt),
    item.lastCheck ? LISTING_CHECK_OUTCOME_LABELS[item.lastCheck.outcome] : '',
    fitCell(item),
    fitReasonsCell(item),
  ]
}

/** Lot 14 : le niveau d'adéquation, ou « Aucun critère actif ». */
function fitCell(item: EvaluatedListing): string {
  const fit = item.criteriaFit
  return fit.activeCriteria === 0
    ? 'Aucun critère actif'
    : CRITERIA_FIT_LEVEL_LABELS[fit.level]
}

/** Lot 14 : le critère, les raisons courtes et l'exception « gardée ». */
function fitReasonsCell(item: EvaluatedListing): string {
  const fit = item.criteriaFit
  if (fit.activeCriteria === 0) return ''
  return [
    fit.name ? `« ${fit.name} »` : null,
    fit.reasons.length ? fitReasonsText(fit.reasons) : null,
    fit.kept ? keptLabel(fit.kept) : null,
  ]
    .filter(Boolean)
    .join(' : ')
}
