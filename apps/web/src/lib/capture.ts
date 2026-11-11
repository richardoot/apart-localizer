import { parseSharedListing } from '@apart/contracts'

/**
 * Lot 24 (ADR 0034) : la capture courte d'une annonce au téléphone. Sur
 * iPhone, la feuille de partage ne propose pas l'application installée (pas
 * de cible de partage dans Safari) : on copie le lien dans l'application du
 * portail, on ouvre « Ajouter », on colle. L'application ne télécharge jamais
 * la page du portail : un lien seul ne dit rien à l'IA ; les captures d'écran
 * et le texte collé, si. Après l'analyse, cinq champs à relire. Pur, testé.
 */

/** Les cinq champs relus avant « Enregistrer » (chemins de `validateForm`). */
export const QUICK_FIELDS = [
  'title',
  'price',
  'surface',
  'location.commune',
  'url',
] as const

/** Les erreurs de saisie qu'aucun des cinq champs n'affiche. */
export function errorsOutsideQuick(errors: Record<string, string>): string[] {
  const shown = new Set<string>(QUICK_FIELDS)
  return Object.entries(errors)
    .filter(([key]) => !shown.has(key))
    .map(([, message]) => message)
}

/**
 * Ce que le presse-papiers apporte : un lien (même au milieu d'une phrase,
 * « Regarde cette annonce : https://… »), et le reste comme texte quand il y
 * en a assez pour être l'annonce elle-même. Rien si c'est vide.
 */
export function clipboardToCapture(text: string): {
  url: string | null
  text: string | null
} {
  const raw = text.trim()
  if (!raw) return { url: null, text: null }
  const shared = parseSharedListing({ text: raw, url: null, title: null })
  const rest = shared.text.trim()
  // Une courte phrase autour du lien n'est pas l'annonce.
  return {
    url: shared.url,
    text: rest.length >= 80 || (!shared.url && rest) ? rest : null,
  }
}

/** Où en est le premier écran : rien, un lien seul, ou de quoi analyser. */
export type CaptureState = 'empty' | 'link-only' | 'analyzable'

export function captureState(input: {
  url: string
  text: string
  images: number
}): CaptureState {
  if (input.text.trim() || input.images > 0) return 'analyzable'
  return input.url.trim() ? 'link-only' : 'empty'
}

/** Ce que dit l'écran pour chaque état (honnête sur ce qu'un lien seul donne). */
export const CAPTURE_HINTS: Record<CaptureState, string> = {
  empty:
    'Colle le lien de l’annonce, puis ajoute des captures d’écran (prix, surface, description) : l’IA remplit la fiche.',
  'link-only':
    'Un lien seul ne dit rien à l’IA : l’application n’ouvre jamais la page du portail. Ajoute des captures d’écran ou le texte de l’annonce, ou enregistre le lien et complète le titre et le prix toi-même.',
  analyzable:
    'L’IA lit les captures et le texte, puis tu relis cinq champs avant d’enregistrer.',
}

/** Le message quand le presse-papiers ne se lit pas (refusé, vide, navigateur). */
export const CLIPBOARD_FALLBACK =
  'Le presse-papiers ne se lit pas ici : touche le champ, puis « Coller ».'
