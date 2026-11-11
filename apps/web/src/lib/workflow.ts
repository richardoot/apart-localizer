import {
  CRITERIA_FIT_LEVEL_LABELS,
  LISTING_STATUS_LABELS,
  WORKFLOW_STAGE_LABELS,
  missingListingFields,
} from '@apart/contracts'
import type {
  DecisionChoice,
  DecisionProposal,
  EvaluatedListing,
  ListingDraft,
  ListingFilters,
  ListingInput,
  ListingSort,
  ListingSortOrder,
  ListingStatus,
  LocationPrecisionFilter,
  OpinionSummary,
  Member,
  WorkflowStage,
} from '@apart/contracts'
import {
  decisionDetail,
  decisionRowKind,
  fitReasonsText,
  formatOpinionAverage,
  isAskableTask,
  isWithinRadius,
  judgementsOfDraft,
  judgementsOfListing,
  listingHighlights,
  listingRowKind,
  orderStageRows,
  stageOfStatus,
  stageRowAction,
  stageRowPill,
} from '@apart/domain'
import type { Judgement, StageRowAction, StageRowKind } from '@apart/domain'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { draftFitReason, draftSourceLabel, pendingDuplicate } from './drafts'
import {
  formatEuros,
  formatEurosPerM2,
  formatEurosPerMonth,
  formatRelativeDays,
  formatSurface,
} from './format'
import type { ListingTab } from './listing-tabs'
import type { Tone } from './ui'
import { commonScoreText, disagreementsText } from './opinions'

/**
 * Lot 21 (ADR 0031) : les lignes de la page Annonces par étapes, sans calcul :
 * l'état de chaque ligne et son ordre viennent de `domain` (`workflow.ts`),
 * ici leur mise en mots et en teintes, comme dans la maquette. Pur, testé.
 */

/** Une ligne d'étape, prête à afficher. */
export interface StageRowView {
  id: string
  kind: 'listing' | 'draft'
  title: string
  meta: string
  stats: Array<{ label: string; value: string }>
  rowKind: StageRowKind
  pill: string
  pillTone: Tone
  /** Lot 25 : les trois jugements étiquetés (rentabilité, recherche, location). */
  judgements: Judgement[]
  detail: string
  action: StageRowAction
  decision: DecisionProposal | null
  /** Pour l'ordre de l'étape. */
  nextVisitAt: string | null
  archivedAt: string | null
}

/** La teinte d'une pastille d'état (`UiBadge`), en jetons du thème (clair et sombre, 4,5:1). */
export function rowPillTone(kind: StageRowKind): Tone {
  switch (kind) {
    case 'waiting':
    case 'ready':
    case 'offer_pending':
      return 'info'
    case 'to_confirm':
    case 'no_date':
    case 'to_rate':
      return 'warn'
    case 'to_settle':
    case 'to_discuss':
    case 'offer_counter':
      return 'ai'
    case 'visit_planned':
    case 'opinions_complete':
    case 'offer_accepted':
      return 'accent'
    case 'archived_refused':
      return 'bad'
    default:
      return 'neutral'
  }
}

const PARIS_SHORT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
})
const PARIS_VISIT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

/** « 6 nov. ». */
export function shortDay(iso: string): string {
  return PARIS_SHORT.format(new Date(iso))
}

/** « mar. 17 nov., 18 h 30 ». */
export function shortVisit(iso: string): string {
  const parts = Object.fromEntries(
    PARIS_VISIT.formatToParts(new Date(iso)).map(p => [p.type, p.value])
  ) as Record<string, string>
  const minute = parts.minute === '00' ? '' : ` ${parts.minute}`
  return `${parts.weekday} ${parts.day} ${parts.month}, ${Number(parts.hour)} h${minute}`
}

function placeOf(item: EvaluatedListing): string {
  const location = item.listing.location
  return [
    location.commune,
    item.listing.surface ? formatSurface(item.listing.surface) : null,
    `DPE ${item.listing.dpeClass ?? '?'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** « 3 questions », « Rien » : ce qu'il reste à demander à l'annonceur. */
export function questionsText(item: Pick<EvaluatedListing, 'tasks'>): string {
  const count = item.tasks.filter(t => !t.done && isAskableTask(t)).length
  if (count === 0) return 'Rien'
  return `${count} question${count > 1 ? 's' : ''}`
}

/** La note d'un membre sur une ligne : « 4/5 », « a noté » (à l'aveugle), « — ». */
export function memberRating(
  summary: OpinionSummary | null,
  memberId: string
): string {
  const member = summary?.members.find(m => m.memberId === memberId)
  if (!member || member.state === 'missing') return '—'
  if (member.state === 'masked') return 'a noté'
  if (member.rating) return `${member.rating}/5`
  return member.average === null
    ? 'a noté'
    : formatOpinionAverage(member.average)
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

function visitedDetail(
  item: EvaluatedListing,
  kind: StageRowKind,
  meId: string | null
): string {
  const summary = item.opinionSummary
  if (kind === 'to_rate') {
    const others = (summary?.members ?? []).filter(m => m.state === 'masked')
    return others.length
      ? `L’avis de ${joinNames(others.map(m => m.displayName))} reste masqué`
      : 'À toi de noter'
  }
  if (kind === 'to_discuss') {
    const hasTask = item.tasks.some(t => t.origin === 'opinion' && !t.done)
    return hasTask
      ? 'Une contre-visite proposée'
      : disagreementsText(summary, meId)
  }
  if (kind === 'opinions_waiting') return disagreementsText(summary, meId)
  return 'Prête pour une décision'
}

function offerDetail(item: EvaluatedListing, now: Date): string {
  const offer = item.offers[0]
  if (!offer) return 'Offre à enregistrer'
  if (offer.response === 'counter_offer' && offer.counterAmount !== null) {
    return `Contre-proposition à ${formatEuros(offer.counterAmount)}`
  }
  if (offer.response === 'accepted') return 'Offre acceptée'
  return `Sans réponse depuis ${formatRelativeDays(offer.madeAt, now).replace('il y a ', '')}`
}

function archiveDetail(item: EvaluatedListing): string {
  const { status, discardReason } = item.listing
  if (status === 'discarded') {
    return discardReason ? `Raison : ${discardReason}` : 'Écartée'
  }
  if (status === 'offer_refused') {
    const offer = item.offers[0]
    return offer ? `Offre à ${formatEuros(offer.amount)}` : 'Offre refusée'
  }
  return LISTING_STATUS_LABELS[status]
}

function stageStats(
  stage: WorkflowStage,
  item: EvaluatedListing,
  members: readonly Pick<Member, 'id' | 'displayName'>[],
  meId: string | null
): Array<{ label: string; value: string }> {
  const m = item.evaluation.metrics
  const price = formatEuros(item.listing.price)
  switch (stage) {
    case 'a-visiter':
      return [
        {
          label: 'Prochaine visite',
          value: item.stage?.nextVisitAt
            ? shortVisit(item.stage.nextVisitAt)
            : '—',
        },
        { label: 'Prix', value: price },
        { label: 'À demander avant', value: questionsText(item) },
      ]
    case 'visitees':
      return [
        {
          label: members.map(p => p.displayName).join(' · ') || 'Avis',
          value:
            members
              .map(p => memberRating(item.opinionSummary, p.id))
              .join(' · ') || '—',
        },
        { label: 'Note commune', value: commonScoreText(item.opinionSummary) },
        {
          label: 'Désaccords',
          value: disagreementsText(item.opinionSummary, meId),
        },
      ]
    case 'offres':
      return [
        {
          label: 'Notre offre',
          value: item.offers[0] ? formatEuros(item.offers[0].amount) : '—',
        },
        { label: 'Prix affiché', value: price },
        {
          label: 'Faite le',
          value: item.offers[0] ? shortDay(item.offers[0].madeAt) : '—',
        },
      ]
    case 'archives':
      return [
        { label: 'Prix', value: price },
        {
          label: 'Quand',
          value: item.stage?.archivedAt ? shortDay(item.stage.archivedAt) : '—',
        },
        { label: 'Par', value: item.stage?.archivedBy ?? '—' },
      ]
    default:
      // Lot 25 : la rentabilité est dans les jugements étiquetés de la ligne.
      return [
        { label: 'Prix', value: price },
        { label: 'Coût tout compris', value: formatEuros(m.totalCost) },
      ]
  }
}

function listingMeta(stage: WorkflowStage, item: EvaluatedListing): string {
  if (stage === 'visitees') {
    return item.stage?.lastVisitAt
      ? `Visitée le ${shortDay(item.stage.lastVisitAt)}`
      : 'Visite à enregistrer'
  }
  return placeOf(item)
}

function listingDetail(
  stage: WorkflowStage,
  item: EvaluatedListing,
  kind: StageRowKind,
  meId: string | null,
  now: Date
): string {
  if (item.decision) return decisionDetail(item.decision, meId)
  switch (stage) {
    case 'a-etudier':
      return 'Personne n’a encore trié'
    case 'a-visiter':
      return (
        joinNames(item.stage?.nextVisitNames ?? []) || 'Aucune visite prévue'
      )
    case 'visitees':
      return visitedDetail(item, kind, meId)
    case 'offres':
      return offerDetail(item, now)
    default:
      return archiveDetail(item)
  }
}

/** La ligne d'une annonce à son étape. */
export function listingRow(
  stage: WorkflowStage,
  item: EvaluatedListing,
  context: {
    members: readonly Pick<Member, 'id' | 'displayName'>[]
    meId: string | null
    now?: Date
  }
): StageRowView {
  const rowKind = listingRowKind({
    status: item.listing.status,
    decision: item.decision,
    stage: item.stage,
    offers: item.offers,
    opinionSummary: item.opinionSummary,
  })
  return {
    id: item.listing.id,
    kind: 'listing',
    title: item.listing.title,
    meta: listingMeta(stage, item),
    stats: stageStats(stage, item, context.members, context.meId),
    rowKind,
    pill: stageRowPill(rowKind, item.decision),
    pillTone: rowPillTone(rowKind),
    judgements: judgementsOfListing(item),
    detail: listingDetail(
      stage,
      item,
      rowKind,
      context.meId,
      context.now ?? new Date()
    ),
    action: stageRowAction(rowKind),
    decision: item.decision,
    nextVisitAt: item.stage?.nextVisitAt ?? null,
    archivedAt: item.stage?.archivedAt ?? null,
  }
}

/** « Dans les critères », « À la marge : prix +4 % », « — » sans critère actif. */
export function draftFitText(draft: Pick<ListingDraft, 'fit'>): string {
  if (!draft.fit || draft.fit.activeCriteria === 0) return '—'
  const label = CRITERIA_FIT_LEVEL_LABELS[draft.fit.level]
  if (draft.fit.level === 'in') return label
  const reason = draftFitReason(draft)?.split(' · ')[0]
  if (!reason) return label
  // Une ligne : le premier motif, en bref ; le détail reste sur la carte.
  const short = reason.split(' (')[0]?.split(' : ')[0] ?? reason
  return `${label} : ${short.charAt(0).toLowerCase()}${short.slice(1)}`
}

/** « Claude · SeLoger · il y a 2 j », « Alerte e-mail · hier ». */
export function draftMeta(draft: ListingDraft, now: Date = new Date()): string {
  const when = formatRelativeDays(draft.receivedAt, now)
  return draft.origin === 'exploration'
    ? ['Claude', draft.portal ? draftSourceLabel(draft) : null, when]
        .filter(Boolean)
        .join(' · ')
    : `Alerte e-mail · ${when}`
}

/** La ligne d'un brouillon « À valider ». */
export function draftRow(
  draft: ListingDraft,
  context: { meId: string | null; now?: Date }
): StageRowView {
  const rowKind = decisionRowKind(draft.decision)
  const duplicate = pendingDuplicate(draft)
  return {
    id: draft.id,
    kind: 'draft',
    title: draft.listing.title,
    meta: draftMeta(draft, context.now),
    stats: [
      {
        label: 'Prix',
        value: draft.listing.price ? formatEuros(draft.listing.price) : '—',
      },
      { label: 'Surface', value: formatSurface(draft.listing.surface) },
    ],
    rowKind,
    pill: stageRowPill(rowKind, draft.decision),
    pillTone: rowPillTone(rowKind),
    // Lot 25 : l'adéquation est le jugement « Recherche », étiqueté avec les deux autres.
    judgements: judgementsOfDraft(draft),
    detail: draft.decision
      ? decisionDetail(draft.decision, context.meId)
      : duplicate
        ? 'Doublon probable à trancher'
        : 'Personne n’a encore trié',
    action:
      rowKind === 'waiting' || rowKind === 'ready'
        ? { kind: 'open', label: 'Voir' }
        : stageRowAction(rowKind),
    decision: draft.decision,
    nextVisitAt: null,
    archivedAt: null,
  }
}

/** Les lignes d'une étape, dans son ordre. */
export function orderedRows(
  stage: WorkflowStage,
  rows: readonly StageRowView[]
): StageRowView[] {
  return orderStageRows(
    stage,
    rows.map(row => ({ ...row, kind: row.rowKind, source: row }))
  ).map(entry => entry.source)
}

/** L'onglet de la fiche ouvert par le bouton d'une ligne. */
export function tabOfAction(action: StageRowAction['kind']): ListingTab | null {
  switch (action) {
    case 'plan':
    case 'prepare':
      return 'a-faire'
    case 'follow':
      return 'negocier'
    case 'rate':
    case 'opinions':
      return 'synthese'
    default:
      return null
  }
}

/** Les raisons d'une ligne hors critères, en une phrase. */
export function outReasonOfListing(item: EvaluatedListing): string {
  return item.criteriaFit.reasons.length
    ? fitReasonsText(item.criteriaFit.reasons)
    : 'Hors critères'
}

/** Les raisons d'un brouillon hors critères, en une phrase. */
export function outReasonOfDraft(draft: Pick<ListingDraft, 'fit'>): string {
  return draft.fit?.reasons.length
    ? fitReasonsText(draft.fit.reasons)
    : 'Hors critères'
}

/** « Voir 2 brouillons hors critères », « Voir 1 annonce hors critères ». */
export function outLabel(kind: 'draft' | 'listing', count: number): string {
  const word = kind === 'draft' ? 'brouillon' : 'annonce'
  return `Voir ${count} ${word}${count > 1 ? 's' : ''} hors critères`
}

/**
 * Les anciens liens de la page : `?vue=a-valider`, `?fit=…`, `?status=…`
 * mènent à leur étape et l'URL se réécrit ; null si rien à faire.
 */
export function legacyStageRedirect(
  query: LocationQuery
): LocationQueryRaw | null {
  const hasLegacy = 'vue' in query || 'fit' in query || 'status' in query
  if (!hasLegacy) return null
  const { vue, fit, status, ...rest } = query as Record<string, unknown>
  const next: LocationQueryRaw = { ...(rest as LocationQueryRaw) }
  if (!next.etape) {
    const first = (value: unknown): string | null =>
      typeof value === 'string'
        ? value
        : Array.isArray(value) && typeof value[0] === 'string'
          ? value[0]
          : null
    const fitValue = first(fit)
    const statusValue = first(status)?.split(',')[0] ?? null
    if (vue === 'a-valider') {
      next.etape = 'a-valider'
    } else if (fitValue?.split(',').includes('out')) {
      next.etape = 'a-etudier'
      next.hors = '1'
    } else if (statusValue && statusValue in LISTING_STATUS_LABELS) {
      next.etape = stageOfStatus(statusValue as ListingStatus)
    }
  }
  return next
}

/** Ce qu'une étape vide dit. */
export const STAGE_EMPTY_TEXT: Record<WorkflowStage, string> = {
  'a-valider': 'Rien à valider pour l’instant.',
  'a-etudier': 'Aucune annonce à étudier.',
  'a-visiter': 'Aucune annonce à visiter.',
  visitees: 'Aucune annonce visitée pour l’instant.',
  offres: 'Aucune offre en cours.',
  archives: 'Rien aux archives.',
}

/**
 * Lot 21 : les filtres de la page appliqués aux brouillons, côté navigateur
 * (l'étape « À valider » ne passe pas par la liste des annonces).
 */
export function draftMatchesFilters(
  draft: ListingDraft,
  filters: Partial<ListingFilters>
): boolean {
  const l = draft.listing
  if (filters.search) {
    const needle = filters.search.toLowerCase()
    const haystack = [
      l.title,
      l.location.commune,
      l.location.district,
      l.sellerName,
      l.sellerReference,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  if (filters.commune?.length) {
    const commune = l.location.commune?.toLowerCase() ?? ''
    if (!filters.commune.some(c => c.toLowerCase() === commune)) return false
  }
  if (
    filters.dpe?.length &&
    (!l.dpeClass || !filters.dpe.includes(l.dpeClass))
  ) {
    return false
  }
  if (filters.priceMin !== undefined && l.price < filters.priceMin) return false
  if (filters.priceMax !== undefined && l.price > filters.priceMax) return false
  if (
    filters.surfaceMin !== undefined &&
    (l.surface ?? 0) < filters.surfaceMin
  ) {
    return false
  }
  if (
    filters.surfaceMax !== undefined &&
    (l.surface ?? Number.POSITIVE_INFINITY) > filters.surfaceMax
  ) {
    return false
  }
  if (filters.roomsMin !== undefined && (l.rooms ?? 0) < filters.roomsMin) {
    return false
  }
  if (
    filters.sellerType?.length &&
    !filters.sellerType.includes(l.sellerType)
  ) {
    return false
  }
  // Sans loyer visé, le verdict reste à confirmer (lot 16) : aucun ne convient.
  if (
    filters.verdict?.length &&
    (!draft.evaluation ||
      !(l.rentalPlan?.targetRent ?? 0) ||
      !filters.verdict.includes(draft.evaluation.metrics.verdict))
  ) {
    return false
  }
  if (
    filters.precision?.length &&
    !filters.precision.includes(draftPrecision(draft))
  ) {
    return false
  }
  if (filters.criteriaId) {
    const entry = draft.fit?.criteria.find(
      c => c.criteriaId === filters.criteriaId
    )
    if (!entry || entry.level === 'out') return false
  }
  if (filters.near) {
    const point = draft.located?.point ?? l.location.point
    if (!point || !isWithinRadius(point, filters.near)) return false
  }
  return true
}

/** La précision du repère d'un brouillon, celle du filtre « Repère ». */
function draftPrecision(draft: ListingDraft): LocationPrecisionFilter {
  const point = draft.located?.point ?? draft.listing.location.point
  const precision = draft.located?.precision ?? draft.listing.location.precision
  return point && precision ? precision : 'none'
}

/** Les tris possibles sur des brouillons : les autres demandent une annonce suivie. */
export const DRAFT_SORTS: readonly ListingSort[] = [
  'score',
  'price',
  'pricePerM2',
  'surface',
  'createdAt',
]

/** Vrai si le tri demandé remplace l'ordre de l'étape « À valider ». */
export function isDraftSortApplied(sort: ListingSort): boolean {
  return sort !== 'score' && DRAFT_SORTS.includes(sort)
}

/** Les brouillons dans l'ordre demandé ; une valeur inconnue va à la fin. */
export function sortDrafts(
  drafts: readonly ListingDraft[],
  sort: ListingSort,
  order: ListingSortOrder
): ListingDraft[] {
  if (!isDraftSortApplied(sort)) return [...drafts]
  const value = (draft: ListingDraft): number | null => {
    const l = draft.listing
    switch (sort) {
      case 'price':
        return l.price || null
      case 'pricePerM2':
        return l.price && l.surface ? l.price / l.surface : null
      case 'surface':
        return l.surface
      default:
        return Date.parse(draft.receivedAt)
    }
  }
  const direction = order === 'asc' ? 1 : -1
  return [...drafts].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || vb === null) {
      return va === vb ? 0 : va === null ? 1 : -1
    }
    return (va - vb) * direction
  })
}

/** La ligne « Archives » d'un brouillon écarté : il n'a jamais été une annonce suivie. */
export function dismissedDraftRow(
  draft: ListingDraft,
  context: { members: readonly Pick<Member, 'id' | 'displayName'>[] }
): StageRowView {
  const by = context.members.find(m => m.id === draft.decidedById)
  return {
    id: draft.id,
    kind: 'draft',
    title: draft.listing.title,
    meta: draftMeta(draft),
    stats: [
      {
        label: 'Prix',
        value: draft.listing.price ? formatEuros(draft.listing.price) : '—',
      },
      {
        label: 'Quand',
        value: draft.decidedAt ? shortDay(draft.decidedAt) : '—',
      },
      { label: 'Par', value: by?.displayName ?? '—' },
    ],
    rowKind: 'archived_discarded',
    pill: 'Écartée',
    pillTone: rowPillTone('archived_discarded'),
    judgements: judgementsOfDraft(draft),
    detail: draft.dismissReason ?? 'Écartée à l’étape À valider',
    action: { kind: 'rescue', label: 'Repêcher' },
    decision: null,
    nextVisitAt: null,
    archivedAt: draft.decidedAt,
  }
}

/**
 * Le repère d'un brouillon sous la forme que la carte lit (elle ne regarde
 * que le titre, le prix, le repère et le verdict) ; sans repère ou sans
 * chiffres, pas de marqueur.
 */
export function draftMapItem(draft: ListingDraft): EvaluatedListing | null {
  const point = draft.located?.point ?? draft.listing.location.point
  if (!point || !draft.evaluation) return null
  return {
    listing: {
      ...draft.listing,
      id: draft.id,
      location: { ...draft.listing.location, point },
      status: 'to_study',
    },
    evaluation: draft.evaluation,
    distanceMeters: null,
    isNewForMe: false,
    links: [],
  } as unknown as EvaluatedListing
}

/** Le texte du bouton d'appel à l'action de l'étape. */
export function stageCta(
  stage: WorkflowStage,
  toSort: number,
  noDate: number,
  toRate: number
): string | null {
  if (stage === 'a-valider' || stage === 'a-etudier') {
    if (toSort === 0) return null
    return toSort > 1 ? `Trier les ${toSort} annonces` : 'Trier l’annonce'
  }
  if (stage === 'a-visiter') {
    if (noDate === 0) return null
    return noDate > 1
      ? 'Planifier les visites sans date'
      : 'Planifier la visite sans date'
  }
  if (stage === 'visitees') return toRate > 0 ? 'Donner mon avis' : null
  return null
}

/** « Confirmer 2 propositions ». */
export function confirmLabel(count: number): string {
  return `Confirmer ${count} proposition${count > 1 ? 's' : ''}`
}

// ---------------------------------------------------------------------------
// Le tri, une carte à la fois
// ---------------------------------------------------------------------------

/** Une carte du tri : les chiffres et ce qu'il faut savoir pour décider. */
export interface TriageCardView {
  id: string
  kind: 'listing' | 'draft'
  title: string
  where: string
  size: string
  rooms: string
  source: string
  url: string | null
  /** Lot 25 : les trois jugements étiquetés, dans leur ordre. */
  judgements: Judgement[]
  dpe: string
  figures: Array<{ label: string; value: string; note: string }>
  whyTitle: string
  why: string[]
  missing: string[]
  facts: PropertyFact[]
  description: string | null
}

/** Une donnée du bien, affichée seulement si elle est connue. */
export interface PropertyFact {
  label: string
  value: string
}

const yesNo = (value: boolean | null): string | null =>
  value === null ? null : value ? 'Oui' : 'Non'

/** Ce qu'on sait du bien, pour le volet « Les données du bien ». */
export function propertyFacts(
  l: Omit<ListingInput, 'sourceText'>
): PropertyFact[] {
  const money = (value: number | null): string | null =>
    value === null ? null : formatEuros(value)
  const floor =
    l.floorLabel ??
    (l.floor === null
      ? null
      : l.floor === 0
        ? 'Rez-de-chaussée'
        : `${l.floor}${l.floorsTotal === null ? '' : ` sur ${l.floorsTotal}`}`)
  const dpe = l.dpeClass
    ? `${l.dpeClass}${l.dpeConsumption === null ? '' : ` (${l.dpeConsumption} kWh/m²/an)`}`
    : null
  const heating = l.heatingType
    ? `${l.heatingType}${l.heatingCollective === null ? '' : l.heatingCollective ? ', collectif' : ', individuel'}`
    : null
  const seller = [
    l.sellerName,
    l.sellerReference ? `réf. ${l.sellerReference}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const facts: Array<[string, string | number | null]> = [
    [
      'Adresse',
      l.location.addressNormalized ??
        l.location.addressRaw ??
        (l.location.district
          ? `${l.location.district}, ${l.location.commune ?? ''}`
          : null),
    ],
    ['Surface Carrez', l.surface === null ? null : formatSurface(l.surface)],
    [
      'Surface au sol',
      l.surfaceTotal === null ? null : formatSurface(l.surfaceTotal),
    ],
    ['Pièces', l.rooms],
    ['Chambres', l.bedrooms],
    ['Étage', floor],
    ['Ascenseur', yesNo(l.elevator)],
    ['Construction', l.constructionYear ?? l.constructionPeriod],
    ['DPE', dpe],
    ['GES', l.gesClass],
    ['Chauffage', heating],
    ['Extérieur', l.outdoor],
    ['Stationnement', l.parking],
    ['Cave', yesNo(l.cellar)],
    ['Orientation', l.orientation],
    ['État', l.condition],
    ['Charges annuelles', money(l.annualCharges)],
    ['Taxe foncière', money(l.propertyTax)],
    ['Honoraires', money(l.feesAmount)],
    ['Lots de la copropriété', l.lotsCount],
    ['Syndic', l.syndic],
    ['Travaux votés', l.votedWorks],
    ['Procédures', l.proceedings],
    ['Vendeur', seller || null],
  ]
  return facts.flatMap(([label, value]) =>
    value === null || value === '' ? [] : [{ label, value: String(value) }]
  )
}

function figuresOf(
  evaluation: EvaluatedListing['evaluation'],
  price: number,
  hasRent = true
): TriageCardView['figures'] {
  const m = evaluation.metrics
  const target = evaluation.targetPrice
  const discount = target.discount
  return [
    {
      label: 'Prix',
      value: price ? formatEuros(price) : 'prix ?',
      note: Number.isFinite(m.pricePerM2) ? formatEurosPerM2(m.pricePerM2) : '',
    },
    {
      label: 'Coût tout compris',
      value: formatEuros(m.totalCost),
      note: `notaire ≈ ${formatEuros(m.notaryFees)}`,
    },
    {
      label: 'Mensualité',
      value: formatEurosPerMonth(m.monthlyPayment),
      note: '',
    },
    {
      label: 'Prix cible',
      value:
        !hasRent || target.targetPrice === null
          ? '—'
          : formatEuros(target.targetPrice),
      note: !hasRent
        ? 'loyer visé inconnu'
        : discount === null || discount <= 0
          ? 'au prix affiché, dans la cible'
          : `décote de ${Math.round(discount * 100)} %`,
    },
  ]
}

function roomsText(rooms: number | null, floor: string | null): string {
  const r =
    rooms === null ? 'pièces ?' : `${rooms} pièce${rooms > 1 ? 's' : ''}`
  return floor ? `${r}, ${floor}` : r
}

/** La carte d'un brouillon. */
export function draftTriageCard(draft: ListingDraft): TriageCardView {
  const l = draft.listing
  const evaluation = draft.evaluation
  const hasRent = (l.rentalPlan?.targetRent ?? 0) > 0
  const why = [
    ...(draft.fit?.level === 'in' && draft.fit.name
      ? [`Dans le critère « ${draft.fit.name} »`]
      : []),
    ...(draft.fit && draft.fit.level !== 'in' && draft.fit.reasons.length
      ? [fitReasonsText(draft.fit.reasons)]
      : []),
    ...(draft.excerpt ? [draft.excerpt] : []),
    ...(draft.emailSubject ? [`« ${draft.emailSubject} »`] : []),
  ].slice(0, 3)
  return {
    id: draft.id,
    kind: 'draft',
    title: l.title,
    where: [l.location.commune, l.location.district]
      .filter(Boolean)
      .join(' · '),
    size: formatSurface(l.surface),
    rooms: roomsText(l.rooms, l.floorLabel),
    source:
      draft.origin === 'exploration'
        ? `Claude · ${draftSourceLabel(draft)}`
        : 'Alerte e-mail',
    url: draft.url,
    // Sans loyer visé, la rentabilité reste à confirmer (lot 16).
    judgements: judgementsOfDraft(draft),
    dpe: l.dpeClass ? `DPE ${l.dpeClass}` : 'DPE inconnu',
    facts: propertyFacts(l),
    description: l.description,
    figures: evaluation
      ? figuresOf(evaluation, l.price, hasRent)
      : [
          {
            label: 'Prix',
            value: l.price ? formatEuros(l.price) : 'prix ?',
            note: '',
          },
        ],
    whyTitle:
      draft.origin === 'exploration'
        ? 'Pourquoi Claude l’a proposée'
        : 'Ce que dit l’alerte',
    why,
    missing: missingListingFields(l).map(m => m.label),
  }
}

/** La carte d'une annonce à étudier. */
export function listingTriageCard(item: EvaluatedListing): TriageCardView {
  const l = item.listing
  const highlights = listingHighlights({
    metrics: item.evaluation.metrics,
    rental: item.evaluation.rental,
    targetPrice: item.evaluation.targetPrice,
    dpeClass: l.dpeClass,
    openData: l.openDataContext ?? null,
    votedWorks: l.votedWorks,
    proceedings: l.proceedings,
    opinions: item.opinionSummary,
  })
  return {
    id: l.id,
    kind: 'listing',
    title: l.title,
    where: [l.location.commune, l.location.district]
      .filter(Boolean)
      .join(' · '),
    size: formatSurface(l.surface),
    rooms: roomsText(l.rooms, l.floorLabel),
    source: l.sourceLabel ?? l.source,
    url: l.url,
    judgements: judgementsOfListing(item),
    dpe: l.dpeClass ? `DPE ${l.dpeClass}` : 'DPE inconnu',
    facts: propertyFacts(l),
    description: l.description,
    figures: figuresOf(item.evaluation, l.price),
    whyTitle: 'Ce qui plaît',
    why: highlights.good.map(h => h.text),
    missing: [
      ...highlights.watch.map(h => h.text),
      ...missingListingFields({ ...l, sourceText: null }).map(m => m.label),
    ].slice(0, 4),
  }
}

/** Le choix du bouton principal du tri à cette étape. */
export function primaryChoice(stage: WorkflowStage): DecisionChoice {
  return stage === 'a-valider' ? 'keep' : 'to_visit'
}

/** Le libellé du bouton principal : « À étudier », « À visiter ». */
export function primaryLabel(stage: WorkflowStage): string {
  return stage === 'a-valider' ? 'À étudier' : 'À visiter'
}

/** « À valider · 2 sur 4 ». */
export function progressText(
  stage: WorkflowStage | null,
  position: number,
  total: number
): string {
  const head = stage ? `${WORKFLOW_STAGE_LABELS[stage]} · ` : ''
  return `${head}${Math.min(position, total)} sur ${total}`
}
