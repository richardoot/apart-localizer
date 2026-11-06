import {
  AgencyAnswerSchema,
  AgencyRequestSchema,
  DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
  ListingContactSchema,
} from '@apart/contracts'
import type {
  AgencyAnswer,
  AgencyRequest as AgencyRequestDto,
  AgencyRequestListing,
  ListingContact as ListingContactDto,
  Task as TaskDto,
} from '@apart/contracts'
import { followUpDueOn, isFollowUpDue, questionText } from '@apart/domain'
import type { QuestionTask, RequestLike } from '@apart/domain'
import type { AgencyRequest, ListingContact } from '../generated/prisma'

/**
 * Lot 17 : lignes Prisma → contrats. Le calcul (questions, relance due) vient
 * de `domain` ; le mapper ne fait que l'assembler.
 */

/**
 * Le contact de l'annonceur. Lot 18 : le nom de l'agence est celui de
 * l'annonce (`listings.seller_name`, une seule source) ; la colonne du
 * contact n'est plus lue.
 */
export function toListingContactDto(
  row: ListingContact,
  agencyName: string | null
): ListingContactDto {
  return ListingContactSchema.parse({
    listingId: row.listingId,
    agencyName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    portalMessageUrl: row.portalMessageUrl,
    preferredChannel: row.preferredChannel,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
  })
}

/** Les réponses gardées en JSON ; un contenu illisible vaut « aucune réponse ». */
export function answersOf(row: Pick<AgencyRequest, 'answers'>): AgencyAnswer[] {
  const parsed = AgencyAnswerSchema.array().safeParse(row.answers)
  return parsed.success ? parsed.data : []
}

/** Ce que les règles de `domain` lisent d'une ligne. */
export function requestLike(row: AgencyRequest): RequestLike {
  return {
    id: row.id,
    status: row.status,
    taskIds: row.taskIds,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    followUpOfId: row.followUpOfId,
    recipientName: row.recipientName,
  }
}

/** Une tâche (contrat) vue par les règles des questions. */
export function questionTask(task: TaskDto): QuestionTask {
  return {
    id: task.id,
    label: task.label,
    field: task.field,
    done: task.done,
    doneAt: task.doneAt,
    requestId: task.requestId,
    requestedAt: task.requestedAt,
    answeredAt: task.answeredAt,
  }
}

export interface RequestContext {
  listing: AgencyRequestListing
  /** Les tâches de l'annonce. */
  tasks: readonly TaskDto[]
  /** Les demandes de l'annonce (pour savoir si celle-ci a déjà une relance). */
  siblings: readonly Pick<AgencyRequest, 'followUpOfId' | 'status'>[]
  now: Date
  followUpBusinessDays?: number
}

export function toAgencyRequestDto(
  row: AgencyRequest,
  context: RequestContext
): AgencyRequestDto {
  const byId = new Map(context.tasks.map(t => [t.id, t]))
  const questions = row.taskIds
    .map(id => byId.get(id))
    .filter((t): t is TaskDto => t !== undefined)
    .map(t => ({
      taskId: t.id,
      label: t.label,
      field: t.field,
      question: questionText(t),
      done: t.done,
    }))
  const followUp = {
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    pendingQuestions: questions.filter(q => !q.done).length,
    followedUp: context.siblings.some(
      s => s.followUpOfId === row.id && s.status !== 'cancelled'
    ),
  }
  const days = context.followUpBusinessDays ?? DEFAULT_FOLLOW_UP_BUSINESS_DAYS
  return AgencyRequestSchema.parse({
    id: row.id,
    listingId: row.listingId,
    listing: context.listing,
    status: row.status,
    channel: row.channel,
    recipientName: row.recipientName,
    subject: row.subject,
    body: row.body,
    taskIds: row.taskIds,
    questions,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    createdChannel: row.createdVia === 'mcp' ? 'mcp' : 'web',
    updatedAt: row.updatedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedVia: row.approvedVia,
    approvedById: row.approvedById,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentById: row.sentById,
    threadRef: row.threadRef,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    answers: answersOf(row),
    closedAt: row.closedAt?.toISOString() ?? null,
    followUpOfId: row.followUpOfId,
    followUpDue: isFollowUpDue(followUp, context.now, days),
    followUpDueOn: followUpDueOn(followUp, days),
  })
}
