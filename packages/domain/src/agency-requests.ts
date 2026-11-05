import {
  ACTIVE_AGENCY_REQUEST_STATUSES,
  AGENCY_ANSWER_EXCERPT_MAX,
  AGENCY_ANSWER_VALUE_FIELD,
  AGENCY_ANSWER_VALUE_LABELS,
  AGENCY_REQUEST_STATUS_LABELS,
  AGENCY_SUBJECT_MAX,
  AgencyAnswerValueKeySchema,
  DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
  DEFAULT_TASKS,
  LISTING_CHECK_TOLERANCES,
  LISTING_QUESTION_TEXTS,
} from '@apart/contracts'
import type {
  AgencyAnswerChange,
  AgencyAnswerValueKey,
  AgencyAnswerValues,
  AgencyChannel,
  AgencyRequestStatus,
  DpeClass,
  FieldProvenanceMap,
  FieldSource,
  ListingQuestionField,
  OpenQuestion,
  OpenQuestionState,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import { sanitizeEvidence } from './listing-checks.js'

/**
 * Lot 17 : questions aux agences (ADR 0027). Quelles tâches se posent à
 * l'annonceur, le texte poli du message, les transitions d'une demande, la
 * relance due (jours ouvrés, fériés français compris), ce qu'une réponse
 * applique ou propose à la fiche et quelles tâches elle coche, l'état lisible
 * d'une tâche demandée. Pur : aucune E/S ; l'API écrit, le web et le MCP
 * affichent. Le serveur n'envoie jamais de message : Claude envoie, avec les
 * outils de l'utilisateur, ce qu'un membre a validé.
 */

// ---------------------------------------------------------------------------
// Tâches et questions
// ---------------------------------------------------------------------------

/** Ce que les règles lisent d'une tâche. */
export interface QuestionTask {
  id: string
  label: string
  field: ListingQuestionField | null
  done: boolean
  doneAt?: string | null
  requestId?: string | null
  requestedAt?: string | null
  answeredAt?: string | null
}

/** Ce que les règles lisent d'une demande. */
export interface RequestLike {
  id: string
  status: AgencyRequestStatus
  taskIds: readonly string[]
  createdAt: string
  approvedAt?: string | null
  sentAt: string | null
  answeredAt: string | null
  followUpOfId?: string | null
  recipientName?: string | null
}

const ASK = /^demander\s+/i

/** Le libellé de la checklist par défaut pour le DTG, sans champ de fiche. */
const DTG_LABEL = DEFAULT_TASKS[3]

/**
 * Une tâche se pose à l'annonceur : liée à un champ de la fiche, ou libellée
 * « Demander … » (DTG, question saisie à la main). Les tâches « Vérifier … »
 * ou « Fixer le loyer visé » restent aux membres.
 */
export function isAskableTask(
  task: Pick<QuestionTask, 'label' | 'field'>
): boolean {
  return task.field !== null || ASK.test(task.label.trim())
}

function lowerFirst(text: string): string {
  // « DPE », « DTG » restent en capitales.
  if (text.length > 1 && text[1] === text[1]?.toUpperCase()) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** La question telle qu'elle s'écrit dans le message (« le montant de la taxe foncière »). */
export function questionText(
  task: Pick<QuestionTask, 'label' | 'field'>
): string {
  if (task.field !== null) return LISTING_QUESTION_TEXTS[task.field]
  const label = task.label.trim().replace(/[\s.…!?;:]+$/u, '')
  if (label === DTG_LABEL) {
    return 'le diagnostic technique global (DTG) ou le plan pluriannuel de travaux de la copropriété'
  }
  return ASK.test(label) ? label.replace(ASK, '') : lowerFirst(label)
}

/** Les tâches d'une demande, ou d'une autre, encore ouvertes (aucune réponse ne les a cochées). */
function covers(request: RequestLike, taskId: string): boolean {
  return request.taskIds.includes(taskId)
}

function latestFirst<T extends { createdAt: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  )
}

/**
 * La demande en cours d'une tâche ouverte : la plus récente qui la porte et
 * qui n'est ni annulée ni close sans réponse (un brouillon, un message validé,
 * envoyé, ou une réponse partielle qui ne l'a pas cochée). Null sinon.
 */
export function activeRequestOf<R extends RequestLike>(
  task: Pick<QuestionTask, 'id' | 'done'>,
  requests: readonly R[]
): R | null {
  if (task.done) return null
  for (const request of latestFirst(requests)) {
    if (!covers(request, task.id) || request.status === 'cancelled') continue
    if (
      (ACTIVE_AGENCY_REQUEST_STATUSES as readonly string[]).includes(
        request.status
      ) ||
      request.status === 'answered'
    ) {
      return request
    }
    // La plus récente est close sans réponse : la question est rouverte.
    return null
  }
  return null
}

function stateOf(request: RequestLike | null): OpenQuestionState {
  if (!request) return 'open'
  if (request.status === 'draft') return 'draft'
  if (request.status === 'approved') return 'approved'
  return 'requested'
}

/** Les questions ouvertes d'une annonce (tâches posables, non faites) et où chacune en est. */
export function openQuestions(
  tasks: readonly QuestionTask[],
  requests: readonly RequestLike[]
): OpenQuestion[] {
  return tasks
    .filter(task => !task.done && isAskableTask(task))
    .map(task => {
      const request = activeRequestOf(task, requests)
      return {
        taskId: task.id,
        label: task.label,
        field: task.field,
        question: questionText(task),
        state: stateOf(request),
        requestId: request?.id ?? null,
        requestedAt:
          request && request.sentAt
            ? request.sentAt
            : (task.requestedAt ?? null),
      }
    })
}

/** Un groupe de questions à poser ensemble : une annonce, un destinataire. */
export interface QuestionGroup {
  listingId: string
  title: string
  recipientName: string | null
  channel: AgencyChannel
  questions: OpenQuestion[]
}

/**
 * Regroupe les questions encore à poser (état « open ») par annonce et
 * destinataire : un message par groupe. Les annonces sans question à poser
 * n'ont pas de groupe.
 */
export function groupOpenQuestions(
  listings: ReadonlyArray<{
    listingId: string
    title: string
    recipientName: string | null
    channel: AgencyChannel
    tasks: readonly QuestionTask[]
    requests: readonly RequestLike[]
  }>
): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>()
  for (const listing of listings) {
    const questions = openQuestions(listing.tasks, listing.requests).filter(
      q => q.state === 'open'
    )
    if (questions.length === 0) continue
    const key = `${listing.listingId}\u0000${(listing.recipientName ?? '').toLowerCase()}`
    const group = groups.get(key)
    if (group) group.questions.push(...questions)
    else
      groups.set(key, {
        listingId: listing.listingId,
        title: listing.title,
        recipientName: listing.recipientName,
        channel: listing.channel,
        questions,
      })
  }
  return [...groups.values()]
}

/** Le résultat du choix des questions d'un brouillon. */
export type DraftQuestions =
  { ok: true; taskIds: string[] } | { ok: false; problem: string }

/**
 * Les tâches d'un nouveau brouillon : celles demandées, ou toutes les
 * questions encore à poser (ou, pour une relance, celles de la demande
 * relancée qui restent ouvertes). Refus lisible pour une tâche inconnue, déjà
 * faite, non posable, ou déjà dans une demande en cours.
 */
export function resolveDraftQuestions(input: {
  tasks: readonly QuestionTask[]
  requests: readonly RequestLike[]
  taskIds?: readonly string[] | undefined
  followUpOf?: RequestLike | null
}): DraftQuestions {
  const { tasks, requests, followUpOf } = input
  const byId = new Map(tasks.map(t => [t.id, t]))
  if (followUpOf) {
    const pending = followUpOf.taskIds.filter(
      id => byId.get(id)?.done === false
    )
    if (
      !(followUpOf.status === 'sent' || followUpOf.status === 'answered') ||
      pending.length === 0
    ) {
      return {
        ok: false,
        problem:
          'Seule une demande envoyée dont une question reste sans réponse se relance.',
      }
    }
    const already = requests.find(
      r =>
        r.followUpOfId === followUpOf.id &&
        (r.status === 'draft' || r.status === 'approved')
    )
    if (already) {
      return {
        ok: false,
        problem:
          'Une relance de cette demande attend déjà d’être validée ou envoyée.',
      }
    }
    if (!input.taskIds) return { ok: true, taskIds: pending }
  }
  if (!input.taskIds) {
    const open = openQuestions(tasks, requests)
      .filter(q => q.state === 'open')
      .map(q => q.taskId)
    return open.length
      ? { ok: true, taskIds: open }
      : {
          ok: false,
          problem: 'Aucune question ouverte à poser pour cette annonce.',
        }
  }
  const ids = [...new Set(input.taskIds)]
  if (ids.length === 0) {
    return { ok: false, problem: 'Aucune question à poser dans ce message.' }
  }
  for (const id of ids) {
    const task = byId.get(id)
    if (!task)
      return { ok: false, problem: `Tâche inconnue sur cette annonce : ${id}.` }
    if (task.done)
      return {
        ok: false,
        problem: `La tâche « ${task.label} » est déjà faite.`,
      }
    if (!isAskableTask(task)) {
      return {
        ok: false,
        problem: `La tâche « ${task.label} » ne se pose pas à l’annonceur (ni champ de la fiche, ni « Demander … »).`,
      }
    }
    const active = activeRequestOf(task, requests)
    if (active && active.id !== followUpOf?.id) {
      return {
        ok: false,
        problem: `La question « ${task.label} » est déjà dans une demande en cours (${AGENCY_REQUEST_STATUS_LABELS[active.status].toLowerCase()}) ; relancez celle-ci (followUpOf) plutôt que de la reposer.`,
      }
    }
  }
  return { ok: true, taskIds: ids }
}

// ---------------------------------------------------------------------------
// Destinataire, canal, signature, message
// ---------------------------------------------------------------------------

/** Ce que les règles lisent du contact de l'annonceur. */
export interface ContactLike {
  agencyName?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  portalMessageUrl?: string | null
  preferredChannel?: AgencyChannel | null
}

/** Le destinataire en nom affiché seulement (« Mme [Exemple], Agence [Exemple] »), ou null. */
export function recipientDisplayName(
  contact: ContactLike | null
): string | null {
  const parts = [contact?.contactName, contact?.agencyName]
    .map(p => p?.trim())
    .filter((p): p is string => Boolean(p))
  return parts.length ? parts.join(', ') : null
}

/**
 * Le canal d'une demande : celui que le contact préfère, sinon l'e-mail, la
 * messagerie du portail, le téléphone connus ; sans contact, la messagerie du
 * portail si l'annonce a un lien, sinon « autre ».
 */
export function preferredAgencyChannel(
  contact: ContactLike | null,
  hasListingUrl: boolean
): AgencyChannel {
  if (contact?.preferredChannel) return contact.preferredChannel
  if (contact?.email) return 'email'
  if (contact?.portalMessageUrl) return 'portal_message'
  if (contact?.phone) return 'phone'
  return hasListingUrl ? 'portal_message' : 'other'
}

/** « à l'agence », ou « au vendeur » pour un particulier. */
export function recipientWord(
  recipientName: string | null | undefined
): string {
  return recipientName &&
    /particulier|propri[ée]taire|vendeu[rs]e?|\bpap\b/i.test(recipientName)
    ? 'au vendeur'
    : 'à l’agence'
}

/** « Richard », « Richard et Chloé », « Richard, Chloé et Léa » ; vide sans membre. */
export function defaultSignature(names: readonly string[]): string {
  const clean = names.map(n => n.trim()).filter(Boolean)
  if (clean.length <= 1) return clean[0] ?? ''
  return `${clean.slice(0, -1).join(', ')} et ${clean.at(-1)}`
}

/**
 * La signature des messages : celle choisie par l'espace, sinon les prénoms
 * des membres. Rien d'autre n'est ajouté : ni adresse e-mail ni téléphone
 * d'un membre, s'il ne les a pas écrits lui-même dans la signature.
 */
export function resolveSignature(
  custom: string | null | undefined,
  memberNames: readonly string[]
): string {
  const chosen = custom?.trim()
  return chosen ? chosen : defaultSignature(memberNames)
}

/** Ce que le message lit de l'annonce. */
export interface MessageListing {
  title: string
  url: string | null
  externalId: string | null
  commune: string | null
  price: number
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** « 5 novembre 2026 », jour de Paris. */
export function formatParisDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** « 5 nov. », jour de Paris (pastilles des tâches). */
export function formatShortParisDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Le message par défaut, en français poli : formule (« Bonjour Madame,
 * Monsieur, » ou le nom de l'interlocuteur), l'annonce (titre, commune,
 * prix, référence, lien), la liste des questions, la signature de l'espace.
 * Une relance rappelle la date du premier message. Aucune coordonnée de
 * membre n'est ajoutée : seule la signature choisie signe.
 */
export function defaultAgencyMessage(input: {
  listing: MessageListing
  contactName?: string | null
  questions: readonly string[]
  signature: string
  followUpOf?: { sentAt: string | null } | null
}): { subject: string; body: string } {
  const { listing } = input
  const reference = listing.externalId?.trim()
  const subject = truncate(
    input.followUpOf
      ? `Relance : votre annonce « ${listing.title} »${reference ? ` (réf. ${reference})` : ''}`
      : `Votre annonce « ${listing.title} »${reference ? ` (réf. ${reference})` : ''} : quelques questions`,
    AGENCY_SUBJECT_MAX
  )
  const where = [
    listing.commune ? `à ${listing.commune}` : null,
    listing.price > 0 ? `affichée à ${formatEuros(listing.price)}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const about = `votre annonce « ${listing.title} »${where ? ` (${where})` : ''}${reference ? `, référence ${reference}` : ''}`
  const greeting = input.contactName?.trim()
    ? `Bonjour ${input.contactName.trim()},`
    : 'Bonjour Madame, Monsieur,'
  const questions = input.questions.map(
    (q, i) => `- ${q}${i === input.questions.length - 1 ? '.' : ' ;'}`
  )
  const opening = input.followUpOf
    ? `Nous nous permettons de revenir vers vous au sujet de notre message${input.followUpOf.sentAt ? ` du ${formatParisDay(input.followUpOf.sentAt)}` : ''} concernant ${about}${listing.url ? ` :\n${listing.url}` : '.'}`
    : `Nous sommes intéressés par ${about}${listing.url ? ` :\n${listing.url}` : '.'}`
  const ask = input.followUpOf
    ? 'Pourriez-vous nous indiquer, quand vous le pourrez :'
    : "Avant d'aller plus loin, pourriez-vous nous indiquer :"
  const signature = input.signature.trim()
  const body = [
    greeting,
    '',
    opening,
    '',
    ask,
    ...questions,
    '',
    "Merci d'avance pour votre retour.",
    '',
    signature ? `Bien cordialement,\n${signature}` : 'Bien cordialement.',
  ].join('\n')
  return { subject, body }
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Les passages permis d'un état à l'autre. */
export const AGENCY_REQUEST_TRANSITIONS: Readonly<
  Record<AgencyRequestStatus, readonly AgencyRequestStatus[]>
> = {
  draft: ['approved', 'cancelled'],
  // Modifier un message validé le fait repasser « à valider ».
  approved: ['sent', 'draft', 'cancelled'],
  sent: ['answered', 'no_answer'],
  // Une réponse en complément d'une première.
  answered: ['answered'],
  // Une réponse tardive, après une relance ou « pas de réponse ».
  no_answer: ['answered'],
  cancelled: [],
}

export function canTransition(
  from: AgencyRequestStatus,
  to: AgencyRequestStatus
): boolean {
  return AGENCY_REQUEST_TRANSITIONS[from].includes(to)
}

/** Pourquoi un passage est refusé, en français ; null s'il est permis. */
export function transitionProblem(
  from: AgencyRequestStatus,
  to: AgencyRequestStatus
): string | null {
  if (canTransition(from, to)) return null
  const now = `« ${AGENCY_REQUEST_STATUS_LABELS[from]} »`
  switch (to) {
    case 'approved':
      return `Seul un message « à valider » se valide ; celui-ci est ${now}.`
    case 'sent':
      return from === 'draft'
        ? "Ce message n'est pas validé : montrez-le au membre et attendez son accord (bouton « Valider l'envoi » dans l'application, ou accord explicite dans la conversation avec approvedInChat: true). Rien n'est enregistré."
        : `Ce message est ${now} : il ne peut pas être enregistré comme envoyé.`
    case 'answered':
      return from === 'cancelled'
        ? 'Cette demande est annulée : aucune réponse ne s’y enregistre.'
        : "Ce message n'a pas été envoyé : enregistrez d'abord l'envoi (record_request_sent)."
    case 'no_answer':
      return 'Seule une demande envoyée, sans réponse, se clôt « pas de réponse ».'
    case 'cancelled':
      return from === 'cancelled'
        ? 'Cette demande est déjà annulée.'
        : "Une demande envoyée ne s'annule pas : notez « pas de réponse » si l'annonceur ne répond pas."
    case 'draft':
      return `Ce message est ${now} : il ne se modifie plus.`
  }
}

// ---------------------------------------------------------------------------
// Jours ouvrés et relances
// ---------------------------------------------------------------------------

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Le jour (AAAA-MM-JJ) d'une date ISO, à Paris. */
export function parisDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

function toUtc(day: string): number {
  const match = DAY.exec(day)
  if (!match) throw new RangeError(`Date invalide : ${day}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function fromUtc(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Dimanche de Pâques (algorithme grégorien anonyme), AAAA-MM-JJ. */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return fromUtc(Date.UTC(year, month - 1, day))
}

const DAY_MS = 86_400_000

/** Les jours fériés de métropole d'une année (Code du travail, art. L3133-1). */
export function frenchPublicHolidays(year: number): Set<string> {
  const easter = toUtc(easterSunday(year))
  const fixed = [
    '01-01',
    '05-01',
    '05-08',
    '07-14',
    '08-15',
    '11-01',
    '11-11',
    '12-25',
  ]
  return new Set([
    ...fixed.map(md => `${year}-${md}`),
    fromUtc(easter + DAY_MS), // lundi de Pâques
    fromUtc(easter + 39 * DAY_MS), // Ascension
    fromUtc(easter + 50 * DAY_MS), // lundi de Pentecôte
  ])
}

/** Un jour ouvré : du lundi au vendredi, hors jours fériés. */
export function isBusinessDay(day: string): boolean {
  const weekday = new Date(toUtc(day)).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !frenchPublicHolidays(Number(day.slice(0, 4))).has(day)
}

/** Le jour ouvré situé `count` jours ouvrés après `day`. */
export function addBusinessDays(day: string, count: number): string {
  let time = toUtc(day)
  let left = count
  while (left > 0) {
    time += DAY_MS
    if (isBusinessDay(fromUtc(time))) left -= 1
  }
  return fromUtc(time)
}

/** Jours ouvrés écoulés après `from` jusqu'à `to` compris (0 si `to` n'est pas après). */
export function businessDaysBetween(from: string, to: string): number {
  let count = 0
  for (let time = toUtc(from) + DAY_MS; time <= toUtc(to); time += DAY_MS) {
    if (isBusinessDay(fromUtc(time))) count += 1
  }
  return count
}

/** Ce que la relance lit d'une demande. */
export interface FollowUpInput {
  status: AgencyRequestStatus
  sentAt: string | null
  answeredAt: string | null
  /** Questions de la demande encore ouvertes. */
  pendingQuestions: number
  /** Vrai si une relance de cette demande existe déjà (non annulée). */
  followedUp: boolean
}

/**
 * Le jour où une relance devient due : `days` jours ouvrés après l'envoi
 * (ou après la dernière réponse, si elle était partielle). Null pour une
 * demande qui n'attend rien : pas envoyée, close, toutes ses questions
 * répondues, ou déjà relancée.
 */
export function followUpDueOn(
  request: FollowUpInput,
  days: number = DEFAULT_FOLLOW_UP_BUSINESS_DAYS
): string | null {
  if (request.followedUp || request.pendingQuestions <= 0) return null
  if (request.status !== 'sent' && request.status !== 'answered') return null
  const from =
    request.status === 'answered' ? request.answeredAt : request.sentAt
  if (!from) return null
  return addBusinessDays(parisDay(from), days)
}

/** Vrai si une relance est due aujourd'hui (5 jours ouvrés par défaut, `DEFAULT_FOLLOW_UP_BUSINESS_DAYS`). */
export function isFollowUpDue(
  request: FollowUpInput,
  now: Date = new Date(),
  days: number = DEFAULT_FOLLOW_UP_BUSINESS_DAYS
): boolean {
  const due = followUpDueOn(request, days)
  return due !== null && parisDay(now.toISOString()) >= due
}

// ---------------------------------------------------------------------------
// Réponse de l'annonceur
// ---------------------------------------------------------------------------

/** Ce que la réponse lit de la fiche. */
export interface AnswerableListing {
  addressRaw: string | null
  surface: number | null
  annualCharges: number | null
  propertyTax: number | null
  dpeClass: DpeClass | null
  dpeConsumption: number | null
  gesClass: DpeClass | null
  dpeDate: string | null
  floor: number | null
  elevator: boolean | null
  constructionYear: number | null
  lotsCount: number | null
  votedWorks: string | null
  proceedings: string | null
  heatingType: string | null
  fieldSources: FieldProvenanceMap
}

type AnswerValue = string | number | boolean

/** Les valeurs appliquées à la fiche (seulement celles qui changent). */
export type AgencyAnswerPatch = Partial<
  Record<AgencyAnswerValueKey, AnswerValue>
>

export interface AgencyAnswerPlan {
  /** Une ligne par valeur lue, dans l'ordre des champs. */
  changes: AgencyAnswerChange[]
  patch: AgencyAnswerPatch
  /** Les questions auxquelles la réponse donne une valeur. */
  answeredFields: ListingQuestionField[]
  /** Les tâches ouvertes que la réponse coche. */
  completedTaskIds: string[]
  summary: string
}

/**
 * Une valeur contraire de la fiche s'écrase seulement si elle n'a pas été
 * saisie par un membre : lue par l'IA, lue sur le portail, estimée, ou déjà
 * donnée par l'annonceur. Une valeur saisie à la main, issue de données
 * ouvertes (DPE vérifié à l'ADEME) ou sans provenance est gardée : la
 * réponse est proposée.
 */
export const AGENCY_OVERWRITABLE_SOURCES: readonly FieldSource[] = [
  'ai',
  'listing',
  'estimated',
  'agency',
]

const TOLERANCES: Partial<Record<AgencyAnswerValueKey, number>> = {
  annualCharges: LISTING_CHECK_TOLERANCES.annualCharges,
  propertyTax: LISTING_CHECK_TOLERANCES.propertyTax,
  surface: LISTING_CHECK_TOLERANCES.surface,
  dpeConsumption: LISTING_CHECK_TOLERANCES.dpeConsumption,
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sameAnswer(
  key: AgencyAnswerValueKey,
  stored: AnswerValue,
  next: AnswerValue
): boolean {
  if (typeof stored === 'number' && typeof next === 'number') {
    return Math.abs(stored - next) <= (TOLERANCES[key] ?? 0)
  }
  if (typeof stored === 'string' && typeof next === 'string') {
    return key === 'dpeDate'
      ? stored.slice(0, 10) === next.slice(0, 10)
      : normalizeText(stored) === normalizeText(next)
  }
  return stored === next
}

/** Une valeur de la réponse en texte (« 1 680 € », « 45 m² », « 3e », « oui »). */
export function formatAnswerValue(
  key: AgencyAnswerValueKey,
  value: AnswerValue | null
): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  switch (key) {
    case 'annualCharges':
    case 'propertyTax':
      return formatEuros(Number(value))
    case 'surface':
      return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m²`
    case 'dpeConsumption':
      return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh/m²/an`
    case 'dpeDate':
      return formatParisDay(`${String(value).slice(0, 10)}T12:00:00Z`)
    case 'floor':
      return value === 0 ? 'rez-de-chaussée' : value === 1 ? '1er' : `${value}e`
    case 'constructionYear':
    case 'lotsCount':
      return String(value)
    default:
      return typeof value === 'string'
        ? truncate(value.replace(/\s+/g, ' ').trim(), 120)
        : String(value)
  }
}

function changeText(
  key: AgencyAnswerValueKey,
  before: AnswerValue | null,
  after: AnswerValue,
  disposition: AgencyAnswerChange['disposition']
): string {
  const label = AGENCY_ANSWER_VALUE_LABELS[key]
  const next = formatAnswerValue(key, after)
  if (disposition === 'unchanged') return `${label} : ${next}, confirmé`
  if (disposition === 'proposed') {
    return `${label} : ${next} proposé, la fiche garde ${formatAnswerValue(key, before)} (saisi à la main)`
  }
  return before === null
    ? `${label} : ${next}`
    : `${label} : ${formatAnswerValue(key, before)} → ${next}`
}

/**
 * Ce qu'une réponse de l'annonceur fait à la fiche : chaque valeur lue est
 * appliquée (champ vide, ou valeur que personne n'a saisie), inchangée (même
 * valeur, à l'arrondi près), ou proposée (elle contredit une saisie à la
 * main, qui n'est pas écrasée). Les tâches ouvertes dont le champ reçoit une
 * valeur, et celles répondues sans valeur (`answeredTaskIds`), sont cochées.
 */
export function planAgencyAnswer(input: {
  listing: AnswerableListing
  values: AgencyAnswerValues
  tasks: readonly QuestionTask[]
  answeredTaskIds?: readonly string[]
}): AgencyAnswerPlan {
  const { listing, values } = input
  const changes: AgencyAnswerChange[] = []
  const patch: AgencyAnswerPatch = {}
  const fields = new Set<ListingQuestionField>()
  for (const key of AgencyAnswerValueKeySchema.options) {
    const after = values[key] as AnswerValue | undefined
    if (after === undefined) continue
    fields.add(AGENCY_ANSWER_VALUE_FIELD[key])
    const before = (listing[key] ?? null) as AnswerValue | null
    const previousSource = listing.fieldSources[key]?.source ?? null
    let disposition: AgencyAnswerChange['disposition']
    if (before === null) disposition = 'applied'
    else if (sameAnswer(key, before, after)) disposition = 'unchanged'
    else if (
      previousSource !== null &&
      AGENCY_OVERWRITABLE_SOURCES.includes(previousSource)
    )
      disposition = 'applied'
    else disposition = 'proposed'
    if (disposition === 'applied') patch[key] = after
    changes.push({
      key,
      field: AGENCY_ANSWER_VALUE_FIELD[key],
      label: AGENCY_ANSWER_VALUE_LABELS[key],
      before,
      after,
      previousSource,
      disposition,
      text: changeText(key, before, after, disposition),
      appliedAt: null,
    })
  }
  const answered = new Set(input.answeredTaskIds ?? [])
  const completedTaskIds = input.tasks
    .filter(
      t =>
        !t.done &&
        ((t.field !== null && fields.has(t.field)) || answered.has(t.id))
    )
    .map(t => t.id)
  return {
    changes,
    patch,
    answeredFields: [...fields],
    completedTaskIds,
    summary: agencyAnswerSummary(changes, completedTaskIds.length),
  }
}

/** « Charges annuelles : 1 680 € ; Taxe foncière : 950 € proposé… ; 2 tâches cochées ». */
export function agencyAnswerSummary(
  changes: readonly AgencyAnswerChange[],
  completedTasks: number
): string {
  const parts = changes.map(c => c.text)
  if (completedTasks > 0) {
    parts.push(
      `${completedTasks} tâche${completedTasks > 1 ? 's' : ''} cochée${completedTasks > 1 ? 's' : ''}`
    )
  }
  return parts.length
    ? parts.join(' ; ')
    : 'Réponse enregistrée, sans valeur pour la fiche'
}

/** L'extrait de réponse gardé : 1 000 caractères au plus, téléphones et e-mails masqués. */
export function sanitizeAnswerExcerpt(
  text: string | null | undefined
): string | null {
  return sanitizeEvidence(text, AGENCY_ANSWER_EXCERPT_MAX)
}

/**
 * Appliquer des valeurs proposées (le membre a choisi la réponse de
 * l'annonceur) : les lignes passent « appliqué », datées ; rend les valeurs à
 * écrire. Une clé qui n'est pas proposée est ignorée.
 */
export function applyProposed(
  changes: readonly AgencyAnswerChange[],
  keys: readonly AgencyAnswerValueKey[],
  now: Date = new Date()
): {
  changes: AgencyAnswerChange[]
  patch: AgencyAnswerPatch
  applied: AgencyAnswerChange[]
} {
  const wanted = new Set(keys)
  const patch: AgencyAnswerPatch = {}
  const applied: AgencyAnswerChange[] = []
  const next = changes.map(change => {
    if (
      change.disposition !== 'proposed' ||
      !wanted.has(change.key) ||
      change.after === null
    ) {
      return change
    }
    const updated: AgencyAnswerChange = {
      ...change,
      disposition: 'applied',
      appliedAt: now.toISOString(),
      text: `${change.label} : ${formatAnswerValue(change.key, change.before)} → ${formatAnswerValue(change.key, change.after)} (proposé, appliqué)`,
    }
    patch[change.key] = change.after
    applied.push(updated)
    return updated
  })
  return { changes: next, patch, applied }
}

// ---------------------------------------------------------------------------
// État lisible d'une tâche
// ---------------------------------------------------------------------------

export type TaskRequestStateKind =
  'none' | 'draft' | 'approved' | 'requested' | 'answered' | 'unanswered'

export interface TaskRequestState {
  kind: TaskRequestStateKind
  /** « Demandée le 5 nov. à l'agence », « Réponse du 7 nov. » ; null sans demande. */
  label: string | null
  requestId: string | null
}

/**
 * Où en est une tâche vis-à-vis de l'annonceur : à faire (aucune demande),
 * message à valider, validé, demandée le …, faite par la réponse du …, ou
 * sans réponse (question rouverte).
 */
export function taskRequestState(
  task: QuestionTask,
  requests: readonly RequestLike[]
): TaskRequestState {
  if (task.done && task.answeredAt) {
    return {
      kind: 'answered',
      label: `Réponse du ${formatShortParisDay(task.answeredAt)}`,
      requestId: task.requestId ?? null,
    }
  }
  if (task.done) return { kind: 'none', label: null, requestId: null }
  const active = activeRequestOf(task, requests)
  if (active) {
    if (active.status === 'draft')
      return { kind: 'draft', label: 'Message à valider', requestId: active.id }
    if (active.status === 'approved')
      return {
        kind: 'approved',
        label: 'Message validé, à envoyer',
        requestId: active.id,
      }
    const at = active.sentAt ?? task.requestedAt ?? null
    return {
      kind: 'requested',
      label: `Demandée${at ? ` le ${formatShortParisDay(at)}` : ''} ${recipientWord(active.recipientName)}`,
      requestId: active.id,
    }
  }
  const last = latestFirst(requests).find(r => covers(r, task.id))
  if (last?.status === 'no_answer') {
    return {
      kind: 'unanswered',
      label: `Sans réponse${last.sentAt ? ` (demandée le ${formatShortParisDay(last.sentAt)})` : ''}`,
      requestId: last.id,
    }
  }
  return { kind: 'none', label: null, requestId: null }
}
