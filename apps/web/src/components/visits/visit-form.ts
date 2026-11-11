import type {
  Visit,
  VisitInputRaw,
  VisitStatus,
  VisitUpdate,
} from '@apart/contracts'

/** Le formulaire d'une visite, en chaînes pour les champs. */
export interface VisitForm {
  visitedAt: string
  status: VisitStatus
  participantIds: string[]
  rating: number
  report: string
  pros: string
  cons: string
  createPrepTask: boolean
}

/** Une date pour `<input type="datetime-local">`, à l'heure locale. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function emptyVisitForm(
  now: Date = new Date(),
  meId: string | null = null
): VisitForm {
  return {
    visitedAt: toLocalInput(now),
    status: 'done',
    participantIds: meId ? [meId] : [],
    rating: 0,
    report: '',
    pros: '',
    cons: '',
    createPrepTask: true,
  }
}

const text = (value: string): string | null => value.trim() || null

/** Le formulaire vers le corps de `POST /listings/:id/visits` ; null si la date est illisible. */
export function visitFormToInput(form: VisitForm): VisitInputRaw | null {
  const date = new Date(form.visitedAt)
  if (Number.isNaN(date.getTime())) return null
  return {
    visitedAt: date.toISOString(),
    status: form.status,
    participantIds: form.participantIds,
    rating: form.rating,
    report: text(form.report),
    pros: text(form.pros),
    cons: text(form.cons),
    createPrepTask: form.status === 'planned' && form.createPrepTask,
  }
}

/**
 * Lot 24 : la correction d'une visite enregistrée (compte rendu, points
 * forts et faibles, note, participants, date), et « Marquer faite » qui
 * porte le compte rendu.
 */
export interface VisitEditForm {
  visitedAt: string
  participantIds: string[]
  rating: number
  report: string
  pros: string
  cons: string
}

export function visitEditForm(
  visit: Pick<
    Visit,
    'visitedAt' | 'participantIds' | 'rating' | 'report' | 'pros' | 'cons'
  >
): VisitEditForm {
  return {
    visitedAt: toLocalInput(new Date(visit.visitedAt)),
    participantIds: [...visit.participantIds],
    rating: visit.rating,
    report: visit.report ?? '',
    pros: visit.pros ?? '',
    cons: visit.cons ?? '',
  }
}

/**
 * Le corps de `PATCH /listings/:id/visits/:visitId` : seulement ce qui a
 * changé, avec le garde-fou (`updatedAt` lu) ; « faite » si on la marque
 * faite. Null si la date est illisible ; un objet sans champ (rien n'a
 * changé) se reconnaît à `changed: false`.
 */
export function visitEditPayload(
  form: VisitEditForm,
  visit: Pick<
    Visit,
    | 'visitedAt'
    | 'participantIds'
    | 'rating'
    | 'report'
    | 'pros'
    | 'cons'
    | 'status'
    | 'updatedAt'
  >,
  markDone = false
): { update: VisitUpdate; changed: boolean } | null {
  const date = new Date(form.visitedAt)
  if (Number.isNaN(date.getTime())) return null
  const update: VisitUpdate = { expectedUpdatedAt: visit.updatedAt }
  // La date ne bouge que si l'heure saisie (à la minute) a changé.
  if (form.visitedAt !== toLocalInput(new Date(visit.visitedAt))) {
    update.visitedAt = date.toISOString()
  }
  const same =
    form.participantIds.length === visit.participantIds.length &&
    form.participantIds.every(id => visit.participantIds.includes(id))
  if (!same) update.participantIds = [...form.participantIds]
  if (form.rating !== visit.rating) update.rating = form.rating
  for (const field of ['report', 'pros', 'cons'] as const) {
    const value = text(form[field])
    if (value !== (visit[field] ?? null)) update[field] = value
  }
  if (markDone && visit.status === 'planned') update.status = 'done'
  const changed = Object.keys(update).some(key => key !== 'expectedUpdatedAt')
  return { update, changed }
}
