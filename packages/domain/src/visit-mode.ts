import { isAskableTask, parisDay } from './agency-requests.js'
import type { QuestionTask } from './agency-requests.js'
import { visitWhen } from './listing-overview.js'

/**
 * Lot 24 (ADR 0034) : le mode visite. Ce qu'on vérifie sur place, quelle
 * visite l'écran ouvre, qui peut corriger une visite, et la remarque
 * horodatée ajoutée au compte rendu. Fonctions pures, sans E/S.
 */

// ---------------------------------------------------------------------------
// Les points à vérifier
// ---------------------------------------------------------------------------

export interface VisitPointTaskLike {
  id: string
  label: string
  field: QuestionTask['field']
  done: boolean
  position: number
  origin?: string | null
}

export type VisitPointKind = 'counter_visit' | 'check'

export interface VisitPoint {
  id: string
  label: string
  done: boolean
  /** « À revoir à la contre-visite » (né des avis) ou une vérification. */
  kind: VisitPointKind
}

const ON_SITE = /^(vérifier|évaluer)\b/i

/**
 * Les points à vérifier pendant la visite, cochables : les tâches à nous
 * (jamais une question pour l'annonceur) nées d'un désaccord des avis (« À
 * revoir à la contre-visite », lot 20), puis celles qui commencent par
 * « Vérifier … » ou « Évaluer … ». Les points faits restent dans la liste,
 * cochés, à leur place : décocher se fait d'un geste, rien ne saute. Aucun
 * point n'est inventé : sans tâche de ce genre, la liste est vide.
 */
export function visitPoints(
  tasks: readonly VisitPointTaskLike[]
): VisitPoint[] {
  const points = tasks.flatMap(task => {
    if (isAskableTask(task)) return []
    const kind: VisitPointKind | null =
      task.origin === 'opinion'
        ? 'counter_visit'
        : ON_SITE.test(task.label.trim())
          ? 'check'
          : null
    return kind ? [{ task, kind }] : []
  })
  return points
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'counter_visit' ? -1 : 1) ||
        a.task.position - b.task.position
    )
    .map(({ task, kind }) => ({
      id: task.id,
      label: task.label,
      done: task.done,
      kind,
    }))
}

/** « 2 sur 5 vérifiés ». */
export function visitPointsProgress(
  points: readonly Pick<VisitPoint, 'done'>[]
): {
  done: number
  total: number
} {
  return {
    done: points.filter(p => p.done).length,
    total: points.length,
  }
}

// ---------------------------------------------------------------------------
// La visite que l'écran ouvre
// ---------------------------------------------------------------------------

export interface VisitModeVisitLike {
  id: string
  status: 'planned' | 'done'
  visitedAt: string
}

const time = (iso: string): number => {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : Number.NaN
}

/**
 * La visite que le mode visite ouvre, sans choix explicite : la visite
 * planifiée d'aujourd'hui (heure de Paris) la plus proche de maintenant ;
 * sinon une visite faite aujourd'hui (son compte rendu reste à finir) ; sinon
 * la dernière visite planifiée passée, jamais marquée faite ; sinon la
 * prochaine visite planifiée. Null s'il n'y en a aucune : l'écran propose
 * d'en commencer une. Une date illisible est ignorée.
 */
export function visitModeVisit<T extends VisitModeVisitLike>(
  visits: readonly T[],
  now: Date
): T | null {
  const today = parisDay(now.toISOString())
  const at = now.getTime()
  const valid = visits.filter(v => Number.isFinite(time(v.visitedAt)))
  const closest = (list: T[]): T | null =>
    [...list].sort(
      (a, b) =>
        Math.abs(time(a.visitedAt) - at) - Math.abs(time(b.visitedAt) - at)
    )[0] ?? null
  const isToday = (v: T) => parisDay(v.visitedAt) === today
  const plannedToday = valid.filter(v => v.status === 'planned' && isToday(v))
  if (plannedToday.length) return closest(plannedToday)
  const doneToday = valid.filter(v => v.status === 'done' && isToday(v))
  if (doneToday.length) return closest(doneToday)
  const plannedPast = valid
    .filter(v => v.status === 'planned' && time(v.visitedAt) < at)
    .sort((a, b) => time(b.visitedAt) - time(a.visitedAt))
  if (plannedPast[0]) return plannedPast[0]
  const plannedNext = valid
    .filter(v => v.status === 'planned')
    .sort((a, b) => time(a.visitedAt) - time(b.visitedAt))
  return plannedNext[0] ?? null
}

/**
 * Quand a lieu la visite, pour l'en-tête du mode visite : « aujourd'hui,
 * 18 h 30 », « hier, 12 h 30 », « demain, 9 h », sinon la date
 * (« jeudi 12 novembre, 18 h 30 »).
 */
export function visitDayLabel(iso: string, now: Date): string {
  const full = visitWhen(iso)
  const day = parisDay(iso)
  const today = parisDay(now.toISOString())
  const offset = (n: number) =>
    parisDay(new Date(now.getTime() + n * 86_400_000).toISOString())
  const hour = full.slice(full.indexOf(',') + 2)
  if (day === today) return `aujourd’hui, ${hour}`
  if (day === offset(-1)) return `hier, ${hour}`
  if (day === offset(1)) return `demain, ${hour}`
  return full
}

// ---------------------------------------------------------------------------
// Qui corrige une visite
// ---------------------------------------------------------------------------

export interface VisitEditLike {
  status: 'planned' | 'done'
  createdById: string | null
  participantIds: readonly string[]
}

export const VISIT_EDIT_REFUSAL =
  'Seuls l’auteur de la visite et ses participants peuvent corriger son compte rendu.'

/**
 * Lot 24 : une visite planifiée se modifie par tout membre de l'espace (la
 * déplacer, la marquer faite avec son compte rendu, dire qui y va) ; une
 * visite faite ne se corrige (compte rendu, points forts et faibles, note,
 * participants, date) que par son auteur ou l'un de ses participants. Une
 * visite sans auteur connu (import) se corrige par tout membre.
 */
export function canEditVisit(visit: VisitEditLike, memberId: string): boolean {
  if (visit.status === 'planned') return true
  if (visit.createdById === null) return true
  return (
    visit.createdById === memberId || visit.participantIds.includes(memberId)
  )
}

/** Le refus d'une modification, ou null si elle est permise. */
export function visitEditRefusal(
  visit: VisitEditLike,
  memberId: string
): string | null {
  return canEditVisit(visit, memberId) ? null : VISIT_EDIT_REFUSAL
}

// ---------------------------------------------------------------------------
// La remarque rapide
// ---------------------------------------------------------------------------

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** La ligne d'une remarque : « 18 h 42 : fenêtres en simple vitrage ». */
export function visitRemarkLine(text: string, at: string | Date): string {
  const parts = Object.fromEntries(
    PARIS_TIME.formatToParts(new Date(at)).map(p => [p.type, p.value])
  ) as Record<string, string>
  const clean = text.trim().replace(/\s+/g, ' ')
  return `${Number(parts.hour)} h ${parts.minute} : ${clean}`
}

/**
 * Le compte rendu après une remarque : la ligne s'ajoute à la fin, sur une
 * ligne à elle. Une ligne déjà présente telle quelle (même heure, même
 * texte : la même remarque renvoyée après une réponse perdue) n'est pas
 * doublée.
 */
export function appendVisitRemark(report: string | null, line: string): string {
  const current = report?.replace(/\s+$/, '') ?? ''
  if (current.split('\n').some(existing => existing.trim() === line.trim())) {
    return current
  }
  return current ? `${current}\n${line}` : line
}
