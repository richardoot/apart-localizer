/**
 * Lot 25, la fiche répond d'abord : les trois jugements étiquetés, la
 * réponse à « Faut-il y aller ? », l'action de l'étape, où mènent les
 * prochaines étapes, « Depuis ta dernière ouverture » en une ligne, la photo
 * de couverture. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type {
  DecisionProposal,
  ListingStageFacts,
  OpinionSummary,
} from '@apart/contracts'
import {
  ANSWER_REASONS_MAX,
  JUDGEMENT_SYMBOLS,
  describeActivity,
  coverPhotoOf,
  ficheNextAction,
  judgementText,
  judgementsOfDraft,
  judgementsOfListing,
  listingChangesLine,
  listingJudgements,
  nextStepTarget,
  pendingJudgementsText,
  rowJudgements,
} from '../src/index.js'
import type {
  FicheActionInput,
  ListingAnswer,
  ListingAnswerInput,
} from '../src/index.js'
import { listingAnswer as rawAnswer } from '../src/index.js'

const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('Lot 25 : trois jugements étiquetés', () => {
  it('rentabilité, recherche, location : toujours dans cet ordre', () => {
    const all = listingJudgements({
      verdict: 'target',
      fit: { level: 'out', activeCriteria: 2 },
      rental: 'conditional',
    })
    expect(all.map(j => j.key)).toEqual(['profitability', 'search', 'rental'])
    expect(all.map(judgementText)).toEqual([
      'Rentabilité : Cible',
      'Recherche : Hors critères',
      'Location : Sous conditions',
    ])
    expect(all.map(j => j.short)).toEqual(['Renta.', 'Rech.', 'Loc.'])
    expect(all.map(j => j.sense)).toEqual(['good', 'bad', 'mixed'])
    expect(all[0]?.description).toMatch(/^Rentabilité : /)
  })

  it('chaque niveau a son sens et un symbole', () => {
    const senses = (['target', 'to_dig', 'off_target'] as const).map(
      v => listingJudgements({ verdict: v, fit: null, rental: null })[0]?.sense
    )
    expect(senses).toEqual(['good', 'mixed', 'bad'])
    const fits = (['in', 'margin', 'to_confirm', 'out'] as const).map(
      level =>
        listingJudgements({
          verdict: 'target',
          fit: { level, activeCriteria: 1 },
          rental: null,
        })[1]?.sense
    )
    expect(fits).toEqual(['good', 'mixed', 'unknown', 'bad'])
    const rentals = (
      ['compatible', 'conditional', 'incompatible'] as const
    ).map(
      r => listingJudgements({ verdict: 'target', fit: null, rental: r })[1]
    )
    expect(rentals.map(r => r?.value)).toEqual([
      'Compatible',
      'Sous conditions',
      'Incompatible',
    ])
    expect(Object.values(JUDGEMENT_SYMBOLS)).toEqual(['✓', '~', '✗', '?'])
  })

  it('sans loyer visé, la rentabilité reste à confirmer ; sans critère actif, pas de « Recherche »', () => {
    const [first, ...rest] = listingJudgements({
      verdict: null,
      fit: { level: 'in', activeCriteria: 0 },
      rental: 'compatible',
    })
    expect(first).toMatchObject({
      key: 'profitability',
      value: 'À confirmer',
      code: 'unknown',
      sense: 'unknown',
    })
    expect(rest.map(j => j.key)).toEqual(['rental'])
  })
})

/** Les montants s'écrivent avec une espace fine insécable : les tests l'écrivent normale. */
function listingAnswer(input: ListingAnswerInput): ListingAnswer {
  const answer = rawAnswer(input)
  const plain = (text: string) => text.replace(/\u202f/g, ' ')
  return {
    ...answer,
    reasons: answer.reasons.map(plain),
    sentence: plain(answer.sentence),
  }
}

describe('Lot 25 : les jugements d’une annonce et d’un brouillon', () => {
  const evaluation = {
    metrics: { verdict: 'off_target' as const },
    rental: { verdict: 'compatible' as const },
  }
  it('une annonce suivie', () => {
    expect(
      judgementsOfListing({
        evaluation,
        criteriaFit: { level: 'margin', activeCriteria: 1 },
      }).map(judgementText)
    ).toEqual([
      'Rentabilité : Hors cible',
      'Recherche : À la marge',
      'Location : Compatible',
    ])
    expect(
      judgementsOfListing({
        evaluation: { ...evaluation, rental: null },
        criteriaFit: null,
      }).map(j => j.key)
    ).toEqual(['profitability'])
  })

  it('un brouillon sans loyer visé : rentabilité à confirmer', () => {
    const draft = {
      evaluation,
      fit: { level: 'in' as const, activeCriteria: 2 },
      listing: { rentalPlan: null },
    }
    expect(judgementsOfDraft(draft).map(judgementText)).toEqual([
      'Rentabilité : À confirmer',
      'Recherche : Dans les critères',
      'Location : Compatible',
    ])
    expect(
      judgementsOfDraft({
        ...draft,
        listing: { rentalPlan: { targetRent: 800 } },
      })[0]?.value
    ).toBe('Hors cible')
    expect(
      judgementsOfDraft({
        evaluation: null,
        fit: null,
        listing: { rentalPlan: { targetRent: 800 } },
      }).map(judgementText)
    ).toEqual(['Rentabilité : À confirmer'])
  })
})

const answerInput = (
  over: Partial<ListingAnswerInput> = {}
): ListingAnswerInput => ({
  price: 200_000,
  hasRent: true,
  verdict: 'target',
  failures: [],
  nearMisses: [],
  fit: { level: 'in', activeCriteria: 1, reasons: [] },
  targetPrice: {
    targetPrice: 210_000,
    discount: -0.05,
    discountClass: 'in_target',
  },
  ...over,
})

describe('Lot 25, lot 26 : « Faut-il y aller ? », une réponse et trois raisons courtes', () => {
  it('oui : dans la cible et dans les critères', () => {
    const answer = listingAnswer(answerInput())
    expect(answer).toEqual({
      tone: 'go',
      lead: 'Oui',
      reasons: [
        'Dans la cible de rentabilité au prix affiché.',
        'Dans tes critères de recherche.',
      ],
      sentence:
        'Oui. Dans la cible de rentabilité au prix affiché. Dans tes critères de recherche.',
      missing: [],
    })
  })

  it('pas à ce prix : hors cible, prix cible négociable', () => {
    const answer = listingAnswer(
      answerInput({
        verdict: 'off_target',
        failures: ['gross_yield'],
        targetPrice: {
          targetPrice: 182_000,
          discount: 0.09,
          discountClass: 'negotiable',
        },
      })
    )
    expect(answer.tone).toBe('maybe')
    expect(answer.lead).toBe('Pas à ce prix')
    expect(answer.reasons).toEqual([
      'Hors de la cible de rentabilité : rendement brut trop faible.',
      'Il faudrait l’obtenir à 182 000 €, soit −9 % : négociable.',
      'Dans tes critères de recherche.',
    ])
  })

  it('plutôt non : décote hors de portée, ou DPE qui la laisse hors cible', () => {
    const far = listingAnswer(
      answerInput({
        verdict: 'off_target',
        failures: ['effort'],
        targetPrice: {
          targetPrice: 120_000,
          discount: 0.4,
          discountClass: 'out_of_reach',
        },
      })
    )
    expect(far.tone).toBe('no')
    expect(far.reasons[1]).toBe(
      'Il faudrait l’obtenir à 120 000 €, soit −40 % : hors de portée.'
    )
    // Le cas relevé par l'audit : trois échecs, le DPE, la marge des critères.
    const dpe = listingAnswer(
      answerInput({
        verdict: 'off_target',
        failures: ['gross_yield', 'effort', 'dpe'],
        dpeClass: 'E',
        fit: {
          level: 'margin',
          activeCriteria: 1,
          reasons: ['DPE E (maximum D, marge une classe)'],
        },
        targetPrice: {
          targetPrice: 159_070,
          discount: 0.26,
          discountClass: 'out_of_reach',
        },
      })
    )
    expect(dpe.lead).toBe('Plutôt non')
    expect(dpe.reasons).toEqual([
      'Hors de la cible de rentabilité : rendement brut trop faible, effort mensuel trop lourd, DPE E.',
      'Baisser le prix ne suffit pas : le DPE la laisse hors cible, même à 159 070 €.',
      'À la marge de tes critères : DPE E (maximum D, marge une classe).',
    ])
    // Plus de parenthèses imbriquées ni de « quel que soit le prix ».
    for (const r of dpe.reasons) {
      expect(r).not.toMatch(/\([^)]*\(/)
      expect(r).not.toContain('quel que soit')
    }
    // Sans la classe lue, le DPE qui échoue reste nommé sans liste « E, F ou G ».
    expect(
      listingAnswer(answerInput({ verdict: 'off_target', failures: ['dpe'] }))
        .reasons[0]
    ).toBe('Hors de la cible de rentabilité : DPE classé E à G.')
  })

  it('plutôt non : hors des critères, la raison en tête', () => {
    const answer = listingAnswer(
      answerInput({
        fit: {
          level: 'out',
          activeCriteria: 1,
          reasons: ['hors du périmètre'],
        },
      })
    )
    expect(answer.tone).toBe('no')
    expect(answer.reasons[0]).toBe('Hors de tes critères : hors du périmètre.')
    expect(
      listingAnswer(
        answerInput({ fit: { level: 'out', activeCriteria: 1, reasons: [] } })
      ).reasons[0]
    ).toBe('Hors de tes critères de recherche.')
  })

  it('peut-être : de peu, à la marge ou à confirmer', () => {
    expect(
      listingAnswer(
        answerInput({
          verdict: 'to_dig',
          nearMisses: ['effort', 'dpe_unknown'],
        })
      ).reasons[0]
    ).toBe('Cible de rentabilité manquée de peu : effort mensuel, DPE inconnu.')
    expect(listingAnswer(answerInput({ verdict: 'to_dig' })).reasons[0]).toBe(
      'Cible de rentabilité manquée de peu.'
    )
    expect(
      listingAnswer(
        answerInput({
          fit: { level: 'margin', activeCriteria: 1, reasons: ['prix +3,6 %'] },
        })
      )
    ).toMatchObject({
      tone: 'maybe',
      reasons: expect.arrayContaining([
        'À la marge de tes critères : prix +3,6 %.',
      ]),
    })
    expect(
      listingAnswer(
        answerInput({
          fit: { level: 'margin', activeCriteria: 1, reasons: [] },
        })
      ).reasons
    ).toContain('À la marge de tes critères de recherche.')
    expect(
      listingAnswer(
        answerInput({
          fit: { level: 'to_confirm', activeCriteria: 1, reasons: [] },
        })
      ).reasons
    ).toContain('À confirmer face à tes critères de recherche.')
    expect(
      listingAnswer(
        answerInput({
          fit: {
            level: 'to_confirm',
            activeCriteria: 1,
            reasons: ['surface inconnue'],
          },
        })
      ).reasons
    ).toContain('À confirmer face à tes critères : surface inconnue.')
  })

  it('hors cible sans détail, prix cible déjà atteint ou incalculable', () => {
    expect(
      listingAnswer(
        answerInput({
          verdict: 'off_target',
          targetPrice: {
            targetPrice: 230_000,
            discount: -0.1,
            discountClass: 'in_target',
          },
        })
      ).sentence
    ).toBe(
      'Plutôt non. Hors de la cible de rentabilité. Prix cible 230 000 €, déjà atteint. Dans tes critères de recherche.'
    )
    expect(
      listingAnswer(
        answerInput({
          verdict: 'to_dig',
          targetPrice: {
            targetPrice: null,
            discount: null,
            discountClass: null,
          },
          fit: null,
        })
      ).sentence
    ).toBe(
      'Peut-être. Cible de rentabilité manquée de peu. Pas de prix cible calculable.'
    )
    expect(
      listingAnswer(answerInput({ targetPrice: null, fit: null })).sentence
    ).toBe('Oui. Dans la cible de rentabilité au prix affiché.')
    // Un prix cible plus bas que le prix (critère du prix cible plus strict que le verdict).
    expect(
      listingAnswer(
        answerInput({
          targetPrice: {
            targetPrice: 190_000,
            discount: 0.05,
            discountClass: null,
          },
        })
      ).reasons
    ).toContain('Il faudrait l’obtenir à 190 000 €, soit −5 %.')
  })

  it('jamais plus de trois raisons', () => {
    expect(ANSWER_REASONS_MAX).toBe(3)
    const answer = listingAnswer(
      answerInput({
        verdict: 'to_dig',
        nearMisses: ['effort'],
        fit: { level: 'margin', activeCriteria: 2, reasons: ['prix +2 %'] },
        targetPrice: {
          targetPrice: 190_000,
          discount: 0.05,
          discountClass: 'negotiable',
        },
      })
    )
    expect(answer.reasons).toHaveLength(3)
  })

  it('pas encore de réponse : dit ce qui manque, sans juger la rentabilité', () => {
    const noRent = listingAnswer(
      answerInput({ hasRent: false, verdict: 'off_target' })
    )
    expect(noRent).toEqual({
      tone: 'unknown',
      lead: 'Pas encore de réponse',
      reasons: [
        'Sans le loyer visé, la rentabilité et le prix cible ne se calculent pas.',
        'Dans tes critères de recherche.',
      ],
      sentence:
        'Pas encore de réponse. Sans le loyer visé, la rentabilité et le prix cible ne se calculent pas. Dans tes critères de recherche.',
      missing: ['le loyer visé'],
    })
    const nothing = listingAnswer(
      answerInput({ hasRent: false, price: 0, fit: null })
    )
    expect(nothing.sentence).toBe(
      'Pas encore de réponse. Sans le prix et le loyer visé, la rentabilité et le prix cible ne se calculent pas.'
    )
  })
})

describe('Lot 26 : ce qu’une ligne montre des jugements', () => {
  const judgements = listingJudgements({
    verdict: null,
    fit: { level: 'to_confirm', activeCriteria: 1 },
    rental: 'conditional',
  })
  it('les jugements à confirmer sont omis, l’ordre gardé', () => {
    expect(rowJudgements(judgements).map(j => j.key)).toEqual(['rental'])
    expect(pendingJudgementsText(judgements)).toBe(
      'Rentabilité et recherche à confirmer'
    )
  })
  it('un seul, ou aucun à confirmer', () => {
    const one = listingJudgements({ verdict: null, fit: null, rental: null })
    expect(rowJudgements(one)).toEqual([])
    expect(pendingJudgementsText(one)).toBe('Rentabilité à confirmer')
    const known = listingJudgements({
      verdict: 'target',
      fit: { level: 'in', activeCriteria: 1 },
      rental: null,
    })
    expect(rowJudgements(known)).toHaveLength(2)
    expect(pendingJudgementsText(known)).toBeNull()
    const three = listingJudgements({
      verdict: null,
      fit: { level: 'to_confirm', activeCriteria: 1 },
      rental: null,
    })
    expect(
      pendingJudgementsText([
        ...three,
        { ...three[0]!, key: 'rental', label: 'Location' },
      ])
    ).toBe('Rentabilité, recherche et location à confirmer')
  })
})

const stage = (over: Partial<ListingStageFacts> = {}): ListingStageFacts => ({
  nextVisitAt: null,
  nextVisitNames: [],
  lastVisitAt: null,
  archivedAt: null,
  archivedBy: null,
  ...over,
})

const decision = (
  viewer: Partial<DecisionProposal['viewer']>,
  over: Partial<DecisionProposal> = {}
): DecisionProposal =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    state: 'open',
    waitingFor: [{ id: CHLOE, displayName: 'Chloé' }],
    viewer: {
      isAuthor: true,
      hasResponded: false,
      canRespond: false,
      canWithdraw: true,
      canDecideNow: true,
      canSettle: false,
      nobodyLeft: false,
      ...viewer,
    },
    ...over,
  }) as DecisionProposal

const summary = (over: Partial<OpinionSummary>): OpinionSummary =>
  ({
    viewerRated: true,
    disagreementKeys: [],
    status: 'complete',
    ...over,
  }) as OpinionSummary

const action = (over: Partial<FicheActionInput>): FicheActionInput => ({
  status: 'to_study',
  decision: null,
  stage: stage(),
  offers: [],
  opinionSummary: null,
  now: new Date('2026-11-11T09:00:00.000Z'),
  ...over,
})

describe('Lot 25 : l’action que l’étape demande', () => {
  it.each([
    [action({}), 'triage', 'Trier cette annonce'],
    [action({ status: 'to_visit' }), 'plan_visit', 'Planifier une visite'],
    [
      action({
        status: 'to_visit',
        stage: stage({ nextVisitAt: '2026-11-20T17:00:00.000Z' }),
      }),
      'prepare_visit',
      'Préparer la visite',
    ],
    [
      action({
        status: 'to_visit',
        stage: stage({ nextVisitAt: '2026-11-11T17:00:00.000Z' }),
      }),
      'visit_mode',
      'Ouvrir le mode visite',
    ],
    [
      action({
        status: 'visited',
        opinionSummary: summary({ viewerRated: false }),
      }),
      'give_opinion',
      'Donner mon avis',
    ],
    [
      action({
        status: 'visited',
        opinionSummary: summary({ disagreementKeys: ['light'] }),
      }),
      'opinions',
      'Voir nos désaccords',
    ],
    [
      action({
        status: 'visited',
        opinionSummary: summary({ status: 'pending' }),
      }),
      'opinions',
      'Voir nos avis',
    ],
    [action({ status: 'visited' }), 'prepare_offer', 'Préparer une offre'],
    [
      action({ status: 'offer_made', offers: [{ response: 'pending' }] }),
      'seller_answer',
      'Noter la réponse du vendeur',
    ],
    [
      action({ status: 'offer_made', offers: [{ response: 'counter_offer' }] }),
      'seller_answer',
      'Répondre à la contre-proposition',
    ],
    [
      action({ status: 'offer_accepted' }),
      'todo',
      'Voir ce qu’il reste à faire',
    ],
    [action({ status: 'discarded' }), 'rescue', 'Repêcher'],
    [action({ status: 'offer_refused' }), 'rescue', 'Repêcher'],
    [action({ status: 'sold_or_withdrawn' }), 'none', ''],
  ] as const)('%#', (input, kind, label) => {
    expect(ficheNextAction(input)).toMatchObject({ kind, label })
  })

  it('une proposition en cours passe avant l’étape', () => {
    expect(
      ficheNextAction(
        action({ decision: decision({ isAuthor: false, canRespond: true }) })
      )
    ).toMatchObject({ kind: 'decision', label: 'Répondre à la proposition' })
    expect(ficheNextAction(action({ decision: decision({}) }))).toEqual({
      kind: 'decision',
      label: 'Voir la proposition',
      hint: 'En attente de Chloé',
    })
    expect(
      ficheNextAction(
        action({ decision: decision({ nobodyLeft: true }, { waitingFor: [] }) })
      )
    ).toMatchObject({ kind: 'decision', hint: 'Plus personne à attendre' })
    expect(
      ficheNextAction(
        action({ decision: decision({}, { state: 'to_settle' }) })
      )
    ).toMatchObject({ kind: 'settle', label: 'Trancher ensemble' })
  })
})

describe('Lot 25 : où mène une prochaine étape', () => {
  it.each([
    ['visit', 'v1', 'a-faire', 'visites'],
    ['discuss', 'opinions', 'synthese', 'nos-avis'],
    ['draft', 'r1', 'a-faire', 'echanges'],
    ['follow_up', 'r2', 'a-faire', 'echanges'],
    ['task', 't1', 'a-faire', 'todo-t1'],
  ] as const)('%s', (kind, id, tab, anchor) => {
    expect(nextStepTarget({ kind, id })).toMatchObject({ tab, anchor })
  })
})

describe('Lot 25 : « Depuis ta dernière ouverture » en une ligne', () => {
  it('compte, nomme qui et les champs', () => {
    expect(
      listingChangesLine({
        changedFields: ['price', 'status', 'surface', 'rooms'],
        entries: [
          { channel: 'web', actor: { displayName: 'Chloé' } },
          { channel: 'mcp', actor: { displayName: 'Richard' } },
          { channel: 'web', actor: { displayName: 'Chloé' } },
        ],
      })
    ).toBe('3 changements, par Chloé et Claude : prix, statut, surface Carrez…')
  })

  it('un seul changement, sans champ ; rien sans changement', () => {
    expect(
      listingChangesLine({
        changedFields: [],
        entries: [{ channel: 'system', actor: null }],
      })
    ).toBe('1 changement, par l’application.')
    expect(listingChangesLine({ changedFields: [], entries: [] })).toBeNull()
  })

  it('trois personnes', () => {
    expect(
      listingChangesLine({
        changedFields: ['notes'],
        entries: [
          { channel: 'web', actor: { displayName: 'Chloé' } },
          { channel: 'web', actor: { displayName: 'Richard' } },
          { channel: 'import', actor: null },
        ],
      })
    ).toBe('3 changements, par Chloé, Richard et l’application : notes.')
  })
})

describe('Lot 25 : la photo de couverture', () => {
  const visits = [
    { id: 'v2', visitedAt: '2026-11-08T10:00:00.000Z' },
    { id: 'v1', visitedAt: '2026-11-02T10:00:00.000Z' },
  ]
  const photo = (
    id: string,
    visitId: string,
    createdAt: string,
    status: 'ready' | 'pending' = 'ready'
  ) => ({
    id,
    visitId,
    createdAt,
    status,
  })
  const photos = [
    photo('p3', 'v2', '2026-11-08T10:05:00.000Z'),
    photo('p2', 'v1', '2026-11-02T10:09:00.000Z'),
    photo('p1', 'v1', '2026-11-02T10:01:00.000Z', 'pending'),
    photo('p0', 'v1', '2026-11-02T10:04:00.000Z'),
  ]

  it('la première photo prête de la première visite', () => {
    expect(coverPhotoOf(visits, photos, null)).toEqual({
      photoId: 'p0',
      visitId: 'v1',
      chosen: false,
    })
  })

  it('celle qu’un membre a choisie, si elle est prête et de l’annonce', () => {
    expect(coverPhotoOf(visits, photos, 'p3')).toEqual({
      photoId: 'p3',
      visitId: 'v2',
      chosen: true,
    })
    expect(coverPhotoOf(visits, photos, 'p1')?.photoId).toBe('p0')
    expect(
      coverPhotoOf(
        visits,
        [photo('px', 'autre', '2026-11-01T00:00:00.000Z')],
        'px'
      )
    ).toBeNull()
  })

  it('rien avant la première photo de visite ; à égalité, l’identifiant départage', () => {
    expect(coverPhotoOf(visits, [], null)).toBeNull()
    expect(coverPhotoOf([], photos, null)).toBeNull()
    const same = '2026-11-02T10:00:00.000Z'
    expect(
      coverPhotoOf(
        visits,
        [photo('b', 'v1', same), photo('a', 'v1', same)],
        null
      )?.photoId
    ).toBe('a')
  })
})

describe('Lot 25 : le choix de la couverture au journal', () => {
  const entry = (photoId: string | null) =>
    describeActivity(
      {
        action: 'visit.cover_chosen',
        actorMemberId: CHLOE,
        channel: 'web',
        before: { photoId: null },
        after: { photoId },
        createdAt: '2026-11-11T10:00:00.000Z',
      } as never,
      [{ id: CHLOE, displayName: 'Chloé' }] as never
    )

  it('dit le choix et le retour à la première photo, sans montrer d’identifiant', () => {
    expect(entry('p1').summary).toContain('a choisi la photo de couverture')
    expect(entry(null).summary).toContain(
      'a remis la première photo de visite en couverture'
    )
    expect(entry('p1').changes).toEqual([])
  })
})
