import type { DecisionChoice, ListingStatus } from '@apart/contracts'
import { choiceLabel } from '@apart/domain'
import type { DecisionJournal } from '@apart/domain'
import { demoId } from './ids.js'

/**
 * Lot 21 : les décisions fictives du jeu de démo, une dans chaque état (en
 * attente de l'autre, à confirmer, à trancher, appliquée d'un commun accord,
 * décidée sans attendre, retirée). Données pures, comme le reste du jeu.
 */

type Handle = 'demo' | 'demo2'

export interface DemoDecisionResponse {
  by: Handle
  agrees: boolean
  choice: DecisionChoice | null
  reason: string | null
  at: string
}

export interface DemoDecision {
  id: string
  listingKey: string | null
  draftId: string | null
  author: Handle
  choice: DecisionChoice
  reason: string | null
  state: 'open' | 'to_settle' | 'applied' | 'withdrawn'
  resolution: 'agreed' | 'without_waiting' | null
  appliedChoice: DecisionChoice | null
  fromStatus: ListingStatus | null
  createdAt: string
  closedAt: string | null
  closedBy: Handle | null
  responses: DemoDecisionResponse[]
}

export interface DemoDecisionSeed {
  at: (daysAgo: number, hour: number, minute?: number) => string
  names: Record<Handle, string>
  listing: (key: string) => { id: string; title: string; status: ListingStatus }
  draft: (title: string) => { id: string; title: string }
  log: (entry: {
    at: string
    actor: Handle | null
    channel: 'web' | 'mcp' | 'system'
    action: string
    listingKey: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
  }) => void
  /** La ligne de statut déjà écrite pour cette annonce : elle cite la décision. */
  markStatusLine: (listingKey: string, decision: DecisionJournal) => void
}

export function buildDemoDecisions(seed: DemoDecisionSeed): DemoDecision[] {
  const { at, names, listing, draft, log, markStatusLine } = seed
  const decisions: DemoDecision[] = []

  function propose(input: {
    key: string
    listingKey?: string
    draftTitle?: string
    author: Handle
    choice: DecisionChoice
    reason?: string
    days: number
    state?: DemoDecision['state']
    resolution?: DemoDecision['resolution']
    appliedChoice?: DecisionChoice
    fromStatus?: ListingStatus
    closedAt?: string
    closedBy?: Handle
    responses?: DemoDecisionResponse[]
  }): DemoDecision {
    const target = input.listingKey
      ? listing(input.listingKey)
      : draft(input.draftTitle as string)
    const kind = input.listingKey ? 'listing' : 'draft'
    const label = choiceLabel(kind, input.choice)
    const createdAt = at(input.days, 18, 30)
    const decision: DemoDecision = {
      id: demoId(`decision:${input.key}`),
      listingKey: input.listingKey ?? null,
      draftId: input.listingKey ? null : target.id,
      author: input.author,
      choice: input.choice,
      reason: input.reason ?? null,
      state: input.state ?? 'open',
      resolution: input.resolution ?? null,
      appliedChoice: input.appliedChoice ?? null,
      fromStatus: input.listingKey
        ? (input.fromStatus ?? listing(input.listingKey).status)
        : null,
      createdAt,
      closedAt: input.closedAt ?? null,
      closedBy: input.closedBy ?? null,
      responses: input.responses ?? [],
    }
    decisions.push(decision)
    log({
      at: createdAt,
      actor: input.author,
      channel: 'web',
      action: 'decision.proposed',
      listingKey: input.listingKey ?? null,
      after: {
        proposalId: decision.id,
        target: kind,
        title: target.title,
        choice: input.choice,
        choiceLabel: label,
        reason: input.reason ?? null,
        fromStatus: decision.fromStatus,
        session: true,
      },
    })
    return decision
  }

  // À valider.
  propose({
    key: 'waiting-draft',
    draftTitle: '[Exemple] T3 68 m², balcon sud',
    author: 'demo',
    choice: 'keep',
    reason: 'Le balcon plein sud vaut le détour.',
    days: 1,
  })
  propose({
    key: 'confirm-draft',
    draftTitle: '[Exemple] T3 63 m², proche tram',
    author: 'demo2',
    choice: 'keep',
    days: 1,
  })
  const clashDraft = propose({
    key: 'settle-draft',
    draftTitle: '[Exemple] T3, surface non indiquée',
    author: 'demo',
    choice: 'keep',
    reason: 'À creuser, le prix est bas pour le quartier.',
    days: 2,
    state: 'to_settle',
    responses: [
      {
        by: 'demo2',
        agrees: false,
        choice: 'discard',
        reason: 'Déjà vue',
        at: at(1, 21),
      },
    ],
  })
  log({
    at: at(1, 21),
    actor: 'demo2',
    channel: 'web',
    action: 'decision.disagreed',
    listingKey: null,
    after: {
      proposalId: clashDraft.id,
      choice: 'discard',
      choiceLabel: 'Écarter',
      proposedLabel: 'À étudier',
      authorName: names.demo,
      reason: 'Déjà vue',
      session: true,
    },
  })

  // À étudier.
  propose({
    key: 'waiting-listing',
    listingKey: 'cenon-t3',
    author: 'demo',
    choice: 'to_visit',
    reason: 'Prix correct, à voir sur place.',
    days: 1,
  })
  propose({
    key: 'confirm-listing',
    listingKey: 'begles-t3',
    author: 'demo2',
    choice: 'discard',
    reason: 'Trop de travaux',
    days: 1,
  })

  // Déjà tranché : une annonce passée À visiter d'un commun accord, une
  // décidée sans attendre, une proposition retirée.
  const agreedAt = at(5, 12)
  const agreed = propose({
    key: 'agreed',
    listingKey: 'bastide-t2',
    author: 'demo2',
    choice: 'to_visit',
    days: 6,
    state: 'applied',
    resolution: 'agreed',
    appliedChoice: 'to_visit',
    fromStatus: 'to_study',
    closedAt: agreedAt,
    closedBy: 'demo',
    responses: [
      { by: 'demo', agrees: true, choice: null, reason: null, at: agreedAt },
    ],
  })
  markStatusLine('bastide-t2', {
    proposalId: agreed.id,
    resolution: 'agreed',
    authorName: names.demo2,
    choiceLabel: 'À visiter',
    session: false,
  })
  const solo = propose({
    key: 'without-waiting',
    listingKey: 'merignac-t2',
    author: 'demo2',
    choice: 'to_visit',
    days: 4,
    state: 'applied',
    resolution: 'without_waiting',
    appliedChoice: 'to_visit',
    fromStatus: 'to_study',
    closedAt: at(3, 12),
    closedBy: 'demo2',
  })
  markStatusLine('merignac-t2', {
    proposalId: solo.id,
    resolution: 'without_waiting',
    authorName: names.demo2,
    waitedForNames: [names.demo],
    choiceLabel: 'À visiter',
    session: false,
  })
  const withdrawnAt = at(8, 10)
  const withdrawn = propose({
    key: 'withdrawn',
    listingKey: 'saint-michel-t3',
    author: 'demo',
    choice: 'discard',
    reason: 'Trop cher',
    days: 9,
    state: 'withdrawn',
    fromStatus: 'visited',
    closedAt: withdrawnAt,
    closedBy: 'demo',
  })
  log({
    at: withdrawnAt,
    actor: 'demo',
    channel: 'web',
    action: 'decision.withdrawn',
    listingKey: 'saint-michel-t3',
    after: {
      proposalId: withdrawn.id,
      choiceLabel: 'Écarter',
      notified: true,
    },
  })
  log({
    at: at(1, 22),
    actor: 'demo',
    channel: 'web',
    action: 'decision.session_finished',
    listingKey: null,
    after: { sessionId: 'demo-session', keep: 2, discard: 0 },
  })

  return decisions
}
