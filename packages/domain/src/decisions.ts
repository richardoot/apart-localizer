import {
  LISTING_STATUS_LABELS,
  OPEN_DECISION_STATES,
  STAGE_STATUSES,
} from '@apart/contracts'
import type {
  ActivityChannel,
  DecisionChoice,
  DecisionMemberRef,
  DecisionProposal,
  DecisionResolution,
  DecisionState,
  DecisionTargetKind,
  DecisionViewer,
  ListingStatus,
  WorkflowStage,
} from '@apart/contracts'
import { joinFrench } from './exploration.js'
import type { MemberRefusal } from './members.js'

/**
 * Lot 21 (ADR 0031) : les décisions à plusieurs. Trier, c'est proposer :
 * garder ou écarter un brouillon, passer une annonce À visiter et écarter
 * une annonce attendent l'accord de tous les membres actifs quand l'espace
 * en a au moins deux et que « Décider à plusieurs » est activé ; le reste
 * s'applique tout de suite. Ici : qui doit décider, ce que chaque réponse
 * fait d'une proposition, ce qu'un membre a le droit d'y faire, et sa
 * lecture. Pur : l'API applique, le web et le MCP affichent.
 */

const STAGE_OF_STATUS = new Map(
  Object.entries(STAGE_STATUSES).flatMap(([stage, statuses]) =>
    statuses.map(status => [status, stage as WorkflowStage] as const)
  )
)

/** L'étape de la barre pour un statut d'annonce. */
export function stageOfStatus(status: ListingStatus): WorkflowStage {
  return STAGE_OF_STATUS.get(status) as WorkflowStage
}

/** Une réponse à une proposition. */
export interface DecisionResponseLike {
  memberId: string
  agrees: boolean
  /** Le choix à la place, quand le membre n'est pas d'accord. */
  choice: DecisionChoice | null
  reason?: string | null
}

/** Ce que les règles lisent d'une proposition. */
export interface DecisionLike {
  state: DecisionState
  authorId: string | null
  choice: DecisionChoice
  reason?: string | null
  responses: readonly DecisionResponseLike[]
}

/** Ce qui décide de la règle : les membres actifs et le réglage de l'espace. */
export interface DecisionSettings {
  decideTogether: boolean
  activeMemberIds: readonly string[]
}

/**
 * Vrai si les décisions à deux attendent l'accord de tous : au moins deux
 * membres actifs et le réglage activé.
 */
export function agreementRequired(settings: DecisionSettings): boolean {
  return settings.decideTogether && settings.activeMemberIds.length >= 2
}

/**
 * La décision à deux que représente un changement de statut, ou null : passer
 * À visiter et écarter se décident à plusieurs ; tout le reste (visite faite,
 * offre, vendue, retour À étudier, repêcher) est un fait appliqué tout de
 * suite.
 */
export function choiceOfStatusChange(
  current: ListingStatus,
  next: ListingStatus
): DecisionChoice | null {
  if (current === next) return null
  if (next === 'to_visit') return 'to_visit'
  if (next === 'discarded') return 'discard'
  return null
}

/** Le statut d'une annonce quand ce choix s'applique. */
export function statusOfChoice(
  choice: DecisionChoice,
  fromStatus: ListingStatus
): ListingStatus {
  if (choice === 'to_visit') return 'to_visit'
  if (choice === 'discard') return 'discarded'
  return fromStatus
}

/** Vrai si ce statut est celui d'une annonce rangée aux archives. */
function isArchived(status: ListingStatus): boolean {
  return (
    status === 'discarded' ||
    status === 'offer_refused' ||
    status === 'sold_or_withdrawn'
  )
}

/**
 * L'autre choix d'une réponse « non » : on garde ce que l'autre écarte,
 * on écarte ce que l'autre garde. À l'étape À étudier, garder c'est aller
 * voir ; ailleurs l'annonce reste où elle est.
 */
export function counterChoice(
  target: DecisionTargetKind,
  choice: DecisionChoice,
  fromStatus: ListingStatus | null
): DecisionChoice {
  if (target === 'draft') return choice === 'discard' ? 'keep' : 'discard'
  if (choice === 'to_visit') {
    return fromStatus !== null && isArchived(fromStatus) ? 'keep' : 'discard'
  }
  return fromStatus === 'to_study' ? 'to_visit' : 'keep'
}

/** « À étudier », « À visiter », « Écarter », « La garder ». */
export function choiceLabel(
  target: DecisionTargetKind,
  choice: DecisionChoice
): string {
  if (choice === 'discard') return 'Écarter'
  if (choice === 'to_visit') return 'À visiter'
  return target === 'draft' ? 'À étudier' : 'La garder'
}

/** Ce que le bouton « non » dit : « Non, je la garde », « Non, à écarter ». */
export function refuseLabel(choice: DecisionChoice): string {
  return choice === 'discard' ? 'Non, je la garde' : 'Non, à écarter'
}

/** « D'accord : À visiter », « D'accord : écarter ». */
export function agreeLabel(
  target: DecisionTargetKind,
  choice: DecisionChoice
): string {
  return choice === 'discard'
    ? 'D’accord : écarter'
    : `D’accord : ${choiceLabel(target, choice)}`
}

/** « la passer À visiter », « l'écarter », « la garder ». */
export function choiceSentence(
  target: DecisionTargetKind,
  choice: DecisionChoice
): string {
  if (choice === 'discard') return 'l’écarter'
  if (choice === 'to_visit') return 'la passer À visiter'
  return target === 'draft' ? 'la garder : À étudier' : 'la garder'
}

/** Les membres actifs dont la proposition attend encore la réponse. */
export function waitingIds(
  decision: Pick<DecisionLike, 'authorId' | 'responses'>,
  activeMemberIds: readonly string[]
): string[] {
  const answered = new Set(decision.responses.map(r => r.memberId))
  return activeMemberIds.filter(
    id => id !== decision.authorId && !answered.has(id)
  )
}

/** Ce qu'une réponse fait d'une proposition. */
export type DecisionStep = 'apply' | 'wait' | 'settle'

/**
 * Non : à trancher ensemble. D'accord de tous les membres actifs : la
 * décision s'applique. Sinon on attend les autres.
 */
export function stepAfterResponse(
  decision: Pick<DecisionLike, 'authorId' | 'responses'>,
  response: Pick<DecisionResponseLike, 'memberId' | 'agrees'>,
  activeMemberIds: readonly string[]
): DecisionStep {
  if (!response.agrees) return 'settle'
  const others = waitingIds(decision, activeMemberIds).filter(
    id => id !== response.memberId
  )
  return others.length === 0 ? 'apply' : 'wait'
}

/** Les choix entre lesquels trancher : celui de l'auteur, puis les autres. */
export function settleOptions(
  decision: Pick<DecisionLike, 'state' | 'choice' | 'responses'>
): DecisionChoice[] {
  if (decision.state !== 'to_settle') return []
  const options = [decision.choice]
  for (const response of decision.responses) {
    if (
      !response.agrees &&
      response.choice &&
      !options.includes(response.choice)
    ) {
      options.push(response.choice)
    }
  }
  return options
}

/** La raison donnée pour un choix : celle de l'auteur ou d'une réponse. */
export function reasonOfChoice(
  decision: Pick<DecisionLike, 'choice' | 'reason' | 'responses'>,
  choice: DecisionChoice
): string | null {
  if (choice === decision.choice) return decision.reason ?? null
  return (
    decision.responses.find(r => !r.agrees && r.choice === choice)?.reason ??
    null
  )
}

/** Vrai pour une proposition qui attend encore (ouverte ou à trancher). */
export function isOpenDecision(state: DecisionState): boolean {
  return OPEN_DECISION_STATES.includes(state)
}

/** L'état réel de ce que la proposition vise, au moment d'appliquer. */
export type DecisionTargetState =
  | { kind: 'listing'; status: ListingStatus }
  | { kind: 'draft'; status: 'pending' | 'accepted' | 'dismissed' | 'merged' }

/**
 * Caduque : l'annonce n'est plus dans le statut de départ, ou le brouillon
 * n'est plus en attente. La proposition se ferme alors sans rien appliquer.
 */
export function isDecisionStale(
  fromStatus: ListingStatus | null,
  target: DecisionTargetState
): boolean {
  if (target.kind === 'draft') return target.status !== 'pending'
  return fromStatus !== null && target.status !== fromStatus
}

/** La phrase d'une proposition caduque. */
export function staleMessage(
  fromStatus: ListingStatus | null,
  target: DecisionTargetState
): string {
  if (target.kind === 'draft') {
    return 'Cette proposition est caduque : le brouillon a déjà été traité. Rien n’a été appliqué.'
  }
  const from = fromStatus ? LISTING_STATUS_LABELS[fromStatus] : 'son statut'
  return `Cette proposition est caduque : l’annonce n’est plus « ${from} » (« ${LISTING_STATUS_LABELS[target.status]} » maintenant). Rien n’a été appliqué.`
}

const closed = (): MemberRefusal => ({
  code: 'conflict',
  message: 'Cette proposition n’est plus en cours.',
})

/** Pourquoi ce membre ne peut pas répondre, ou null. */
export function respondRefusal(
  decision: DecisionLike,
  memberId: string
): MemberRefusal | null {
  if (decision.state !== 'open') return closed()
  if (decision.authorId === memberId) {
    return {
      code: 'forbidden',
      message: 'Vous avez fait cette proposition : un autre membre y répond.',
    }
  }
  if (decision.responses.some(r => r.memberId === memberId)) {
    return {
      code: 'conflict',
      message: 'Vous avez déjà répondu à cette proposition.',
    }
  }
  return null
}

/** Pourquoi ce membre ne peut pas retirer la proposition, ou null. */
export function withdrawRefusal(
  decision: DecisionLike,
  memberId: string
): MemberRefusal | null {
  if (!isOpenDecision(decision.state)) return closed()
  if (decision.authorId !== memberId) {
    return {
      code: 'forbidden',
      message: 'Seul l’auteur d’une proposition peut la retirer.',
    }
  }
  return null
}

/** Pourquoi ce membre ne peut pas « Décider sans attendre », ou null. */
export function decideNowRefusal(
  decision: DecisionLike,
  memberId: string
): MemberRefusal | null {
  if (decision.state !== 'open') return closed()
  if (decision.authorId !== memberId) {
    return {
      code: 'forbidden',
      message: 'Seul l’auteur de la proposition peut décider sans attendre.',
    }
  }
  return null
}

/** Pourquoi ce choix ne peut pas trancher la proposition, ou null. */
export function settleRefusal(
  decision: DecisionLike,
  choice: DecisionChoice
): MemberRefusal | null {
  if (decision.state !== 'to_settle') {
    return {
      code: 'conflict',
      message: 'Cette proposition n’est pas à trancher.',
    }
  }
  if (!settleOptions(decision).includes(choice)) {
    return {
      code: 'conflict',
      message: 'Ce choix n’est pas l’un de ceux à trancher.',
    }
  }
  return null
}

/** Ce que le membre connecté peut faire d'une proposition. */
export function decisionViewer(
  decision: DecisionLike,
  viewerId: string,
  activeMemberIds: readonly string[]
): DecisionViewer {
  const isAuthor = decision.authorId === viewerId
  const hasResponded = decision.responses.some(r => r.memberId === viewerId)
  const open = decision.state === 'open'
  const waiting = waitingIds(decision, activeMemberIds)
  return {
    isAuthor,
    hasResponded,
    canRespond: open && !isAuthor && !hasResponded,
    canWithdraw: isAuthor && isOpenDecision(decision.state),
    canDecideNow: isAuthor && open,
    canSettle:
      decision.state === 'to_settle' && activeMemberIds.includes(viewerId),
    nobodyLeft: open && waiting.length === 0,
  }
}

/** Une proposition telle que la base la garde, prête à être lue. */
export interface DecisionRecord extends DecisionLike {
  id: string
  target: DecisionTargetKind
  listingId: string | null
  draftId: string | null
  title: string
  fromStatus: ListingStatus | null
  resolution: DecisionResolution | null
  appliedChoice: DecisionChoice | null
  channel: ActivityChannel
  sessionId: string | null
  createdAt: string
  closedAt: string | null
  closedById: string | null
  responses: readonly (DecisionResponseLike & { at: string })[]
}

/** Les membres que la lecture d'une proposition nomme. */
export interface DecisionNames {
  /** Les membres actifs, dans l'ordre de l'espace. */
  active: readonly DecisionMemberRef[]
  /** Tous les prénoms, anciens membres compris. */
  names: ReadonlyMap<string, string>
}

const refOf = (
  id: string | null,
  names: ReadonlyMap<string, string>
): DecisionMemberRef | null =>
  id ? { id, displayName: names.get(id) ?? 'Un membre' } : null

/** L'étape où se trouve ce que la proposition vise. */
export function stageOfDecision(
  decision: Pick<DecisionRecord, 'fromStatus'>
): WorkflowStage {
  return decision.fromStatus === null
    ? 'a-valider'
    : stageOfStatus(decision.fromStatus)
}

/** La lecture d'une proposition par un membre. */
export function decisionProposalView(
  record: DecisionRecord,
  viewerId: string,
  context: DecisionNames
): DecisionProposal {
  const activeIds = context.active.map(m => m.id)
  const waiting = new Set(waitingIds(record, activeIds))
  return {
    id: record.id,
    target: record.target,
    listingId: record.listingId,
    draftId: record.draftId,
    title: record.title,
    choice: record.choice,
    choiceLabel: choiceLabel(record.target, record.choice),
    reason: record.reason ?? null,
    state: record.state,
    resolution: record.resolution,
    appliedChoice: record.appliedChoice,
    fromStatus: record.fromStatus,
    fromStage: stageOfDecision(record),
    author: refOf(record.authorId, context.names),
    channel: record.channel,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    closedAt: record.closedAt,
    closedBy: refOf(record.closedById, context.names),
    responses: record.responses.map(r => ({
      member: refOf(r.memberId, context.names) as DecisionMemberRef,
      agrees: r.agrees,
      choice: r.choice,
      reason: r.reason ?? null,
      at: r.at,
    })),
    waitingFor: context.active.filter(m => waiting.has(m.id)),
    settleOptions: settleOptions(record),
    viewer: decisionViewer(record, viewerId, activeIds),
  }
}

/** Les prénoms qu'on attend : « Chloé », « Chloé et Léa ». */
export function waitingNames(
  decision: Pick<DecisionProposal, 'waitingFor'>
): string {
  return joinFrench(decision.waitingFor.map(m => m.displayName))
}

/** « En attente de Chloé » ; plus personne : « Plus personne à attendre ». */
export function waitingLabel(
  decision: Pick<DecisionProposal, 'waitingFor'>
): string {
  return decision.waitingFor.length
    ? `En attente de ${waitingNames(decision)}`
    : 'Plus personne à attendre'
}

/** « Tu proposes : À visiter », « Tu proposes : Écarter (trop de travaux) ». */
function choiceWithReason(decision: DecisionProposal): string {
  return decision.choice === 'discard' && decision.reason
    ? `${decision.choiceLabel} (${decision.reason})`
    : decision.choiceLabel
}

/** Le côté d'un choix à trancher : qui, quoi, pourquoi. */
export interface DecisionSide {
  memberId: string | null
  who: string
  choice: DecisionChoice
  choiceLabel: string
  reason: string | null
}

/** Les choix côte à côte de « À trancher ensemble », l'auteur d'abord. */
export function decisionSides(decision: DecisionProposal): DecisionSide[] {
  const sides: DecisionSide[] = [
    {
      memberId: decision.author?.id ?? null,
      who: decision.author?.displayName ?? 'Un membre',
      choice: decision.choice,
      choiceLabel: decision.choiceLabel,
      reason: decision.reason,
    },
  ]
  for (const response of decision.responses) {
    if (response.agrees || !response.choice) continue
    sides.push({
      memberId: response.member.id,
      who: response.member.displayName,
      choice: response.choice,
      choiceLabel: choiceLabel(decision.target, response.choice),
      reason: response.reason,
    })
  }
  return sides
}

/** Ce que la ligne d'une annonce dit sous sa pastille. */
export function decisionDetail(
  decision: DecisionProposal,
  viewerId: string | null
): string {
  const authorName = decision.author?.displayName ?? 'Un membre'
  if (decision.state === 'to_settle') {
    return decisionSides(decision)
      .map(
        side =>
          `${side.memberId === viewerId ? 'Toi' : side.who} : ${side.choiceLabel}`
      )
      .join(' · ')
  }
  const who = decision.viewer.isAuthor ? 'Tu proposes' : `${authorName} propose`
  return `${who} : ${choiceWithReason(decision)}`
}

/** La phrase du bandeau de la fiche ; `since` : « hier », « 3 j ». */
export function decisionBannerText(
  decision: DecisionProposal,
  since: string | null = null
): {
  head: string
  body: string
} {
  const authorName = decision.author?.displayName ?? 'Un membre'
  const from = decision.fromStatus
    ? LISTING_STATUS_LABELS[decision.fromStatus]
    : 'À valider'
  const sentence = choiceSentence(decision.target, decision.choice)
  if (decision.viewer.isAuthor) {
    return {
      head: `Tu proposes de ${sentence}.`,
      body: decision.waitingFor.length
        ? `En attente de ${waitingNames(decision)}${since ? `, depuis ${since}` : ''}. ${decision.target === 'listing' ? 'L’annonce' : 'Le brouillon'} reste ${from} d’ici là.`
        : `Plus personne à attendre : décide sans attendre pour l’appliquer.`,
    }
  }
  return {
    head: `${authorName} propose de ${sentence}.`,
    body: decision.reason ? `« ${decision.reason} »` : '',
  }
}

/** « C'est proposé. En attente de Chloé. » */
export function proposedMessage(names: string): string {
  return names
    ? `C’est proposé. En attente de ${names}.`
    : 'C’est proposé. Plus personne à attendre : décide sans attendre pour l’appliquer.'
}

/**
 * La réponse du connecteur quand une décision à deux devient une proposition
 * au nom du membre connecté.
 */
export function mcpProposedMessage(input: {
  target: DecisionTargetKind
  fromStatus: ListingStatus | null
  names: string
}): string {
  const what = input.target === 'listing' ? 'L’annonce' : 'Le brouillon'
  const where = input.fromStatus
    ? LISTING_STATUS_LABELS[input.fromStatus]
    : 'À valider'
  return input.names
    ? `C’est proposé en ton nom. ${what} reste ${where} tant que ${input.names} n’a pas confirmé.`
    : `C’est proposé en ton nom. ${what} reste ${where} ; plus personne à attendre : décide sans attendre dans l’application.`
}

/** Le refus du connecteur : une proposition d'un autre membre est en cours. */
export function mcpBlockedMessage(input: {
  authorName: string
  choiceLabel: string
  toSettle: boolean
}): string {
  return input.toSettle
    ? `Vos choix diffèrent sur cette annonce (« À trancher ensemble ») : tranchez-la dans l’application.`
    : `${input.authorName} a déjà proposé « ${input.choiceLabel} » pour cette annonce. Claude ne confirme jamais pour un autre membre : répondez dans l’application.`
}

/** La ligne d'une proposition en cours dans les réponses du connecteur. */
export function mcpDecisionLine(decision: DecisionProposal): string {
  const author = decision.author?.displayName ?? 'Un membre'
  return decision.state === 'to_settle'
    ? `proposition à trancher ensemble dans l’application (${author} proposait ${decision.choiceLabel})`
    : `proposition en cours : ${author} propose ${decision.choiceLabel}, ${decision.waitingFor.length ? `en attente de ${waitingNames(decision)}` : 'plus personne à attendre'} ; le statut ne bouge pas d’ici là`
}

/** La phrase après une réponse d'accord, quand d'autres membres doivent encore répondre. */
export function waitingAfterAgreeMessage(names: string): string {
  return `C’est noté. En attente de ${names}.`
}

/** La phrase après un non. */
export const TO_SETTLE_MESSAGE =
  'C’est noté : elle part dans « À trancher ensemble ».'

/** La phrase après qu'une décision s'est appliquée. */
export function appliedMessage(
  target: DecisionTargetKind,
  choice: DecisionChoice,
  listingStatus: ListingStatus | null
): string {
  if (choice === 'discard') return 'C’est appliqué : elle est écartée.'
  if (target === 'draft') return 'C’est appliqué : elle passe À étudier.'
  if (choice === 'keep') return 'C’est appliqué : elle reste où elle est.'
  return listingStatus
    ? `C’est appliqué : elle passe ${LISTING_STATUS_LABELS[listingStatus]}.`
    : 'C’est appliqué.'
}

/** Ce qui se passe quand un brouillon est déjà devenu une annonce. */
export const CREATED_LISTING_NO_UNDO =
  'Ce brouillon est devenu une annonce : pour l’écarter, ouvre sa fiche.'

/** Les propositions qu'un membre qui part laisse derrière lui : les siennes sont retirées. */
export function proposalsOfDeparted<
  T extends Pick<DecisionLike, 'state' | 'authorId'>,
>(decisions: readonly T[], memberId: string): T[] {
  return decisions.filter(
    d => d.authorId === memberId && isOpenDecision(d.state)
  )
}
