import { DEFAULT_TASKS, LISTING_QUESTION_TEXTS } from '@apart/contracts'
import type {
  AgencyAnswer,
  AgencyAnswerValues,
  AgencyApprovalVia,
  AgencyChannel,
  AgencyRequestStatus,
  FieldProvenanceMap,
} from '@apart/contracts'
import {
  defaultAgencyMessage,
  planAgencyAnswer,
  questionText,
  recipientDisplayName,
  resolveSignature,
  sanitizeAnswerExcerpt,
} from '@apart/domain'
import type { AnswerableListing } from '@apart/domain'
import type {
  DemoActivity,
  DemoHandle,
  DemoListing,
  DemoMember,
  DemoTask,
} from './dataset.js'
import { demoId } from './ids.js'

/**
 * Lot 17 : les échanges fictifs avec des annonceurs, pour le jeu de démo.
 * Trois annonces : une demande envoyée par Claude (validée dans la
 * conversation) dont la réponse a rempli les charges et coché les tâches, la
 * taxe foncière restant proposée (elle contredit une saisie à la main) ; une
 * demande à valider ; une demande envoyée il y a douze jours, sans réponse
 * (relance due). Contacts fictifs (« Agence [Exemple] », domaine
 * `exemple.invalid`) ; textes et réponses par les règles de `domain`.
 */

export interface DemoContact {
  listingId: string
  agencyName: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  portalMessageUrl: string | null
  preferredChannel: AgencyChannel | null
  at: string
  by: DemoHandle
}

export interface DemoAgencyRequest {
  id: string
  listingId: string
  listingKey: string
  status: AgencyRequestStatus
  channel: AgencyChannel
  recipientName: string | null
  subject: string
  body: string
  taskIds: string[]
  by: DemoHandle
  createdVia: 'web' | 'mcp'
  createdAt: string
  approvedAt: string | null
  approvedVia: AgencyApprovalVia | null
  approvedBy: DemoHandle | null
  sentAt: string | null
  sentBy: DemoHandle | null
  threadRef: string | null
  answeredAt: string | null
  answers: AgencyAnswer[]
  closedAt: string | null
  followUpOfId: string | null
}

type Clock = (days: number, hour?: number, minute?: number) => string
type Log = (
  entry: Omit<DemoActivity, 'id' | 'before' | 'after'> & {
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
  }
) => void

interface RequestSpec {
  key: string
  listingKey: string
  /** Indices des tâches par défaut posées. */
  tasks: number[]
  channel: AgencyChannel
  by: DemoHandle
  via: 'web' | 'mcp'
  createdDays: [number, number, number?]
  approved?: {
    days: [number, number, number?]
    via: AgencyApprovalVia
    by: DemoHandle
  }
  sent?: { days: [number, number, number?]; by: DemoHandle; threadRef: string }
  answer?: {
    days: [number, number, number?]
    excerpt: string
    values: AgencyAnswerValues
    /** Champs corrigés à la main avant la réponse : la réponse y est proposée. */
    manual?: Array<keyof AgencyAnswerValues>
  }
}

interface ContactSpec {
  listingKey: string
  agencyName: string
  contactName?: string
  email?: string
  phone?: string
  portalMessageUrl?: string
  preferredChannel: AgencyChannel
  days: [number, number, number?]
  by: DemoHandle
  via: 'web' | 'mcp'
}

const CONTACTS: ContactSpec[] = [
  {
    listingKey: 'bastide-t2',
    agencyName: 'Agence [Exemple]',
    contactName: 'Mme [Exemple]',
    email: 'contact@agence.exemple.invalid',
    preferredChannel: 'email',
    days: [5, 9],
    by: 'demo',
    via: 'mcp',
  },
  {
    listingKey: 'merignac-t2',
    agencyName: 'Agence [Exemple] Mérignac',
    portalMessageUrl: 'https://exemple.invalid/messagerie/merignac-t2',
    preferredChannel: 'portal_message',
    days: [1, 10],
    by: 'demo2',
    via: 'web',
  },
  {
    listingKey: 'chartrons-t2',
    agencyName: 'Agence [Exemple] Chartrons',
    email: 'chartrons@agence.exemple.invalid',
    phone: '05 00 00 00 00',
    preferredChannel: 'email',
    days: [12, 9],
    by: 'demo',
    via: 'web',
  },
]

const REQUESTS: RequestSpec[] = [
  {
    // Envoyée par Claude après accord dans la conversation ; réponse reçue.
    key: 'bastide',
    listingKey: 'bastide-t2',
    tasks: [0, 1],
    channel: 'email',
    by: 'demo',
    via: 'mcp',
    createdDays: [5, 9, 5],
    approved: { days: [5, 9, 20], via: 'chat', by: 'demo' },
    sent: {
      days: [5, 9, 25],
      by: 'demo',
      threadRef: 'fil-gmail-fictif-bastide',
    },
    answer: {
      days: [2, 14],
      excerpt:
        'Bonjour, les charges de copropriété sont de 140 € par mois (budget prévisionnel 2026) et la dernière taxe foncière est de 1 020 €. Je reste à votre disposition au 05 00 00 00 99. Bien cordialement, Mme [Exemple]',
      values: { annualCharges: 1_680, propertyTax: 1_020 },
      manual: ['propertyTax'],
    },
  },
  {
    // Préparée par Claude ce matin, à valider.
    key: 'merignac',
    listingKey: 'merignac-t2',
    tasks: [2, 3],
    channel: 'portal_message',
    by: 'demo',
    via: 'mcp',
    createdDays: [0, 8],
  },
  {
    // Validée dans l'application, envoyée il y a douze jours : relance due.
    key: 'chartrons',
    listingKey: 'chartrons-t2',
    tasks: [3],
    channel: 'email',
    by: 'demo',
    via: 'web',
    createdDays: [12, 9, 10],
    approved: { days: [12, 9, 15], via: 'app', by: 'demo2' },
    sent: {
      days: [12, 10],
      by: 'demo',
      threadRef: 'fil-gmail-fictif-chartrons',
    },
  },
]

const at3 = (at: Clock, [d, h, m]: [number, number, number?]) =>
  at(d, h, m ?? 0)

function answerable(listing: DemoListing): AnswerableListing {
  const i = listing.input
  return {
    addressRaw: i.location.addressRaw,
    surface: i.surface,
    annualCharges: i.annualCharges,
    propertyTax: i.propertyTax,
    dpeClass: i.dpeClass,
    dpeConsumption: i.dpeConsumption,
    gesClass: i.gesClass,
    dpeDate: i.dpeDate,
    floor: i.floor,
    elevator: i.elevator,
    constructionYear: i.constructionYear,
    lotsCount: i.lotsCount,
    votedWorks: i.votedWorks,
    proceedings: i.proceedings,
    heatingType: i.heatingType,
    fieldSources: i.fieldSources,
  }
}

/**
 * Les contacts et demandes fictifs ; met à jour les annonces concernées
 * (valeurs de la réponse, provenance « agence », tâches demandées ou
 * cochées) et écrit le journal.
 */
export function buildAgencyExchanges(
  listings: DemoListing[],
  members: readonly DemoMember[],
  at: Clock,
  log: Log
): { contacts: DemoContact[]; agencyRequests: DemoAgencyRequest[] } {
  const byKey = new Map(listings.map(l => [l.key, l]))
  const signature = resolveSignature(
    null,
    members.map(m => m.displayName)
  )
  const contacts: DemoContact[] = CONTACTS.flatMap(spec => {
    const listing = byKey.get(spec.listingKey)
    if (!listing) return []
    const contact: DemoContact = {
      listingId: listing.id,
      agencyName: spec.agencyName,
      contactName: spec.contactName ?? null,
      email: spec.email ?? null,
      phone: spec.phone ?? null,
      portalMessageUrl: spec.portalMessageUrl ?? null,
      preferredChannel: spec.preferredChannel,
      at: at3(at, spec.days),
      by: spec.by,
    }
    log({
      at: contact.at,
      actor: spec.by,
      channel: spec.via,
      action: 'contact.updated',
      listingKey: spec.listingKey,
      // Jamais les coordonnées au journal : seulement les champs.
      before: { state: 'none' },
      after: {
        fields: (
          [
            'agencyName',
            'contactName',
            'email',
            'phone',
            'portalMessageUrl',
            'preferredChannel',
          ] as const
        ).filter(k => contact[k] !== null),
      },
    })
    return [contact]
  })
  const contactOf = new Map(contacts.map(c => [c.listingId, c]))

  const agencyRequests: DemoAgencyRequest[] = []
  for (const spec of REQUESTS) {
    const listing = byKey.get(spec.listingKey)
    if (!listing) continue
    const contact = contactOf.get(listing.id) ?? null
    const tasks = spec.tasks
      .map(index => listing.tasks.find(t => t.label === DEFAULT_TASKS[index]))
      .filter((t): t is DemoTask => t !== undefined && !t.done)
    const message = defaultAgencyMessage({
      listing: {
        title: listing.input.title,
        url: listing.input.url,
        externalId: listing.input.externalId,
        commune: listing.input.location.commune,
        price: listing.input.price,
      },
      contactName: contact?.contactName ?? null,
      questions: tasks.map(t =>
        t.field
          ? LISTING_QUESTION_TEXTS[t.field]
          : questionText({ label: t.label, field: null })
      ),
      signature,
    })
    const id = demoId(`agency-request:${spec.key}`)
    const createdAt = at3(at, spec.createdDays)
    const approvedAt = spec.approved ? at3(at, spec.approved.days) : null
    const sentAt = spec.sent ? at3(at, spec.sent.days) : null
    const request: DemoAgencyRequest = {
      id,
      listingId: listing.id,
      listingKey: listing.key,
      status: spec.answer
        ? 'answered'
        : spec.sent
          ? 'sent'
          : spec.approved
            ? 'approved'
            : 'draft',
      channel: spec.channel,
      recipientName: recipientDisplayName(contact),
      subject: message.subject,
      body: message.body,
      taskIds: tasks.map(t => t.id),
      by: spec.by,
      createdVia: spec.via,
      createdAt,
      approvedAt,
      approvedVia: spec.approved?.via ?? null,
      approvedBy: spec.approved?.by ?? null,
      sentAt,
      sentBy: spec.sent?.by ?? null,
      threadRef: spec.sent?.threadRef ?? null,
      answeredAt: null,
      answers: [],
      closedAt: null,
      followUpOfId: null,
    }
    log({
      at: createdAt,
      actor: spec.by,
      channel: spec.via,
      action: 'agency_request.drafted',
      listingKey: listing.key,
      after: { requestId: id, channel: spec.channel, taskIds: request.taskIds },
    })
    if (spec.approved && approvedAt) {
      log({
        at: approvedAt,
        actor: spec.approved.by,
        channel: spec.approved.via === 'chat' ? 'mcp' : 'web',
        action: 'agency_request.approved',
        listingKey: listing.key,
        after: { requestId: id, approvedVia: spec.approved.via },
      })
    }
    if (spec.sent && sentAt) {
      for (const task of tasks) {
        task.requestedAt = sentAt
        task.requestId = id
      }
      log({
        at: sentAt,
        actor: spec.sent.by,
        channel: 'mcp',
        action: 'agency_request.sent',
        listingKey: listing.key,
        after: {
          requestId: id,
          channel: spec.channel,
          taskIds: request.taskIds,
          approvedVia: request.approvedVia,
        },
      })
    }
    if (spec.answer) {
      const receivedAt = at3(at, spec.answer.days)
      // Un membre avait corrigé ces champs à la main avant la réponse.
      for (const key of spec.answer.manual ?? []) {
        listing.input.fieldSources = {
          ...listing.input.fieldSources,
          [key]: { source: 'user', recordedAt: createdAt },
        }
      }
      const plan = planAgencyAnswer({
        listing: answerable(listing),
        values: spec.answer.values,
        tasks: listing.tasks.map(t => ({
          id: t.id,
          label: t.label,
          field: t.field ?? null,
          done: t.done,
        })),
      })
      const excerpt = sanitizeAnswerExcerpt(spec.answer.excerpt)
      const applied = plan.changes.filter(c => c.disposition === 'applied')
      // Les valeurs appliquées entrent dans la fiche, provenance « agence ».
      const sources: FieldProvenanceMap = { ...listing.input.fieldSources }
      for (const change of applied) {
        ;(listing.input as unknown as Record<string, unknown>)[change.key] =
          change.after
        sources[change.key] = {
          source: 'agency',
          recordedAt: receivedAt,
          ...(excerpt ? { evidence: excerpt.slice(0, 300) } : {}),
        }
      }
      listing.input.fieldSources = sources
      for (const task of listing.tasks) {
        if (!plan.completedTaskIds.includes(task.id)) continue
        task.done = true
        task.doneAt = receivedAt
        task.answeredAt = receivedAt
        task.requestId ??= id
      }
      if (receivedAt > listing.updatedAt) listing.updatedAt = receivedAt
      request.answeredAt = receivedAt
      request.answers = [
        {
          receivedAt,
          recordedAt: receivedAt,
          authorId: demoId(`member:${spec.by}`),
          channel: 'mcp',
          excerpt,
          values: spec.answer.values,
          changes: plan.changes,
          completedTaskIds: plan.completedTaskIds,
          summary: plan.summary,
        },
      ]
      log({
        at: receivedAt,
        actor: spec.by,
        channel: 'mcp',
        action: 'agency_request.answered',
        listingKey: listing.key,
        before: {
          facts: Object.fromEntries(applied.map(c => [c.key, c.before])),
        },
        after: {
          requestId: id,
          summary: plan.summary,
          facts: Object.fromEntries(applied.map(c => [c.key, c.after])),
          proposed: plan.changes
            .filter(c => c.disposition === 'proposed')
            .map(c => c.key),
          completedTasks: listing.tasks
            .filter(t => plan.completedTaskIds.includes(t.id))
            .map(t => t.label),
        },
      })
    }
    agencyRequests.push(request)
  }
  return { contacts, agencyRequests }
}
