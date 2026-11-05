import { EXPLORATION_PORTAL_LABELS } from '@apart/contracts'
import type {
  DuplicateCandidate,
  ListingDraft,
  LocationPrecision,
} from '@apart/contracts'
import { fitReasonsText } from '@apart/domain'
import { formatRelativeDays } from './format'

/**
 * Lot 16 : les textes d'une carte « À valider » (brouillon reçu par e-mail
 * ou trouvé par Claude), sans calcul : l'adéquation vient de l'API (calculée
 * par `domain`), ici seulement sa mise en mots.
 */

const PRECISION_WORDS: Record<LocationPrecision, string> = {
  exact: 'adresse exacte',
  street: 'à la rue',
  district: 'au quartier',
  commune: 'commune seulement',
}

/** « Bordeaux · Caudéran, à la rue », « lieu inconnu ». */
export function draftPlace(draft: Pick<ListingDraft, 'listing'>): string {
  const location = draft.listing.location
  const where = [location.commune, location.district]
    .filter(Boolean)
    .join(' · ')
  const precision = location.precision
    ? PRECISION_WORDS[location.precision]
    : null
  if (!where) return precision ? `Repère ${precision}` : 'Lieu inconnu'
  return precision ? `${where}, ${precision}` : where
}

/** Le portail, ou « E-mail » pour une alerte reçue. */
export function draftSourceLabel(
  draft: Pick<ListingDraft, 'portal' | 'origin'>
): string {
  if (draft.portal) return EXPLORATION_PORTAL_LABELS[draft.portal]
  return draft.origin === 'email' ? 'E-mail' : 'Autre portail'
}

/** « publiée hier », « reçue il y a 3 j ». */
export function draftWhen(
  draft: Pick<ListingDraft, 'listing' | 'receivedAt' | 'origin'>,
  now: Date = new Date()
): string {
  if (draft.listing.publishedAt) {
    return `publiée ${formatRelativeDays(draft.listing.publishedAt, now)}`
  }
  return `${draft.origin === 'exploration' ? 'trouvée' : 'reçue'} ${formatRelativeDays(draft.receivedAt, now)}`
}

/** La raison sous la pastille d'adéquation : le critère, ou ce qui dépasse ou manque. */
export function draftFitReason(
  draft: Pick<ListingDraft, 'fit'>
): string | null {
  const fit = draft.fit
  if (!fit || fit.activeCriteria === 0) return null
  if (fit.level === 'in') return fit.name ? `« ${fit.name} »` : null
  return fit.reasons.length ? fitReasonsText(fit.reasons) : null
}

/** Le doublon probable à trancher, s'il reste à trancher. */
export function pendingDuplicate(
  draft: Pick<ListingDraft, 'duplicates' | 'distinct' | 'status'>
): DuplicateCandidate | null {
  if (draft.status !== 'pending' || draft.distinct) return null
  return draft.duplicates[0] ?? null
}

/** « même surface, même rue, 5 000 € de moins » : les motifs du doublon, en clair. */
export function duplicateWhy(duplicate: DuplicateCandidate): string {
  return duplicate.reasons.map(r => r.detail).join(' ; ')
}

/** Ce que Claude ou l'e-mail a transmis, et qui l'a lu. */
export function draftReadLabel(
  draft: Pick<ListingDraft, 'origin' | 'extractedBy'>
): string {
  if (draft.origin === 'exploration' || draft.extractedBy === 'claude') {
    return 'Lu sur la page par Claude'
  }
  return draft.extractedBy === 'ai'
    ? 'Lu dans l’e-mail par l’IA'
    : 'Lu dans l’e-mail (analyseur simple)'
}

/** Les cartes : à valider d'abord dans l'ordre reçu, les décisions de la session gardées à leur place. */
export function mergeDraftCards(
  pending: readonly ListingDraft[],
  decided: ReadonlyMap<string, ListingDraft>
): ListingDraft[] {
  const byId = new Map<string, ListingDraft>()
  for (const draft of pending) byId.set(draft.id, draft)
  for (const [id, draft] of decided) byId.set(id, draft)
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.receivedAt) - Date.parse(a.receivedAt) ||
      a.id.localeCompare(b.id)
  )
}
