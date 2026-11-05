import { WhatsNewKindSchema } from '@apart/contracts'
import type {
  ActivityActor,
  ActivityChannel,
  WhatsNewItem,
  WhatsNewKind,
  WhatsNewListing,
  WhatsNewReport,
  WhatsNewSinceSource,
} from '@apart/contracts'
import {
  activityActorName,
  activityChanges,
  describeActivity,
  formatActivityValue,
} from './activity.js'
import type { MemberNames } from './activity.js'

/**
 * « Ce qui a changé depuis ma dernière visite » (besoin K4). Un événement
 * du journal compte pour le membre s'il est postérieur à la fois à sa
 * dernière visite de l'application et à sa dernière ouverture de la fiche
 * concernée, et s'il ne vient pas de lui-même dans l'application (ce qu'il a
 * fait par Claude, au MCP, est signalé : il ne l'a pas vu à l'écran). Les
 * avis et les tâches ne comptent que s'ils viennent de l'autre membre.
 */

export interface WhatsNewEvent {
  id: string
  action: string
  channel: ActivityChannel
  actorMemberId: string | null
  listingId: string | null
  before: unknown
  after: unknown
  /** ISO 8601. */
  createdAt: string
}

export interface WhatsNewListingState {
  title: string
  /** Dernière ouverture de la fiche par le membre (ISO 8601), null si jamais. */
  seenAt: string | null
}

export interface WhatsNewInput {
  memberId: string
  since: string
  sinceSource: WhatsNewSinceSource
  now: string
  events: readonly WhatsNewEvent[]
  listings: ReadonlyMap<string, WhatsNewListingState>
  members: ReadonlyMap<string, ActivityActor>
  limit?: number
}

const time = (iso: string): number => Date.parse(iso)

/** Vrai si le membre a fait l'action lui-même, à l'écran. */
export function isOwnAppAction(
  event: Pick<WhatsNewEvent, 'actorMemberId' | 'channel'>,
  memberId: string
): boolean {
  return event.actorMemberId === memberId && event.channel === 'web'
}

/** La sorte de nouveauté d'un événement, ou null s'il n'en est pas une pour ce membre. */
export function whatsNewKindOf(
  event: WhatsNewEvent,
  memberId: string
): WhatsNewKind | null {
  if (isOwnAppAction(event, memberId)) return null
  const byOther =
    event.actorMemberId !== null && event.actorMemberId !== memberId
  switch (event.action) {
    case 'listing.created':
      return 'new_listing'
    case 'listing.price_changed':
      return 'price_change'
    case 'listing.updated': {
      const after = event.after as Record<string, unknown> | null
      const before = event.before as Record<string, unknown> | null
      return after &&
        typeof after === 'object' &&
        'price' in after &&
        after.price !== before?.price
        ? 'price_change'
        : null
    }
    case 'listing.status_changed':
      return 'status_change'
    case 'listing.checked': {
      // Lot 15 : seule une vérification qui a trouvé quelque chose compte ;
      // un prix changé est un changement de prix.
      const after = event.after as Record<string, unknown> | null
      const outcome = after?.outcome
      if (
        outcome !== 'changed' &&
        outcome !== 'offline' &&
        outcome !== 'republished'
      )
        return null
      const facts = after?.facts as Record<string, unknown> | null | undefined
      return facts && typeof facts === 'object' && 'price' in facts
        ? 'price_change'
        : 'listing_check'
    }
    case 'opinion.created':
    case 'opinion.updated':
      return byOther ? 'opinion' : null
    case 'task.created':
    case 'task.completed':
      return byOther ? 'task' : null
    case 'criteria.matched':
      return fitChangeFromListing(event.after) ? 'criteria_match' : null
    case 'criteria.unmatched':
      return fitChangeFromListing(event.after) ? 'criteria_exit' : null
    case 'agency_request.answered':
      // Lot 17 : une réponse de l'annonceur, enregistrée par l'autre membre
      // ou par Claude.
      return 'agency_answer'
    default:
      return null
  }
}

/**
 * Lot 14 : une entrée ou une sortie compte quand l'annonce a bougé (prix,
 * adresse, fiche) ; pas quand un membre a modifié un critère ou les
 * hypothèses (il voit l'effet à l'écran, ADR 0024) ni au rattrapage. Une
 * ligne antérieure au lot 14 n'a pas de cause : elle venait de l'annonce.
 */
export function fitChangeFromListing(after: unknown): boolean {
  if (typeof after !== 'object' || after === null) return true
  const cause = (after as Record<string, unknown>).cause
  return cause === undefined || cause === 'listing'
}

function itemOf(
  kind: WhatsNewKind,
  event: WhatsNewEvent,
  listingId: string,
  title: string,
  members: ReadonlyMap<string, ActivityActor>
): WhatsNewItem {
  const names: MemberNames = members
  const actor = event.actorMemberId
    ? (members.get(event.actorMemberId) ?? null)
    : null
  const who = activityActorName(event, names)
  const before = event.before as Record<string, unknown> | null
  const after = event.after as Record<string, unknown> | null
  const description = describeActivity(event, names)
  let summary = `${who} ${description.summary}`
  let from: string | null = null
  let to: string | null = null
  if (event.action === 'listing.checked') {
    // Lot 15 : le résumé de la vérification, prix avant et après s'il change.
    const facts = (record: Record<string, unknown> | null) =>
      (record?.facts as Record<string, unknown> | undefined) ?? undefined
    if (kind === 'price_change') {
      from = formatActivityValue('price', facts(before)?.price, names)
      to = formatActivityValue('price', facts(after)?.price, names)
    }
    const text = typeof after?.summary === 'string' ? after.summary : ''
    summary = `Vérifiée sur le portail par ${who} : ${text}`
  } else if (kind === 'new_listing') {
    summary = `Ajoutée par ${who}`
  } else if (kind === 'price_change') {
    from = formatActivityValue('price', before?.price, names)
    to = formatActivityValue('price', after?.price, names)
    summary = `Prix : ${from ?? '—'} → ${to ?? '—'} (${who})`
  } else if (kind === 'status_change') {
    from = formatActivityValue('status', before?.status, names)
    to = formatActivityValue('status', after?.status, names)
    summary = `Statut : ${from ?? '—'} → ${to ?? '—'} (${who})`
  } else if (kind === 'opinion') {
    to = activityChanges(null, after, names)
      .map(c => c.after)
      .filter(Boolean)
      .join(' — ')
    summary = `Avis de ${who}${to ? ` : ${to}` : ''}`
  } else if (kind === 'agency_answer') {
    const text = typeof after?.summary === 'string' ? after.summary : ''
    summary = `Réponse de l'annonceur enregistrée par ${who}${text ? ` : ${text}` : ''}`
  } else if (kind === 'criteria_match' || kind === 'criteria_exit') {
    summary =
      description.summary.charAt(0).toUpperCase() + description.summary.slice(1)
  }
  return {
    kind,
    listingId,
    listingTitle: title,
    at: new Date(event.createdAt).toISOString(),
    actor,
    channel: event.channel,
    summary,
    before: from,
    after: to,
  }
}

/** Le rapport « ce qui a changé » pour un membre. */
export function computeWhatsNew(input: WhatsNewInput): WhatsNewReport {
  const since = time(input.since)
  const items: WhatsNewItem[] = []
  const newListings = new Set<string>()
  const sorted = [...input.events].sort(
    (a, b) => time(a.createdAt) - time(b.createdAt)
  )
  for (const event of sorted) {
    if (!event.listingId) continue
    const listing = input.listings.get(event.listingId)
    if (!listing) continue
    const reference = Math.max(
      since,
      listing.seenAt ? time(listing.seenAt) : Number.NEGATIVE_INFINITY
    )
    if (!(time(event.createdAt) > reference)) continue
    const kind = whatsNewKindOf(event, input.memberId)
    if (!kind) continue
    // Une annonce nouvelle se lit en entier : ses autres changements n'en
    // sont pas, sauf son entrée dans un critère ou sa sortie.
    if (
      newListings.has(event.listingId) &&
      kind !== 'criteria_match' &&
      kind !== 'criteria_exit' &&
      kind !== 'new_listing'
    )
      continue
    if (kind === 'new_listing') newListings.add(event.listingId)
    items.push(
      itemOf(kind, event, event.listingId, listing.title, input.members)
    )
  }
  items.reverse()
  const counts = Object.fromEntries(
    WhatsNewKindSchema.options.map(kind => [
      kind,
      items.filter(item => item.kind === kind).length,
    ])
  ) as Record<WhatsNewKind, number>
  const byListing = new Map<string, WhatsNewListing>()
  for (const item of items) {
    const entry = byListing.get(item.listingId)
    if (entry) {
      entry.count += 1
      if (!entry.kinds.includes(item.kind)) entry.kinds.push(item.kind)
    } else {
      byListing.set(item.listingId, {
        listingId: item.listingId,
        title: item.listingTitle,
        kinds: [item.kind],
        count: 1,
        lastAt: item.at,
      })
    }
  }
  return {
    since: new Date(input.since).toISOString(),
    sinceSource: input.sinceSource,
    generatedAt: new Date(input.now).toISOString(),
    total: items.length,
    counts,
    items: items.slice(0, input.limit ?? 50),
    listings: [...byListing.values()],
  }
}

/**
 * Les champs d'une fiche modifiés par d'autres depuis sa dernière ouverture
 * par le membre : la matière de la mise en évidence dans la fiche. Les
 * sous-champs sont donnés avec leur parent (`rentalPlan.targetRent` et
 * `rentalPlan`).
 */
export function listingChangedFields(
  events: readonly WhatsNewEvent[],
  memberId: string,
  seenAt: string | null
): string[] {
  if (seenAt === null) return []
  const fields = new Set<string>()
  for (const event of events) {
    if (time(event.createdAt) <= time(seenAt)) continue
    if (isOwnAppAction(event, memberId)) continue
    switch (event.action) {
      case 'listing.updated':
      case 'listing.dpe_verified':
        for (const change of activityChanges(event.before, event.after)) {
          fields.add(change.field)
          const parent = change.field.split('.')[0]
          if (parent) fields.add(parent)
        }
        break
      case 'listing.price_changed':
        fields.add('price')
        break
      case 'listing.checked': {
        const before = event.before as Record<string, unknown> | null
        const after = event.after as Record<string, unknown> | null
        for (const change of activityChanges(
          before?.facts ?? null,
          after?.facts ?? null
        )) {
          fields.add(change.field)
        }
        break
      }
      case 'listing.status_changed':
        fields.add('status')
        break
      case 'listing.geocoded':
      case 'listing.relocated':
        fields.add('location')
        break
      default:
        break
    }
  }
  return [...fields].sort()
}

/** L'état « visite » d'un membre : dernière activité, point de départ des nouveautés. */
export interface VisitState {
  lastVisitAt: string | null
  whatsNewSince: string | null
  whatsNewSource: WhatsNewSinceSource | null
  memberCreatedAt: string
}

export interface VisitWindow {
  lastVisitAt: string
  since: string
  sinceSource: WhatsNewSinceSource
  newSession: boolean
}

/** Trente minutes sans activité ferment une visite. */
export const VISIT_SESSION_GAP_MS = 30 * 60 * 1000

/** Le point de départ courant, sans rien changer. */
export function currentWhatsNewSince(state: VisitState): {
  since: string
  sinceSource: WhatsNewSinceSource
} {
  return state.whatsNewSince
    ? {
        since: state.whatsNewSince,
        sinceSource: state.whatsNewSource ?? 'previous_visit',
      }
    : { since: state.memberCreatedAt, sinceSource: 'member_created' }
}

/**
 * Une visite de l'application à `now` : si la précédente est finie (plus de
 * `gapMs` sans activité), le point de départ avance à sa dernière activité ;
 * pendant une visite, il ne bouge pas (le bandeau reste jusqu'à « tout
 * marquer comme vu »).
 */
export function nextVisitWindow(
  state: VisitState,
  now: string,
  gapMs = VISIT_SESSION_GAP_MS
): VisitWindow {
  const current = currentWhatsNewSince(state)
  const newSession =
    state.lastVisitAt === null || time(now) - time(state.lastVisitAt) > gapMs
  if (
    newSession &&
    state.lastVisitAt !== null &&
    time(state.lastVisitAt) > time(current.since)
  ) {
    return {
      lastVisitAt: now,
      since: state.lastVisitAt,
      sinceSource: 'previous_visit',
      newSession,
    }
  }
  return {
    lastVisitAt: now,
    since: current.since,
    sinceSource: current.sinceSource,
    newSession,
  }
}
