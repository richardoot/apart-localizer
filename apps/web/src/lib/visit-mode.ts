import type { Opinion, Visit, VisitStatus } from '@apart/contracts'
import { appendVisitRemark, visitRemarkLine } from '@apart/domain'
import { LOCAL_PREFIX, laneOf } from './outbox'
import type { OutboxData, OutboxEntry, VisitRef } from './outbox'

/**
 * Lot 24 (ADR 0034) : ce que le mode visite affiche, côté interface. Ce que
 * le serveur a rendu, plus ce qui attend dans la file (tâches cochées,
 * compte rendu, remarques, notes, photos) : l'écran montre tout de suite ce
 * que le membre a fait, envoyé ou non. Pur, testé.
 */

/** La visite telle que l'écran la montre. */
export interface VisitView {
  /** L'identifiant, ou `local:…` pour une visite commencée hors ligne. */
  ref: VisitRef
  status: VisitStatus
  visitedAt: string
  participantIds: string[]
  report: string | null
  pros: string | null
  cons: string | null
  rating: number
  createdById: string | null
  /** `updatedAt` lu (garde-fou) ; null pour une visite pas encore créée. */
  updatedAt: string | null
  /** Pas encore créée sur le serveur. */
  local: boolean
}

export function visitViewOf(visit: Visit): VisitView {
  return {
    ref: visit.id,
    status: visit.status,
    visitedAt: visit.visitedAt,
    participantIds: [...visit.participantIds],
    report: visit.report,
    pros: visit.pros,
    cons: visit.cons,
    rating: visit.rating,
    createdById: visit.createdById,
    updatedAt: visit.updatedAt,
    local: false,
  }
}

const entriesOf = (data: OutboxData, lane: string): OutboxEntry[] =>
  data.entries.filter(e => laneOf(e.op) === lane)

/** Les visites commencées hors ligne d'une annonce (pas encore créées). */
export function localVisits(
  data: OutboxData,
  listingId: string,
  meId: string | null
): VisitView[] {
  return data.entries.flatMap(e =>
    e.op.kind === 'visit-create' &&
    e.op.listingId === listingId &&
    !data.refs[e.op.localId]
      ? [
          {
            ref: `${LOCAL_PREFIX}${e.op.localId}`,
            status: e.op.input.status ?? 'planned',
            visitedAt: e.op.input.visitedAt,
            participantIds: [...(e.op.input.participantIds ?? [])],
            report: e.op.input.report ?? null,
            pros: e.op.input.pros ?? null,
            cons: e.op.input.cons ?? null,
            rating: e.op.input.rating ?? 0,
            createdById: meId,
            updatedAt: null,
            local: true,
          },
        ]
      : []
  )
}

/**
 * La visite avec ce qui attend : les changements par-dessus, les remarques
 * ajoutées à la fin du compte rendu (même règle que le serveur), dans
 * l'ordre de la file.
 */
export function projectVisit(view: VisitView, data: OutboxData): VisitView {
  const refs = [view.ref]
  // Une visite créée depuis la file garde ses écritures sous l'ancien nom.
  for (const [local, id] of Object.entries(data.refs)) {
    if (id === view.ref) refs.push(`${LOCAL_PREFIX}${local}`)
  }
  let next: VisitView = { ...view, participantIds: [...view.participantIds] }
  const entries = refs.flatMap(ref => entriesOf(data, `visit:${ref}`))
  for (const entry of entries) {
    const op = entry.op
    if (op.kind === 'visit') {
      next = {
        ...next,
        ...Object.fromEntries(
          Object.entries(op.changes).filter(([, v]) => v !== undefined)
        ),
      }
    } else if (op.kind === 'remark') {
      next = {
        ...next,
        report: appendVisitRemark(next.report, visitRemarkLine(op.text, op.at)),
      }
    }
  }
  return next
}

/** L'état d'une tâche avec ce qui attend (le dernier choix gagne). */
export function projectTaskDone(
  taskId: string,
  done: boolean,
  data: OutboxData
): boolean {
  const pending = entriesOf(data, `task:${taskId}`)
  const last = pending[pending.length - 1]
  return last?.op.kind === 'task' ? last.op.done : done
}

/** Mes notes telles que l'écran les montre. */
export interface MyScores {
  rating: number
  text: string
  scores: Record<string, { score: number | null; word: string | null }>
  /** `updatedAt` de mon avis lu (garde-fou), null s'il n'existe pas. */
  base: string | null
}

export function myScoresOf(opinion: Opinion | null): MyScores {
  return {
    rating: opinion?.rating ?? 0,
    text: opinion?.text ?? '',
    scores: Object.fromEntries(
      (opinion?.scores ?? []).map(s => [
        s.key,
        { score: s.score, word: s.word },
      ])
    ),
    base: opinion?.updatedAt ?? null,
  }
}

/** Mes notes avec ce qui attend. */
export function projectScores(
  mine: MyScores,
  listingId: string,
  data: OutboxData
): MyScores {
  let next: MyScores = { ...mine, scores: { ...mine.scores } }
  for (const entry of entriesOf(data, `opinion:${listingId}`)) {
    if (entry.op.kind !== 'opinion') continue
    const scores = { ...next.scores }
    for (const [key, value] of Object.entries(entry.op.scores)) {
      if (value === null) delete scores[key]
      else scores[key] = value
    }
    next = { ...next, rating: entry.op.rating, text: entry.op.text, scores }
  }
  return next
}

/** Les photos qui attendent pour cette visite, dans l'ordre. */
export function pendingPhotos(
  data: OutboxData,
  view: Pick<VisitView, 'ref'>
): OutboxEntry[] {
  const refs = new Set([view.ref])
  for (const [local, id] of Object.entries(data.refs)) {
    if (id === view.ref) refs.add(`${LOCAL_PREFIX}${local}`)
  }
  return data.entries.filter(
    e => e.op.kind === 'photo' && refs.has(e.op.visitRef)
  )
}

/** Les écritures en attente qui touchent une annonce. */
export function entriesOfListing(
  data: OutboxData,
  listingId: string
): OutboxEntry[] {
  return data.entries.filter(e => e.op.listingId === listingId)
}

/** Une liste de participants en mots : « Camille et Sacha ». */
export function namesText(names: readonly string[]): string {
  if (names.length === 0) return 'personne'
  if (names.length === 1) return names[0] as string
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

/**
 * Ce que dit le bouton du bas : « Terminer la visite » pour une visite
 * planifiée, « Fermer » une fois faite.
 */
export function visitFinishLabel(status: VisitStatus): string {
  return status === 'planned' ? 'Terminer la visite' : 'Fermer'
}
