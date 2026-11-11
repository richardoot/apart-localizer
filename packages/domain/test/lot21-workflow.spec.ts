/**
 * Lot 21, suivre ses annonces : quelle étape pour quel statut, état et
 * bouton de chaque ligne, ordre d'une étape, compteurs, « Ce qui t'attend »
 * propre au membre connecté (sans aucune note révélée), étape par défaut.
 * Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type {
  DecisionProposal,
  ListingStageFacts,
  OpinionSummary,
} from '@apart/contracts'
import { WORKFLOW_STAGES } from '@apart/contracts'
import {
  archivedByLabel,
  decisionRowKind,
  defaultStage,
  finishLabel,
  isOutOfCriteria,
  isWithinRadius,
  isWorkflowStage,
  listingRowKind,
  orderStageRows,
  sessionIntro,
  stageRowAction,
  stageRowPill,
  statusesOfStage,
  workflowOverview,
} from '../src/index.js'
import type {
  StageRowListing,
  StageRowKind,
  WorkflowListingFact,
  WorkflowDraftFact,
} from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const members = [
  { id: RICHARD, displayName: 'Richard' },
  { id: CHLOE, displayName: 'Chloé' },
]

const viewer = (
  over: Partial<DecisionProposal['viewer']> = {}
): DecisionProposal['viewer'] => ({
  isAuthor: true,
  hasResponded: false,
  canRespond: false,
  canWithdraw: true,
  canDecideNow: true,
  canSettle: false,
  nobodyLeft: false,
  ...over,
})

const decision = (over: Partial<DecisionProposal> = {}): DecisionProposal => ({
  id: '11111111-1111-4111-8111-111111111111',
  target: 'listing',
  listingId: '22222222-2222-4222-8222-222222222222',
  draftId: null,
  title: '[Exemple] T3',
  choice: 'to_visit',
  choiceLabel: 'À visiter',
  reason: null,
  state: 'open',
  resolution: null,
  appliedChoice: null,
  fromStatus: 'to_study',
  fromStage: 'a-etudier',
  author: { id: RICHARD, displayName: 'Richard' },
  channel: 'web',
  sessionId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  closedAt: null,
  closedBy: null,
  responses: [],
  waitingFor: [{ id: CHLOE, displayName: 'Chloé' }],
  settleOptions: [],
  viewer: viewer(),
  ...over,
})

const stage = (over: Partial<ListingStageFacts> = {}): ListingStageFacts => ({
  nextVisitAt: null,
  nextVisitNames: [],
  lastVisitAt: null,
  archivedAt: null,
  archivedBy: null,
  ...over,
})

const summary = (over: Partial<OpinionSummary> = {}): OpinionSummary =>
  ({
    blind: true,
    masked: false,
    revealed: false,
    viewerRated: true,
    members: [],
    rows: [],
    agreements: 0,
    disagreementKeys: [],
    maxGap: null,
    commonScore: 4,
    status: 'complete',
    pendingMemberIds: [],
    sentence: '',
    ...over,
  }) as OpinionSummary

const rowListing = (over: Partial<StageRowListing> = {}): StageRowListing => ({
  status: 'to_study',
  decision: null,
  stage: stage(),
  offers: [],
  opinionSummary: null,
  ...over,
})

const listingFact = (
  over: Partial<WorkflowListingFact> = {}
): WorkflowListingFact => ({
  id: 'l1',
  status: 'to_study',
  fit: { level: 'in', kept: null },
  plannedVisits: 0,
  viewerRated: false,
  lastOffer: null,
  decision: null,
  ...over,
})

const draftFact = (
  over: Partial<WorkflowDraftFact> = {}
): WorkflowDraftFact => ({
  id: 'd1',
  fit: { level: 'in', kept: null },
  decision: null,
  ...over,
})

describe('les étapes', () => {
  it('chaque étape a ses statuts ; À valider, les brouillons', () => {
    expect(statusesOfStage('a-valider')).toEqual([])
    expect(statusesOfStage('a-etudier')).toEqual(['to_study'])
    expect(statusesOfStage('a-visiter')).toEqual(['to_visit'])
    expect(statusesOfStage('visitees')).toEqual(['visited'])
    expect(statusesOfStage('offres')).toEqual(['offer_made', 'offer_accepted'])
    expect(statusesOfStage('archives')).toEqual([
      'discarded',
      'offer_refused',
      'sold_or_withdrawn',
    ])
  })

  it('reconnaît un identifiant d’étape', () => {
    for (const stageId of WORKFLOW_STAGES) {
      expect(isWorkflowStage(stageId)).toBe(true)
    }
    expect(isWorkflowStage('a-trancher')).toBe(false)
    expect(isWorkflowStage(3)).toBe(false)
  })

  it('l’étape qui s’ouvre sans adresse : la première qui a quelque chose', () => {
    expect(
      defaultStage([
        { stage: 'a-valider', count: 0 },
        { stage: 'a-etudier', count: 5 },
      ])
    ).toBe('a-etudier')
    expect(defaultStage([{ stage: 'a-valider', count: 2 }])).toBe('a-valider')
    expect(defaultStage([{ stage: 'archives', count: 9 }])).toBe('a-valider')
    expect(defaultStage([])).toBe('a-valider')
  })

  it('une annonce hors critères et pas gardée est repliée', () => {
    expect(isOutOfCriteria({ level: 'out', kept: null })).toBe(true)
    expect(isOutOfCriteria({ level: 'out', kept: 'visit' })).toBe(false)
    expect(isOutOfCriteria({ level: 'margin', kept: null })).toBe(false)
    expect(isOutOfCriteria(null)).toBe(false)
  })
})

describe('l’état et le bouton d’une ligne', () => {
  it('d’après sa proposition', () => {
    expect(decisionRowKind(null)).toBe('to_sort')
    expect(decisionRowKind(decision())).toBe('waiting')
    expect(
      decisionRowKind(
        decision({
          viewer: viewer({ isAuthor: false, canRespond: true }),
        })
      )
    ).toBe('to_confirm')
    expect(decisionRowKind(decision({ state: 'to_settle' }))).toBe('to_settle')
    expect(
      decisionRowKind(decision({ viewer: viewer({ nobodyLeft: true }) }))
    ).toBe('ready')
  })

  it('à chaque étape', () => {
    expect(listingRowKind(rowListing())).toBe('to_sort')
    expect(listingRowKind(rowListing({ status: 'to_visit' }))).toBe('no_date')
    expect(
      listingRowKind(
        rowListing({
          status: 'to_visit',
          stage: stage({ nextVisitAt: '2026-11-17T18:30:00.000Z' }),
        })
      )
    ).toBe('visit_planned')
    expect(
      listingRowKind(
        rowListing({
          status: 'visited',
          opinionSummary: summary({ viewerRated: false }),
        })
      )
    ).toBe('to_rate')
    expect(
      listingRowKind(
        rowListing({
          status: 'visited',
          opinionSummary: summary({ disagreementKeys: ['quiet'] }),
        })
      )
    ).toBe('to_discuss')
    expect(
      listingRowKind(
        rowListing({
          status: 'visited',
          opinionSummary: summary({ status: 'pending' }),
        })
      )
    ).toBe('opinions_waiting')
    expect(
      listingRowKind(
        rowListing({ status: 'visited', opinionSummary: summary() })
      )
    ).toBe('opinions_complete')
    expect(listingRowKind(rowListing({ status: 'visited' }))).toBe(
      'opinions_complete'
    )
    expect(listingRowKind(rowListing({ status: 'offer_made' }))).toBe(
      'offer_pending'
    )
    expect(
      listingRowKind(
        rowListing({
          status: 'offer_made',
          offers: [{ response: 'counter_offer' }],
        })
      )
    ).toBe('offer_counter')
    expect(listingRowKind(rowListing({ status: 'offer_accepted' }))).toBe(
      'offer_accepted'
    )
    expect(listingRowKind(rowListing({ status: 'discarded' }))).toBe(
      'archived_discarded'
    )
    expect(listingRowKind(rowListing({ status: 'offer_refused' }))).toBe(
      'archived_refused'
    )
    expect(listingRowKind(rowListing({ status: 'sold_or_withdrawn' }))).toBe(
      'archived_sold'
    )
  })

  it('une proposition en cours prime sur l’état de l’étape', () => {
    expect(
      listingRowKind(rowListing({ status: 'to_visit', decision: decision() }))
    ).toBe('waiting')
  })

  it('les pastilles et les boutons de la maquette', () => {
    const expected: Array<[StageRowKind, string, string, string]> = [
      ['to_sort', 'À trier', 'sort', 'Trier'],
      ['waiting', 'En attente de Chloé', 'open', 'Voir'],
      ['ready', 'Plus personne à attendre', 'open', 'Voir'],
      ['to_confirm', 'À confirmer', 'confirm', 'Confirmer'],
      ['to_settle', 'À trancher', 'settle', 'Trancher'],
      ['no_date', 'Sans date', 'plan', 'Planifier'],
      ['visit_planned', 'Visite prévue', 'prepare', 'Préparer'],
      ['to_rate', 'À toi de noter', 'rate', 'Donner mon avis'],
      ['to_discuss', 'À rediscuter', 'opinions', 'Voir nos avis'],
      ['opinions_complete', 'Avis complets', 'opinions', 'Voir nos avis'],
      ['opinions_waiting', 'Avis en attente', 'opinions', 'Voir nos avis'],
      ['offer_pending', 'Réponse attendue', 'follow', 'Suivre'],
      ['offer_accepted', 'Offre acceptée', 'follow', 'Suivre'],
      ['offer_counter', 'Contre-proposition', 'follow', 'Suivre'],
      ['archived_discarded', 'Écartée', 'rescue', 'Repêcher'],
      ['archived_refused', 'Offre refusée', 'rescue', 'Repêcher'],
      ['archived_sold', 'Vendue', 'open', 'Voir'],
    ]
    for (const [kind, pill, action, label] of expected) {
      expect(stageRowPill(kind, decision())).toBe(pill)
      expect(stageRowAction(kind)).toEqual({ kind: action, label })
    }
    expect(stageRowPill('waiting', null)).toBe('En attente')
  })
})

describe('l’ordre d’une étape', () => {
  const row = (
    kind: StageRowKind,
    nextVisitAt: string | null = null,
    archivedAt: string | null = null
  ) => ({ kind, nextVisitAt, archivedAt })

  it('à trier d’abord, puis en attente, à confirmer, à trancher', () => {
    const rows = [
      row('to_settle'),
      row('to_confirm'),
      row('waiting'),
      row('to_sort'),
      row('to_sort'),
    ]
    expect(orderStageRows('a-valider', rows).map(r => r.kind)).toEqual([
      'to_sort',
      'to_sort',
      'waiting',
      'to_confirm',
      'to_settle',
    ])
  })

  it('À visiter : sans date d’abord, puis par date', () => {
    const rows = [
      row('visit_planned', '2026-11-21T10:00:00.000Z'),
      row('visit_planned', '2026-11-17T18:30:00.000Z'),
      row('no_date'),
      row('visit_planned', '2026-11-17T18:30:00.000Z'),
    ]
    const ordered = orderStageRows('a-visiter', rows)
    expect(ordered.map(r => r.nextVisitAt)).toEqual([
      null,
      '2026-11-17T18:30:00.000Z',
      '2026-11-17T18:30:00.000Z',
      '2026-11-21T10:00:00.000Z',
    ])
    // Une date avant « sans date » dans l'entrée : même résultat.
    expect(
      orderStageRows('a-visiter', [
        row('no_date'),
        row('visit_planned', 'x'),
      ])[0]?.kind
    ).toBe('no_date')
  })

  it('Archives : les plus récentes d’abord', () => {
    const rows = [
      row('archived_sold', null, '2026-10-02T10:00:00.000Z'),
      row('archived_discarded', null, '2026-11-03T10:00:00.000Z'),
      row('archived_refused', null, null),
    ]
    expect(orderStageRows('archives', rows).map(r => r.kind)).toEqual([
      'archived_discarded',
      'archived_sold',
      'archived_refused',
    ])
  })

  it('reste stable entre deux lignes de même rang', () => {
    const a = row('to_rate')
    const b = row('to_rate')
    expect(orderStageRows('visitees', [a, b])).toEqual([a, b])
  })
})

describe('qui a rangé une annonce aux archives', () => {
  it('nomme le refus, l’accord à deux, Claude ou le membre', () => {
    const base = { channel: 'web' as const, actorName: 'Chloé', after: null }
    expect(archivedByLabel({ ...base, status: 'offer_refused' })).toBe(
      'Refus du vendeur'
    )
    expect(archivedByLabel({ ...base, status: 'discarded' })).toBe('Chloé')
    expect(
      archivedByLabel({
        ...base,
        status: 'discarded',
        after: {
          decision: {
            proposalId: 'p',
            resolution: 'agreed',
            authorName: 'Richard',
            choiceLabel: 'Écarter',
            session: false,
          },
        },
      })
    ).toBe('Richard et Chloé')
    expect(
      archivedByLabel({
        ...base,
        status: 'discarded',
        actorName: null,
        after: {
          decision: {
            proposalId: 'p',
            resolution: 'agreed',
            authorName: 'Richard',
            choiceLabel: 'Écarter',
            session: false,
          },
        },
      })
    ).toBe('Richard')
    expect(
      archivedByLabel({ ...base, status: 'sold_or_withdrawn', channel: 'mcp' })
    ).toBe('Claude, pour Chloé')
    expect(
      archivedByLabel({
        ...base,
        status: 'sold_or_withdrawn',
        channel: 'mcp',
        actorName: null,
      })
    ).toBe('Claude')
  })
})

describe('les compteurs et « Ce qui t’attend »', () => {
  const overview = (input: {
    listings?: WorkflowListingFact[]
    drafts?: WorkflowDraftFact[]
    proposals?: DecisionProposal[]
    decideTogether?: boolean
    activeMembers?: typeof members
    dismissedDrafts?: number
  }) =>
    workflowOverview({
      viewerId: RICHARD,
      decideTogether: input.decideTogether ?? true,
      activeMembers: input.activeMembers ?? members,
      listings: input.listings ?? [],
      drafts: input.drafts ?? [],
      proposals: input.proposals ?? [],
      dismissedDrafts: input.dismissedDrafts ?? 0,
    })

  const count = (o: ReturnType<typeof overview>, stage: string) =>
    o.stages.find(s => s.stage === stage)

  it('l’espace décide à plusieurs : au moins deux membres et le réglage', () => {
    expect(overview({}).agreementRequired).toBe(true)
    expect(overview({ decideTogether: false }).agreementRequired).toBe(false)
    expect(
      overview({ activeMembers: members.slice(0, 1) }).agreementRequired
    ).toBe(false)
    expect(overview({}).others).toEqual([members[1]])
  })

  it('les brouillons écartés comptent dans les archives', () => {
    expect(count(overview({ dismissedDrafts: 3 }), 'archives')?.count).toBe(3)
    expect(count(overview({}), 'archives')?.count).toBe(0)
  })

  it('un point est dans le rayon, ou non', () => {
    const near = { longitude: -0.58, latitude: 44.84, radiusMeters: 500 }
    expect(isWithinRadius({ coordinates: [-0.58, 44.843] }, near)).toBe(true)
    expect(isWithinRadius({ coordinates: [-0.5, 44.9] }, near)).toBe(false)
  })

  it('compte chaque étape, les hors critères à part', () => {
    const o = overview({
      drafts: [
        draftFact(),
        draftFact({ id: 'd2', decision: decision() }),
        draftFact({ id: 'd3', fit: { level: 'out', kept: null } }),
        draftFact({ id: 'd4', fit: null }),
      ],
      listings: [
        listingFact(),
        listingFact({ id: 'l2', decision: decision() }),
        listingFact({ id: 'l3', fit: { level: 'out', kept: null } }),
        listingFact({ id: 'l4', status: 'to_visit' }),
        listingFact({ id: 'l5', status: 'to_visit', plannedVisits: 1 }),
        listingFact({ id: 'l6', status: 'visited' }),
        listingFact({ id: 'l7', status: 'visited', viewerRated: true }),
        listingFact({ id: 'l8', status: 'offer_made' }),
        listingFact({
          id: 'l9',
          status: 'offer_made',
          lastOffer: 'counter_offer',
        }),
        listingFact({ id: 'l10', status: 'offer_accepted' }),
        listingFact({ id: 'l11', status: 'discarded' }),
      ],
    })
    expect(count(o, 'a-valider')).toMatchObject({
      count: 3,
      outOfCriteria: 1,
      toSort: 2,
      sub: '2 à trier',
    })
    expect(count(o, 'a-etudier')).toMatchObject({
      count: 2,
      outOfCriteria: 1,
      toSort: 1,
      sub: '1 à trier',
    })
    expect(count(o, 'a-visiter')).toMatchObject({
      count: 2,
      sub: '1 sans date',
    })
    expect(count(o, 'visitees')).toMatchObject({
      count: 2,
      sub: '1 avis à donner',
    })
    expect(count(o, 'offres')).toMatchObject({
      count: 3,
      sub: 'Réponse attendue',
    })
    expect(count(o, 'archives')).toMatchObject({
      count: 1,
      sub: 'Écartées, refusées, vendues',
    })
  })

  it('dit quand il n’y a rien, ou plusieurs réponses attendues', () => {
    const empty = overview({})
    expect(count(empty, 'a-valider')?.sub).toBe('Rien à trier')
    expect(count(empty, 'a-visiter')?.sub).toBe('Rien de prévu')
    expect(count(empty, 'visitees')?.sub).toBe('Aucune encore')
    expect(count(empty, 'offres')?.sub).toBe('Aucune en cours')
    const full = overview({
      listings: [
        listingFact({ status: 'to_visit', plannedVisits: 1 }),
        listingFact({ status: 'visited', viewerRated: true }),
        listingFact({ status: 'offer_made' }),
        listingFact({ status: 'offer_made' }),
      ],
    })
    expect(count(full, 'a-visiter')?.sub).toBe('Toutes datées')
    expect(count(full, 'visitees')?.sub).toBe('Avis donnés')
    expect(count(full, 'offres')?.sub).toBe('2 réponses attendues')
    const accepted = overview({
      listings: [listingFact({ status: 'offer_accepted' })],
    })
    expect(count(accepted, 'offres')?.sub).toBe('Rien en attente')
  })

  it('ce qui attend le membre connecté, dans l’ordre du bandeau', () => {
    const toConfirm = decision({
      viewer: viewer({ isAuthor: false, canRespond: true }),
    })
    const toSettle = decision({
      state: 'to_settle',
      viewer: viewer({ canSettle: true, canDecideNow: false }),
    })
    const o = overview({
      drafts: [draftFact()],
      listings: [
        listingFact({ id: 'a' }),
        listingFact({ id: 'b', status: 'to_visit' }),
        listingFact({ id: 'c', status: 'to_visit' }),
        listingFact({ id: 'd', status: 'visited' }),
      ],
      proposals: [
        toConfirm,
        toSettle,
        decision({
          viewer: viewer({ nobodyLeft: true }),
          fromStage: 'a-valider',
        }),
      ],
    })
    // Lot 23 : chaque ligne porte aussi sa précision et l'annonce unique qu'elle vise.
    expect(
      o.agenda.map(({ detail: _d, listingId: _l, ...rest }) => rest)
    ).toEqual([
      { key: 'to_sort', count: 2, label: 'à trier', stage: 'a-valider' },
      {
        key: 'to_confirm',
        count: 1,
        label: 'à confirmer après Chloé',
        stage: null,
      },
      {
        key: 'to_settle',
        count: 1,
        label: 'à trancher ensemble',
        stage: null,
      },
      { key: 'ready', count: 1, label: 'à finaliser', stage: 'a-valider' },
      {
        key: 'visits_to_plan',
        count: 2,
        label: 'visites à planifier',
        stage: 'a-visiter',
      },
      {
        key: 'opinions_to_give',
        count: 1,
        label: 'avis à donner',
        stage: 'visitees',
      },
    ])
  })

  it('à trier sur À étudier seulement ; une seule visite ; plusieurs autres membres', () => {
    const o = overview({
      activeMembers: [...members, { id: 'x', displayName: 'Léa' }],
      listings: [listingFact(), listingFact({ id: 'b', status: 'to_visit' })],
      proposals: [
        decision({ viewer: viewer({ isAuthor: false, canRespond: true }) }),
      ],
    })
    expect(o.agenda[0]).toMatchObject({ key: 'to_sort', stage: 'a-etudier' })
    expect(o.agenda[1]?.label).toBe('à confirmer après les autres')
    expect(o.agenda[2]?.label).toBe('visite à planifier')
  })

  it('rien à faire : un bandeau vide', () => {
    expect(overview({}).agenda).toEqual([])
  })

  it('n’utilise que « a noté ou non » : aucune note dans la réponse', () => {
    const o = overview({
      listings: [listingFact({ status: 'visited', viewerRated: false })],
    })
    expect(JSON.stringify(o)).not.toContain('rating')
    expect(JSON.stringify(o)).not.toContain('score')
  })
})

describe('les phrases de la session', () => {
  it('prévient les autres par leur prénom', () => {
    expect(finishLabel(members.slice(1))).toBe('Terminer et prévenir Chloé')
    expect(
      finishLabel([...members.slice(1), { id: 'x', displayName: 'Léa' }])
    ).toBe('Terminer et prévenir Chloé et Léa')
    expect(finishLabel([])).toBe('Terminer')
    expect(sessionIntro(members.slice(1))).toBe(
      'Tes choix sont des propositions : Chloé les verra quand tu auras fini.'
    )
    expect(
      sessionIntro([...members.slice(1), { id: 'x', displayName: 'Léa' }])
    ).toContain('Chloé et Léa les verront')
  })
})
