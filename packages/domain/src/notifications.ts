import { LISTING_STATUS_LABELS, OFFER_RESPONSE_LABELS } from '@apart/contracts'
import type {
  ActivityActor,
  MemberRole,
  NotificationType,
} from '@apart/contracts'
import { activityActorName } from './activity.js'
import type { ActivityRecord } from './activity.js'
import { formatEuros } from './format.js'

/**
 * Quelles notifications une écriture journalisée fait naître (besoin S7), et
 * pour qui. Règles :
 *  - une action ne notifie jamais son auteur, sauf une annonce ajoutée (ou
 *    entrée dans un critère) par Claude au MCP : le membre ne l'a pas vue à
 *    l'écran ;
 *  - une tâche assignée ne notifie que le membre assigné ;
 *  - une écriture du système (alerte e-mail reçue) notifie tous les membres ;
 *  - l'arrivée d'un membre invité (invitation acceptée) ne notifie que les
 *    propriétaires (lot 8) ; la première connexion d'un membre pré-créé
 *    (import) est journalisée sans notification.
 * Les préférences par type et par canal s'appliquent ensuite, côté API.
 */

export interface NotificationEvent extends ActivityRecord {
  listingId: string | null
}

export interface NotificationDraft {
  recipientId: string
  type: NotificationType
  title: string
  body: string
  url: string | null
  listingId: string | null
}

export interface NotificationContext {
  /** Les membres actifs de l'espace ; le rôle sert aux notifications des propriétaires. */
  members: readonly (Pick<ActivityActor, 'id' | 'displayName'> & {
    role?: MemberRole
  })[]
  listingTitle: string | null
}

function field(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null
    ? (record as Record<string, unknown>)[key]
    : undefined
}

function str(record: unknown, key: string): string | null {
  const value = field(record, key)
  return typeof value === 'string' ? value : null
}

/** Le type de notification d'une action, ou null si elle n'en fait pas naître. */
export function notificationTypeOf(
  event: NotificationEvent
): NotificationType | null {
  switch (event.action) {
    case 'listing.created':
      return 'listing_created'
    case 'listing.status_changed':
      return 'status_changed'
    case 'task.created':
      return str(event.after, 'assigneeId') ? 'task_assigned' : null
    case 'task.updated': {
      const next = str(event.after, 'assigneeId')
      return next && next !== str(event.before, 'assigneeId')
        ? 'task_assigned'
        : null
    }
    case 'criteria.matched':
      return 'criteria_matched'
    case 'offer.updated': {
      const response = str(event.after, 'response')
      return response &&
        response !== 'pending' &&
        response !== str(event.before, 'response')
        ? 'offer_response'
        : null
    }
    case 'draft.received':
      return Number(field(event.after, 'created') ?? 0) > 0
        ? 'drafts_received'
        : null
    case 'member.joined':
      return str(event.after, 'via') === 'invitation' ? 'member_joined' : null
    default:
      return null
  }
}

/** Les destinataires d'une notification de ce type. */
export function notificationRecipients(
  event: NotificationEvent,
  type: NotificationType,
  memberIds: readonly string[],
  ownerIds: readonly string[] = []
): string[] {
  if (type === 'member_joined') {
    return ownerIds.filter(
      id => id !== event.actorMemberId && memberIds.includes(id)
    )
  }
  if (type === 'task_assigned') {
    const assignee = str(event.after, 'assigneeId')
    return assignee &&
      assignee !== event.actorMemberId &&
      memberIds.includes(assignee)
      ? [assignee]
      : []
  }
  const outsideApp =
    event.channel === 'mcp' &&
    (type === 'listing_created' || type === 'criteria_matched')
  return memberIds.filter(
    id =>
      outsideApp || event.actorMemberId === null || id !== event.actorMemberId
  )
}

/** Les notifications d'une écriture : titre, texte, lien, destinataire. */
export function notificationsForActivity(
  event: NotificationEvent,
  context: NotificationContext
): NotificationDraft[] {
  const type = notificationTypeOf(event)
  if (!type) return []
  const names = new Map(context.members.map(m => [m.id, m]))
  const who = activityActorName(event, names)
  const title = context.listingTitle ?? 'une annonce'
  const url = event.listingId ? `/annonces/${event.listingId}` : null
  let heading: string
  let body: string
  switch (type) {
    case 'listing_created': {
      heading = `Nouvelle annonce : ${title}`
      const price = field(event.after, 'price')
      body = `Ajoutée par ${who}${typeof price === 'number' ? `, ${formatEuros(price)}` : ''}.`
      break
    }
    case 'status_changed': {
      const from = str(event.before, 'status')
      const to = str(event.after, 'status')
      const label = (s: string | null) =>
        s ? ((LISTING_STATUS_LABELS as Record<string, string>)[s] ?? s) : '—'
      heading = `Statut : ${title}`
      body = `${who} : ${label(from)} → ${label(to)}.`
      break
    }
    case 'task_assigned':
      heading = `Tâche pour vous : ${str(event.after, 'label') ?? str(event.before, 'label') ?? 'nouvelle tâche'}`
      body = `Assignée par ${who}, annonce « ${title} ».`
      break
    case 'criteria_matched': {
      const criteria = field(event.after, 'criteria')
      const list = Array.isArray(criteria)
        ? criteria
            .map(c => str(c, 'name'))
            .filter((n): n is string => Boolean(n))
        : []
      heading = `Dans votre critère : ${title}`
      body = `L'annonce entre dans ${list.map(n => `« ${n} »`).join(', ') || 'un critère'}.`
      break
    }
    case 'offer_response': {
      const response = str(event.after, 'response') ?? 'pending'
      const counter = field(event.after, 'counterAmount')
      heading = `Réponse à l'offre : ${title}`
      body = `${(OFFER_RESPONSE_LABELS as Record<string, string>)[response] ?? response}${response === 'counter_offer' && typeof counter === 'number' ? ` à ${formatEuros(counter)}` : ''} (enregistrée par ${who}).`
      break
    }
    case 'drafts_received': {
      const count = Number(field(event.after, 'created') ?? 0)
      const subject = str(event.after, 'subject')
      heading = `${count} annonce(s) reçue(s) par e-mail`
      body = `À valider${subject ? ` : « ${subject.slice(0, 120)} »` : ''}.`
      break
    }
    case 'member_joined': {
      const name =
        (event.actorMemberId
          ? names.get(event.actorMemberId)?.displayName
          : null) ??
        str(event.after, 'displayName') ??
        'Un membre'
      heading = `${name} a rejoint l'espace`
      body = `${name} a accepté l'invitation et voit désormais les annonces, avis et tâches de l'espace.`
      break
    }
  }
  return notificationRecipients(
    event,
    type,
    context.members.map(m => m.id),
    context.members.filter(m => m.role === 'owner').map(m => m.id)
  ).map(recipientId => ({
    recipientId,
    type,
    title: heading,
    body,
    url:
      type === 'drafts_received'
        ? '/?brouillons=1'
        : type === 'member_joined'
          ? '/espace'
          : url,
    listingId: event.listingId,
  }))
}
