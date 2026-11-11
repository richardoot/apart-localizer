import type { EvaluatedListing, OpenTasks } from '@apart/contracts'

/**
 * Lot 24 (ADR 0034) : les réponses immédiates. Une tâche cochée s'affiche
 * cochée tout de suite (la fiche, toutes les tâches), avant la réponse du
 * serveur ; si le serveur refuse, l'état d'avant revient et l'erreur
 * s'affiche là où l'on a cliqué. Pur, testé.
 */

/** La fiche avec la tâche cochée ou rouverte. */
export function withTaskDone(
  item: EvaluatedListing,
  taskId: string,
  done: boolean,
  now: Date = new Date()
): EvaluatedListing {
  if (!item.tasks.some(t => t.id === taskId)) return item
  return {
    ...item,
    tasks: item.tasks.map(t =>
      t.id === taskId
        ? { ...t, done, doneAt: done ? now.toISOString() : null }
        : t
    ),
  }
}

/**
 * « Toutes les tâches » sans la tâche cochée (les compteurs suivent) ; une
 * tâche rouverte n'y revient qu'à la relecture (sa place dépend du serveur).
 */
export function withoutOpenTask(open: OpenTasks, taskId: string): OpenTasks {
  const group = open.groups.find(g => g.tasks.some(t => t.id === taskId))
  const task = group?.tasks.find(t => t.id === taskId)
  if (!group || !task) return open
  return {
    ...open,
    open: Math.max(0, open.open - 1),
    overdue: Math.max(0, open.overdue - (task.overdue ? 1 : 0)),
    groups: open.groups
      .map(g =>
        g === group
          ? {
              ...g,
              overdue: Math.max(0, g.overdue - (task.overdue ? 1 : 0)),
              tasks: g.tasks.filter(t => t.id !== taskId),
            }
          : g
      )
      .filter(g => g.tasks.length > 0),
  }
}
