import type { Task } from '@apart/contracts'
import { isAskableTask } from '@apart/domain'
import type { TodoFilter, TodoGroup, TodoItem } from '@apart/domain'
import type { Tone } from './ui'

/**
 * Lot 19 (ADR 0029) : l'onglet « À faire » de la fiche, côté interface. La
 * liste elle-même (tâches, questions à l'annonceur et visites fusionnées,
 * états, ordre) vient de `domain` (`todoItems`) ; ici, le libellé d'une
 * question saisie, les actions d'une demande rangées sur sa première ligne,
 * ce qu'on vérifie pendant la visite, les filtres et leurs pastilles. Pur,
 * testé.
 */

/** Les filtres de la liste, dans l'ordre de la maquette. */
export const TODO_FILTERS: ReadonlyArray<{ id: TodoFilter; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'us', label: 'Nous' },
  { id: 'agency', label: 'Agence' },
  { id: 'visit', label: 'Visites' },
]

/** La pastille de type d'une ligne. */
export const TODO_GROUP_LABELS: Record<TodoGroup, string> = {
  us: 'Nous',
  agency: 'Agence',
  visit: 'Visite',
}

/** Les teintes des pastilles, en jetons du thème (clair et sombre). */
/** Lot 22 : le ton de la pastille de chaque groupe (`UiBadge`). */
export const TODO_GROUP_TONES: Record<TodoGroup, Tone> = {
  us: 'neutral',
  agency: 'warn',
  visit: 'info',
}

const ASK = /^demander\b/i

/**
 * Le libellé d'une tâche ajoutée. Une question pour l'annonceur est une
 * tâche « Demander … » (règle du lot 17) : la case « À demander à l'agence »
 * préfixe le texte, sauf s'il commence déjà par « Demander ». Une majuscule
 * de début de phrase devient minuscule (« La quote-part… » → « Demander la
 * quote-part… ») ; un sigle (« DTG ») reste tel quel. Null si rien n'est saisi.
 */
export function taskLabelFor(text: string, askAgency: boolean): string | null {
  const value = text.trim().replace(/\s+/g, ' ')
  if (!value) return null
  if (!askAgency) return value
  if (ASK.test(value)) return value.charAt(0).toUpperCase() + value.slice(1)
  const acronym = /^[A-ZÀ-Ý]{2,}\b/.test(value)
  const rest = acronym ? value : value.charAt(0).toLowerCase() + value.slice(1)
  return `Demander ${rest}`
}

/**
 * Les actions d'une demande à l'annonceur ne se montrent qu'une fois : sur
 * la première ligne de la liste qui en dépend. Pour chaque demande, la clé
 * de cette ligne et les titres des autres questions du même message.
 */
export function requestRows(
  items: readonly Pick<TodoItem, 'key' | 'requestId' | 'title'>[]
): Map<string, { firstKey: string; others: string[] }> {
  const rows = new Map<string, { firstKey: string; others: string[] }>()
  for (const item of items) {
    if (!item.requestId) continue
    const row = rows.get(item.requestId)
    if (!row) rows.set(item.requestId, { firstKey: item.key, others: [] })
    else row.others.push(item.title)
  }
  return rows
}

const CHECK = /^vérifier\b/i

/**
 * « Pendant la visite » : ce qui reste à vérifier sur place, soit les tâches
 * à nous, ouvertes, libellées « Vérifier … », et (lot 20) les points « À
 * revoir à la contre-visite » proposés depuis « Nos avis ». Rien d'autre
 * n'est inventé.
 */
export function visitChecklist(
  tasks: readonly (Pick<Task, 'id' | 'label' | 'field' | 'done' | 'position'> &
    Partial<Pick<Task, 'origin'>>)[]
): Array<{ id: string; label: string }> {
  return [...tasks]
    .filter(
      t =>
        !t.done &&
        !isAskableTask(t) &&
        (t.origin === 'opinion' || CHECK.test(t.label.trim()))
    )
    .sort((a, b) => a.position - b.position)
    .map(t => ({ id: t.id, label: t.label }))
}

/** Le nombre de lignes par filtre (« Agence (3) »). */
export function todoCounts(
  items: readonly Pick<TodoItem, 'group'>[]
): Record<TodoFilter, number> {
  const counts: Record<TodoFilter, number> = {
    all: items.length,
    us: 0,
    agency: 0,
    visit: 0,
  }
  for (const item of items) counts[item.group] += 1
  return counts
}
