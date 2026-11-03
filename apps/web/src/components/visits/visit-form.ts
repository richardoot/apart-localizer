import type { VisitInputRaw, VisitStatus } from '@apart/contracts'

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
