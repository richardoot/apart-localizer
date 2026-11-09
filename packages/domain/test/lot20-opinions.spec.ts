/**
 * Lot 20, nos avis critère par critère : critères de l'espace (défauts,
 * ajout, retrait, ordre, dix au plus), avis à l'aveugle (qui voit quoi),
 * « après visite », confrontation (moyennes, écarts, désaccords, note
 * commune, bilan), points de la Synthèse, prochaine étape, tâche de
 * contre-visite proposée, journal et notifications. Données fictives : les
 * notes reprennent la maquette validée.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPINION_CRITERIA,
  OPINION_CRITERIA_MAX,
  TASK_DETAILS_MAX,
} from '@apart/contracts'
import {
  HIGHLIGHTS_MAX,
  addCriterionRefusal,
  bestCommonIndexes,
  canSeeOthersOpinions,
  capitalizeFirst,
  comparableLabel,
  confrontOpinions,
  countWord,
  counterVisitLabel,
  counterVisitTask,
  criteriaCountText,
  criterionInSentence,
  criterionLower,
  customCriterionKey,
  defaultOpinionCriteria,
  describeActivity,
  disagreementList,
  disagreementsWith,
  effectiveOpinionCriteria,
  formatOpinionAverage,
  isOpinionWrite,
  labelTakenRefusal,
  listingHighlights,
  moveCriterion,
  nextSteps,
  opinionAfterVisit,
  opinionAverage,
  opinionHasRating,
  opinionHighlights,
  opinionJournalPayload,
  opinionNextStepText,
  opinionNotificationText,
  opinionSnapshot,
  notificationsForActivity,
  notificationTypeOf,
  ratedScores,
  redactOpinionActivity,
  removeCriterionRefusal,
  reorderRefusal,
  resolveOpinionCriterion,
  sameOpinionSnapshot,
  scoreText,
  splitOpinionsForViewer,
  todoItems,
  visibleCriterionKeys,
  visibleOpinionCriteria,
  computeWhatsNew,
} from '../src/index.js'
import type {
  ConfrontationInput,
  OpinionCriterionLike,
  OpinionLike,
} from '../src/index.js'

const R = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'
const L = '33333333-3333-4333-8333-333333333333'
const GONE = '44444444-4444-4444-8444-444444444444'
const LISTING = '55555555-5555-4555-8555-555555555555'
const VISIT = '66666666-6666-4666-8666-666666666666'

const members = [
  { id: R, displayName: 'Richard' },
  { id: C, displayName: 'Chloé' },
]
const criteria = defaultOpinionCriteria()
const keys = visibleCriterionKeys(criteria)

/** Un avis : notes par clé (0 = —), mots facultatifs. */
function opinion(
  memberId: string,
  rating: number,
  scores: Record<string, number>,
  words: Record<string, string> = {},
  extra: Partial<OpinionLike> = {}
): OpinionLike {
  const all = new Set([...Object.keys(scores), ...Object.keys(words)])
  return {
    memberId,
    rating,
    text: '',
    scores: [...all].map(key => ({
      key,
      score: scores[key] ? (scores[key] as number) : null,
      word: words[key] ?? null,
    })),
    updatedAt: '2026-11-15T20:00:00.000Z',
    ...extra,
  }
}

// Les notes de la maquette (Main.dc.html).
const richard = opinion(
  R,
  4,
  {
    luminosity: 5,
    layout: 4,
    condition: 3,
    quiet: 4,
    outdoor: 5,
    building: 3,
    street: 4,
    feel: 4,
  },
  { quiet: 'fenêtres fermées, ça va' }
)
const chloe = opinion(
  C,
  3,
  {
    luminosity: 4,
    layout: 4,
    condition: 2,
    quiet: 2,
    outdoor: 5,
    building: 3,
    feel: 2,
  },
  { quiet: 'bus devant la chambre', luminosity: 'chambre 2 un peu sombre' }
)

function confront(
  overrides: Partial<ConfrontationInput> = {}
): ReturnType<typeof confrontOpinions> {
  return confrontOpinions({
    criteria,
    members,
    visible: [richard, chloe],
    masked: [],
    blind: true,
    revealed: false,
    viewerRated: true,
    ...overrides,
  })
}

describe('critères de l’espace', () => {
  it('huit critères par défaut, clés stables, tant que l’espace n’a rien réglé', () => {
    const list = effectiveOpinionCriteria([])
    expect(list.map(c => c.key)).toEqual([
      'luminosity',
      'layout',
      'condition',
      'quiet',
      'outdoor',
      'building',
      'street',
      'feel',
    ])
    expect(list.every(c => c.origin === 'default' && !c.hidden)).toBe(true)
    expect(list.map(c => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(effectiveOpinionCriteria(null)).toEqual(list)
    expect(effectiveOpinionCriteria(undefined)).toEqual(list)
    expect(list.map(c => c.label)).toEqual(
      DEFAULT_OPINION_CRITERIA.map(c => c.label)
    )
  })

  it('les critères enregistrés, dans leur ordre ; les masqués à part', () => {
    const rows: OpinionCriterionLike[] = [
      {
        key: 'quiet',
        label: 'Calme',
        hint: '',
        position: 1,
        hidden: true,
        origin: 'default',
      },
      {
        key: 'custom_cuisine',
        label: 'Cuisine',
        hint: 'équipée',
        position: 0,
        hidden: false,
        origin: 'custom',
      },
      {
        key: 'layout',
        label: 'Agencement',
        hint: '',
        position: 1,
        hidden: false,
        origin: 'default',
      },
    ]
    const list = effectiveOpinionCriteria(rows)
    expect(list.map(c => c.key)).toEqual(['custom_cuisine', 'layout', 'quiet'])
    expect(visibleOpinionCriteria(list).map(c => c.key)).toEqual([
      'custom_cuisine',
      'layout',
    ])
    expect([...visibleCriterionKeys(list)]).toEqual([
      'custom_cuisine',
      'layout',
    ])
  })

  it('les libellés en phrase : article d’origine, sinon entre guillemets', () => {
    expect(criterionInSentence({ key: 'quiet', label: 'Calme' })).toBe(
      'le calme'
    )
    expect(criterionInSentence({ key: 'feel', label: 'On s’y voit' })).toBe(
      '« on s’y voit »'
    )
    expect(criterionInSentence({ key: 'quiet', label: 'Calme et bruit' })).toBe(
      '« Calme et bruit »'
    )
    expect(
      criterionInSentence({ key: 'custom_cuisine', label: 'Cuisine' })
    ).toBe('« Cuisine »')
    expect(criterionLower('Calme')).toBe('calme')
    expect(criterionLower('On s’y voit')).toBe('on s’y voit')
    expect(criterionLower('DPE ressenti')).toBe('DPE ressenti')
    expect(capitalizeFirst('le calme')).toBe('Le calme')
    expect(capitalizeFirst('« on s’y voit »')).toBe('« On s’y voit »')
    expect(capitalizeFirst('42')).toBe('42')
  })

  it('une clé générée, unique, sans accents', () => {
    expect(customCriterionKey('Cuisine équipée', [])).toBe(
      'custom_cuisine_equipee'
    )
    expect(
      customCriterionKey('Cuisine', ['custom_cuisine', 'custom_cuisine_2'])
    ).toBe('custom_cuisine_3')
    expect(customCriterionKey('!!!', [])).toBe('custom_critere')
    expect(
      customCriterionKey('Proximité de l’école maternelle et primaire', [])
    ).toBe('custom_proximite_de_l_ecole_mat')
  })

  it('dix critères au plus, masqués compris ; pas deux fois le même libellé', () => {
    const ten = Array.from({ length: OPINION_CRITERIA_MAX }, (_, i) => ({
      label: `Critère ${i}`,
    }))
    expect(addCriterionRefusal(ten, 'Cuisine')).toMatch(/10 critères au plus/)
    expect(addCriterionRefusal(criteria, 'calme')).toBe(
      'Un critère s’appelle déjà « calme ».'
    )
    expect(addCriterionRefusal(criteria, "On s'y voit")).toMatch(/déjà/)
    expect(addCriterionRefusal(criteria, 'Cuisine')).toBeNull()
    expect(labelTakenRefusal(criteria, 'Etat')).toMatch(/déjà/)
    expect(comparableLabel('  État   général ')).toBe('etat general')
  })

  it('un critère dicté : par sa clé ou son libellé', () => {
    expect(resolveOpinionCriterion(criteria, 'quiet')?.key).toBe('quiet')
    expect(resolveOpinionCriterion(criteria, ' calme ')?.key).toBe('quiet')
    expect(resolveOpinionCriterion(criteria, "on s'y voit")?.key).toBe('feel')
    expect(resolveOpinionCriterion(criteria, 'ETAT')?.key).toBe('condition')
    expect(resolveOpinionCriterion(criteria, 'cuisine')).toBeNull()
  })

  it('un critère ajouté jamais noté se retire ; sinon, on le masque', () => {
    expect(
      removeCriterionRefusal({ origin: 'default', label: 'Calme' }, 0)
    ).toMatch(/par défaut/)
    expect(
      removeCriterionRefusal({ origin: 'custom', label: 'Cuisine' }, 3)
    ).toBe('« Cuisine » a déjà 3 notes : masquez-le pour les garder.')
    expect(
      removeCriterionRefusal({ origin: 'custom', label: 'Cuisine' }, 1)
    ).toBe('« Cuisine » a déjà 1 note : masquez-le pour les garder.')
    expect(
      removeCriterionRefusal({ origin: 'custom', label: 'Cuisine' }, 0)
    ).toBeNull()
  })

  it('un nouvel ordre reprend chaque clé une fois ; monter et descendre', () => {
    const current = ['a1', 'b1', 'c1']
    expect(reorderRefusal(current, ['c1', 'a1', 'b1'])).toBeNull()
    expect(reorderRefusal(current, ['a1', 'a1', 'b1'])).toMatch(/une fois/)
    expect(reorderRefusal(current, ['a1', 'b1'])).toMatch(/une fois/)
    expect(reorderRefusal(current, ['a1', 'b1', 'd1'])).toMatch(/une fois/)
    expect(moveCriterion(current, 'b1', 'up')).toEqual(['b1', 'a1', 'c1'])
    expect(moveCriterion(current, 'b1', 'down')).toEqual(['a1', 'c1', 'b1'])
    expect(moveCriterion(current, 'a1', 'up')).toBeNull()
    expect(moveCriterion(current, 'c1', 'down')).toBeNull()
    expect(moveCriterion(current, 'zz', 'up')).toBeNull()
  })
})

describe('avis à l’aveugle', () => {
  it('a noté : un critère affiché ou une note globale ; un critère masqué ne compte pas', () => {
    const hiddenOnly = opinion(R, 0, { quiet: 4 })
    const withoutQuiet = new Set([...keys].filter(k => k !== 'quiet'))
    expect(opinionHasRating(hiddenOnly, keys)).toBe(true)
    expect(opinionHasRating(hiddenOnly, withoutQuiet)).toBe(false)
    expect(opinionHasRating(opinion(R, 3, {}), keys)).toBe(true)
    expect(
      opinionHasRating(opinion(R, 0, {}, { quiet: 'à revoir' }), keys)
    ).toBe(false)
    expect(opinionHasRating(null, keys)).toBe(false)
    expect(opinionHasRating(undefined, keys)).toBe(false)
    expect(ratedScores(richard, withoutQuiet)).toHaveLength(7)
    expect(opinionAverage(richard, keys)).toBe(4)
    expect(opinionAverage(opinion(R, 2, {}), keys)).toBeNull()
  })

  it('voit les autres si l’espace ne masque pas, s’il a noté, ou « Voir quand même »', () => {
    expect(
      canSeeOthersOpinions({ blind: true, viewerRated: false, revealed: false })
    ).toBe(false)
    expect(
      canSeeOthersOpinions({
        blind: false,
        viewerRated: false,
        revealed: false,
      })
    ).toBe(true)
    expect(
      canSeeOthersOpinions({ blind: true, viewerRated: true, revealed: false })
    ).toBe(true)
    expect(
      canSeeOthersOpinions({ blind: true, viewerRated: false, revealed: true })
    ).toBe(true)
  })

  it('un membre qui n’a pas noté ne reçoit que son avis ; les autres sont comptés', () => {
    const textOnly = opinion(L, 0, {}, {}, { text: 'Je passe demain' })
    const mine = opinion(R, 0, {}, {}, { text: 'Pas encore vu' })
    const split = splitOpinionsForViewer([mine, chloe, textOnly], {
      viewerId: R,
      blind: true,
      revealed: false,
      visibleKeys: keys,
    })
    expect(split.visible).toEqual([mine])
    expect(split.masked).toEqual([chloe])
    expect(split.viewerRated).toBe(false)
    expect(split.canSeeOthers).toBe(false)

    const revealed = splitOpinionsForViewer([chloe], {
      viewerId: R,
      blind: true,
      revealed: true,
      visibleKeys: keys,
    })
    expect(revealed.visible).toEqual([chloe])
    expect(revealed.masked).toEqual([])

    const rated = splitOpinionsForViewer([richard, chloe], {
      viewerId: R,
      blind: true,
      revealed: false,
      visibleKeys: keys,
    })
    expect(rated.visible).toHaveLength(2)
    expect(rated.viewerRated).toBe(true)

    const open = splitOpinionsForViewer([chloe], {
      viewerId: R,
      blind: false,
      revealed: false,
      visibleKeys: keys,
    })
    expect(open.visible).toEqual([chloe])
  })

  it('« après visite » : la dernière visite faite avec le membre avant son avis', () => {
    const visits = [
      {
        id: 'v-planned',
        visitedAt: '2026-11-10T10:00:00.000Z',
        status: 'planned' as const,
        participantIds: [R],
      },
      {
        id: VISIT,
        visitedAt: '2026-11-14T10:00:00.000Z',
        status: 'done' as const,
        participantIds: [R, C],
      },
      {
        id: 'v-older',
        visitedAt: '2026-11-01T10:00:00.000Z',
        status: 'done' as const,
        participantIds: [R],
      },
      {
        id: 'v-later',
        visitedAt: '2026-11-20T10:00:00.000Z',
        status: 'done' as const,
        participantIds: [R],
      },
      {
        id: 'v-alone',
        visitedAt: '2026-11-15T10:00:00.000Z',
        status: 'done' as const,
        participantIds: [C],
      },
    ]
    expect(opinionAfterVisit(visits, R, '2026-11-15T20:00:00.000Z')).toEqual({
      visitId: VISIT,
      visitedAt: '2026-11-14T10:00:00.000Z',
    })
    expect(opinionAfterVisit(visits, L, new Date('2026-11-30'))).toBeNull()
    expect(opinionAfterVisit(visits, R, '2026-10-01T00:00:00.000Z')).toBeNull()
  })
})

describe('confrontation', () => {
  it('reprend la maquette : 5 accords, 2 désaccords, note commune 3,6', () => {
    const s = confront()
    expect(s.status).toBe('ready')
    expect(s.agreements).toBe(5)
    expect(s.disagreementKeys).toEqual(['quiet', 'feel'])
    expect(s.maxGap).toBe(2)
    expect(s.commonScore).toBeCloseTo(25 / 7, 10)
    expect(formatOpinionAverage(s.commonScore)).toBe('3,6')
    const [r, c] = s.members
    expect(r?.average).toBe(4)
    expect(formatOpinionAverage(c?.average ?? null)).toBe('3,1')
    expect(r?.ratedCount).toBe(8)
    expect(c?.ratedCount).toBe(7)
    expect(c?.criteriaCount).toBe(8)
    const street = s.rows.find(row => row.key === 'street')
    expect(street?.common).toBe(false)
    expect(street?.gap).toBeNull()
    expect(street?.agreement).toBeNull()
    const quiet = s.rows.find(row => row.key === 'quiet')
    expect(quiet?.agreement).toBe('disagree')
    expect(quiet?.scores).toEqual([
      { memberId: R, score: 4, word: 'fenêtres fermées, ça va' },
      { memberId: C, score: 2, word: 'bus devant la chambre' },
    ])
    expect(s.rows.find(row => row.key === 'layout')?.agreement).toBe('agree')
    expect(s.rows.find(row => row.key === 'luminosity')?.agreement).toBe(
      'close'
    )
    expect(s.sentence).toBe(
      'D’accord sur 5 critères. Désaccord sur le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2). Chloé n’a pas encore noté la rue.'
    )
    expect(s.pendingMemberIds).toEqual([])
    expect(s.masked).toBe(false)
  })

  it('à l’aveugle : l’avis de l’autre n’entre que par son nombre de critères', () => {
    const s = confront({
      visible: [],
      masked: [chloe],
      viewerRated: false,
    })
    expect(s.status).toBe('pending')
    expect(s.masked).toBe(true)
    expect(s.commonScore).toBeNull()
    const c = s.members.find(m => m.memberId === C)
    expect(c).toMatchObject({
      state: 'masked',
      rating: null,
      average: null,
      ratedCount: 7,
    })
    expect(s.rows.every(r => r.scores.length === 0)).toBe(true)
    expect(JSON.stringify(s)).not.toContain('bus devant')
    expect(s.pendingMemberIds).toEqual([R, C])
    expect(s.sentence).toBe(
      'L’avis de Chloé reste masqué tant que tu n’as pas noté.'
    )
  })

  it('personne n’a noté ; un seul avis ; aucun critère noté par tous', () => {
    expect(confront({ visible: [], viewerRated: false }).sentence).toBe(
      'Personne n’a encore donné son avis.'
    )
    expect(confront({ visible: [], viewerRated: false }).status).toBe('empty')
    const one = confront({ visible: [richard] })
    expect(one.status).toBe('pending')
    expect(one.sentence).toBe(
      'Richard : 8 critères notés sur 8, 4,0 en moyenne. En attente de l’avis de Chloé.'
    )
    const globalOnly = confront({
      visible: [opinion(R, 4, {}), opinion(C, 0, { quiet: 2 })],
    })
    expect(globalOnly.status).toBe('none')
    expect(globalOnly.commonScore).toBeNull()
    expect(globalOnly.sentence).toBe('Richard n’a pas encore noté le calme.')
    const single = confrontOpinions({
      criteria,
      members: [members[0] as (typeof members)[number]],
      visible: [opinion(R, 0, { quiet: 4 })],
      masked: [],
      blind: true,
      revealed: false,
      viewerRated: true,
    })
    expect(single.status).toBe('ready')
    expect(single.commonScore).toBe(4)
    expect(single.sentence).toBe(
      'Richard : 1 critère noté sur 8, 4,0 en moyenne.'
    )
    const noAverage = confront({ visible: [opinion(R, 3, {})] })
    expect(noAverage.sentence).toBe(
      'Richard : 0 critère noté sur 8. En attente de l’avis de Chloé.'
    )
  })

  it('à trois : l’écart est max − min ; après visite et « après avoir vu » ', () => {
    const lea = opinion(
      L,
      4,
      { quiet: 5, layout: 4 },
      {},
      {
        seenBefore: [C, GONE],
        afterVisit: { visitId: VISIT, visitedAt: '2026-11-14T10:00:00.000Z' },
      }
    )
    const s = confrontOpinions({
      criteria,
      members: [...members, { id: L, displayName: 'Léa' }],
      visible: [richard, chloe, lea],
      masked: [],
      blind: true,
      revealed: true,
      viewerRated: false,
      names: new Map([[GONE, 'Paul']]),
    })
    expect(s.rows.find(r => r.key === 'quiet')?.gap).toBe(3)
    expect(s.disagreementKeys[0]).toBe('quiet')
    const l = s.members.find(m => m.memberId === L)
    expect(l?.seenBefore).toEqual(['Chloé', 'Paul'])
    expect(l?.afterVisit?.visitId).toBe(VISIT)
    expect(s.revealed).toBe(true)
    // Communs aux trois : agencement (4, 4, 4) et calme (4, 2, 5).
    expect(s.commonScore).toBeCloseTo((4 + 11 / 3) / 2, 10)
  })

  it('pas de désaccord ; beaucoup de désaccords et de critères manquants', () => {
    const calm = confront({
      visible: [opinion(R, 4, { quiet: 4 }), opinion(C, 4, { quiet: 3 })],
    })
    expect(calm.sentence).toBe(
      'D’accord sur 1 critère. Aucun désaccord de 2 points ou plus.'
    )
    const far = confront({
      visible: [
        opinion(R, 5, { luminosity: 5, layout: 5, condition: 5, quiet: 5 }),
        opinion(C, 1, {
          luminosity: 1,
          layout: 2,
          condition: 3,
          quiet: 1,
          outdoor: 3,
          building: 3,
          street: 3,
          feel: 3,
        }),
      ],
    })
    expect(far.disagreementKeys).toEqual([
      'luminosity',
      'quiet',
      'layout',
      'condition',
    ])
    expect(far.sentence).toBe(
      'Désaccord sur la luminosité (Richard 5, Chloé 1), le calme (5 et 1), l’agencement (5 et 2) et 1 autre. Richard n’a pas encore noté l’extérieur et la vue, l’immeuble, la rue et 1 autre.'
    )
    expect(disagreementList(far, ['quiet'])).toBe(
      'le calme (Richard 5, Chloé 1)'
    )
  })

  it('un membre sans avis visible mais avec un avis sans note reste « en attente »', () => {
    const s = confront({
      visible: [richard, opinion(C, 0, {}, {}, { text: 'Je réfléchis' })],
    })
    expect(s.members.find(m => m.memberId === C)?.state).toBe('missing')
    expect(s.status).toBe('pending')
  })
})

describe('phrases et effets', () => {
  it('mots de l’échelle, nombres en lettres, moyennes au dixième', () => {
    expect(scoreText(null)).toBe('—')
    expect(scoreText(undefined)).toBe('—')
    expect(scoreText(4)).toBe('4 · bien')
    expect(scoreText(1)).toBe('1 · rédhibitoire')
    expect(countWord(0)).toBe('Aucun')
    expect(countWord(1)).toBe('Un')
    expect(countWord(1, true)).toBe('Une')
    expect(countWord(2)).toBe('Deux')
    expect(countWord(12)).toBe('12')
    expect(criteriaCountText(1)).toBe('1 critère')
    expect(criteriaCountText(7)).toBe('7 critères')
    expect(formatOpinionAverage(null)).toBe('—')
    expect(formatOpinionAverage(Number.NaN)).toBe('—')
    expect(formatOpinionAverage(4)).toBe('4,0')
  })

  it('« Ce qui plaît » et « À surveiller » nés des avis', () => {
    const s = confront()
    expect(opinionHighlights(s)).toEqual({
      good: [
        {
          key: 'opinions_liked',
          text: 'Vous aimez tous les deux : extérieur et vue (5 et 5), luminosité (5 et 4), agencement (4 et 4)',
          tab: 'synthese',
          section: 'opinions',
        },
      ],
      watch: [
        {
          key: 'opinions_disagreement',
          text: 'Vous n’êtes pas d’accord sur le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2)',
          tab: 'synthese',
          section: 'opinions',
        },
      ],
    })
    expect(opinionHighlights(null)).toEqual({ good: [], watch: [] })
    // Rien ne plaît à tous tant qu'un avis manque ou est masqué.
    expect(opinionHighlights(confront({ visible: [richard] })).good).toEqual([])
  })

  it('un « rédhibitoire » passe avant les désaccords, sans les répéter', () => {
    const s = confront({
      visible: [
        opinion(R, 4, { quiet: 4, feel: 4, building: 1 }),
        opinion(C, 2, { quiet: 1, feel: 2, building: 1 }),
      ],
    })
    const { watch } = opinionHighlights(s)
    expect(watch.map(w => w.text)).toEqual([
      'Noté rédhibitoire : le calme (Chloé) et l’immeuble (Richard et Chloé)',
      'Vous n’êtes pas d’accord sur « on s’y voit » (Richard 4, Chloé 2)',
    ])
    const onlyDealbreaker = opinionHighlights(
      confront({
        visible: [opinion(R, 4, { quiet: 4 }), opinion(C, 2, { quiet: 1 })],
      })
    )
    expect(onlyDealbreaker.watch.map(w => w.key)).toEqual([
      'opinions_dealbreaker',
    ])
  })

  it('seul, ou à trois : « Vous aimez », « Vous aimez tous »', () => {
    const solo = confrontOpinions({
      criteria,
      members: [{ id: R, displayName: 'Richard' }],
      visible: [opinion(R, 5, { quiet: 5 })],
      masked: [],
      blind: false,
      revealed: false,
      viewerRated: true,
    })
    expect(opinionHighlights(solo).good[0]?.text).toBe('Vous aimez : calme (5)')
    const trio = confrontOpinions({
      criteria,
      members: [...members, { id: L, displayName: 'Léa' }],
      visible: [
        opinion(R, 5, { quiet: 5 }),
        opinion(C, 5, { quiet: 4 }),
        opinion(L, 5, { quiet: 4 }),
      ],
      masked: [],
      blind: false,
      revealed: false,
      viewerRated: true,
    })
    expect(opinionHighlights(trio).good[0]?.text).toBe(
      'Vous aimez tous : calme (5, 4 et 4)'
    )
  })

  it('listingHighlights : les avis après le verdict et les contrôles bloquants, trois au plus', () => {
    const s = confront()
    const result = listingHighlights({
      metrics: null,
      rental: {
        checks: [
          {
            key: 'dpe_ban',
            level: 'bad',
            message: 'DPE G : location interdite.',
          },
        ],
      } as unknown as Parameters<typeof listingHighlights>[0]['rental'],
      targetPrice: null,
      dpeClass: 'G',
      openData: {
        transit: {
          nearestTram: {
            name: '[Exemple] Parc',
            lines: ['A'],
            distanceMeters: 450,
          },
        },
      } as unknown as Parameters<typeof listingHighlights>[0]['openData'],
      votedWorks: 'Ravalement voté en 2026',
      proceedings: 'Procédure contre un copropriétaire',
      opinions: s,
    })
    expect(result.good.map(g => g.key)).toEqual(['opinions_liked', 'tram'])
    expect(result.watch.map(w => w.key)).toEqual([
      'rental_dpe_ban',
      'opinions_disagreement',
      'voted_works',
    ])
    expect(result.watch).toHaveLength(HIGHLIGHTS_MAX)
    const without = listingHighlights({
      metrics: null,
      rental: null,
      targetPrice: null,
      dpeClass: null,
      openData: null,
      votedWorks: null,
      proceedings: null,
    })
    expect(without).toEqual({ good: [], watch: [] })
  })

  it('« À rediscuter » dans les prochaines étapes, après la visite planifiée', () => {
    const s = confront()
    expect(opinionNextStepText(s)).toBe(
      'Le calme et « on s’y voit » : vos notes s’écartent de 2 points'
    )
    expect(opinionNextStepText(null)).toBeNull()
    expect(
      opinionNextStepText(
        confront({
          visible: [opinion(R, 4, { quiet: 4 }), opinion(C, 4, { quiet: 4 })],
        })
      )
    ).toBeNull()
    const wide = confront({
      visible: [
        opinion(R, 5, { luminosity: 5, layout: 5, quiet: 5 }),
        opinion(C, 1, { luminosity: 2, layout: 3, quiet: 3 }),
      ],
    })
    expect(opinionNextStepText(wide)).toBe(
      'La luminosité, l’agencement et 1 autre : vos notes s’écartent de 2 à 3 points'
    )
    const steps = nextSteps({
      tasks: [
        {
          id: 't1',
          label: 'Appeler le syndic',
          field: null,
          done: false,
          position: 0,
        },
      ],
      requests: [],
      visits: [
        {
          id: 'v1',
          visitedAt: '2026-11-20T09:00:00.000Z',
          status: 'planned',
        },
      ],
      now: new Date('2026-11-16T09:00:00.000Z'),
      opinions: s,
    })
    expect(steps.map(step => step.kind)).toEqual(['visit', 'discuss', 'task'])
  })

  it('la tâche de contre-visite est proposée avec les notes et les mots', () => {
    const s = confront()
    expect(counterVisitLabel({ key: 'quiet', label: 'Calme' })).toBe(
      'À revoir à la contre-visite : le calme'
    )
    expect(counterVisitTask(s, 'quiet')).toEqual({
      label: 'À revoir à la contre-visite : le calme',
      details:
        'Vos notes s’écartent de 2 points : Richard 4 (« fenêtres fermées, ça va »), Chloé 2 (« bus devant la chambre »).',
    })
    expect(counterVisitTask(s, 'layout')).toBeNull()
    expect(counterVisitTask(s, 'inconnu')).toBeNull()
    const long = confront({
      visible: [
        opinion(R, 4, { quiet: 5 }, { quiet: 'x'.repeat(80) }),
        opinion(C, 4, { quiet: 1 }, { quiet: 'y'.repeat(80) }),
        opinion(L, 4, { quiet: 3 }, { quiet: 'z'.repeat(80) }),
      ],
      members: [
        ...members,
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `7777777${i}-7777-4777-8777-777777777777`,
          displayName: `Membre ${i}`,
        })),
        { id: L, displayName: 'Léa' },
      ],
    })
    const many = confrontOpinions({
      criteria,
      members: long.members.map(m => ({
        id: m.memberId,
        displayName: m.displayName,
      })),
      visible: long.members.map((m, i) =>
        opinion(
          m.memberId,
          3,
          { quiet: (i % 5) + 1 },
          { quiet: 'w'.repeat(80) }
        )
      ),
      masked: [],
      blind: false,
      revealed: false,
      viewerRated: true,
    })
    const task = counterVisitTask(many, 'quiet')
    expect(task?.details.length).toBe(TASK_DETAILS_MAX)
    expect(task?.details.endsWith('…')).toBe(true)
  })

  it('la meilleure note commune d’une ligne de comparaison', () => {
    expect(bestCommonIndexes([])).toEqual([])
    expect(bestCommonIndexes([4, null])).toEqual([])
    expect(bestCommonIndexes([4, 4])).toEqual([])
    expect(bestCommonIndexes([3.5, 4, null])).toEqual([1])
    expect(bestCommonIndexes([4, 4, 3])).toEqual([0, 1])
  })

  it('les désaccords d’un avis avec chacun des autres, dans l’ordre des critères', () => {
    expect(disagreementsWith(chloe, [richard], keys)).toEqual([
      { memberId: R, keys: ['quiet', 'feel'] },
    ])
    expect(disagreementsWith(opinion(C, 3, {}), [richard], keys)).toEqual([
      { memberId: R, keys: [] },
    ])
  })

  it('« À revoir à la contre-visite » se range avec les visites dans « À faire »', () => {
    const items = todoItems({
      tasks: [
        {
          id: 't-opinion',
          label: 'À revoir à la contre-visite : le calme',
          field: null,
          done: false,
          position: 0,
          origin: 'opinion',
        },
        {
          id: 't-manual',
          label: 'Appeler le syndic',
          field: null,
          done: false,
          position: 1,
          origin: 'manual',
        },
      ],
      requests: [],
      visits: [],
    })
    expect(items.map(i => i.group)).toEqual(['visit', 'us'])
  })
})

describe('cas limites', () => {
  it('un avis sans date, des moyennes à égalité, beaucoup de désaccords', () => {
    const { updatedAt: _r, ...undated } = opinion(R, 4, { quiet: 4 })
    const { updatedAt: _c, ...maskedUndated } = opinion(C, 3, { quiet: 2 })
    const s = confront({
      visible: [undated],
      masked: [maskedUndated],
      viewerRated: true,
    })
    expect(s.members.map(m => m.updatedAt)).toEqual([null, null])
    const tie = confront({
      visible: [
        opinion(R, 5, { layout: 4, luminosity: 4, outdoor: 5 }),
        opinion(C, 5, { layout: 4, luminosity: 4, outdoor: 5 }),
      ],
    })
    expect(opinionHighlights(tie).good[0]?.text).toBe(
      'Vous aimez tous les deux : extérieur et vue (5 et 5), luminosité (4 et 4), agencement (4 et 4)'
    )
    const five = confront({
      visible: [
        opinion(R, 5, {
          luminosity: 5,
          layout: 5,
          condition: 5,
          quiet: 5,
          outdoor: 5,
        }),
        opinion(C, 1, {
          luminosity: 2,
          layout: 2,
          condition: 2,
          quiet: 2,
          outdoor: 2,
        }),
      ],
    })
    expect(disagreementList(five)).toMatch(/ et 2 autres$/)
    expect(opinionNextStepText(five)).toBe(
      'La luminosité, l’agencement et 3 autres : vos notes s’écartent de 3 points'
    )
    expect(counterVisitTask(confront(), 'feel')?.details).toBe(
      'Vos notes s’écartent de 2 points : Richard 4, Chloé 2.'
    )
  })

  it('une note globale donnée, une phrase effacée, un seul désaccord', () => {
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'web',
        actorMemberId: C,
        before: { rating: 0, text: 'Bof', scores: { quiet: 2 }, words: {} },
        after: {
          rating: 4,
          text: '',
          scores: { quiet: 2 },
          words: {},
          labels: { quiet: 'Calme' },
          disagreements: [{ memberId: R, keys: ['quiet'] }],
        },
      },
      new Map([[R, { displayName: 'Richard' }]])
    )
    expect(d.summary).toBe(
      'a mis à jour son avis : 4/5, 1 critère (note globale — → 4). Un désaccord avec Richard : calme.'
    )
    expect(d.changes.find(c => c.field === 'text')).toEqual({
      field: 'text',
      label: 'Phrase',
      before: 'Bof',
      after: null,
    })
  })

  it('l’ordre des critères survit à une base qui réordonne les clés (jsonb)', () => {
    const before = opinionSnapshot(
      opinion(R, 3, { luminosity: 3, feel: 3 }),
      keys
    )
    const { after } = opinionJournalPayload({
      before,
      opinion: opinion(R, 3, { luminosity: 4, feel: 2 }),
      criteria,
      visibleKeys: keys,
      afterVisit: false,
      seenBefore: [],
      others: [],
      blind: true,
    })
    expect(after.order).toEqual(['luminosity', 'feel'])
    // Postgres range les clés d'un objet jsonb par longueur : « feel » d'abord.
    const shuffled = {
      ...after,
      labels: { feel: 'On s’y voit', luminosity: 'Luminosité' },
      scores: { feel: 2, luminosity: 4 },
    }
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'web',
        actorMemberId: R,
        before: { ...before, scores: { feel: 3, luminosity: 3 } },
        after: shuffled,
      },
      new Map([[R, { displayName: 'Richard' }]])
    )
    expect(d.summary).toBe(
      'a mis à jour son avis : 3/5, 2 critères (luminosité 3 → 4, on s’y voit 3 → 2).'
    )
    expect(d.changes.map(c => c.field)).toEqual([
      'scores.luminosity',
      'scores.feel',
    ])
  })

  it('une ligne du journal mal formée ne casse rien', () => {
    const names = new Map([[R, { displayName: 'Richard' }]])
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'web',
        actorMemberId: R,
        before: {
          rating: 'x',
          text: 3,
          scores: { quiet: 4 },
          words: { quiet: 'ok' },
        },
        after: {
          rating: 'x',
          text: 3,
          scores: { quiet: 'x', other_key: 3 },
          words: 5,
          labels: 5,
          seenBefore: 'x',
          disagreements: [
            { keys: 'x', memberId: R },
            { memberId: R, keys: [] },
            { memberId: 3, keys: ['quiet'] },
            3,
            { memberId: GONE, keys: ['quiet', 'other_key'] },
          ],
        },
      },
      names
    )
    expect(d.summary).toBe(
      'a mis à jour son avis : 1 critère (quiet 4 → —, other_key — → 3). Deux désaccords avec un membre : quiet, other_key.'
    )
    expect(d.changes.map(c => c.label)).toEqual([
      'quiet',
      'other_key',
      'quiet (mot)',
    ])
    const plain = describeActivity(
      {
        action: 'opinion.created',
        channel: 'web',
        actorMemberId: R,
        before: null,
        after: { scores: {}, disagreements: 'x' },
      },
      names
    )
    expect(plain.summary).toBe('a donné son avis.')
    expect(plain.changes).toEqual([])
    expect(
      opinionNotificationText({
        action: 'opinion.created',
        after: { ratedMemberIds: [R], disagreements: 'x' },
        actorName: 'Chloé',
        recipientId: R,
        listingTitle: 'T3',
      }).body
    ).toBe('T3 : aucun désaccord de 2 points ou plus.')
    expect(
      opinionNotificationText({
        action: 'opinion.created',
        after: {
          ratedMemberIds: [R],
          disagreements: [{ memberId: R, keys: 'x' }],
        },
        actorName: 'Chloé',
        recipientId: R,
        listingTitle: 'T3',
      }).body
    ).toBe('T3 : aucun désaccord de 2 points ou plus.')
  })
})

describe('journal et notifications', () => {
  const names = new Map([
    [R, { displayName: 'Richard' }],
    [C, { displayName: 'Chloé' }],
  ])
  const hiddenQuiet = criteria.map(c =>
    c.key === 'quiet' ? { ...c, hidden: true } : c
  )

  it('ce qu’une écriture d’avis garde : notes affichées, mots, libellés, désaccords', () => {
    const snapshot = opinionSnapshot(chloe, visibleCriterionKeys(hiddenQuiet))
    expect(snapshot.scores.quiet).toBeUndefined()
    expect(snapshot.words).toEqual({ luminosity: 'chambre 2 un peu sombre' })
    expect(opinionSnapshot({ rating: 0, scores: [] }, keys).text).toBe('')
    const payload = opinionJournalPayload({
      before: null,
      opinion: { ...chloe, text: 'Belle lumière mais trop de bruit' },
      criteria,
      visibleKeys: keys,
      afterVisit: true,
      seenBefore: [],
      others: [richard, opinion(L, 0, {}, {}, { text: 'Sans note' })],
      blind: true,
    })
    expect(payload.after).toMatchObject({
      rating: 3,
      text: 'Belle lumière mais trop de bruit',
      criteriaCount: 7,
      afterVisit: true,
      disagreements: [{ memberId: R, keys: ['quiet', 'feel'] }],
      ratedMemberIds: [R],
      blind: true,
    })
    expect(payload.after.labels.quiet).toBe('Calme')
    expect(payload.after.labels.street).toBeUndefined()
    expect(sameOpinionSnapshot(null, payload.after)).toBe(false)
    expect(
      sameOpinionSnapshot(
        opinionSnapshot(chloe, keys),
        opinionSnapshot(chloe, keys)
      )
    ).toBe(true)
  })

  it('« Chloé a donné son avis : 3/5, 7 critères. Deux désaccords avec Richard… »', () => {
    const { after } = opinionJournalPayload({
      before: null,
      opinion: chloe,
      criteria,
      visibleKeys: keys,
      afterVisit: false,
      seenBefore: [],
      others: [richard],
      blind: true,
    })
    const d = describeActivity(
      {
        action: 'opinion.created',
        channel: 'web',
        actorMemberId: C,
        before: null,
        after,
      },
      names
    )
    expect(d.kind).toBe('opinion')
    expect(d.summary).toBe(
      'a donné son avis : 3/5, 7 critères. Deux désaccords avec Richard : calme, on s’y voit.'
    )
    expect(d.changes.find(c => c.field === 'rating')).toEqual({
      field: 'rating',
      label: 'Note globale',
      before: null,
      after: '3/5',
    })
    expect(d.changes.find(c => c.field === 'scores.quiet')).toEqual({
      field: 'scores.quiet',
      label: 'Calme',
      before: null,
      after: '2 · bof',
    })
    expect(d.changes.find(c => c.field === 'words.quiet')?.after).toBe(
      'bus devant la chambre'
    )
  })

  it('« Richard a mis à jour son avis après la visite : 4/5, 8 critères (état 4 → 3). »', () => {
    const before = opinionSnapshot(
      {
        ...richard,
        scores: richard.scores.map(s =>
          s.key === 'condition' ? { ...s, score: 4 } : s
        ),
      },
      keys
    )
    const { after } = opinionJournalPayload({
      before,
      opinion: richard,
      criteria,
      visibleKeys: keys,
      afterVisit: true,
      seenBefore: [],
      others: [],
      blind: true,
    })
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'web',
        actorMemberId: R,
        before,
        after,
      },
      names
    )
    expect(d.summary).toBe(
      'a mis à jour son avis après la visite : 4/5, 8 critères (état 4 → 3).'
    )
    expect(d.changes).toEqual([
      {
        field: 'scores.condition',
        label: 'État',
        before: '4 · bien',
        after: '3 · correct',
      },
    ])
  })

  it('après avoir vu celui de Chloé ; beaucoup d’écarts ; note globale, phrase, mots', () => {
    const before = opinionSnapshot(
      opinion(R, 2, { quiet: 4, layout: 4 }, { quiet: 'ok' }),
      keys
    )
    before.text = 'Avant'
    const { after } = opinionJournalPayload({
      before,
      opinion: {
        rating: 0,
        text: 'Après',
        scores: [
          { key: 'quiet', score: null, word: null },
          { key: 'layout', score: 2, word: null },
          { key: 'feel', score: 5, word: null },
          { key: 'street', score: 3, word: null },
        ],
      },
      criteria,
      visibleKeys: keys,
      afterVisit: true,
      seenBefore: [C, GONE],
      others: [],
      blind: true,
    })
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'mcp',
        actorMemberId: R,
        before,
        after,
      },
      names
    )
    // Dans l'ordre des critères, quel que soit l'ordre de la saisie.
    expect(d.summary).toBe(
      'a mis à jour son avis après la visite et après avoir vu ceux de Chloé et un membre : 3 critères (agencement 4 → 2, calme 4 → —, rue et ambiance — → 3, …).'
    )
    expect(d.changes.map(c => c.field)).toEqual([
      'rating',
      'text',
      'scores.layout',
      'scores.quiet',
      'scores.street',
      'scores.feel',
      'words.quiet',
    ])
    expect(d.changes[0]).toEqual({
      field: 'rating',
      label: 'Note globale',
      before: '2/5',
      after: null,
    })
    const seenOne = describeActivity(
      {
        action: 'opinion.created',
        channel: 'web',
        actorMemberId: R,
        before: null,
        after: {
          ...after,
          afterVisit: false,
          seenBefore: [C],
          rating: 0,
          scores: {},
        },
      },
      names
    )
    expect(seenOne.summary).toBe(
      'a donné son avis après avoir vu celui de Chloé.'
    )
  })

  it('à l’aveugle, la ligne d’un autre ne dit ni les notes ni les désaccords', () => {
    const { after } = opinionJournalPayload({
      before: null,
      opinion: chloe,
      criteria,
      visibleKeys: keys,
      afterVisit: true,
      seenBefore: [],
      others: [richard],
      blind: true,
    })
    const redacted = redactOpinionActivity('opinion.created', null, after)
    expect(redacted.before).toBeNull()
    expect(redacted.after).toEqual({
      masked: true,
      criteriaCount: 7,
      afterVisit: true,
    })
    const d = describeActivity(
      {
        action: 'opinion.created',
        channel: 'web',
        actorMemberId: C,
        ...redacted,
      },
      names
    )
    expect(d.summary).toBe(
      'a donné son avis après la visite : 7 critères notés (masqué tant que tu n’as pas noté).'
    )
    expect(d.changes).toEqual([])
    expect(JSON.stringify(d)).not.toMatch(/3\/5|bof|bus/)
    // Une ligne d'avant le lot 20 : pas de compte.
    const legacy = redactOpinionActivity('opinion.updated', null, {
      rating: 4,
      text: 'Lumineux',
    })
    expect(
      describeActivity(
        {
          action: 'opinion.updated',
          channel: 'web',
          actorMemberId: C,
          ...legacy,
        },
        names
      ).summary
    ).toBe('a mis à jour son avis (masqué tant que tu n’as pas noté).')
    expect(redactOpinionActivity('opinion.created', null, null).after).toEqual({
      masked: true,
      criteriaCount: null,
      afterVisit: false,
    })
    expect(
      describeActivity(
        {
          action: 'opinion.created',
          channel: 'web',
          actorMemberId: C,
          before: null,
          after: { masked: true, criteriaCount: 1, afterVisit: false },
        },
        names
      ).summary
    ).toBe(
      'a donné son avis : 1 critère noté (masqué tant que tu n’as pas noté).'
    )
    const other = redactOpinionActivity('task.created', 'b', 'a')
    expect(other).toEqual({ before: 'b', after: 'a' })
    expect(isOpinionWrite('opinion.updated')).toBe(true)
    expect(isOpinionWrite('opinion.revealed')).toBe(false)
  })

  it('les lignes d’avant le lot 20 se lisent comme avant', () => {
    const d = describeActivity(
      {
        action: 'opinion.updated',
        channel: 'web',
        actorMemberId: R,
        before: { rating: 3, text: 'Bien' },
        after: { rating: 4, text: 'Très bien' },
      },
      names
    )
    expect(d.summary).toBe('a modifié son avis')
    expect(d.changes.map(c => c.after)).toEqual(['4/5', 'Très bien'])
    expect(
      describeActivity(
        {
          action: 'opinion.created',
          channel: 'web',
          actorMemberId: R,
          before: null,
          after: { rating: 4, text: 'Bien' },
        },
        names
      ).summary
    ).toBe('a donné son avis')
  })

  it('« Voir quand même » et les réglages des critères au journal', () => {
    const say = (action: string, before: unknown, after: unknown) =>
      describeActivity(
        { action, channel: 'web', actorMemberId: R, before, after },
        names
      )
    expect(say('opinion.revealed', null, { memberIds: [C] }).summary).toBe(
      'a affiché l’avis de Chloé avant de noter'
    )
    expect(say('opinion.revealed', null, null).summary).toBe(
      'a choisi de voir les avis avant de noter'
    )
    expect(say('opinion.revealed', null, null).kind).toBe('opinion')
    expect(
      say('opinion_settings.blind_changed', null, { blind: true }).summary
    ).toBe('a activé les avis à l’aveugle')
    expect(
      say('opinion_settings.blind_changed', null, { blind: false }).summary
    ).toBe('a désactivé les avis à l’aveugle')
    expect(
      say('opinion_settings.criterion_added', null, { label: 'Cuisine' })
        .summary
    ).toBe('a ajouté le critère d’avis « Cuisine »')
    expect(say('opinion_settings.criterion_added', null, null).summary).toBe(
      'a ajouté le critère d’avis'
    )
    expect(
      say('opinion_settings.criterion_removed', { label: 'Cuisine' }, null)
        .summary
    ).toBe('a retiré le critère d’avis « Cuisine »')
    expect(
      say(
        'opinion_settings.criterion_updated',
        { label: 'Calme', hidden: false },
        { hidden: true }
      ).summary
    ).toBe('a masqué le critère d’avis « Calme »')
    expect(
      say(
        'opinion_settings.criterion_updated',
        { label: 'Calme', hidden: true },
        { hidden: false }
      ).summary
    ).toBe('a réaffiché le critère d’avis « Calme »')
    const renamed = say(
      'opinion_settings.criterion_updated',
      { label: 'Calme' },
      { label: 'Calme et bruit' }
    )
    expect(renamed.summary).toBe(
      'a renommé le critère d’avis « Calme » en « Calme et bruit »'
    )
    expect(renamed.changes).toEqual([
      {
        field: 'label',
        label: 'Libellé',
        before: 'Calme',
        after: 'Calme et bruit',
      },
    ])
    expect(
      say(
        'opinion_settings.criterion_updated',
        { label: 'Calme', hint: 'rue' },
        { hint: 'rue, voisins' }
      ).summary
    ).toBe('a modifié le critère d’avis « Calme »')
    const reordered = say(
      'opinion_settings.criteria_reordered',
      { labels: ['Calme', 'État'] },
      { labels: ['État', 'Calme'] }
    )
    expect(reordered.summary).toBe('a changé l’ordre des critères d’avis')
    expect(reordered.changes[0]).toEqual({
      field: 'order',
      label: 'Ordre',
      before: 'Calme · État',
      after: 'État · Calme',
    })
    expect(
      say('opinion_settings.criteria_reordered', null, null).changes[0]
    ).toMatchObject({ before: null, after: null })
  })

  it('la notification : les désaccords avec soi, ou « à toi de noter » sans les notes', () => {
    const { after } = opinionJournalPayload({
      before: null,
      opinion: chloe,
      criteria,
      visibleKeys: keys,
      afterVisit: false,
      seenBefore: [],
      others: [richard],
      blind: true,
    })
    expect(
      opinionNotificationText({
        action: 'opinion.created',
        after,
        actorName: 'Chloé',
        recipientId: R,
        listingTitle: '[Exemple] T3 68 m², balcon sud',
      })
    ).toEqual({
      title: 'Chloé a donné son avis',
      body: '[Exemple] T3 68 m², balcon sud : 2 désaccords à discuter.',
    })
    expect(
      opinionNotificationText({
        action: 'opinion.updated',
        after: { ...after, disagreements: [{ memberId: R, keys: ['quiet'] }] },
        actorName: 'Chloé',
        recipientId: R,
        listingTitle: 'T3',
      })
    ).toEqual({
      title: 'Chloé a mis à jour son avis',
      body: 'T3 : 1 désaccord à discuter.',
    })
    expect(
      opinionNotificationText({
        action: 'opinion.created',
        after: { ...after, disagreements: [] },
        actorName: 'Chloé',
        recipientId: R,
        listingTitle: 'T3',
      }).body
    ).toBe('T3 : aucun désaccord de 2 points ou plus.')
    const blind = opinionNotificationText({
      action: 'opinion.created',
      after,
      actorName: 'Chloé',
      recipientId: L,
      listingTitle: 'T3',
    })
    expect(blind).toEqual({
      title: 'Chloé a donné son avis, à toi de noter',
      body: 'T3 : ses notes restent masquées tant que tu n’as pas noté.',
    })
    expect(
      opinionNotificationText({
        action: 'opinion.updated',
        after: { ...after, blind: false },
        actorName: 'Chloé',
        recipientId: L,
        listingTitle: 'T3',
      })
    ).toEqual({
      title: 'Chloé a mis à jour son avis, à toi de noter',
      body: 'T3.',
    })
    expect(
      opinionNotificationText({
        action: 'opinion.created',
        after: null,
        actorName: 'Chloé',
        recipientId: L,
        listingTitle: 'T3',
      }).title
    ).toBe('Chloé a donné son avis, à toi de noter')
  })

  it('notificationsForActivity : les autres membres, le prénom même par Claude', () => {
    const { after } = opinionJournalPayload({
      before: null,
      opinion: chloe,
      criteria,
      visibleKeys: keys,
      afterVisit: false,
      seenBefore: [],
      others: [richard],
      blind: true,
    })
    const event = {
      action: 'opinion.created',
      channel: 'mcp' as const,
      actorMemberId: C,
      listingId: LISTING,
      before: null,
      after,
    }
    expect(notificationTypeOf(event)).toBe('opinion_added')
    const drafts = notificationsForActivity(event, {
      members: [
        { id: R, displayName: 'Richard' },
        { id: C, displayName: 'Chloé' },
        { id: L, displayName: 'Léa' },
      ],
      listingTitle: 'T3',
    })
    expect(drafts.map(d => [d.recipientId, d.title])).toEqual([
      [R, 'Chloé a donné son avis'],
      [L, 'Chloé a donné son avis, à toi de noter'],
    ])
    expect(drafts[0]?.url).toBe(`/annonces/${LISTING}`)
    expect(drafts[0]?.type).toBe('opinion_added')
    const anonymous = notificationsForActivity(
      { ...event, actorMemberId: null },
      { members: [{ id: R, displayName: 'Richard' }], listingTitle: null }
    )
    expect(anonymous[0]?.title).toBe('Un membre a donné son avis')
    expect(
      notificationsForActivity(
        { ...event, listingId: null },
        { members: [{ id: R, displayName: 'Richard' }], listingTitle: null }
      )[0]?.url
    ).toBeNull()
  })

  it('« ce qui a changé » : la phrase du journal, masquée si besoin', () => {
    const { after } = opinionJournalPayload({
      before: null,
      opinion: chloe,
      criteria,
      visibleKeys: keys,
      afterVisit: false,
      seenBefore: [],
      others: [],
      blind: true,
    })
    const report = computeWhatsNew({
      memberId: R,
      since: '2026-11-01T00:00:00.000Z',
      sinceSource: 'previous_visit',
      now: '2026-11-20T00:00:00.000Z',
      events: [
        {
          id: '88888888-8888-4888-8888-888888888881',
          action: 'opinion.created',
          channel: 'web',
          actorMemberId: C,
          listingId: LISTING,
          before: null,
          after,
          createdAt: '2026-11-15T20:00:00.000Z',
        },
        {
          id: '88888888-8888-4888-8888-888888888882',
          action: 'opinion.updated',
          channel: 'web',
          actorMemberId: C,
          listingId: LISTING,
          ...redactOpinionActivity('opinion.updated', null, after),
          createdAt: '2026-11-16T20:00:00.000Z',
        },
      ],
      listings: new Map([[LISTING, { title: 'T3', seenAt: null }]]),
      members: new Map([
        [R, { id: R, handle: 'richard', displayName: 'Richard' }],
        [C, { id: C, handle: 'chloe', displayName: 'Chloé' }],
      ]),
    })
    expect(report.items.map(i => i.summary)).toEqual([
      'Chloé a mis à jour son avis : 7 critères notés (masqué tant que tu n’as pas noté).',
      'Chloé a donné son avis : 3/5, 7 critères.',
    ])
  })
})
