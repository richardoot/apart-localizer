import { STAGE_STATUSES, WORKFLOW_STAGES } from '@apart/contracts'
import type {
  ActivityChannel,
  CriteriaFitKept,
  CriteriaFitLevel,
  DecisionMemberRef,
  DecisionProposal,
  ListingStageFacts,
  ListingStatus,
  OfferResponse,
  OpinionSummary,
  WorkflowAgendaItem,
  WorkflowOverview,
  WorkflowStage,
  WorkflowStageCount,
} from '@apart/contracts'
import { parisDay } from './agency-requests.js'
import { inMainFitTab } from './criteria-fit.js'
import { decisionJournalOf } from './decision-activity.js'
import { agreementRequired, stageOfStatus, waitingLabel } from './decisions.js'
import { joinFrench } from './exploration.js'
import { visitWhen } from './listing-overview.js'
import { isOverdueTask, isTrackedStatus, openTaskCounts } from './open-tasks.js'
import { TASK_OVERDUE_DAYS } from './summary.js'

/**
 * Lot 21 (ADR 0031) : les étapes de la page Annonces. Quelle étape pour quel
 * statut, ce que chaque ligne affiche d'état (À trier, En attente de …, À
 * confirmer, À trancher, Sans date…), l'ordre d'une étape, les compteurs de
 * la barre et « Ce qui t'attend », propre au membre connecté, sans jamais
 * dire une note masquée (avis à l'aveugle du lot 20). Pur.
 */

export { stageOfStatus }

/** Les statuts d'une étape d'annonces ; aucun pour « À valider ». */
export function statusesOfStage(stage: WorkflowStage): ListingStatus[] {
  return stage === 'a-valider' ? [] : [...STAGE_STATUSES[stage]]
}

/** Vrai si la valeur est un identifiant d'étape. */
export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return (
    typeof value === 'string' &&
    (WORKFLOW_STAGES as readonly string[]).includes(value)
  )
}

/** L'état affiché sur la ligne d'une annonce ou d'un brouillon. */
export type StageRowKind =
  | 'to_sort'
  | 'waiting'
  | 'to_confirm'
  | 'to_settle'
  | 'ready'
  | 'no_date'
  | 'visit_planned'
  | 'to_rate'
  | 'to_discuss'
  | 'opinions_complete'
  | 'opinions_waiting'
  | 'offer_pending'
  | 'offer_accepted'
  | 'offer_counter'
  | 'archived_discarded'
  | 'archived_refused'
  | 'archived_sold'

/** L'état d'une ligne d'après sa proposition (aucune : à trier). */
export function decisionRowKind(
  decision: DecisionProposal | null
): StageRowKind {
  if (!decision) return 'to_sort'
  if (decision.state === 'to_settle') return 'to_settle'
  if (decision.viewer.canRespond) return 'to_confirm'
  if (decision.viewer.canDecideNow && decision.viewer.nobodyLeft) return 'ready'
  return 'waiting'
}

/** Ce que l'état d'une ligne d'annonce lit. */
export interface StageRowListing {
  status: ListingStatus
  decision: DecisionProposal | null
  stage: ListingStageFacts | null
  /** Les offres, de la plus récente à la plus ancienne. */
  offers: readonly { response: OfferResponse }[]
  opinionSummary: OpinionSummary | null
}

/** L'état d'une ligne d'annonce à son étape. */
export function listingRowKind(listing: StageRowListing): StageRowKind {
  if (listing.decision) return decisionRowKind(listing.decision)
  switch (listing.status) {
    case 'to_study':
      return 'to_sort'
    case 'to_visit':
      return listing.stage?.nextVisitAt ? 'visit_planned' : 'no_date'
    case 'visited': {
      const summary = listing.opinionSummary
      if (summary && !summary.viewerRated) return 'to_rate'
      if (summary?.disagreementKeys.length) return 'to_discuss'
      return summary?.status === 'pending'
        ? 'opinions_waiting'
        : 'opinions_complete'
    }
    case 'offer_made':
    case 'offer_accepted': {
      if (listing.status === 'offer_accepted') return 'offer_accepted'
      return listing.offers[0]?.response === 'counter_offer'
        ? 'offer_counter'
        : 'offer_pending'
    }
    case 'offer_refused':
      return 'archived_refused'
    case 'sold_or_withdrawn':
      return 'archived_sold'
    default:
      return 'archived_discarded'
  }
}

/** La pastille d'une ligne. */
export function stageRowPill(
  kind: StageRowKind,
  decision: DecisionProposal | null
): string {
  switch (kind) {
    case 'to_sort':
      return 'À trier'
    case 'waiting':
      return decision ? waitingLabel(decision) : 'En attente'
    case 'ready':
      return 'Plus personne à attendre'
    case 'to_confirm':
      return 'À confirmer'
    case 'to_settle':
      return 'À trancher'
    case 'no_date':
      return 'Sans date'
    case 'visit_planned':
      return 'Visite prévue'
    case 'to_rate':
      return 'À toi de noter'
    case 'to_discuss':
      return 'À rediscuter'
    case 'opinions_complete':
      return 'Avis complets'
    case 'opinions_waiting':
      return 'Avis en attente'
    case 'offer_pending':
      return 'Réponse attendue'
    case 'offer_accepted':
      return 'Offre acceptée'
    case 'offer_counter':
      return 'Contre-proposition'
    case 'archived_refused':
      return 'Offre refusée'
    case 'archived_sold':
      return 'Vendue'
    case 'archived_discarded':
      return 'Écartée'
  }
}

/** Ce que le bouton d'une ligne ouvre. */
export type StageRowActionKind =
  | 'sort'
  | 'open'
  | 'confirm'
  | 'settle'
  | 'plan'
  | 'prepare'
  | 'rate'
  | 'opinions'
  | 'follow'
  | 'rescue'

export interface StageRowAction {
  kind: StageRowActionKind
  label: string
}

/** Le bouton d'une ligne. */
export function stageRowAction(kind: StageRowKind): StageRowAction {
  switch (kind) {
    case 'to_sort':
      return { kind: 'sort', label: 'Trier' }
    case 'to_confirm':
      return { kind: 'confirm', label: 'Confirmer' }
    case 'to_settle':
      return { kind: 'settle', label: 'Trancher' }
    case 'no_date':
      return { kind: 'plan', label: 'Planifier' }
    case 'visit_planned':
      return { kind: 'prepare', label: 'Préparer' }
    case 'to_rate':
      return { kind: 'rate', label: 'Donner mon avis' }
    case 'to_discuss':
    case 'opinions_complete':
    case 'opinions_waiting':
      return { kind: 'opinions', label: 'Voir nos avis' }
    case 'offer_pending':
    case 'offer_accepted':
    case 'offer_counter':
      return { kind: 'follow', label: 'Suivre' }
    case 'archived_discarded':
    case 'archived_refused':
      return { kind: 'rescue', label: 'Repêcher' }
    default:
      return { kind: 'open', label: 'Voir' }
  }
}

const KIND_RANK: Record<StageRowKind, number> = {
  to_sort: 0,
  to_confirm: 3,
  to_settle: 4,
  waiting: 2,
  ready: 1,
  no_date: 0,
  visit_planned: 1,
  to_rate: 0,
  to_discuss: 1,
  opinions_waiting: 2,
  opinions_complete: 3,
  offer_pending: 0,
  offer_counter: 1,
  offer_accepted: 2,
  archived_discarded: 0,
  archived_refused: 0,
  archived_sold: 0,
}

/** Ce que l'ordre d'une étape lit d'une ligne. */
export interface StageRowOrder {
  kind: StageRowKind
  nextVisitAt: string | null
  archivedAt: string | null
}

const time = (iso: string | null): number =>
  iso === null ? Number.NaN : new Date(iso).getTime()

/**
 * L'ordre d'une étape, stable (les lignes d'un même rang gardent l'ordre
 * reçu) : à trier d'abord, puis ce qu'on attend, à confirmer et à trancher ;
 * À visiter : sans date d'abord, puis par date de visite ; Archives : les
 * plus récentes d'abord.
 */
export function orderStageRows<T extends StageRowOrder>(
  stage: WorkflowStage,
  rows: readonly T[]
): T[] {
  const rank = (row: T): number => KIND_RANK[row.kind]
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (stage === 'a-visiter') {
        const aDated = a.row.nextVisitAt !== null
        const bDated = b.row.nextVisitAt !== null
        if (aDated !== bDated) return aDated ? 1 : -1
        if (aDated && bDated) {
          const diff = time(a.row.nextVisitAt) - time(b.row.nextVisitAt)
          if (diff !== 0) return diff
        }
      } else if (stage === 'archives') {
        const diff =
          (time(b.row.archivedAt) || 0) - (time(a.row.archivedAt) || 0)
        if (diff !== 0) return diff
      } else {
        const diff = rank(a.row) - rank(b.row)
        if (diff !== 0) return diff
      }
      return a.index - b.index
    })
    .map(entry => entry.row)
}

/** L'adéquation d'une ligne : hors critères et pas gardée = repliée en bas. */
export function isOutOfCriteria(
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null } | null
): boolean {
  return fit !== null && !inMainFitTab(fit)
}

/**
 * Repliée en bas de l'étape : hors critères, sans proposition en cours (une
 * décision à prendre reste visible, sinon on ne la verrait plus).
 */
export function isFoldedOut(
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null } | null,
  decision: DecisionProposal | null
): boolean {
  return decision === null && isOutOfCriteria(fit)
}

/** Vrai si le point est dans le rayon (distance à vol d'oiseau, formule de haversine). */
export function isWithinRadius(
  point: { coordinates: readonly [number, number] },
  near: { longitude: number; latitude: number; radiusMeters: number }
): boolean {
  const EARTH_RADIUS_METERS = 6_371_000
  const rad = (degrees: number): number => (degrees * Math.PI) / 180
  const [longitude, latitude] = point.coordinates
  const dLat = rad(near.latitude - latitude)
  const dLng = rad(near.longitude - longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(latitude)) *
      Math.cos(rad(near.latitude)) *
      Math.sin(dLng / 2) ** 2
  const distance = 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
  return distance <= near.radiusMeters
}

/** Une annonce suivie telle que les compteurs la lisent. */
export interface WorkflowListingFact {
  id: string
  status: ListingStatus
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null }
  plannedVisits: number
  /** Le membre connecté a noté cette annonce. */
  viewerRated: boolean
  /** La dernière offre, s'il y en a une. */
  lastOffer: OfferResponse | null
  decision: DecisionProposal | null
}

/** Un brouillon en attente tel que les compteurs le lisent. */
export interface WorkflowDraftFact {
  id: string
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null } | null
  decision: DecisionProposal | null
}

/** Lot 23 : une visite planifiée de l'espace (date ISO). */
export interface WorkflowVisitFact {
  listingId: string
  visitedAt: string
}

/** Lot 23 : une tâche d'une annonce de l'espace. */
export interface WorkflowTaskFact {
  listingId: string
  done: boolean
  createdAt: string
}

/** Lot 23 : un message à l'annonceur qui attend un membre. */
export interface WorkflowAgencyFact {
  listingId: string
  /** À valider (brouillon), ou relance due (jours ouvrés, calculée par le serveur). */
  kind: 'to_approve' | 'follow_up_due'
}

export interface WorkflowOverviewInput {
  viewerId: string
  decideTogether: boolean
  activeMembers: readonly DecisionMemberRef[]
  listings: readonly WorkflowListingFact[]
  drafts: readonly WorkflowDraftFact[]
  /** Les propositions ouvertes ou à trancher, lues par ce membre. */
  proposals: readonly DecisionProposal[]
  /** Les brouillons écartés : ils comptent dans les archives. */
  dismissedDrafts?: number
  /** Lot 23 : « maintenant » (visites à venir, tâches en retard). */
  now?: Date
  /** Lot 23 : les visites planifiées (pas encore faites). */
  plannedVisits?: readonly WorkflowVisitFact[]
  /** Lot 23 : les tâches des annonces (ouvertes et faites). */
  tasks?: readonly WorkflowTaskFact[]
  /** Lot 23 : les messages à valider et les relances dues. */
  agency?: readonly WorkflowAgencyFact[]
  /** Lot 23 : au-delà, une tâche ouverte est en retard (14 jours par défaut). */
  overdueDays?: number
}

const plural = (n: number, one: string, many: string): string =>
  n > 1 ? many : one

function stageSub(
  stage: WorkflowStage,
  counts: { total: number; toSort: number; noDate: number; toRate: number },
  offersPending: number
): string {
  switch (stage) {
    case 'a-valider':
    case 'a-etudier':
      return counts.toSort > 0 ? `${counts.toSort} à trier` : 'Rien à trier'
    case 'a-visiter':
      return counts.noDate > 0
        ? `${counts.noDate} sans date`
        : counts.total > 0
          ? 'Toutes datées'
          : 'Rien de prévu'
    case 'visitees':
      return counts.toRate > 0
        ? `${counts.toRate} avis à donner`
        : counts.total > 0
          ? 'Avis donnés'
          : 'Aucune encore'
    case 'offres':
      return offersPending > 0
        ? offersPending > 1
          ? `${offersPending} réponses attendues`
          : 'Réponse attendue'
        : counts.total > 0
          ? 'Rien en attente'
          : 'Aucune en cours'
    case 'archives':
      return 'Écartées, refusées, vendues'
  }
}

/** Le texte « après l'autre » du bandeau. */
function confirmLabel(others: readonly DecisionMemberRef[]): string {
  return others.length === 1
    ? `à confirmer après ${others[0]?.displayName}`
    : 'à confirmer après les autres'
}

/** L'annonce d'une ligne quand toute la ligne n'en vise qu'une ; null sinon. */
function onlyListing(ids: readonly (string | null)[]): string | null {
  const set = new Set(ids)
  if (set.size !== 1) return null
  return [...set][0] ?? null
}

/** Ce que « Ce qui t'attend » compte, ligne par ligne. */
interface AgendaInput {
  toSort: { 'a-valider': number; 'a-etudier': number }
  toConfirm: readonly DecisionProposal[]
  toSettle: readonly DecisionProposal[]
  ready: readonly DecisionProposal[]
  visitsToPlan: readonly string[]
  opinionsToGive: readonly string[]
  others: readonly DecisionMemberRef[]
  /** Lot 24 : les visites planifiées d'aujourd'hui (heure de Paris). */
  today: readonly WorkflowVisitFact[]
  upcoming: readonly WorkflowVisitFact[]
  toApprove: readonly string[]
  followUps: readonly string[]
  overdue: readonly string[]
  overdueDays: number
}

const item = (
  value: Omit<WorkflowAgendaItem, 'detail' | 'listingId'> &
    Partial<Pick<WorkflowAgendaItem, 'detail' | 'listingId'>>
): WorkflowAgendaItem => ({ detail: null, listingId: null, ...value })

/**
 * « Ce qui t'attend » : ce qui demande quelque chose au membre connecté,
 * dans l'ordre du bandeau. Les décisions d'abord (trier, confirmer,
 * trancher, finaliser), puis les visites (à venir, à planifier), les avis à
 * donner, les messages à valider, les relances dues et les tâches en
 * retard. Aucune note n'y entre : « avis à donner » ne lit que « a noté ou
 * non » pour le membre connecté.
 */
function agendaOf(input: AgendaInput): WorkflowAgendaItem[] {
  const items: WorkflowAgendaItem[] = []
  const totalToSort = input.toSort['a-valider'] + input.toSort['a-etudier']
  if (totalToSort > 0) {
    items.push(
      item({
        key: 'to_sort',
        count: totalToSort,
        label: 'à trier',
        stage: input.toSort['a-valider'] > 0 ? 'a-valider' : 'a-etudier',
      })
    )
  }
  if (input.toConfirm.length > 0) {
    items.push(
      item({
        key: 'to_confirm',
        count: input.toConfirm.length,
        label: confirmLabel(input.others),
        stage: null,
      })
    )
  }
  if (input.toSettle.length > 0) {
    items.push(
      item({
        key: 'to_settle',
        count: input.toSettle.length,
        label: 'à trancher ensemble',
        stage: null,
      })
    )
  }
  if (input.ready.length > 0) {
    items.push(
      item({
        key: 'ready',
        count: input.ready.length,
        label: 'à finaliser',
        stage: input.ready[0]?.fromStage ?? null,
        listingId: onlyListing(input.ready.map(p => p.listingId)),
      })
    )
  }
  if (input.today.length > 0) {
    const next = input.today[0] as WorkflowVisitFact
    const when = visitWhen(next.visitedAt)
    const hour = when.slice(when.indexOf(',') + 2)
    items.push(
      item({
        key: 'visit_today',
        count: input.today.length,
        label: plural(
          input.today.length,
          'visite aujourd’hui',
          'visites aujourd’hui'
        ),
        stage: 'a-visiter',
        detail: input.today.length > 1 ? `première à ${hour}` : `à ${hour}`,
        listingId: onlyListing(input.today.map(v => v.listingId)),
      })
    )
  }
  if (input.upcoming.length > 0) {
    const next = input.upcoming[0] as WorkflowVisitFact
    const when = visitWhen(next.visitedAt)
    items.push(
      item({
        key: 'upcoming_visits',
        count: input.upcoming.length,
        label: plural(
          input.upcoming.length,
          'visite à venir',
          'visites à venir'
        ),
        stage: 'a-visiter',
        detail: input.upcoming.length > 1 ? `prochaine : ${when}` : when,
        listingId: onlyListing(input.upcoming.map(v => v.listingId)),
      })
    )
  }
  if (input.visitsToPlan.length > 0) {
    items.push(
      item({
        key: 'visits_to_plan',
        count: input.visitsToPlan.length,
        label: plural(
          input.visitsToPlan.length,
          'visite à planifier',
          'visites à planifier'
        ),
        stage: 'a-visiter',
        listingId: onlyListing(input.visitsToPlan),
      })
    )
  }
  if (input.opinionsToGive.length > 0) {
    items.push(
      item({
        key: 'opinions_to_give',
        count: input.opinionsToGive.length,
        label: 'avis à donner',
        stage: 'visitees',
        listingId: onlyListing(input.opinionsToGive),
      })
    )
  }
  if (input.toApprove.length > 0) {
    items.push(
      item({
        key: 'messages_to_approve',
        count: input.toApprove.length,
        label: plural(
          input.toApprove.length,
          'message à valider',
          'messages à valider'
        ),
        stage: null,
        detail:
          input.toApprove.length > 1
            ? 'avant que Claude les envoie aux agences'
            : 'avant que Claude l’envoie à l’agence',
        listingId: onlyListing(input.toApprove),
      })
    )
  }
  if (input.followUps.length > 0) {
    items.push(
      item({
        key: 'follow_ups_due',
        count: input.followUps.length,
        label: plural(input.followUps.length, 'relance due', 'relances dues'),
        stage: null,
        detail: 'une agence n’a pas répondu',
        listingId: onlyListing(input.followUps),
      })
    )
  }
  if (input.overdue.length > 0) {
    items.push(
      item({
        key: 'overdue_tasks',
        count: input.overdue.length,
        label: plural(
          input.overdue.length,
          'tâche en retard',
          'tâches en retard'
        ),
        stage: null,
        detail: `ouvertes depuis plus de ${input.overdueDays} jours`,
        listingId: onlyListing(input.overdue),
      })
    )
  }
  return items
}

/**
 * Lot 23 : le verbe du bouton d'une ligne de « Ce qui t'attend » sur
 * l'accueil (ce que la ligne ouvre).
 */
export function agendaActionLabel(key: WorkflowAgendaItem['key']): string {
  switch (key) {
    case 'to_sort':
      return 'Trier'
    case 'to_confirm':
      return 'Confirmer'
    case 'to_settle':
      return 'Trancher'
    case 'ready':
      return 'Finaliser'
    case 'visit_today':
      return 'Mode visite'
    case 'upcoming_visits':
      return 'Préparer'
    case 'visits_to_plan':
      return 'Planifier'
    case 'opinions_to_give':
      return 'Donner mon avis'
    case 'messages_to_approve':
      return 'Relire'
    case 'follow_ups_due':
      return 'Relancer'
    case 'overdue_tasks':
      return 'Voir les tâches'
  }
}

/** Les visites planifiées d'aujourd'hui (heure de Paris) ou plus tard, des annonces suivies, la plus proche d'abord. */
export function upcomingVisits(
  visits: readonly WorkflowVisitFact[],
  tracked: ReadonlySet<string>,
  now: Date
): WorkflowVisitFact[] {
  const today = parisDay(now.toISOString())
  return visits
    .filter(
      v =>
        tracked.has(v.listingId) &&
        Number.isFinite(Date.parse(v.visitedAt)) &&
        parisDay(v.visitedAt) >= today
    )
    .sort((a, b) => Date.parse(a.visitedAt) - Date.parse(b.visitedAt))
}

/**
 * Lot 24 : les visites à venir séparées entre aujourd'hui (la ligne « visite
 * aujourd'hui », qui ouvre le mode visite) et les jours suivants.
 */
function splitToday(
  visits: readonly WorkflowVisitFact[],
  now: Date
): { today: WorkflowVisitFact[]; upcoming: WorkflowVisitFact[] } {
  const today = parisDay(now.toISOString())
  return {
    today: visits.filter(v => parisDay(v.visitedAt) === today),
    upcoming: visits.filter(v => parisDay(v.visitedAt) !== today),
  }
}

/**
 * Les compteurs de la barre, « Ce qui t'attend » et les propositions en
 * cours. Une annonce hors critères (pas gardée) n'est pas comptée : elle est
 * repliée en bas de son étape.
 */
export function workflowOverview(
  input: WorkflowOverviewInput
): WorkflowOverview {
  const others = input.activeMembers.filter(m => m.id !== input.viewerId)
  const active = new Set(input.activeMembers.map(m => m.id))
  const required = agreementRequired({
    decideTogether: input.decideTogether,
    activeMemberIds: [...active],
  })
  const counts = Object.fromEntries(
    WORKFLOW_STAGES.map(stage => [
      stage,
      { total: 0, out: 0, toSort: 0, noDate: 0, toRate: 0 },
    ])
  ) as Record<
    WorkflowStage,
    {
      total: number
      out: number
      toSort: number
      noDate: number
      toRate: number
    }
  >
  let offersPending = 0
  for (const draft of input.drafts) {
    const bucket = counts['a-valider']
    if (isFoldedOut(draft.fit, draft.decision)) {
      bucket.out += 1
      continue
    }
    bucket.total += 1
    if (!draft.decision) bucket.toSort += 1
  }
  counts.archives.total += input.dismissedDrafts ?? 0
  const visitsToPlan: string[] = []
  const opinionsToGive: string[] = []
  for (const listing of input.listings) {
    const stage = stageOfStatus(listing.status)
    const bucket = counts[stage]
    if (isFoldedOut(listing.fit, listing.decision)) {
      bucket.out += 1
      continue
    }
    bucket.total += 1
    if (listing.status === 'to_study' && !listing.decision) bucket.toSort += 1
    if (listing.status === 'to_visit' && listing.plannedVisits === 0) {
      bucket.noDate += 1
      visitsToPlan.push(listing.id)
    }
    if (listing.status === 'visited' && !listing.viewerRated) {
      bucket.toRate += 1
      opinionsToGive.push(listing.id)
    }
    if (
      listing.status === 'offer_made' &&
      listing.lastOffer !== 'counter_offer'
    ) {
      offersPending += 1
    }
  }
  const stages: WorkflowStageCount[] = WORKFLOW_STAGES.map(stage => ({
    stage,
    count: counts[stage].total,
    outOfCriteria: counts[stage].out,
    toSort: counts[stage].toSort,
    sub: stageSub(stage, counts[stage], offersPending),
  }))
  const toConfirm = input.proposals.filter(p => p.viewer.canRespond)
  const toSettle = input.proposals.filter(p => p.viewer.canSettle)
  const ready = input.proposals.filter(
    p => p.viewer.canDecideNow && p.viewer.nobodyLeft
  )
  // Lot 23 : les visites, les messages et les tâches des annonces suivies.
  const now = input.now ?? new Date()
  const overdueDays = input.overdueDays ?? TASK_OVERDUE_DAYS
  const statusOf = new Map(input.listings.map(l => [l.id, l.status]))
  const tracked = new Set(
    input.listings.filter(l => isTrackedStatus(l.status)).map(l => l.id)
  )
  const tasksOf = new Map<string, { done: boolean; createdAt: string }[]>()
  for (const task of input.tasks ?? []) {
    const list = tasksOf.get(task.listingId) ?? []
    list.push(task)
    tasksOf.set(task.listingId, list)
  }
  const taskListings = [...tasksOf].flatMap(([id, tasks]) => {
    const status = statusOf.get(id)
    return status ? [{ id, status, tasks }] : []
  })
  const tasks = openTaskCounts(taskListings, now, overdueDays)
  const overdue = taskListings.flatMap(l =>
    isTrackedStatus(l.status)
      ? l.tasks.filter(t => isOverdueTask(t, now, overdueDays)).map(() => l.id)
      : []
  )
  const agency = input.agency ?? []
  return {
    decideTogether: input.decideTogether,
    agreementRequired: required,
    others: [...others],
    stages,
    agenda: agendaOf({
      toSort: {
        'a-valider': counts['a-valider'].toSort,
        'a-etudier': counts['a-etudier'].toSort,
      },
      toConfirm,
      toSettle,
      ready,
      visitsToPlan,
      opinionsToGive,
      others,
      ...splitToday(
        upcomingVisits(input.plannedVisits ?? [], tracked, now),
        now
      ),
      toApprove: agency
        .filter(a => a.kind === 'to_approve')
        .map(a => a.listingId),
      followUps: agency
        .filter(a => a.kind === 'follow_up_due')
        .map(a => a.listingId),
      overdue,
      overdueDays,
    }),
    proposals: [...input.proposals],
    tasks,
  }
}

/**
 * L'étape qui s'ouvre sans `?etape=` : la première qui a quelque chose,
 * À valider si tout est vide. Les archives ne s'ouvrent que si on les demande.
 */
export function defaultStage(
  stages: readonly Pick<WorkflowStageCount, 'stage' | 'count'>[]
): WorkflowStage {
  const open = stages.find(s => s.stage !== 'archives' && s.count > 0)
  return open?.stage ?? 'a-valider'
}

/** Qui a rangé une annonce aux archives : « Richard et Chloé », « Refus du vendeur ». */
export function archivedByLabel(input: {
  status: ListingStatus
  channel: ActivityChannel | null
  actorName: string | null
  after: unknown
}): string | null {
  if (input.status === 'offer_refused') return 'Refus du vendeur'
  const decision = decisionJournalOf(input.after)
  if (decision?.resolution === 'agreed' && decision.authorName) {
    return joinFrench(
      [decision.authorName, input.actorName].filter((n): n is string =>
        Boolean(n)
      )
    )
  }
  if (input.channel === 'mcp') {
    return input.actorName ? `Claude, pour ${input.actorName}` : 'Claude'
  }
  return input.actorName
}

/** « Terminer et prévenir Chloé », ou sans prénom : « Terminer ». */
export function finishLabel(others: readonly DecisionMemberRef[]): string {
  return others.length > 0
    ? `Terminer et prévenir ${joinFrench(others.map(m => m.displayName))}`
    : 'Terminer'
}

/** « Tes choix sont des propositions : Chloé les verra quand tu auras fini. » */
export function sessionIntro(others: readonly DecisionMemberRef[]): string {
  const who = joinFrench(others.map(m => m.displayName))
  return `Tes choix sont des propositions : ${who} ${others.length > 1 ? 'les verront' : 'les verra'} quand tu auras fini.`
}
