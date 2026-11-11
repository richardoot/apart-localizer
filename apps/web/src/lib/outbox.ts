import type {
  SignedUpload,
  VisitInputRaw,
  VisitPhotoMimeType,
  VisitStatus,
} from '@apart/contracts'
import { plural } from './format'

/**
 * Lot 24 (ADR 0034) : la file des écritures en attente du mode visite. Une
 * écriture faite sans réseau (ou sur un réseau faible) y entre, gardée sur
 * l'appareil, et repart dans l'ordre quand le serveur répond. Ici, la partie
 * pure : ce qu'est une écriture, comment deux écritures sur la même chose se
 * regroupent, laquelle part ensuite, ce qu'on fait d'une réponse ou d'un
 * refus, et les phrases affichées. Rien ne se perd en silence : une écriture
 * refusée reste dans la file, « à revoir », jusqu'à ce que le membre la
 * renvoie ou l'abandonne.
 *
 * Les écritures d'une même chose (une tâche, une visite, mon avis sur une
 * annonce) forment une file à elles (« voie ») : elles partent l'une après
 * l'autre, une écriture refusée bloque la suite de sa voie (rien ne
 * s'applique par-dessus), les autres voies continuent.
 */

/** Une visite : son identifiant, ou `local:…` pour une visite commencée hors ligne. */
export type VisitRef = string

export const LOCAL_PREFIX = 'local:'

export const isLocalRef = (ref: VisitRef): boolean =>
  ref.startsWith(LOCAL_PREFIX)

export interface VisitChanges {
  status?: VisitStatus | undefined
  report?: string | null | undefined
  pros?: string | null | undefined
  cons?: string | null | undefined
  rating?: number | undefined
  participantIds?: string[] | undefined
}

export interface OpinionScoreChange {
  score: number | null
  word: string | null
}

export interface PhotoMeta {
  contentType: VisitPhotoMimeType
  sizeBytes: number
  width: number | null
  height: number | null
  thumbnail: { contentType: VisitPhotoMimeType; sizeBytes: number }
}

/** Où en est l'envoi d'une photo (gardé : une reprise ne la double pas). */
export interface PhotoProgress {
  photoId: string
  upload: SignedUpload
  thumbnailUpload: SignedUpload
  /** Les deux fichiers sont dans le stockage ; reste à terminer l'envoi. */
  uploaded: boolean
}

export type OutboxOp =
  | {
      kind: 'task'
      listingId: string
      taskId: string
      done: boolean
      label: string
    }
  | {
      kind: 'visit-create'
      listingId: string
      localId: string
      input: VisitInputRaw & { visitedAt: string }
    }
  | {
      kind: 'visit'
      listingId: string
      visitRef: VisitRef
      changes: VisitChanges
      /** `updatedAt` lu (garde-fou) ; null pour une visite commencée hors ligne. */
      base: string | null
    }
  | {
      kind: 'remark'
      listingId: string
      visitRef: VisitRef
      text: string
      at: string
    }
  | {
      kind: 'opinion'
      listingId: string
      /** La note globale et la phrase telles qu'elles sont (le serveur les remplace). */
      rating: number
      text: string
      /** La note globale vient d'être changée (pour la file affichée). */
      ratingChanged: boolean
      scores: Record<string, OpinionScoreChange | null>
      /** Les libellés des critères notés, pour la file affichée. */
      labels: Record<string, string>
      /** `updatedAt` de mon avis lu (garde-fou) ; null s'il n'existe pas encore. */
      base: string | null
    }
  | {
      kind: 'photo'
      listingId: string
      visitRef: VisitRef
      name: string
      meta: PhotoMeta
      progress: PhotoProgress | null
    }

export type OutboxState = 'pending' | 'blocked'

export interface OutboxEntry {
  id: string
  op: OutboxOp
  createdAt: string
  /** Regroupement : l'écriture ne part pas avant (millisecondes). */
  holdUntil: number
  attempts: number
  /** Après un échec de réseau, la prochaine tentative (millisecondes). */
  nextTryAt: number
  state: OutboxState
  /** Pourquoi elle attend ou a été refusée (texte du serveur). */
  error: string | null
  /** Refus pour conflit : quelqu'un a modifié la même chose entre-temps. */
  conflict: boolean
}

export interface OutboxData {
  entries: OutboxEntry[]
  /** Les visites commencées hors ligne et leur identifiant une fois créées. */
  refs: Record<string, string>
}

export const emptyOutbox = (): OutboxData => ({ entries: [], refs: {} })

/** Le délai de regroupement des notes : une rafale de notes part en une écriture (une notification). */
export const OPINION_HOLD_MS = 15_000
/** Le délai de regroupement d'un texte saisi (compte rendu, points forts et faibles). */
export const TEXT_HOLD_MS = 2_500

/** La voie d'une écriture : une tâche, une visite, mon avis sur une annonce. */
export function laneOf(op: OutboxOp): string {
  switch (op.kind) {
    case 'task':
      return `task:${op.taskId}`
    case 'opinion':
      return `opinion:${op.listingId}`
    case 'visit-create':
      return `visit:${LOCAL_PREFIX}${op.localId}`
    default:
      return `visit:${op.visitRef}`
  }
}

const isLastOfLane = (
  entries: readonly OutboxEntry[],
  index: number
): boolean => {
  const lane = laneOf((entries[index] as OutboxEntry).op)
  return !entries.slice(index + 1).some(e => laneOf(e.op) === lane)
}

/**
 * Ajoute une écriture. Une écriture qui n'est pas encore partie se regroupe
 * avec la nouvelle quand c'est la même chose : la même tâche (le dernier
 * état gagne), mon avis sur la même annonce (les notes par clé, le garde-fou
 * le plus ancien), la même visite quand rien ne s'est intercalé (les champs
 * fusionnés). Une remarque, une photo, une visite commencée s'ajoutent.
 */
export function enqueue(
  data: OutboxData,
  op: OutboxOp,
  options: {
    id: string
    now: number
    holdMs?: number
    inFlight?: ReadonlySet<string>
  }
): OutboxData {
  const { id, now, holdMs = 0, inFlight = new Set<string>() } = options
  const lane = laneOf(op)
  let index = -1
  data.entries.forEach((e, i) => {
    if (laneOf(e.op) === lane && e.state === 'pending' && !inFlight.has(e.id)) {
      index = i
    }
  })
  const existing = index >= 0 ? data.entries[index] : undefined
  if (existing && isLastOfLane(data.entries, index)) {
    const merged = mergeOps(existing.op, op)
    if (merged) {
      const entries = [...data.entries]
      entries[index] = {
        ...existing,
        op: merged,
        holdUntil: Math.max(existing.holdUntil, now + holdMs),
      }
      return { ...data, entries }
    }
  }
  const entry: OutboxEntry = {
    id,
    op,
    createdAt: new Date(now).toISOString(),
    holdUntil: now + holdMs,
    attempts: 0,
    nextTryAt: 0,
    state: 'pending',
    error: null,
    conflict: false,
  }
  return { ...data, entries: [...data.entries, entry] }
}

function mergeOps(previous: OutboxOp, next: OutboxOp): OutboxOp | null {
  if (previous.kind === 'task' && next.kind === 'task') return next
  if (previous.kind === 'opinion' && next.kind === 'opinion') {
    return {
      ...previous,
      rating: next.rating,
      text: next.text,
      ratingChanged: previous.ratingChanged || next.ratingChanged,
      scores: { ...previous.scores, ...next.scores },
      labels: { ...previous.labels, ...next.labels },
    }
  }
  if (previous.kind === 'visit' && next.kind === 'visit') {
    return { ...previous, changes: { ...previous.changes, ...next.changes } }
  }
  return null
}

/** Après un échec de réseau : 2 s, 4 s, 8 s… une minute au plus. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1))
}

/**
 * L'écriture qui part maintenant : la première de chaque voie, si elle
 * n'attend pas (regroupement, nouvelle tentative), n'est pas refusée et
 * n'est pas déjà en route, et si la visite qu'elle vise existe (une visite
 * commencée hors ligne part d'abord). `wakeAt` : quand regarder à nouveau.
 */
export function nextReady(
  data: OutboxData,
  now: number,
  inFlight: ReadonlySet<string> = new Set()
): { entry: OutboxEntry | null; wakeAt: number | null } {
  const seen = new Set<string>()
  let wakeAt: number | null = null
  for (const entry of data.entries) {
    const lane = laneOf(entry.op)
    if (seen.has(lane)) continue
    seen.add(lane)
    if (inFlight.has(entry.id) || entry.state === 'blocked') continue
    if (needsLocalVisit(entry.op) && !resolveVisitRef(data, refOf(entry.op))) {
      // Sa visite n'est pas encore créée : elle attend la création.
      continue
    }
    const at = Math.max(entry.holdUntil, entry.nextTryAt)
    if (at > now) {
      wakeAt = wakeAt === null ? at : Math.min(wakeAt, at)
      continue
    }
    return { entry, wakeAt: null }
  }
  return { entry: null, wakeAt }
}

const refOf = (op: OutboxOp): VisitRef =>
  op.kind === 'visit' || op.kind === 'remark' || op.kind === 'photo'
    ? op.visitRef
    : ''

const needsLocalVisit = (op: OutboxOp): boolean =>
  (op.kind === 'visit' || op.kind === 'remark' || op.kind === 'photo') &&
  isLocalRef(op.visitRef)

/** L'identifiant de la visite visée, ou null tant qu'elle n'est pas créée. */
export function resolveVisitRef(
  data: OutboxData,
  ref: VisitRef
): string | null {
  if (!isLocalRef(ref)) return ref
  return data.refs[ref.slice(LOCAL_PREFIX.length)] ?? null
}

/** Ce que la réponse du serveur apprend à la suite de la file. */
export interface OutboxSuccess {
  /** La visite créée (une visite commencée hors ligne). */
  createdVisitId?: string
  /** Le nouvel `updatedAt` de la visite écrite. */
  visitUpdatedAt?: string
  /** Le nouvel `updatedAt` de mon avis. */
  opinionUpdatedAt?: string
}

/**
 * Une écriture est passée : elle sort de la file. Les écritures suivantes de
 * la même voie prennent pour garde-fou ce que le serveur vient de rendre
 * (sinon chacune se heurterait à la précédente) ; une visite commencée hors
 * ligne reçoit son identifiant.
 */
export function succeed(
  data: OutboxData,
  entryId: string,
  result: OutboxSuccess = {}
): OutboxData {
  const done = data.entries.find(e => e.id === entryId)
  if (!done) return data
  const lane = laneOf(done.op)
  const refs =
    done.op.kind === 'visit-create' && result.createdVisitId
      ? { ...data.refs, [done.op.localId]: result.createdVisitId }
      : data.refs
  const entries = data.entries
    .filter(e => e.id !== entryId)
    .map(e => {
      if (laneOf(e.op) !== lane) return e
      if (e.op.kind === 'visit' && result.visitUpdatedAt) {
        return { ...e, op: { ...e.op, base: result.visitUpdatedAt } }
      }
      if (e.op.kind === 'opinion' && result.opinionUpdatedAt) {
        return { ...e, op: { ...e.op, base: result.opinionUpdatedAt } }
      }
      return e
    })
  // Les références locales dont plus aucune écriture n'a besoin s'oublient.
  const needed = new Set(
    entries.flatMap(e => {
      const ref = refOf(e.op)
      return isLocalRef(ref) ? [ref.slice(LOCAL_PREFIX.length)] : []
    })
  )
  return {
    entries,
    refs: Object.fromEntries(
      Object.entries(refs).filter(([local]) => needed.has(local))
    ),
  }
}

/** Ce que l'on fait d'un échec, d'après le code HTTP (null : pas de réponse). */
export type FailureOutcome = 'retry' | 'conflict' | 'refused'

export function outcomeOf(status: number | null): FailureOutcome {
  if (status === null || status === 401 || status === 408 || status === 429) {
    return 'retry'
  }
  if (status >= 500) return 'retry'
  if (status === 409) return 'conflict'
  return 'refused'
}

/** Un échec : nouvelle tentative plus tard, ou « à revoir » (refus, conflit). */
export function fail(
  data: OutboxData,
  entryId: string,
  outcome: FailureOutcome,
  message: string,
  now: number
): OutboxData {
  return {
    ...data,
    entries: data.entries.map(e => {
      if (e.id !== entryId) return e
      if (outcome === 'retry') {
        const attempts = e.attempts + 1
        return {
          ...e,
          attempts,
          nextTryAt: now + backoffMs(attempts),
          error: message,
        }
      }
      return {
        ...e,
        state: 'blocked' as const,
        error: message,
        conflict: outcome === 'conflict',
      }
    }),
  }
}

/** « Réessayer » : l'écriture repart tout de suite ; une progression de photo est gardée. */
export function retryEntry(data: OutboxData, entryId: string): OutboxData {
  return {
    ...data,
    entries: data.entries.map(e =>
      e.id === entryId
        ? {
            ...e,
            state: 'pending' as const,
            attempts: 0,
            nextTryAt: 0,
            holdUntil: 0,
            error: null,
            conflict: false,
          }
        : e
    ),
  }
}

/** « Envoyer maintenant » : plus de regroupement (fin de visite, page quittée). */
export function releaseHolds(data: OutboxData): OutboxData {
  return {
    ...data,
    entries: data.entries.map(e =>
      e.holdUntil > 0 ? { ...e, holdUntil: 0 } : e
    ),
  }
}

/**
 * « Abandonner » (le choix du membre, jamais d'office) : l'écriture sort de
 * la file. Abandonner une visite commencée hors ligne abandonne aussi ce qui
 * la visait (sans visite, rien ne peut partir) : `removed` le dit.
 */
export function discardEntry(
  data: OutboxData,
  entryId: string
): { data: OutboxData; removed: OutboxEntry[] } {
  const target = data.entries.find(e => e.id === entryId)
  if (!target) return { data, removed: [] }
  const local =
    target.op.kind === 'visit-create'
      ? `${LOCAL_PREFIX}${target.op.localId}`
      : null
  const removed = data.entries.filter(
    e => e.id === entryId || (local !== null && refOf(e.op) === local)
  )
  const ids = new Set(removed.map(e => e.id))
  return {
    data: { ...data, entries: data.entries.filter(e => !ids.has(e.id)) },
    removed,
  }
}

/** Remplace l'écriture (progression d'une photo). */
export function updateOp(
  data: OutboxData,
  entryId: string,
  op: OutboxOp
): OutboxData {
  return {
    ...data,
    entries: data.entries.map(e => (e.id === entryId ? { ...e, op } : e)),
  }
}

// ---------------------------------------------------------------------------
// Une écriture déjà appliquée (réponse perdue)
// ---------------------------------------------------------------------------

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every(id => b.includes(id))

/**
 * Un conflit sur une écriture renvoyée peut venir d'une réponse perdue :
 * le serveur l'a appliquée, puis la file l'a renvoyée avec l'ancien
 * garde-fou. Si la visite porte déjà exactement ces valeurs, l'écriture est
 * faite ; sinon c'est un vrai conflit (quelqu'un d'autre a écrit).
 */
export function visitAlreadyApplied(
  changes: VisitChanges,
  current: {
    status: VisitStatus
    report: string | null
    pros: string | null
    cons: string | null
    rating: number
    participantIds: readonly string[]
  }
): boolean {
  return Object.entries(changes).every(([key, value]) => {
    if (value === undefined) return true
    if (key === 'participantIds') {
      return sameSet(value as string[], current.participantIds)
    }
    return (current as Record<string, unknown>)[key] === value
  })
}

/** Le même contrôle pour mon avis : la note globale et chaque note envoyée. */
export function opinionAlreadyApplied(
  op: Extract<OutboxOp, { kind: 'opinion' }>,
  current: {
    rating: number
    scores: readonly {
      key: string
      score: number | null
      word: string | null
    }[]
  } | null
): boolean {
  if (!current) return false
  if (op.rating !== current.rating) return false
  return Object.entries(op.scores).every(([key, value]) => {
    const saved = current.scores.find(s => s.key === key)
    if (value === null) return !saved || (saved.score === null && !saved.word)
    return (
      (saved?.score ?? null) === value.score &&
      (saved?.word ?? null) === value.word
    )
  })
}

// ---------------------------------------------------------------------------
// Les phrases
// ---------------------------------------------------------------------------

/** Ce qu'une écriture en attente fait, en quelques mots. */
export function entryLabel(op: OutboxOp): string {
  switch (op.kind) {
    case 'task':
      return `${op.done ? 'Point coché' : 'Point décoché'} : ${op.label}`
    case 'visit-create':
      return 'Visite commencée'
    case 'visit': {
      const fields = [
        op.changes.status === 'done' ? 'visite faite' : null,
        op.changes.report !== undefined ? 'compte rendu' : null,
        op.changes.pros !== undefined ? 'points forts' : null,
        op.changes.cons !== undefined ? 'points faibles' : null,
        op.changes.rating !== undefined ? 'note de la visite' : null,
        op.changes.participantIds !== undefined ? 'participants' : null,
      ].filter((f): f is string => f !== null)
      const text = fields.join(', ') || 'visite'
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
    case 'remark':
      return `Remarque : ${op.text}`
    case 'opinion': {
      const names = Object.keys(op.scores).map(k => op.labels[k] ?? k)
      const parts = [
        names.length ? names.join(', ') : null,
        op.ratingChanged ? 'note globale' : null,
      ].filter(Boolean)
      return `Mes notes : ${parts.join(', ') || 'avis'}`
    }
    case 'photo':
      return `Photo « ${op.name} »`
  }
}

export interface OutboxSummary {
  /** Rien en attente. */
  clear: boolean
  pending: number
  blocked: number
  text: string
  tone: 'good' | 'info' | 'warn' | 'bad'
}

/**
 * La pastille de l'écran : « Tout est envoyé », « 3 changements en
 * attente du réseau » (gardés sur l'appareil), « Envoi… », « 1 changement
 * à revoir ».
 */
export function outboxSummary(
  entries: readonly OutboxEntry[],
  options: { online: boolean; sending: boolean }
): OutboxSummary {
  const blocked = entries.filter(e => e.state === 'blocked').length
  const pending = entries.length - blocked
  if (entries.length === 0) {
    return {
      clear: true,
      pending: 0,
      blocked: 0,
      text: 'Tout est envoyé',
      tone: 'good',
    }
  }
  if (blocked > 0) {
    return {
      clear: false,
      pending,
      blocked,
      text: `${plural(blocked, 'changement')} à revoir${pending ? ` · ${pending} en attente` : ''}`,
      tone: 'bad',
    }
  }
  if (!options.online) {
    return {
      clear: false,
      pending,
      blocked,
      text: `${plural(pending, 'changement')} en attente du réseau`,
      tone: 'warn',
    }
  }
  return {
    clear: false,
    pending,
    blocked,
    text: options.sending
      ? `Envoi… (${pending} en attente)`
      : `${plural(pending, 'changement')} à envoyer`,
    tone: 'info',
  }
}
