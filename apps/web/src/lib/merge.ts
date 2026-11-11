import {
  LISTING_STATUS_LABELS,
  SIMILARITY_LEVEL_LABELS,
} from '@apart/contracts'
import type {
  ListingMergeSide,
  ListingStatus,
  SimilarListing,
  SimilarityLevel,
} from '@apart/contracts'
import { similarityPercent } from '@apart/domain'
import { formatEuros, plural } from './format'
import type { Tone } from './ui'

/**
 * Lot 27 (ADR 0037) : les textes, côté interface, de « Déjà vue » et de la
 * fusion de deux fiches. Aucune règle ici : la ressemblance et ce qui passe
 * d'une fiche à l'autre viennent de l'API (calculés par `domain`).
 */

const LEVEL_TONES: Record<SimilarityLevel, Tone> = {
  certain: 'good',
  very_close: 'accent',
  close: 'info',
  far: 'neutral',
}

/** La teinte de la pastille de ressemblance. */
export function similarTone(level: SimilarityLevel): Tone {
  return LEVEL_TONES[level]
}

/** « Très proche · 92 % » ; « La même annonce » sans pourcentage. */
export function similarLevelText(
  item: Pick<SimilarListing, 'level' | 'score'>
): string {
  const label = SIMILARITY_LEVEL_LABELS[item.level]
  return item.level === 'certain'
    ? label
    : `${label} · ${similarityPercent(item.score)}`
}

/** « 209 000 € · 68 m² · 3 pièces · Bordeaux · Caudéran ». */
export function similarFacts(
  item: Pick<
    SimilarListing,
    'price' | 'surface' | 'rooms' | 'commune' | 'district'
  >
): string {
  return [
    formatEuros(item.price),
    item.surface !== null ? `${item.surface} m²` : null,
    item.rooms !== null ? plural(item.rooms, 'pièce') : null,
    item.commune,
    item.district,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Les statuts rangés aux archives : une annonce « déjà vue » y est souvent. */
const ARCHIVED: readonly ListingStatus[] = [
  'discarded',
  'offer_refused',
  'sold_or_withdrawn',
]

/** L'étape de l'annonce ressemblante, et si elle est aux archives. */
export function similarStatus(item: Pick<SimilarListing, 'status'>): {
  label: string
  archived: boolean
} {
  return {
    label: LISTING_STATUS_LABELS[item.status],
    archived: ARCHIVED.includes(item.status),
  }
}

/** « Agence · réf. EX-2041 » ; null si la fiche ne sait rien de son vendeur. */
export function similarSeller(
  item: Pick<SimilarListing, 'sellerName' | 'sellerReference'>
): string | null {
  const parts = [
    item.sellerName,
    item.sellerReference ? `réf. ${item.sellerReference}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** « 214 000 € · 68 m² · Bordeaux » : une des deux fiches à fusionner. */
export function mergeSideFacts(
  side: Pick<ListingMergeSide, 'price' | 'surface' | 'commune'>
): string {
  return [
    formatEuros(side.price),
    side.surface !== null ? `${side.surface} m²` : null,
    side.commune,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** « 2 liens · 1 visite · 1 offre · 2 avis · 3 tâches » ; « Aucun suivi » si rien. */
export function mergeSideHistory(
  side: Pick<
    ListingMergeSide,
    'links' | 'visits' | 'offers' | 'opinions' | 'tasks'
  >
): string {
  const parts = [
    side.links ? plural(side.links, 'lien') : null,
    side.visits ? plural(side.visits, 'visite') : null,
    side.offers ? plural(side.offers, 'offre') : null,
    side.opinions ? `${side.opinions} avis` : null,
    side.tasks ? plural(side.tasks, 'tâche') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Aucun suivi'
}

/** Le choix du tri, au bilan : « Déjà vue : « T3 Caudéran » ». */
export function alreadySeenLabel(title: string): string {
  return `Déjà vue : « ${title} »`
}
