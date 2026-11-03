import {
  ACTIVITY_CHANNEL_LABELS,
  LEASE_TYPE_LABELS,
  LISTING_STATUS_LABELS,
  OFFER_CHANNEL_LABELS,
  OFFER_RESPONSE_LABELS,
  RENOVATION_LEVEL_LABELS,
  VISIT_STATUS_LABELS,
  activityKindOf,
  listingFieldLabel,
} from '@apart/contracts'
import type {
  ActivityActor,
  ActivityChange,
  ActivityChannel,
  ActivityKind,
} from '@apart/contracts'
import { formatEuros } from './format.js'

/**
 * Le journal d'activité en français (besoin S6) : à partir d'une ligne
 * brute (action, avant, après), une phrase (« a changé le statut ») et le
 * détail des champs modifiés, valeurs mises en forme (euros, m², dates,
 * libellés). Pur : l'API, le web et le MCP disent la même chose.
 */

/** Une ligne du journal telle que la base la garde. */
export interface ActivityRecord {
  action: string
  channel: ActivityChannel
  actorMemberId: string | null
  before: unknown
  after: unknown
}

export interface ActivityDescription {
  kind: ActivityKind
  /** La phrase, sans le nom de l'acteur (« a changé le statut »). */
  summary: string
  changes: ActivityChange[]
}

/** Ce que la description lit des membres : leur nom, par identifiant. */
export type MemberNames = ReadonlyMap<
  string,
  Pick<ActivityActor, 'displayName'>
>

const EURO_FIELDS = new Set([
  'price',
  'feesAmount',
  'annualCharges',
  'nonRecoverableChargesMonthly',
  'propertyTax',
  'furnitureValue',
  'targetRent',
  'marketRent',
  'amount',
  'counterAmount',
  'rent',
  'newPrice',
  'oldPrice',
])
const AREA_FIELDS = new Set(['surface', 'surfaceTotal'])
const DATE_FIELDS = new Set([
  'publishedAt',
  'sourceUpdatedAt',
  'dpeDate',
  'visitedAt',
  'observedAt',
  'madeAt',
  'respondedAt',
  'effectiveFrom',
])
/** Champs techniques qui ne disent rien à un lecteur. */
const HIDDEN_FIELDS = new Set([
  'provenance',
  'fieldSources',
  'id',
  'taskId',
  'offerId',
  'visitId',
  'photoId',
  'impact',
  'expectedUpdatedAt',
  'expectedPrice',
  'expectedStatus',
  'expectedResponse',
])

const TRI_STATE: Record<string, string> = {
  yes: 'oui',
  no: 'non',
  unknown: 'à vérifier',
}
const ENUM_LABELS: Record<string, Record<string, string>> = {
  status: LISTING_STATUS_LABELS,
  response: OFFER_RESPONSE_LABELS,
  leaseType: LEASE_TYPE_LABELS,
  level: RENOVATION_LEVEL_LABELS,
  feesPayer: { buyer: 'acquéreur', seller: 'vendeur' },
  rentControl: { auto: 'automatique', yes: 'oui', no: 'non' },
  demand: { strong: 'forte', medium: 'moyenne', weak: 'faible' },
  coOwnershipAllowsRental: TRI_STATE,
  decencyCompliant: TRI_STATE,
  rentalPermitRequired: TRI_STATE,
  precision: {
    exact: 'adresse exacte',
    street: 'rue',
    district: 'quartier',
    commune: 'commune',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Une date ISO en date française (fuseau de Paris), heure comprise si elle compte. */
export function formatActivityDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  return date.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  })
}

/** Une valeur du journal en texte lisible ; null pour « vide ». */
export function formatActivityValue(
  field: string,
  value: unknown,
  members: MemberNames = new Map()
): string | null {
  if (value === null || value === undefined || value === '') return null
  if (field === 'assigneeId' && typeof value === 'string') {
    return members.get(value)?.displayName ?? 'un membre'
  }
  if (field === 'participantIds' && Array.isArray(value)) {
    if (value.length === 0) return null
    return value
      .map(id =>
        typeof id === 'string'
          ? (members.get(id)?.displayName ?? 'un membre')
          : '?'
      )
      .join(', ')
  }
  if (field === 'rating' && typeof value === 'number') {
    return value > 0 ? `${value}/5` : 'sans note'
  }
  if (field === 'status' && typeof value === 'string') {
    return (
      LISTING_STATUS_LABELS[value as keyof typeof LISTING_STATUS_LABELS] ??
      (VISIT_STATUS_LABELS as Record<string, string>)[value] ??
      value
    )
  }
  if (field === 'channel' && typeof value === 'string') {
    return (OFFER_CHANNEL_LABELS as Record<string, string>)[value] ?? value
  }
  const labels = ENUM_LABELS[field]
  if (labels && typeof value === 'string') return labels[value] ?? value
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') {
    if (EURO_FIELDS.has(field)) return formatEuros(value)
    if (AREA_FIELDS.has(field))
      return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m²`
    if (field === 'referenceRentPerM2')
      return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/m²`
    if (field === 'feesPercent')
      return `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
    return value.toLocaleString('fr-FR', { maximumFractionDigits: 4 })
  }
  if (typeof value === 'string') {
    return DATE_FIELDS.has(field) ? formatActivityDate(value) : truncate(value)
  }
  if (Array.isArray(value)) {
    if (field === 'items') {
      const total = value.reduce<number>(
        (sum, item) =>
          sum +
          (isRecord(item) && typeof item.amount === 'number' ? item.amount : 0),
        0
      )
      return `${value.length} poste(s)${total > 0 ? `, ${formatEuros(total)}` : ''}`
    }
    return value.length === 0 ? null : `${value.length} élément(s)`
  }
  if (isRecord(value)) {
    if (value.type === 'Point' && Array.isArray(value.coordinates)) {
      const [lng, lat] = value.coordinates as number[]
      return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
    }
    if (
      typeof value.addressRaw === 'string' ||
      typeof value.commune === 'string'
    )
      return (
        [value.addressRaw, value.commune].filter(Boolean).join(', ') || null
      )
    return 'modifié'
  }
  return truncate(String(value))
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Les champs qui changent entre `before` et `after` : les clés de `after`
 * (un patch ne porte que ce qu'il change), en descendant d'un niveau dans
 * les sous-objets (localisation, phase 2, travaux).
 */
export function activityChanges(
  before: unknown,
  after: unknown,
  members: MemberNames = new Map(),
  prefix = ''
): ActivityChange[] {
  if (!isRecord(after)) return []
  const previous = isRecord(before) ? before : {}
  const changes: ActivityChange[] = []
  for (const [key, next] of Object.entries(after)) {
    if (HIDDEN_FIELDS.has(key)) continue
    const old = previous[key]
    if (sameValue(old, next)) continue
    const field = prefix ? `${prefix}.${key}` : key
    const nested =
      !prefix &&
      (isRecord(next) || isRecord(old)) &&
      !(isRecord(next) && next.type === 'Point')
    if (nested) {
      const inner = activityChanges(
        isRecord(old) ? old : {},
        isRecord(next)
          ? next
          : Object.fromEntries(
              Object.keys(isRecord(old) ? old : {}).map(k => [k, null])
            ),
        members,
        key
      )
      if (inner.length > 0) {
        changes.push(
          ...inner.map(change => ({
            ...change,
            label: `${listingFieldLabel(key)} · ${change.label}`,
          }))
        )
        continue
      }
    }
    changes.push({
      field,
      label: listingFieldLabel(key),
      before: formatActivityValue(key, old, members),
      after: formatActivityValue(key, next, members),
    })
  }
  return changes
}

function text(record: unknown, key: string): string | null {
  return isRecord(record) && typeof record[key] === 'string'
    ? (record[key] as string)
    : null
}
function num(record: unknown, key: string): number | null {
  return isRecord(record) && typeof record[key] === 'number'
    ? (record[key] as number)
    : null
}
function quoted(value: string | null): string {
  return value ? ` « ${truncate(value, 80)} »` : ''
}
function criteriaNames(record: unknown): string {
  const list =
    isRecord(record) && Array.isArray(record.criteria) ? record.criteria : []
  const names = list
    .map(c =>
      isRecord(c) && typeof c.name === 'string' ? `« ${c.name} »` : null
    )
    .filter(Boolean)
  return names.join(', ')
}

/** La phrase et le détail d'une ligne du journal. */
export function describeActivity(
  record: ActivityRecord,
  members: MemberNames = new Map()
): ActivityDescription {
  const { action, before, after } = record
  const kind = activityKindOf(action)
  const change = (
    field: string,
    from: unknown,
    to: unknown
  ): ActivityChange => ({
    field,
    label: listingFieldLabel(field),
    before: formatActivityValue(field, from, members),
    after: formatActivityValue(field, to, members),
  })
  const describe = (summary: string, changes: ActivityChange[] = []) => ({
    kind,
    summary,
    changes,
  })
  switch (action) {
    case 'listing.created': {
      const how =
        text(after, 'provenance') === 'ai' ? ' (fiche lue par l’IA)' : ''
      return describe(
        `a ajouté l'annonce${how}`,
        [change('price', null, num(after, 'price'))].filter(
          c => c.after !== null
        )
      )
    }
    case 'listing.updated':
      return describe(
        "a modifié l'annonce",
        activityChanges(before, after, members)
      )
    case 'listing.status_changed': {
      const changes = [
        change('status', text(before, 'status'), text(after, 'status')),
      ]
      const reason = text(after, 'reason')
      if (reason) changes.push(change('discardReason', null, reason))
      return describe('a changé le statut', changes)
    }
    case 'listing.price_changed':
      return describe('a enregistré un nouveau prix', [
        change('price', num(before, 'price'), num(after, 'price')),
      ])
    case 'listing.geocoded':
      return describe(
        "a relancé le géocodage de l'adresse",
        [
          change(
            'precision',
            text(before, 'precision'),
            text(after, 'precision')
          ),
        ].filter(c => c.before !== c.after)
      )
    case 'listing.enriched':
      return describe('données ouvertes mises à jour (tram, plafond, marché)')
    case 'listing.dpe_verified':
      return describe(
        'a retenu le DPE vérifié auprès de l’ADEME',
        activityChanges(before, after, members)
      )
    case 'task.created': {
      const assignee = text(after, 'assigneeId')
      return describe(
        `a ajouté la tâche${quoted(text(after, 'label'))}${assignee ? `, assignée à ${formatActivityValue('assigneeId', assignee, members)}` : ''}`
      )
    }
    case 'task.completed':
      return describe(`a coché la tâche${quoted(text(before, 'label'))}`)
    case 'task.reopened':
      return describe(`a décoché la tâche${quoted(text(before, 'label'))}`)
    case 'task.updated':
      return describe(
        `a modifié la tâche${quoted(text(before, 'label'))}`,
        activityChanges(before, after, members)
      )
    case 'task.deleted':
      return describe(`a supprimé la tâche${quoted(text(before, 'label'))}`)
    case 'opinion.created':
    case 'opinion.updated':
      return describe(
        action === 'opinion.created'
          ? 'a donné son avis'
          : 'a modifié son avis',
        activityChanges(before, after, members)
      )
    case 'offer.created':
      return describe(
        `a enregistré une offre de ${formatEuros(num(after, 'amount') ?? 0)}`,
        activityChanges(null, after, members).filter(c => c.field !== 'amount')
      )
    case 'offer.updated': {
      const response = text(after, 'response')
      const label = response
        ? (OFFER_RESPONSE_LABELS as Record<string, string>)[response]
        : null
      return describe(
        text(before, 'response') !== response && label
          ? `a enregistré la réponse du vendeur : ${label.toLowerCase()}`
          : "a modifié l'offre",
        activityChanges(before, after, members)
      )
    }
    case 'criteria.matched':
      return describe(`l'annonce entre dans le critère ${criteriaNames(after)}`)
    case 'criteria.unmatched':
      return describe(`l'annonce sort du critère ${criteriaNames(before)}`)
    case 'criteria.created':
      return describe(`a créé le critère${quoted(text(after, 'name'))}`)
    case 'criteria.updated':
      return describe(
        `a modifié le critère${quoted(text(before, 'name'))}`,
        activityChanges(before, after, members).filter(
          c => !c.field.startsWith('filters.')
        )
      )
    case 'criteria.deleted':
      return describe(`a supprimé le critère${quoted(text(before, 'name'))}`)
    case 'ai.extraction': {
      const cost = num(after, 'estimatedCostUsd')
      return describe(
        `a lancé une extraction par IA${cost !== null ? ` (≈ ${cost.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} $)` : ''}`
      )
    }
    case 'assumptions.updated':
      return describe(
        'a modifié les hypothèses',
        activityChanges(before, after, members)
      )
    case 'scenario.created':
      return describe(`a enregistré le scénario${quoted(text(after, 'name'))}`)
    case 'scenario.updated':
      return describe(`a modifié le scénario${quoted(text(before, 'name'))}`)
    case 'scenario.deleted':
      return describe(`a supprimé le scénario${quoted(text(before, 'name'))}`)
    case 'rent_comparable.created':
      return describe(
        `a ajouté un loyer comparable (${formatEuros(num(after, 'rent') ?? 0)}/mois, ${num(after, 'surface') ?? '?'} m²)`
      )
    case 'rent_comparable.updated':
      return describe(
        'a modifié un loyer comparable',
        activityChanges(before, after, members)
      )
    case 'rent_comparable.deleted':
      return describe('a supprimé un loyer comparable')
    case 'visit.created': {
      const at = text(after, 'visitedAt')
      const planned = text(after, 'status') === 'planned'
      return describe(
        `${planned ? 'a planifié une visite' : 'a ajouté le compte rendu d’une visite'}${at ? ` le ${formatActivityDate(at)}` : ''}`,
        activityChanges(null, after, members).filter(
          c =>
            c.field !== 'visitedAt' &&
            c.field !== 'status' &&
            c.field !== 'createPrepTask'
        )
      )
    }
    case 'visit.updated':
      return describe(
        'a modifié une visite',
        activityChanges(before, after, members)
      )
    case 'visit.deleted':
      return describe('a supprimé une visite')
    case 'visit.photo_added':
      return describe('a ajouté une photo de visite')
    case 'visit.photo_deleted':
      return describe('a supprimé une photo de visite')
    case 'draft.received': {
      const count = num(after, 'created') ?? 0
      return describe(
        `${count} annonce(s) reçue(s) par e-mail${quoted(text(after, 'subject'))}`
      )
    }
    case 'draft.accepted':
      return describe('a validé une annonce reçue par e-mail')
    case 'draft.dismissed':
      return describe('a écarté une annonce reçue par e-mail')
    default:
      return describe(action, activityChanges(before, after, members))
  }
}

/** « Chloé », « Claude (MCP, pour Richard) », « Import », « Système ». */
export function activityActorName(
  record: Pick<ActivityRecord, 'channel' | 'actorMemberId'>,
  members: MemberNames = new Map()
): string {
  const name = record.actorMemberId
    ? (members.get(record.actorMemberId)?.displayName ?? 'Un membre')
    : null
  if (record.channel === 'mcp')
    return name ? `Claude (MCP, pour ${name})` : 'Claude (MCP)'
  if (name) return name
  return ACTIVITY_CHANNEL_LABELS[record.channel]
}
