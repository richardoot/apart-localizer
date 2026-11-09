/**
 * Lot 21, décider à plusieurs : qui doit décider, ce qu'une réponse fait
 * d'une proposition, membres actifs et membre parti, caducité, droits de
 * chacun, lecture d'une proposition, phrases de l'interface et du MCP.
 * Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { DecisionProposal } from '@apart/contracts'
import {
  TO_SETTLE_MESSAGE,
  agreeLabel,
  agreementRequired,
  appliedMessage,
  choiceLabel,
  choiceOfStatusChange,
  choiceSentence,
  counterChoice,
  decideNowRefusal,
  decisionBannerText,
  decisionDetail,
  decisionProposalView,
  decisionSides,
  decisionViewer,
  isDecisionStale,
  isOpenDecision,
  mcpBlockedMessage,
  mcpDecisionLine,
  mcpProposedMessage,
  proposalsOfDeparted,
  proposedMessage,
  reasonOfChoice,
  refuseLabel,
  respondRefusal,
  settleOptions,
  settleRefusal,
  stageOfDecision,
  stageOfStatus,
  staleMessage,
  statusOfChoice,
  stepAfterResponse,
  waitingAfterAgreeMessage,
  waitingIds,
  waitingLabel,
  waitingNames,
  withdrawRefusal,
} from '../src/index.js'
import type { DecisionLike, DecisionRecord } from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LEA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ACTIVE = [RICHARD, CHLOE]

const open = (over: Partial<DecisionLike> = {}): DecisionLike => ({
  state: 'open',
  authorId: RICHARD,
  choice: 'to_visit',
  reason: null,
  responses: [],
  ...over,
})

const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  target: 'listing',
  listingId: '22222222-2222-4222-8222-222222222222',
  draftId: null,
  title: '[Exemple] T3 Bastide',
  state: 'open',
  authorId: RICHARD,
  choice: 'to_visit',
  reason: null,
  responses: [],
  fromStatus: 'to_study',
  resolution: null,
  appliedChoice: null,
  channel: 'web',
  sessionId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  closedAt: null,
  closedById: null,
  ...over,
})

const names = {
  active: [
    { id: RICHARD, displayName: 'Richard' },
    { id: CHLOE, displayName: 'Chloé' },
  ],
  names: new Map([
    [RICHARD, 'Richard'],
    [CHLOE, 'Chloé'],
    [LEA, 'Léa'],
  ]),
}

const view = (
  over: Partial<DecisionRecord> = {},
  viewer = RICHARD
): DecisionProposal => decisionProposalView(record(over), viewer, names)

describe('qui doit décider', () => {
  it('à plusieurs seulement : au moins deux membres actifs et le réglage activé', () => {
    expect(
      agreementRequired({ decideTogether: true, activeMemberIds: ACTIVE })
    ).toBe(true)
    expect(
      agreementRequired({ decideTogether: false, activeMemberIds: ACTIVE })
    ).toBe(false)
    expect(
      agreementRequired({ decideTogether: true, activeMemberIds: [RICHARD] })
    ).toBe(false)
  })

  it('À visiter et écarter se décident à plusieurs ; le reste est un fait', () => {
    expect(choiceOfStatusChange('to_study', 'to_visit')).toBe('to_visit')
    expect(choiceOfStatusChange('to_study', 'discarded')).toBe('discard')
    expect(choiceOfStatusChange('visited', 'discarded')).toBe('discard')
    expect(choiceOfStatusChange('to_visit', 'visited')).toBeNull()
    expect(choiceOfStatusChange('visited', 'offer_made')).toBeNull()
    expect(choiceOfStatusChange('offer_made', 'offer_accepted')).toBeNull()
    expect(choiceOfStatusChange('offer_made', 'offer_refused')).toBeNull()
    expect(choiceOfStatusChange('to_visit', 'sold_or_withdrawn')).toBeNull()
    expect(choiceOfStatusChange('to_visit', 'to_study')).toBeNull()
    // Repêcher : un fait.
    expect(choiceOfStatusChange('discarded', 'to_study')).toBeNull()
    // Rien ne change : rien à décider.
    expect(choiceOfStatusChange('to_visit', 'to_visit')).toBeNull()
  })

  it('le statut d’un choix appliqué', () => {
    expect(statusOfChoice('to_visit', 'to_study')).toBe('to_visit')
    expect(statusOfChoice('discard', 'visited')).toBe('discarded')
    expect(statusOfChoice('keep', 'visited')).toBe('visited')
  })

  it('l’autre choix d’un « non », comme dans la maquette', () => {
    expect(counterChoice('draft', 'keep', null)).toBe('discard')
    expect(counterChoice('draft', 'discard', null)).toBe('keep')
    expect(counterChoice('listing', 'to_visit', 'to_study')).toBe('discard')
    // À étudier, garder c'est aller voir.
    expect(counterChoice('listing', 'discard', 'to_study')).toBe('to_visit')
    // Ailleurs, l'annonce reste où elle est.
    expect(counterChoice('listing', 'discard', 'visited')).toBe('keep')
    expect(counterChoice('listing', 'to_visit', 'discarded')).toBe('keep')
    expect(counterChoice('listing', 'to_visit', 'sold_or_withdrawn')).toBe(
      'keep'
    )
    expect(counterChoice('listing', 'to_visit', null)).toBe('discard')
  })

  it('les libellés des choix', () => {
    expect(choiceLabel('draft', 'keep')).toBe('À étudier')
    expect(choiceLabel('listing', 'keep')).toBe('La garder')
    expect(choiceLabel('listing', 'to_visit')).toBe('À visiter')
    expect(choiceLabel('draft', 'discard')).toBe('Écarter')
    expect(refuseLabel('discard')).toBe('Non, je la garde')
    expect(refuseLabel('to_visit')).toBe('Non, à écarter')
    expect(agreeLabel('listing', 'discard')).toBe('D’accord : écarter')
    expect(agreeLabel('listing', 'to_visit')).toBe('D’accord : À visiter')
    expect(choiceSentence('listing', 'discard')).toBe('l’écarter')
    expect(choiceSentence('listing', 'to_visit')).toBe('la passer À visiter')
    expect(choiceSentence('draft', 'keep')).toBe('la garder : À étudier')
    expect(choiceSentence('listing', 'keep')).toBe('la garder')
  })
})

describe('ce qu’une réponse fait d’une proposition', () => {
  it('attend tous les membres actifs sauf l’auteur', () => {
    expect(waitingIds(open(), ACTIVE)).toEqual([CHLOE])
    expect(
      waitingIds(
        open({
          responses: [{ memberId: CHLOE, agrees: true, choice: null }],
        }),
        ACTIVE
      )
    ).toEqual([])
    expect(waitingIds(open(), [RICHARD, CHLOE, LEA])).toEqual([CHLOE, LEA])
  })

  it('d’accord de tous : s’applique ; un seul sur deux : on attend ; non : à trancher', () => {
    expect(
      stepAfterResponse(open(), { memberId: CHLOE, agrees: true }, ACTIVE)
    ).toBe('apply')
    expect(
      stepAfterResponse(open(), { memberId: CHLOE, agrees: true }, [
        RICHARD,
        CHLOE,
        LEA,
      ])
    ).toBe('wait')
    expect(
      stepAfterResponse(
        open({
          responses: [{ memberId: LEA, agrees: true, choice: null }],
        }),
        { memberId: CHLOE, agrees: true },
        [RICHARD, CHLOE, LEA]
      )
    ).toBe('apply')
    expect(
      stepAfterResponse(open(), { memberId: CHLOE, agrees: false }, ACTIVE)
    ).toBe('settle')
  })

  it('les choix à trancher et la raison de chacun', () => {
    const toSettle = open({
      state: 'to_settle',
      choice: 'to_visit',
      reason: 'à voir sur place',
      responses: [
        {
          memberId: CHLOE,
          agrees: false,
          choice: 'discard',
          reason: 'trop bruyant',
        },
        { memberId: LEA, agrees: true, choice: null },
        { memberId: 'x', agrees: false, choice: 'discard', reason: 'non' },
        { memberId: 'y', agrees: false, choice: null },
      ],
    })
    expect(settleOptions(toSettle)).toEqual(['to_visit', 'discard'])
    expect(settleOptions(open())).toEqual([])
    expect(reasonOfChoice(toSettle, 'to_visit')).toBe('à voir sur place')
    expect(reasonOfChoice(toSettle, 'discard')).toBe('trop bruyant')
    expect(
      reasonOfChoice({ choice: 'to_visit', responses: [] }, 'to_visit')
    ).toBeNull()
    expect(reasonOfChoice(toSettle, 'keep')).toBeNull()
  })

  it('une proposition encore en cours', () => {
    expect(isOpenDecision('open')).toBe(true)
    expect(isOpenDecision('to_settle')).toBe(true)
    expect(isOpenDecision('applied')).toBe(false)
    expect(isOpenDecision('withdrawn')).toBe(false)
    expect(isOpenDecision('stale')).toBe(false)
  })
})

describe('caducité', () => {
  it('l’annonce n’est plus dans son statut de départ, ou le brouillon n’attend plus', () => {
    expect(
      isDecisionStale('to_study', { kind: 'listing', status: 'to_study' })
    ).toBe(false)
    expect(
      isDecisionStale('to_study', {
        kind: 'listing',
        status: 'sold_or_withdrawn',
      })
    ).toBe(true)
    expect(isDecisionStale(null, { kind: 'listing', status: 'to_visit' })).toBe(
      false
    )
    expect(isDecisionStale(null, { kind: 'draft', status: 'pending' })).toBe(
      false
    )
    expect(isDecisionStale(null, { kind: 'draft', status: 'merged' })).toBe(
      true
    )
  })

  it('l’interface le dit', () => {
    expect(
      staleMessage('to_study', { kind: 'listing', status: 'sold_or_withdrawn' })
    ).toBe(
      'Cette proposition est caduque : l’annonce n’est plus « À étudier » (« Vendu ou retiré » maintenant). Rien n’a été appliqué.'
    )
    expect(
      staleMessage(null, { kind: 'listing', status: 'visited' })
    ).toContain('son statut')
    expect(staleMessage(null, { kind: 'draft', status: 'merged' })).toContain(
      'le brouillon a déjà été traité'
    )
  })
})

describe('qui peut quoi', () => {
  it('répondre : pas l’auteur, une seule fois, sur une proposition ouverte', () => {
    expect(respondRefusal(open(), CHLOE)).toBeNull()
    expect(respondRefusal(open(), RICHARD)?.code).toBe('forbidden')
    expect(
      respondRefusal(
        open({ responses: [{ memberId: CHLOE, agrees: true, choice: null }] }),
        CHLOE
      )?.code
    ).toBe('conflict')
    expect(respondRefusal(open({ state: 'to_settle' }), CHLOE)?.code).toBe(
      'conflict'
    )
  })

  it('retirer : son auteur seulement, tant qu’elle est en cours', () => {
    expect(withdrawRefusal(open(), RICHARD)).toBeNull()
    expect(withdrawRefusal(open({ state: 'to_settle' }), RICHARD)).toBeNull()
    expect(withdrawRefusal(open(), CHLOE)?.code).toBe('forbidden')
    expect(withdrawRefusal(open({ state: 'applied' }), RICHARD)?.code).toBe(
      'conflict'
    )
  })

  it('décider sans attendre : l’auteur, sur une proposition ouverte', () => {
    expect(decideNowRefusal(open(), RICHARD)).toBeNull()
    expect(decideNowRefusal(open(), CHLOE)?.code).toBe('forbidden')
    expect(decideNowRefusal(open({ state: 'to_settle' }), RICHARD)?.code).toBe(
      'conflict'
    )
  })

  it('trancher : un des choix en présence', () => {
    const toSettle = open({
      state: 'to_settle',
      responses: [{ memberId: CHLOE, agrees: false, choice: 'discard' }],
    })
    expect(settleRefusal(toSettle, 'discard')).toBeNull()
    expect(settleRefusal(toSettle, 'keep')?.code).toBe('conflict')
    expect(settleRefusal(open(), 'to_visit')?.code).toBe('conflict')
  })

  it('ce que voit chacun', () => {
    expect(decisionViewer(open(), RICHARD, ACTIVE)).toEqual({
      isAuthor: true,
      hasResponded: false,
      canRespond: false,
      canWithdraw: true,
      canDecideNow: true,
      canSettle: false,
      nobodyLeft: false,
    })
    expect(decisionViewer(open(), CHLOE, ACTIVE)).toMatchObject({
      isAuthor: false,
      canRespond: true,
      canWithdraw: false,
      canDecideNow: false,
    })
    expect(
      decisionViewer(open({ state: 'to_settle' }), CHLOE, ACTIVE).canSettle
    ).toBe(true)
    // Un membre retiré ne tranche plus.
    expect(
      decisionViewer(open({ state: 'to_settle' }), LEA, ACTIVE).canSettle
    ).toBe(false)
    // Plus personne à attendre : applicable par son auteur.
    expect(decisionViewer(open(), RICHARD, [RICHARD])).toMatchObject({
      canDecideNow: true,
      nobodyLeft: true,
    })
  })

  it('un membre qui part : ses propositions en cours sont retirées', () => {
    const mine = open({ authorId: CHLOE })
    const settled = open({ authorId: CHLOE, state: 'to_settle' })
    const closed = open({ authorId: CHLOE, state: 'applied' })
    const other = open()
    expect(proposalsOfDeparted([mine, settled, closed, other], CHLOE)).toEqual([
      mine,
      settled,
    ])
  })
})

describe('la lecture d’une proposition', () => {
  it('nomme l’auteur, les réponses et qui on attend', () => {
    const v = view({ reason: 'à voir sur place' })
    expect(v.author).toEqual({ id: RICHARD, displayName: 'Richard' })
    expect(v.waitingFor).toEqual([{ id: CHLOE, displayName: 'Chloé' }])
    expect(v.choiceLabel).toBe('À visiter')
    expect(v.reason).toBe('à voir sur place')
    expect(v.fromStage).toBe('a-etudier')
    expect(v.settleOptions).toEqual([])
    expect(v.viewer.isAuthor).toBe(true)
  })

  it('un auteur ou un membre inconnu reste lisible', () => {
    const v = decisionProposalView(
      record({
        authorId: null,
        closedById: '99999999-9999-4999-8999-999999999999',
        responses: [
          {
            memberId: '99999999-9999-4999-8999-999999999999',
            agrees: true,
            choice: null,
            at: '2026-11-08T10:00:00.000Z',
          },
        ],
      }),
      RICHARD,
      names
    )
    expect(v.author).toBeNull()
    expect(v.reason).toBeNull()
    expect(v.closedBy?.displayName).toBe('Un membre')
    expect(v.responses[0]?.member.displayName).toBe('Un membre')
    expect(v.responses[0]?.reason).toBeNull()
  })

  it('l’étape d’une proposition', () => {
    expect(stageOfDecision({ fromStatus: null })).toBe('a-valider')
    expect(stageOfDecision({ fromStatus: 'to_visit' })).toBe('a-visiter')
    expect(stageOfStatus('discarded')).toBe('archives')
    expect(stageOfStatus('visited')).toBe('visitees')
    expect(stageOfStatus('offer_accepted')).toBe('offres')
    expect(stageOfStatus('to_study')).toBe('a-etudier')
  })

  it('« En attente de … » et plus personne', () => {
    expect(waitingNames(view())).toBe('Chloé')
    expect(waitingLabel(view())).toBe('En attente de Chloé')
    expect(
      waitingLabel(
        decisionProposalView(record(), RICHARD, {
          active: names.active.slice(0, 1),
          names: names.names,
        })
      )
    ).toBe('Plus personne à attendre')
  })

  it('les deux choix côte à côte, et la ligne de chaque étape', () => {
    const toSettle = view(
      {
        state: 'to_settle',
        reason: 'à voir',
        responses: [
          {
            memberId: CHLOE,
            agrees: false,
            choice: 'discard',
            reason: 'trop bruyant',
            at: '2026-11-08T11:00:00.000Z',
          },
          {
            memberId: LEA,
            agrees: true,
            choice: null,
            at: '2026-11-08T11:00:00.000Z',
          },
        ],
      },
      RICHARD
    )
    expect(decisionSides(toSettle)).toEqual([
      {
        memberId: RICHARD,
        who: 'Richard',
        choice: 'to_visit',
        choiceLabel: 'À visiter',
        reason: 'à voir',
      },
      {
        memberId: CHLOE,
        who: 'Chloé',
        choice: 'discard',
        choiceLabel: 'Écarter',
        reason: 'trop bruyant',
      },
    ])
    expect(decisionDetail(toSettle, RICHARD)).toBe(
      'Toi : À visiter · Chloé : Écarter'
    )
    expect(decisionDetail(view(), RICHARD)).toBe('Tu proposes : À visiter')
    expect(decisionDetail(view({}, CHLOE), CHLOE)).toBe(
      'Richard propose : À visiter'
    )
    expect(
      decisionDetail(
        view({ choice: 'discard', reason: 'trop de travaux' }),
        RICHARD
      )
    ).toBe('Tu proposes : Écarter (trop de travaux)')
    expect(decisionDetail(view({ authorId: null }, CHLOE), CHLOE)).toBe(
      'Un membre propose : À visiter'
    )
    expect(decisionSides(view({ authorId: null }))[0]?.who).toBe('Un membre')
  })

  it('les bandeaux de la fiche', () => {
    expect(decisionBannerText(view())).toEqual({
      head: 'Tu proposes de la passer À visiter.',
      body: 'En attente de Chloé. L’annonce reste À étudier d’ici là.',
    })
    expect(
      decisionBannerText(
        decisionProposalView(record(), RICHARD, {
          active: names.active.slice(0, 1),
          names: names.names,
        })
      ).body
    ).toContain('Plus personne à attendre')
    expect(decisionBannerText(view({ reason: 'Prix correct' }, CHLOE))).toEqual(
      {
        head: 'Richard propose de la passer À visiter.',
        body: '« Prix correct »',
      }
    )
    expect(decisionBannerText(view({}, CHLOE)).body).toBe('')
    expect(decisionBannerText(view({ authorId: null }, CHLOE)).head).toContain(
      'Un membre propose'
    )
    expect(
      decisionBannerText(
        view({
          target: 'draft',
          listingId: null,
          draftId: '33333333-3333-4333-8333-333333333333',
          fromStatus: null,
          choice: 'keep',
        })
      )
    ).toEqual({
      head: 'Tu proposes de la garder : À étudier.',
      body: 'En attente de Chloé. Le brouillon reste À valider d’ici là.',
    })
  })
})

describe('les phrases', () => {
  it('après une proposition, une réponse, une application', () => {
    expect(proposedMessage('Chloé')).toBe('C’est proposé. En attente de Chloé.')
    expect(proposedMessage('')).toContain('Plus personne à attendre')
    expect(waitingAfterAgreeMessage('Léa')).toBe(
      'C’est noté. En attente de Léa.'
    )
    expect(TO_SETTLE_MESSAGE).toContain('À trancher ensemble')
    expect(appliedMessage('listing', 'discard', 'discarded')).toContain(
      'écartée'
    )
    expect(appliedMessage('draft', 'keep', null)).toContain('À étudier')
    expect(appliedMessage('listing', 'keep', 'visited')).toContain(
      'reste où elle est'
    )
    expect(appliedMessage('listing', 'to_visit', 'to_visit')).toContain(
      'À visiter'
    )
    expect(appliedMessage('listing', 'to_visit', null)).toBe('C’est appliqué.')
  })

  it('le connecteur propose au nom du membre, sans jamais confirmer pour l’autre', () => {
    expect(
      mcpProposedMessage({
        target: 'listing',
        fromStatus: 'to_study',
        names: 'Chloé',
      })
    ).toBe(
      'C’est proposé en ton nom. L’annonce reste À étudier tant que Chloé n’a pas confirmé.'
    )
    expect(
      mcpProposedMessage({ target: 'draft', fromStatus: null, names: '' })
    ).toContain('Le brouillon reste À valider')
    expect(
      mcpBlockedMessage({
        authorName: 'Chloé',
        choiceLabel: 'À visiter',
        toSettle: false,
      })
    ).toContain('Claude ne confirme jamais pour un autre membre')
    expect(
      mcpBlockedMessage({
        authorName: 'Chloé',
        choiceLabel: 'À visiter',
        toSettle: true,
      })
    ).toContain('tranchez-la dans l’application')
    expect(mcpDecisionLine(view())).toBe(
      'proposition en cours : Richard propose À visiter, en attente de Chloé ; le statut ne bouge pas d’ici là'
    )
    expect(mcpDecisionLine(view({ authorId: null }))).toContain('Un membre')
    expect(mcpDecisionLine(view({ state: 'to_settle' }))).toContain(
      'à trancher ensemble'
    )
    expect(
      mcpDecisionLine(
        decisionProposalView(record(), RICHARD, {
          active: names.active.slice(0, 1),
          names: names.names,
        })
      )
    ).toContain('plus personne à attendre')
  })
})
