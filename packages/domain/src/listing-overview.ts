import type {
  AgencyRequestStatus,
  DpeClass,
  ListingMetrics,
  ListingOpenDataContext,
  ListingQuestionField,
  RentalChecksResult,
  TargetPrice,
  VisitStatus,
} from '@apart/contracts'
import {
  isAskableTask,
  taskRequestState,
  type QuestionTask,
  type RequestLike,
} from './agency-requests.js'
import { formatEuros, formatPercent } from './format.js'
import { marketGap } from './listing-reading.js'

/**
 * Lot 19 (ADR 0029) : la fiche répond à sept questions. Ce module choisit,
 * à partir des données déjà là (lecture de la fiche, louabilité, données
 * ouvertes, travaux, champs manquants, tâches et demandes à l'annonceur,
 * visites), ce que la Synthèse met en avant (« Ce qui plaît », « À
 * surveiller », « Prochaines étapes ») et ce que l'onglet « À faire »
 * fusionne en une seule liste. Aucun texte n'est inventé : chaque phrase
 * reprend une valeur ou un message de `domain` ; rien quand rien. Pur.
 */

// ---------------------------------------------------------------------------
// Ce qui plaît, à surveiller
// ---------------------------------------------------------------------------

/** L'onglet où un point se détaille (identifiant d'URL de la fiche). */
export type HighlightTab =
  'bien' | 'budget' | 'negocier' | 'quartier' | 'a-faire'

export interface Highlight {
  /** Clé stable du point (`tram`, `works`, `rental_dpe_ban`…). */
  key: string
  text: string
  tab: HighlightTab
}

export interface ListingHighlights {
  good: Highlight[]
  watch: Highlight[]
}

export interface HighlightsInput {
  metrics: ListingMetrics | null
  rental: RentalChecksResult | null
  targetPrice: TargetPrice | null
  dpeClass: DpeClass | null
  /** L'instantané des données ouvertes de la fiche (tram, DVF, équipements). */
  openData: ListingOpenDataContext | null
  votedWorks: string | null
  proceedings: string | null
  /** Les champs qu'une tâche encore ouverte demande à l'annonceur (lot 17). */
  askedFields?: readonly ListingQuestionField[]
  /** Le repère est approché (quartier, commune) : les distances sont « ≈ ». */
  approximate?: boolean
}

/** Trois points au plus de chaque côté. */
export const HIGHLIGHTS_MAX = 3
/** Écart au prix au m² des ventes du quartier à partir duquel il compte (3 %). */
export const MARKET_GAP_NOTABLE = 0.03
/** Un tram « proche » : 1 km à vol d'oiseau. */
export const NEAR_TRAM_METERS = 1000
/** Un drive « proche » : 1,5 km à vol d'oiseau. */
export const NEAR_DRIVE_METERS = 1500

/** « 450 m », « 1,2 km » (comme l'interface). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

/** « 3 % » : un écart en pour cent entier. */
export function formatWholePercent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100).toLocaleString('fr-FR')} %`
}

/** Un texte saisi qui dit « rien » (« Aucune », « Néant », « Pas de… »). */
const NOTHING = /^(aucun|aucune|néant|neant|non\b|rien|pas de|sans\b|ras\b)/i

/** Le texte saisi, raccourci, s'il dit quelque chose. */
function saidText(value: string | null, max = 60): string | null {
  const text = value?.trim() ?? ''
  if (!text || NOTHING.test(text)) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

const withoutFinalDot = (text: string): string => text.replace(/\.\s*$/, '')

/**
 * « Ce qui plaît » et « À surveiller » : trois points au plus chacun, du plus
 * important au moins important, chacun avec l'onglet qui le détaille.
 */
export function listingHighlights(input: HighlightsInput): ListingHighlights {
  const m = input.metrics
  const asked = new Set(input.askedFields ?? [])
  const approx = input.approximate ? '≈ ' : ''
  const good: Highlight[] = []
  const watch: Highlight[] = []
  const gap = m
    ? marketGap(m.pricePerM2, input.openData?.market?.medianPricePerM2 ?? null)
    : null

  // Ce qui plaît
  if (m && m.verdict === 'target') {
    good.push({
      key: 'target',
      text: `Dans la cible au prix affiché (rendement brut ${formatPercent(m.grossYield)})`,
      tab: 'budget',
    })
  }
  if (gap !== null && gap <= -MARKET_GAP_NOTABLE) {
    good.push({
      key: 'below_market',
      text: `Prix au m² ${formatWholePercent(gap)} sous les ventes du quartier (DVF)`,
      tab: 'negocier',
    })
  }
  const tram = input.openData?.transit?.nearestTram ?? null
  if (tram && tram.distanceMeters <= NEAR_TRAM_METERS) {
    const lines = tram.lines.length ? ` ${tram.lines.join(', ')}` : ''
    good.push({
      key: 'tram',
      text: `Tram${lines} à ${approx}${formatDistance(tram.distanceMeters)} (${tram.name})`,
      tab: 'quartier',
    })
  }
  const dpeCheck = input.rental?.checks.find(c => c.key === 'dpe_ban') ?? null
  if (dpeCheck?.level === 'ok' && input.dpeClass) {
    good.push({
      key: 'dpe',
      text: withoutFinalDot(dpeCheck.message),
      tab: 'bien',
    })
  }
  if (
    m &&
    m.rentCap !== null &&
    m.targetRent > 0 &&
    m.targetRent <= m.rentCap
  ) {
    good.push({
      key: 'rent_under_cap',
      text: `Loyer visé sous le plafond d’encadrement (${formatEuros(m.targetRent)} pour ${formatEuros(m.rentCap)})`,
      tab: 'budget',
    })
  }
  const drive = input.openData?.surroundings?.supermarkets.nearest ?? null
  if (
    drive &&
    drive.drive === 'yes' &&
    drive.distanceMeters <= NEAR_DRIVE_METERS
  ) {
    good.push({
      key: 'drive',
      text: `Supermarché avec drive à ${approx}${formatDistance(drive.distanceMeters)}`,
      tab: 'quartier',
    })
  }

  // À surveiller
  for (const check of input.rental?.checks ?? []) {
    if (
      check.level === 'bad' ||
      (check.key === 'dpe_ban' && check.level === 'warn')
    ) {
      watch.push({
        key: `rental_${check.key}`,
        text: withoutFinalDot(check.message),
        tab: check.key === 'dpe_ban' ? 'bien' : 'budget',
      })
    }
  }
  if (m && m.renovationTotal > 0) {
    watch.push({
      key: 'works',
      text: `Travaux avant d’emménager : ${formatEuros(m.renovationTotal)} estimés`,
      tab: 'bien',
    })
  }
  const voted = saidText(input.votedWorks)
  if (voted) {
    watch.push({
      key: 'voted_works',
      text: `Travaux votés : ${voted}`,
      tab: asked.has('votedWorks') ? 'a-faire' : 'bien',
    })
  }
  const proceedings = saidText(input.proceedings)
  if (proceedings) {
    watch.push({
      key: 'proceedings',
      text: `Procédures : ${proceedings}`,
      tab: asked.has('proceedings') ? 'a-faire' : 'bien',
    })
  }
  if (gap !== null && gap >= MARKET_GAP_NOTABLE) {
    watch.push({
      key: 'above_market',
      text: `Prix au m² ${formatWholePercent(gap)} au-dessus des ventes du quartier (DVF)`,
      tab: 'negocier',
    })
  }
  const tp = input.targetPrice
  if (
    m &&
    m.verdict !== 'target' &&
    tp &&
    tp.targetPrice !== null &&
    tp.discount !== null &&
    tp.discount > 0
  ) {
    watch.push({
      key: 'discount',
      text: `Décote de ${formatPercent(tp.discount)} nécessaire pour la cible (prix cible ${formatEuros(tp.targetPrice)})`,
      tab: 'negocier',
    })
  }
  if (m && m.rentCap !== null && m.targetRent > m.rentCap) {
    watch.push({
      key: 'rent_over_cap',
      text: `Loyer visé au-dessus du plafond d’encadrement (${formatEuros(m.targetRent)} pour ${formatEuros(m.rentCap)}) : le plafond est retenu`,
      tab: 'budget',
    })
  }
  if (m?.propertyTaxEstimated) {
    watch.push(
      asked.has('propertyTax')
        ? {
            key: 'property_tax',
            text: 'Taxe foncière manquante, demandée à l’annonceur : estimée à un mois de loyer',
            tab: 'a-faire',
          }
        : {
            key: 'property_tax',
            text: 'Taxe foncière manquante : estimée à un mois de loyer',
            tab: 'bien',
          }
    )
  }
  if (m && m.annualCharges === null) {
    watch.push(
      asked.has('annualCharges')
        ? {
            key: 'charges',
            text: 'Charges de copropriété inconnues, demandées à l’annonceur',
            tab: 'a-faire',
          }
        : {
            key: 'charges',
            text: 'Charges de copropriété inconnues',
            tab: 'bien',
          }
    )
  }
  if (input.approximate) {
    watch.push({
      key: 'approximate',
      text: 'Adresse à préciser : distances approchées',
      tab: 'bien',
    })
  }

  return {
    good: good.slice(0, HIGHLIGHTS_MAX),
    watch: watch.slice(0, HIGHLIGHTS_MAX),
  }
}

// ---------------------------------------------------------------------------
// À faire : tâches, questions à l'annonceur et visites en une liste
// ---------------------------------------------------------------------------

/** Qui agit : nous, l'annonceur (une question), une visite. */
export type TodoGroup = 'us' | 'agency' | 'visit'

/**
 * L'état d'une ligne : tâche ouverte ou faite ; question à l'annonceur à
 * valider, validée à envoyer, demandée, relance due, réponse reçue, sans
 * réponse ; visite planifiée ou faite.
 */
export type TodoState =
  | 'open'
  | 'done'
  | 'draft'
  | 'approved'
  | 'requested'
  | 'follow_up_due'
  | 'answered'
  | 'unanswered'
  | 'planned'
  | 'visited'

/** Ce que la liste lit d'une tâche. */
export interface TodoTaskLike extends QuestionTask {
  position: number
}

/** Ce que la liste lit d'une demande à l'annonceur. */
export interface TodoRequestLike extends RequestLike {
  status: AgencyRequestStatus
  /** Relance due (calculée par le serveur, jours ouvrés). */
  followUpDue?: boolean
  subject?: string | null
  /** Les questions posées, dans l'ordre (libellés des tâches). */
  questions?: readonly { label: string }[]
}

/** Ce que la liste lit d'une visite. */
export interface TodoVisitLike {
  id: string
  visitedAt: string
  status: VisitStatus
}

export interface TodoItem {
  /** `task:<id>` ou `visit:<id>`. */
  key: string
  kind: 'task' | 'visit'
  id: string
  group: TodoGroup
  title: string
  state: TodoState
  /** La phrase de l'état (« Message à valider », « Demandée le 4 nov. à l'agence · relance due ») ; null pour une tâche simple. */
  stateLabel: string | null
  done: boolean
  /** La demande qui porte la question, pour ses actions (valider, relancer, appliquer). */
  requestId: string | null
  /** Date de la visite (ISO), null pour une tâche. */
  at: string | null
}

export interface TodoInput {
  tasks: readonly TodoTaskLike[]
  requests: readonly TodoRequestLike[]
  visits: readonly TodoVisitLike[]
}

const PARIS_WHEN = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** « samedi 9 novembre, 10 h », « jeudi 7 novembre, 18 h 30 » (heure de Paris). */
export function visitWhen(iso: string): string {
  const parts = Object.fromEntries(
    PARIS_WHEN.formatToParts(new Date(iso)).map(p => [p.type, p.value])
  ) as Record<string, string>
  const hour = String(Number(parts.hour))
  const minute = parts.minute === '00' ? '' : ` ${parts.minute}`
  return `${parts.weekday} ${parts.day} ${parts.month}, ${hour} h${minute}`
}

function requestsOf(input: TodoInput) {
  return input.requests.map(r => ({
    id: r.id,
    status: r.status,
    taskIds: r.taskIds,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt ?? null,
    sentAt: r.sentAt,
    answeredAt: r.answeredAt,
    followUpOfId: r.followUpOfId ?? null,
    recipientName: r.recipientName ?? null,
  }))
}

/** Une tâche en ligne de la liste « À faire ». */
function taskItem(
  task: TodoTaskLike,
  input: TodoInput,
  requests: ReturnType<typeof requestsOf>
): TodoItem {
  const base = {
    key: `task:${task.id}`,
    kind: 'task' as const,
    id: task.id,
    title: task.label,
    done: task.done,
    at: null,
  }
  if (!isAskableTask(task)) {
    return {
      ...base,
      group: 'us',
      state: task.done ? 'done' : 'open',
      stateLabel: null,
      requestId: null,
    }
  }
  const s = taskRequestState(task, requests)
  const request = s.requestId
    ? (input.requests.find(r => r.id === s.requestId) ?? null)
    : null
  const due = s.kind === 'requested' && request?.followUpDue === true
  const state: TodoState =
    s.kind === 'none'
      ? task.done
        ? 'done'
        : 'open'
      : due
        ? 'follow_up_due'
        : s.kind
  return {
    ...base,
    group: 'agency',
    state,
    stateLabel:
      s.label === null ? null : due ? `${s.label} · relance due` : s.label,
    requestId: s.requestId,
  }
}

/** Une visite en ligne de la liste. */
function visitItem(visit: TodoVisitLike): TodoItem {
  const done = visit.status === 'done'
  return {
    key: `visit:${visit.id}`,
    kind: 'visit',
    id: visit.id,
    group: 'visit',
    title: `Visite ${visitWhen(visit.visitedAt)}`,
    state: done ? 'visited' : 'planned',
    stateLabel: done ? 'Faite' : 'Planifiée',
    done,
    requestId: null,
    at: visit.visitedAt,
  }
}

/**
 * La liste « À faire » : tâches (nous), questions à l'annonceur (avec
 * l'état de leur demande) et visites, en une seule liste. D'abord ce qui
 * reste : les visites planifiées par date, puis les tâches dans leur ordre ;
 * en bas ce qui est fait, le plus récent d'abord.
 */
export function todoItems(input: TodoInput): TodoItem[] {
  const requests = requestsOf(input)
  const tasks = [...input.tasks]
    .sort((a, b) => a.position - b.position)
    .map(t => taskItem(t, input, requests))
  const visits = [...input.visits]
    .sort((a, b) => Date.parse(a.visitedAt) - Date.parse(b.visitedAt))
    .map(visitItem)
  const doneAt = (item: TodoItem): number => {
    if (item.kind === 'visit') return Date.parse(item.at ?? '') || 0
    const task = input.tasks.find(t => t.id === item.id)
    return Date.parse(task?.doneAt ?? '') || 0
  }
  return [
    ...visits.filter(v => !v.done),
    ...tasks.filter(t => !t.done),
    ...[...visits.filter(v => v.done), ...tasks.filter(t => t.done)].sort(
      (a, b) => doneAt(b) - doneAt(a)
    ),
  ]
}

/** Le filtre de la liste : tout, nous, l'annonceur, les visites. */
export type TodoFilter = 'all' | TodoGroup

export function filterTodo(
  items: readonly TodoItem[],
  filter: TodoFilter
): TodoItem[] {
  return filter === 'all' ? [...items] : items.filter(i => i.group === filter)
}

/** « X sur Y faits ». */
export function todoProgress(items: readonly TodoItem[]): {
  done: number
  total: number
} {
  return { done: items.filter(i => i.done).length, total: items.length }
}

/**
 * La pastille de l'onglet « À faire » : ce qui est à traiter, soit les
 * tâches ouvertes, plus les messages à valider, plus les relances dues.
 */
export function todoPendingCount(input: {
  tasks: readonly Pick<TodoTaskLike, 'done'>[]
  requests: readonly Pick<TodoRequestLike, 'status' | 'followUpDue'>[]
}): number {
  return (
    input.tasks.filter(t => !t.done).length +
    input.requests.filter(r => r.status === 'draft').length +
    input.requests.filter(r => r.followUpDue === true).length
  )
}

/** Une ligne des « Prochaines étapes » de la Synthèse. */
export interface NextStep {
  kind: 'visit' | 'draft' | 'follow_up' | 'task'
  /** La visite, la demande ou la tâche concernée. */
  id: string
  text: string
}

/** Trois prochaines étapes au plus. */
export const NEXT_STEPS_MAX = 3

/**
 * Ce que demande un message, en quelques mots : la première question (sans
 * « Demander »), « (+ n) » s'il en pose d'autres ; l'objet du message s'il
 * n'a pas de question ; rien sinon.
 */
export function requestTopic(
  request: Pick<TodoRequestLike, 'subject' | 'questions'>
): string | null {
  const [first, ...others] = request.questions ?? []
  if (first) {
    const topic = first.label.trim().replace(/^demander\s+/i, '')
    return others.length ? `${topic} (+ ${others.length})` : topic
  }
  return request.subject?.trim() || null
}

/**
 * Les prochaines étapes : la prochaine visite planifiée, les messages à
 * valider, les relances dues, puis les tâches ouvertes qu'aucune demande ne
 * porte encore ; trois au plus.
 */
export function nextSteps(
  input: TodoInput & { now: Date },
  max: number = NEXT_STEPS_MAX
): NextStep[] {
  const steps: NextStep[] = []
  const visit = [...input.visits]
    .filter(
      v =>
        v.status === 'planned' && Date.parse(v.visitedAt) >= input.now.getTime()
    )
    .sort((a, b) => Date.parse(a.visitedAt) - Date.parse(b.visitedAt))[0]
  if (visit) {
    steps.push({
      kind: 'visit',
      id: visit.id,
      text: `Visite ${visitWhen(visit.visitedAt)}`,
    })
  }
  for (const r of input.requests) {
    if (r.status === 'draft') {
      steps.push({
        kind: 'draft',
        id: r.id,
        text: `Message à valider${requestTopic(r) ? ` : ${requestTopic(r)}` : ''}`,
      })
    }
  }
  for (const r of input.requests) {
    if (r.followUpDue === true) {
      steps.push({
        kind: 'follow_up',
        id: r.id,
        text: `Relance due${requestTopic(r) ? ` : ${requestTopic(r)}` : ''}`,
      })
    }
  }
  for (const item of todoItems(input)) {
    if (item.kind === 'task' && item.state === 'open') {
      steps.push({ kind: 'task', id: item.id, text: item.title })
    }
  }
  return steps.slice(0, max)
}
