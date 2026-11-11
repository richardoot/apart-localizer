import type { IconName } from '@/lib/icons'

/**
 * Lot 23 (ADR 0033) : la navigation. Sur ordinateur, l'en-tête garde ses
 * entrées et un menu du compte (espace, critères des avis, notifications,
 * thème, déconnexion) ; au téléphone, une barre en bas (Accueil, Annonces,
 * Ajouter, Notifications, Plus) et un en-tête d'une ligne. Chaque page
 * secondaire allume l'entrée de sa page parente : la table ci-dessous est
 * la seule à le dire. Pur.
 */

/** Les entrées de l'en-tête d'ordinateur ; `account` est le menu du compte. */
export type DesktopEntry =
  'home' | 'listings' | 'criteria' | 'assumptions' | 'activity' | 'account'

/** Les entrées de la barre du bas au téléphone. */
export type PhoneEntry = 'home' | 'listings' | 'add' | 'notifications' | 'more'

export interface NavLink<E extends string> {
  entry: E
  to: string
  label: string
  icon: IconName
}

export const DESKTOP_LINKS: readonly NavLink<DesktopEntry>[] = [
  { entry: 'home', to: '/', label: 'Accueil', icon: 'home' },
  { entry: 'listings', to: '/annonces', label: 'Annonces', icon: 'list' },
  { entry: 'criteria', to: '/criteres', label: 'Critères', icon: 'map-pin' },
  {
    entry: 'assumptions',
    to: '/hypotheses',
    label: 'Hypothèses',
    icon: 'sliders',
  },
  { entry: 'activity', to: '/activite', label: 'Activité', icon: 'clock' },
]

export const PHONE_LINKS: readonly NavLink<PhoneEntry>[] = [
  { entry: 'home', to: '/', label: 'Accueil', icon: 'home' },
  { entry: 'listings', to: '/annonces', label: 'Annonces', icon: 'list' },
  { entry: 'add', to: '/annonces/nouvelle', label: 'Ajouter', icon: 'plus' },
  {
    entry: 'notifications',
    to: '/notifications',
    label: 'Notifications',
    icon: 'bell',
  },
  { entry: 'more', to: '/plus', label: 'Plus', icon: 'menu' },
]

/** Ce que « Plus » range au téléphone (et le menu du compte sur ordinateur, en partie). */
export const MORE_LINKS: readonly (NavLink<string> & { hint: string })[] = [
  {
    entry: 'criteria',
    to: '/criteres',
    label: 'Critères',
    icon: 'map-pin',
    hint: 'Où chercher, budget, surface ; ce que Claude cherche',
  },
  {
    entry: 'assumptions',
    to: '/hypotheses',
    label: 'Hypothèses',
    icon: 'sliders',
    hint: 'Apport, prêt, loyer visé : la base des calculs',
  },
  {
    entry: 'claude',
    to: '/claude',
    label: 'Claude',
    icon: 'spark',
    hint: 'Le brancher, lui demander, ce qu’il a fait',
  },
  {
    entry: 'activity',
    to: '/activite',
    label: 'Activité',
    icon: 'clock',
    hint: 'Qui a fait quoi, et quand',
  },
  {
    entry: 'workspace',
    to: '/espace',
    label: 'Espace',
    icon: 'users',
    hint: 'Membres, invitations, décider à plusieurs',
  },
  {
    entry: 'opinion-criteria',
    to: '/espace/criteres-des-avis',
    label: 'Critères des avis',
    icon: 'star',
    hint: 'Ce que chacun note après une visite',
  },
]

/** L'entrée d'ordinateur allumée par chaque page (par nom de route). */
const DESKTOP_OF: Record<string, DesktopEntry> = {
  home: 'home',
  tasks: 'home',
  listings: 'listings',
  listing: 'listings',
  'listing-new': 'listings',
  compare: 'listings',
  triage: 'listings',
  settle: 'listings',
  criteria: 'criteria',
  'criteria-brief': 'criteria',
  exploration: 'criteria',
  assumptions: 'assumptions',
  activity: 'activity',
  workspace: 'account',
  'opinion-criteria': 'account',
  notifications: 'account',
  claude: 'account',
  more: 'account',
}

/** L'entrée de la barre du bas allumée par chaque page. */
const PHONE_OF: Record<string, PhoneEntry> = {
  home: 'home',
  tasks: 'home',
  listings: 'listings',
  listing: 'listings',
  compare: 'listings',
  triage: 'listings',
  settle: 'listings',
  'listing-new': 'add',
  notifications: 'notifications',
  more: 'more',
  criteria: 'more',
  'criteria-brief': 'more',
  exploration: 'more',
  assumptions: 'more',
  activity: 'more',
  workspace: 'more',
  'opinion-criteria': 'more',
  claude: 'more',
}

const nameOf = (name: unknown): string => (typeof name === 'string' ? name : '')

/** L'entrée de l'en-tête d'ordinateur à allumer ; null pour une page hors menu. */
export function desktopEntryOf(routeName: unknown): DesktopEntry | null {
  return DESKTOP_OF[nameOf(routeName)] ?? null
}

/** L'entrée de la barre du bas à allumer ; null pour une page hors menu. */
export function phoneEntryOf(routeName: unknown): PhoneEntry | null {
  return PHONE_OF[nameOf(routeName)] ?? null
}

/** Les initiales d'un nom affiché (« Richard » → « R », « Marie Curie » → « MC »), sans ponctuation. */
export function initialsOf(name: string | null | undefined): string {
  // Les mots qui commencent par une lettre seulement (« Camille (démo) » → « C »).
  const letters = (name ?? '')
    .trim()
    .split(/\s+/)
    .map(w => w.match(/^\p{L}/u)?.[0] ?? '')
    .filter(Boolean)
  if (letters.length === 0) return '?'
  return letters
    .slice(0, 2)
    .map(l => l.toLocaleUpperCase('fr-FR'))
    .join('')
}

/**
 * Le retour d'une page ouverte depuis une autre (compte rendu
 * d'exploration, tâches, fiche) : la page précédente de l'historique si
 * elle est de l'application, sinon la page parente donnée.
 */
export function backTarget(
  historyBack: unknown,
  fallback: string
): { kind: 'history' } | { kind: 'push'; to: string } {
  return typeof historyBack === 'string' && historyBack.startsWith('/')
    ? { kind: 'history' }
    : { kind: 'push', to: fallback }
}

/** Les routes de la page Annonces (liste, fiche, nouvelle annonce). */
const LISTINGS_PAGE = new Set(['listings', 'listing', 'listing-new'])

/**
 * Fermer une fiche ou la nouvelle annonce : si elle a été ouverte depuis une
 * autre page de l'application (l'accueil, toutes les tâches, le tri), on y
 * revient par l'historique ; sinon (lien direct, page Annonces), la liste.
 */
export function closesBack(previousRouteName: unknown): boolean {
  return (
    typeof previousRouteName === 'string' &&
    previousRouteName !== '' &&
    previousRouteName !== 'login' &&
    !LISTINGS_PAGE.has(previousRouteName)
  )
}

/**
 * Lot 25 (ADR 0035) : à partir de cette largeur (Tailwind `lg`), la fiche est
 * une pleine page ; en dessous, le panneau plein écran du lot 19.
 */
export const FICHE_PAGE_QUERY = '(min-width: 1024px)'

/** Les routes qui ouvrent un panneau par-dessus la liste (fiche au téléphone, nouvelle annonce). */
const OVER_LIST = new Set(['listing', 'listing-new'])

/**
 * Le défilement de la fenêtre entre la liste et une fiche (règle du routeur).
 * Un panneau s'ouvre et se ferme par-dessus la liste, qui ne bouge pas
 * (`false`). La fiche en pleine page s'ouvre en haut ; un retour arrière
 * vers la liste reprend sa position enregistrée (le routeur la garde).
 * `null` : la règle ordinaire.
 */
export function listingScroll(
  toName: unknown,
  fromName: unknown,
  fichePage: boolean
): false | null {
  const to = nameOf(toName)
  const from = nameOf(fromName)
  const between =
    (to === 'listings' && OVER_LIST.has(from)) ||
    (from === 'listings' && OVER_LIST.has(to)) ||
    (OVER_LIST.has(to) && OVER_LIST.has(from))
  if (!between) return null
  const pageInvolved = fichePage && (to === 'listing' || from === 'listing')
  return pageInvolved ? null : false
}

/**
 * Fermer une fiche ou la nouvelle annonce (lot 23, lot 25) : par
 * l'historique si la page précédente est une autre page de l'application
 * (accueil, tâches, tri) ou la liste elle-même (même étape, mêmes filtres,
 * même position) ; sinon (lien direct), la liste.
 */
export function closeTarget(previousRouteName: unknown): 'history' | 'list' {
  return closesBack(previousRouteName) || previousRouteName === 'listings'
    ? 'history'
    : 'list'
}
