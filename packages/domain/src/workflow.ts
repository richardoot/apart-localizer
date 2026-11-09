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
import { inMainFitTab } from './criteria-fit.js'
import { decisionJournalOf } from './decision-activity.js'
import { agreementRequired, stageOfStatus, waitingLabel } from './decisions.js'
import { joinFrench } from './exploration.js'

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

/** « Ce qui t'attend » : ce qui demande quelque chose au membre connecté. */
function agendaOf(input: {
  toSort: { 'a-valider': number; 'a-etudier': number }
  toConfirm: number
  toSettle: number
  ready: number
  visitsToPlan: number
  opinionsToGive: number
  others: readonly DecisionMemberRef[]
  readyStage: WorkflowStage | null
}): WorkflowAgendaItem[] {
  const items: WorkflowAgendaItem[] = []
  const totalToSort = input.toSort['a-valider'] + input.toSort['a-etudier']
  if (totalToSort > 0) {
    items.push({
      key: 'to_sort',
      count: totalToSort,
      label: 'à trier',
      stage: input.toSort['a-valider'] > 0 ? 'a-valider' : 'a-etudier',
    })
  }
  if (input.toConfirm > 0) {
    items.push({
      key: 'to_confirm',
      count: input.toConfirm,
      label: confirmLabel(input.others),
      stage: null,
    })
  }
  if (input.toSettle > 0) {
    items.push({
      key: 'to_settle',
      count: input.toSettle,
      label: 'à trancher ensemble',
      stage: null,
    })
  }
  if (input.ready > 0) {
    items.push({
      key: 'ready',
      count: input.ready,
      label: 'à finaliser',
      stage: input.readyStage,
    })
  }
  if (input.visitsToPlan > 0) {
    items.push({
      key: 'visits_to_plan',
      count: input.visitsToPlan,
      label: plural(
        input.visitsToPlan,
        'visite à planifier',
        'visites à planifier'
      ),
      stage: 'a-visiter',
    })
  }
  if (input.opinionsToGive > 0) {
    items.push({
      key: 'opinions_to_give',
      count: input.opinionsToGive,
      label: 'avis à donner',
      stage: 'visitees',
    })
  }
  return items
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
  let visitsToPlan = 0
  let opinionsToGive = 0
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
      visitsToPlan += 1
    }
    if (listing.status === 'visited' && !listing.viewerRated) {
      bucket.toRate += 1
      opinionsToGive += 1
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
  const toConfirm = input.proposals.filter(p => p.viewer.canRespond).length
  const toSettle = input.proposals.filter(p => p.viewer.canSettle).length
  const ready = input.proposals.filter(
    p => p.viewer.canDecideNow && p.viewer.nobodyLeft
  )
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
      ready: ready.length,
      visitsToPlan,
      opinionsToGive,
      others,
      readyStage: ready[0]?.fromStage ?? null,
    }),
    proposals: [...input.proposals],
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
