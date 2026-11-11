import { LISTING_STATUS_LABELS, WORKFLOW_STAGE_LABELS } from '@apart/contracts'
import type {
  ActivityChange,
  DecisionResolution,
  NotificationType,
} from '@apart/contracts'
import { joinFrench } from './exploration.js'

/**
 * Lot 21 (ADR 0031) : les décisions à plusieurs au journal et dans les
 * notifications. Une proposition entre au journal (`decision.proposed`) sans
 * changer de statut ; quand elle s'applique, seule la ligne de changement de
 * statut (ou de brouillon) la raconte, en citant l'auteur et qui confirme.
 * Une session de tri ne fait qu'une notification, à la fin. Pur.
 */

/** Ce que la ligne d'application garde de la décision. */
export interface DecisionJournal {
  proposalId: string
  resolution: DecisionResolution | 'undone'
  /** Le prénom de l'auteur de la proposition. */
  authorName: string | null
  /** Les prénoms de ceux qu'on n'a pas attendus (« sans attendre »). */
  waitedForNames?: string[]
  /** À trancher : les deux choix, avec le prénom de chacun. */
  sides?: Array<{ name: string; label: string }>
  /** Le libellé du choix appliqué. */
  choiceLabel: string
  /** La décision vient d'une session de tri : pas de notification à l'unité. */
  session: boolean
}

/** La ligne journalisée d'une décision appliquée, si elle en porte une. */
export function decisionJournalOf(after: unknown): DecisionJournal | null {
  const value = field(after, 'decision')
  return typeof value === 'object' && value !== null
    ? (value as DecisionJournal)
    : null
}

function field(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null
    ? (record as Record<string, unknown>)[key]
    : undefined
}
function text(record: unknown, key: string): string | null {
  const value = field(record, key)
  return typeof value === 'string' ? value : null
}
function num(record: unknown, key: string): number {
  const value = field(record, key)
  return typeof value === 'number' ? value : 0
}

function statusLabel(status: string | null): string {
  return status
    ? ((LISTING_STATUS_LABELS as Record<string, string>)[status] ?? status)
    : '—'
}

function quoted(value: string | null): string {
  return value ? ` : « ${value} »` : ''
}

/**
 * La phrase d'une décision appliquée, sans l'acteur : « a confirmé : À
 * étudier vers À visiter, proposé par Richard », « a tranché : Écarter
 * (Richard : À visiter, Chloé : Écarter) », « a décidé sans attendre Chloé :
 * À visiter ».
 */
export function appliedDecisionSummary(
  decision: DecisionJournal,
  fromLabel: string,
  toLabel: string
): string {
  switch (decision.resolution) {
    case 'agreed':
      return `a confirmé : ${fromLabel} vers ${toLabel}${decision.authorName ? `, proposé par ${decision.authorName}` : ''}`
    case 'settled': {
      const sides = (decision.sides ?? [])
        .map(s => `${s.name} : ${s.label}`)
        .join(', ')
      return `a tranché : ${toLabel}${sides ? ` (${sides})` : ''}`
    }
    case 'without_waiting':
      return `a décidé sans attendre ${joinFrench(decision.waitedForNames ?? []) || 'les autres'} : ${toLabel}`
    case 'undone':
      return `a annulé sa décision : retour ${toLabel}`
  }
}

/** « a trié 3 annonces : 2 à garder, 1 à écarter ». */
export function sessionProposedText(keep: number, discard: number): string {
  const total = keep + discard
  const parts = [
    keep > 0 ? `${keep} à garder` : null,
    discard > 0 ? `${discard} à écarter` : null,
  ].filter(Boolean)
  return `a trié ${total} annonce${total > 1 ? 's' : ''} : ${parts.join(', ')}`
}

/** « 2 annonces changent d'étape, 1 reste à trancher ». */
export function sessionAnsweredText(
  changed: number,
  toSettle: number,
  waiting: number
): string {
  const parts = [
    changed > 0
      ? `${changed} annonce${changed > 1 ? 's changent' : ' change'} d’étape`
      : null,
    toSettle > 0
      ? `${toSettle} ${toSettle > 1 ? 'restent' : 'reste'} à trancher`
      : null,
    waiting > 0
      ? `${waiting} ${waiting > 1 ? 'attendent' : 'attend'} encore`
      : null,
  ].filter(Boolean)
  return parts.join(', ') || 'rien ne change'
}

/** Une ligne du journal des décisions en français. */
export function describeDecisionActivity(
  action: string,
  after: unknown
): { summary: string; changes: ActivityChange[] } | null {
  switch (action) {
    case 'decision.proposed':
      return {
        summary: `propose ${text(after, 'choiceLabel') ?? 'une décision'}${quoted(text(after, 'reason'))}${targetSuffix(after)}`,
        changes: [],
      }
    case 'decision.disagreed':
      return {
        summary: `n’est pas d’accord : ${text(after, 'choiceLabel') ?? 'autre choix'}${text(after, 'authorName') ? `, ${text(after, 'authorName')} proposait ${text(after, 'proposedLabel') ?? ''}`.trimEnd() : ''}${quoted(text(after, 'reason'))}`,
        changes: [],
      }
    case 'decision.answered':
      return {
        summary: `est d’accord : ${text(after, 'choiceLabel') ?? 'la proposition'}`,
        changes: [],
      }
    case 'decision.response_undone':
      return {
        summary: `a annulé sa réponse sur « ${text(after, 'choiceLabel') ?? ''} »`,
        changes: [],
      }
    case 'decision.kept':
      return { summary: 'a tranché : on la garde où elle est', changes: [] }
    case 'decision.withdrawn':
      return {
        summary: `a retiré sa proposition « ${text(after, 'choiceLabel') ?? ''} »${text(after, 'via') === 'departure' ? ' (membre parti)' : ''}`,
        changes: [],
      }
    case 'decision.stale':
      return {
        summary: `proposition « ${text(after, 'choiceLabel') ?? ''} » devenue caduque : ${text(after, 'why') ?? 'l’annonce a changé'}`,
        changes: [],
      }
    case 'decision.session_finished':
      return {
        summary: sessionProposedText(num(after, 'keep'), num(after, 'discard')),
        changes: [],
      }
    case 'decision.session_answered': {
      const name = text(after, 'authorNames')
      return {
        summary: `a répondu au tri${name ? ` de ${name}` : ''} : ${sessionAnsweredText(
          num(after, 'changed'),
          num(after, 'toSettle'),
          num(after, 'waiting')
        )}`,
        changes: [],
      }
    }
    case 'workspace.decide_together_changed':
      return {
        summary:
          field(after, 'decideTogether') === true
            ? 'a activé « Décider à plusieurs »'
            : 'a désactivé « Décider à plusieurs »',
        changes: [],
      }
    default:
      return null
  }
}

function targetSuffix(after: unknown): string {
  return text(after, 'target') === 'draft' && text(after, 'title')
    ? ` (brouillon « ${text(after, 'title')} »)`
    : ''
}

/**
 * La phrase de la ligne de statut d'une décision appliquée, ou null pour un
 * changement de statut ordinaire.
 */
export function statusChangeSummary(
  before: unknown,
  after: unknown
): string | null {
  const decision = decisionJournalOf(after)
  if (!decision) return null
  return appliedDecisionSummary(
    decision,
    statusLabel(text(before, 'status')),
    statusLabel(text(after, 'status'))
  )
}

/**
 * La phrase d'un brouillon gardé ou écarté par une décision : « a confirmé :
 * À valider vers À étudier, proposé par Richard », ou null.
 */
export function draftDecisionSummary(
  action: string,
  after: unknown
): string | null {
  const decision = decisionJournalOf(after)
  if (!decision) return null
  const to = action === 'draft.dismissed' ? 'Écartée' : 'À étudier'
  return appliedDecisionSummary(
    decision,
    WORKFLOW_STAGE_LABELS['a-valider'],
    to
  )
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Vrai si cette écriture appartient à une session de tri (pas de notification à l'unité). */
function inSession(after: unknown): boolean {
  return (
    decisionJournalOf(after)?.session === true ||
    field(after, 'session') === true
  )
}

/** Le type de notification d'une écriture de décision, ou undefined si elle n'en relève pas. */
export function decisionNotificationType(
  action: string,
  after: unknown
): NotificationType | null | undefined {
  switch (action) {
    case 'decision.proposed':
      return inSession(after) ? null : 'decision_proposed'
    case 'decision.session_finished':
      return 'decision_proposed'
    case 'decision.disagreed':
      return inSession(after) ? null : 'decision_resolved'
    case 'decision.session_answered':
      return 'decision_resolved'
    case 'decision.withdrawn':
      // Rien à dire si les autres n'ont jamais été prévenus.
      return field(after, 'notified') === true ? 'decision_resolved' : null
    case 'decision.kept':
    case 'listing.status_changed':
    case 'draft.accepted':
    case 'draft.dismissed': {
      const decision = decisionJournalOf(after)
      if (!decision) return undefined
      if (decision.session || decision.resolution === 'undone') return null
      return 'decision_resolved'
    }
    default:
      return undefined
  }
}

/** Ce qu'une notification de décision dit à son destinataire. */
export interface DecisionNotificationText {
  title: string
  body: string
  url: string | null
}

/** La page de confirmation et celle des désaccords. */
export const CONFIRM_URL = '/annonces/tri?mode=confirmer'
export const SETTLE_URL = '/annonces/a-trancher'
export const DRAFTS_STAGE_URL = '/annonces?etape=a-valider'

/** Le texte d'une notification de décision. */
export function decisionNotificationText(input: {
  action: string
  before: unknown
  after: unknown
  actorName: string
  listingId: string | null
  listingTitle: string | null
  /** Le destinataire : le texte du retour d'un tri lui est propre. */
  recipientId: string
}): DecisionNotificationText {
  const { action, after, actorName } = input
  const title = input.listingTitle ?? text(after, 'title') ?? 'une annonce'
  const fiche = input.listingId
    ? `/annonces/${input.listingId}`
    : DRAFTS_STAGE_URL
  switch (action) {
    case 'decision.session_finished': {
      const keep = num(after, 'keep')
      const discard = num(after, 'discard')
      const total = keep + discard
      const parts = [
        keep > 0 ? `${keep} à garder` : null,
        discard > 0 ? `${discard} à écarter` : null,
      ].filter(Boolean)
      return {
        title: `${actorName} a trié ${total} annonce${total > 1 ? 's' : ''}`,
        body: `${parts.join(', ')} : à toi de confirmer.`,
        url: CONFIRM_URL,
      }
    }
    case 'decision.session_answered': {
      const perAuthor = field(after, 'perAuthor')
      const mine = Array.isArray(perAuthor)
        ? (perAuthor as Array<Record<string, unknown>>).find(
            p => p.authorId === input.recipientId
          )
        : undefined
      const changed = num(mine, 'changed')
      const toSettle = num(mine, 'toSettle')
      const waiting = num(mine, 'waiting')
      return {
        title:
          toSettle > 0 && changed === 0
            ? `${actorName} a répondu à ton tri`
            : `${actorName} a confirmé ton tri`,
        body: `${sessionAnsweredText(changed, toSettle, waiting)}.`,
        url: toSettle > 0 ? SETTLE_URL : '/annonces',
      }
    }
    case 'decision.proposed':
      return {
        title: `${actorName} propose ${text(after, 'choiceLabel') ?? ''} : ${title}`,
        body: text(after, 'reason')
          ? `« ${text(after, 'reason')} » À toi de confirmer.`
          : 'À toi de confirmer.',
        url: fiche,
      }
    case 'decision.disagreed':
      return {
        title: `${actorName} n’est pas d’accord : ${title}`,
        body: 'Les choix diffèrent : à trancher ensemble.',
        url: SETTLE_URL,
      }
    case 'decision.withdrawn':
      return {
        title: `${actorName} a retiré sa proposition : ${title}`,
        body: `« ${text(after, 'choiceLabel') ?? ''} » n’est plus proposé.`,
        url: fiche,
      }
    case 'decision.kept':
      return {
        title: `${actorName} a tranché : ${title}`,
        body: 'On la garde où elle est.',
        url: fiche,
      }
    default: {
      const decision = decisionJournalOf(after) as DecisionJournal
      const summary =
        action === 'listing.status_changed'
          ? statusChangeSummary(input.before, after)
          : draftDecisionSummary(action, after)
      const verb =
        decision.resolution === 'without_waiting'
          ? 'a décidé sans attendre'
          : decision.resolution === 'settled'
            ? 'a tranché'
            : 'a confirmé'
      return {
        title: `${actorName} ${verb} : ${title}`,
        body: `${actorName} ${summary ?? ''}.`,
        url: fiche,
      }
    }
  }
}

/** Les destinataires d'une notification de décision : le retour d'un tri va à ses auteurs. */
export function decisionRecipients(
  action: string,
  after: unknown,
  actorMemberId: string | null,
  memberIds: readonly string[]
): string[] {
  if (action === 'decision.session_answered') {
    const perAuthor = field(after, 'perAuthor')
    const authors = Array.isArray(perAuthor)
      ? (perAuthor as Array<Record<string, unknown>>)
          .map(p => p.authorId)
          .filter((id): id is string => typeof id === 'string')
      : []
    return memberIds.filter(id => authors.includes(id) && id !== actorMemberId)
  }
  return memberIds.filter(id => id !== actorMemberId)
}

/** Vrai si cette écriture crée une annonce par une décision (la notification vient de la décision). */
export function createdByDecision(after: unknown): boolean {
  return field(after, 'viaDecision') === true
}
