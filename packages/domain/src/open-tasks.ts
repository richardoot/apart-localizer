import type {
  ListingStatus,
  OpenTask,
  OpenTasks,
  OpenTasksGroup,
  OpenTasksListing,
  Task,
  WorkflowTaskCounts,
} from '@apart/contracts'
import { plural } from './format.js'
import { ACTIVE_STATUSES, TASK_OVERDUE_DAYS } from './summary.js'

/**
 * Lot 23 (ADR 0033) : toutes les tâches ouvertes de l'espace, par annonce et
 * par retard. Une tâche est en retard quand elle est ouverte depuis plus de
 * `TASK_OVERDUE_DAYS` jours (la règle de la synthèse, inchangée) ; seules
 * les annonces suivies comptent (ni écartées, ni vendues, ni refusées). Les
 * mêmes fonctions donnent les chiffres de « Ce qui t'attend » et la vue
 * « Toutes les tâches » : ils ne peuvent pas se contredire. Pur.
 */

const DAY_MS = 86_400_000

/** Une annonce suivie : ni écartée, ni vendue, ni refusée. */
export function isTrackedStatus(status: ListingStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

/** Jours entiers depuis la création (0 le jour même, jamais négatif). */
export function taskOpenDays(createdAt: string, now: Date): number {
  const age = now.getTime() - Date.parse(createdAt)
  return Number.isFinite(age) && age > 0 ? Math.floor(age / DAY_MS) : 0
}

/** Ouverte depuis plus de `days` jours. */
export function isOverdueTask(
  task: { done: boolean; createdAt: string },
  now: Date,
  days: number = TASK_OVERDUE_DAYS
): boolean {
  if (task.done) return false
  const age = now.getTime() - Date.parse(task.createdAt)
  return Number.isFinite(age) && age > days * DAY_MS
}

/** Ce que les compteurs lisent d'une annonce. */
export interface TaskCountListing {
  status: ListingStatus
  tasks: readonly { done: boolean; createdAt: string }[]
}

/** Les tâches ouvertes et en retard des annonces suivies. */
export function openTaskCounts(
  listings: readonly TaskCountListing[],
  now: Date,
  days: number = TASK_OVERDUE_DAYS
): WorkflowTaskCounts {
  let open = 0
  let overdue = 0
  for (const listing of listings) {
    if (!isTrackedStatus(listing.status)) continue
    for (const task of listing.tasks) {
      if (task.done) continue
      open += 1
      if (isOverdueTask(task, now, days)) overdue += 1
    }
  }
  return { open, overdue, overdueDays: days }
}

/** Une annonce et ses tâches, telles que la vue les lit. */
export interface OpenTasksInputListing {
  listing: OpenTasksListing
  tasks: readonly Task[]
}

/**
 * La vue « Toutes les tâches » : une entrée par annonce suivie qui a des
 * tâches ouvertes. Dans une annonce, les tâches en retard d'abord (la plus
 * ancienne en tête), puis les autres dans l'ordre de la fiche. Les annonces
 * qui ont du retard d'abord (le plus de retard en tête), puis par nombre de
 * tâches, puis par titre.
 */
export function openTasksView(
  listings: readonly OpenTasksInputListing[],
  now: Date,
  days: number = TASK_OVERDUE_DAYS
): OpenTasks {
  const groups: OpenTasksGroup[] = []
  for (const entry of listings) {
    if (!isTrackedStatus(entry.listing.status)) continue
    const tasks: OpenTask[] = entry.tasks
      .filter(task => !task.done)
      .map(task => ({
        ...task,
        overdue: isOverdueTask(task, now, days),
        openDays: taskOpenDays(task.createdAt, now),
      }))
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        if (a.overdue) {
          const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt)
          if (diff !== 0) return diff
        }
        return a.position - b.position
      })
    if (tasks.length === 0) continue
    groups.push({
      listing: entry.listing,
      overdue: tasks.filter(t => t.overdue).length,
      tasks,
    })
  }
  groups.sort(
    (a, b) =>
      b.overdue - a.overdue ||
      b.tasks.length - a.tasks.length ||
      a.listing.title.localeCompare(b.listing.title, 'fr')
  )
  const open = groups.reduce((sum, g) => sum + g.tasks.length, 0)
  const overdue = groups.reduce((sum, g) => sum + g.overdue, 0)
  return { open, overdue, overdueDays: days, groups }
}

/** « ouverte aujourd'hui », « ouverte hier », « ouverte depuis 18 jours ». */
export function openTaskAgeText(openDays: number): string {
  if (openDays <= 0) return 'ouverte aujourd’hui'
  if (openDays === 1) return 'ouverte hier'
  return `ouverte depuis ${openDays} jours`
}

/** « 71 tâches ouvertes, dont 25 en retard », « Aucune tâche ouverte ». */
export function openTasksSummaryText(
  counts: Pick<WorkflowTaskCounts, 'open' | 'overdue'>
): string {
  if (counts.open === 0) return 'Aucune tâche ouverte'
  const open = plural(counts.open, 'tâche ouverte', 'tâches ouvertes')
  return counts.overdue > 0 ? `${open}, dont ${counts.overdue} en retard` : open
}
