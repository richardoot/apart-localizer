import {
  EXPLORATION_LINE_FILTER_LABELS,
  EXPLORATION_PORTAL_STATUS_LABELS,
  ExplorationLineFilterSchema,
} from '@apart/contracts'
import type {
  ExplorationCounts,
  ExplorationLineFilter,
  ExplorationOutcome,
  PortalSearch,
  SearchCriteria,
} from '@apart/contracts'
import { formatEuros } from './format'

/**
 * Lot 16 : les textes de la page Critères (« Ce que Claude cherche ») et du
 * compte rendu d'une exploration. Mise en mots seulement : le brief, le tri
 * et les compteurs viennent de l'API (calculés par `domain`).
 */

const TIME_ZONE = 'Europe/Paris'

function sameDay(a: Date, b: Date): boolean {
  const day = (d: Date) =>
    d.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE })
  return day(a) === day(b)
}

/** « Aujourd’hui, 18:40 », « 30 octobre, 21:10 ». */
export function explorationWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  })
  if (sameDay(at, now)) return `Aujourd’hui, ${time}`
  const day = at.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  })
  return `${day}, ${time}`
}

/** « Exploration du 5 novembre, 18:40 ». */
export function explorationTitle(iso: string): string {
  const at = new Date(iso)
  return `Exploration du ${at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: TIME_ZONE })}, ${at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })}`
}

/** « durée 6 min », « durée moins d’une minute ». */
export function explorationDuration(
  startedAt: string,
  finishedAt: string
): string {
  const minutes = Math.round(
    (Date.parse(finishedAt) - Date.parse(startedAt)) / 60_000
  )
  if (!Number.isFinite(minutes) || minutes < 1)
    return 'durée moins d’une minute'
  return `durée ${minutes} min`
}

/** « 23 vues · 5 à valider », « 18 vues · aucune à valider ». */
export function explorationCountsText(counts: ExplorationCounts): string {
  return `${counts.seen} vue${counts.seen > 1 ? 's' : ''} · ${counts.toValidate ? `${counts.toValidate} à valider` : 'aucune à valider'}`
}

/** L'état d'un portail au dernier passage : « lu aujourd’hui », « bloqué le 30 octobre (captcha) ». */
export function portalLastRunText(
  lastRun: PortalSearch['lastRun'],
  now: Date = new Date()
): string | null {
  if (!lastRun) return null
  const at = new Date(lastRun.at)
  const when = sameDay(at, now)
    ? 'aujourd’hui'
    : `le ${at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: TIME_ZONE })}`
  const note =
    lastRun.status === 'blocked' && lastRun.note ? ` (${lastRun.note})` : ''
  return `${EXPLORATION_PORTAL_STATUS_LABELS[lastRun.status]} ${when}${note}`
}

/** Le critère en une ligne (« Polygone dessiné · ≤ 220 000 € · ≥ 60 m² · 3 pièces et plus · DPE ≤ D »). */
export function criteriaHeadline(
  criteria: Pick<SearchCriteria, 'filters'>,
  perimeterLabel: string
): string {
  const f = criteria.filters
  return [
    perimeterLabel,
    f.priceMax !== null ? `≤ ${formatEuros(f.priceMax)}` : null,
    f.priceMin !== null ? `≥ ${formatEuros(f.priceMin)}` : null,
    f.surfaceMin !== null ? `≥ ${f.surfaceMin} m²` : null,
    f.roomsMin !== null
      ? `${f.roomsMin} pièce${f.roomsMin > 1 ? 's' : ''} et plus`
      : null,
    f.dpeMax !== null ? `DPE ≤ ${f.dpeMax}` : null,
    f.maxTramDistanceMeters !== null
      ? `tram ≤ ${f.maxTramDistanceMeters} m`
      : null,
    f.communes.length ? f.communes.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** La pastille d'un résultat du compte rendu, lisible sans la couleur. */
export const OUTCOME_BADGE: Record<
  ExplorationOutcome,
  { label: string; tone: string }
> = {
  new: { label: 'À valider', tone: 'bg-accent text-accent-fg' },
  duplicate_probable: { label: 'À valider', tone: 'bg-accent text-accent-fg' },
  known: { label: 'Déjà suivie', tone: 'bg-accent-soft text-accent' },
  attached: {
    label: 'Rattachée d’office',
    tone: 'border border-accent text-accent',
  },
  dismissed: { label: 'Déjà écartée', tone: 'bg-surface-2 text-fg' },
  out: { label: 'Hors critères', tone: 'bg-muted text-surface' },
}

/** Le filtre du compte rendu lu dans l'URL (`?resultat=`) ; inconnu = toutes. */
export function lineFilterFromQuery(value: unknown): ExplorationLineFilter {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = ExplorationLineFilterSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'all'
}

export const LINE_FILTERS: readonly ExplorationLineFilter[] =
  ExplorationLineFilterSchema.options

export { EXPLORATION_LINE_FILTER_LABELS }
