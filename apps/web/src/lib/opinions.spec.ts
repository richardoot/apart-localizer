import { describe, expect, it } from 'vitest'
import {
  MEMBERS,
  fakeOpinion,
  fakeOpinionSummary,
  fakeScores,
  mockupOpinions,
} from '@/test/fixtures'
import {
  GLOBAL_CHOICES,
  SCORE_CHOICES,
  afterVisitText,
  commonScoreText,
  compareCell,
  disagreementsText,
  draftAverage,
  gapText,
  hasOpenTask,
  isOpinionDraftDirty,
  maskedText,
  memberCell,
  memberMeta,
  memberSortValue,
  opinionDraft,
  opinionPayload,
  rowNotes,
  scoreChip,
  scoreToneClass,
  seenBeforeText,
  shortDay,
} from './opinions'

const R = MEMBERS[0]?.id ?? ''
const C = MEMBERS[1]?.id ?? ''
const KEYS = [
  'luminosity',
  'layout',
  'condition',
  'quiet',
  'outdoor',
  'building',
  'street',
  'feel',
]

describe('lot 20 : textes de « Nos avis »', () => {
  it('six choix par critère (« — » puis 1 à 5 et leur mot), cinq pour la note globale', () => {
    expect(SCORE_CHOICES.map(c => `${c.num} ${c.word}`)).toEqual([
      '— pas d’avis',
      '1 rédhibitoire',
      '2 bof',
      '3 correct',
      '4 bien',
      '5 excellent',
    ])
    expect(SCORE_CHOICES[4]?.aria).toBe('4, bien')
    expect(GLOBAL_CHOICES.map(c => c.aria)).toEqual([
      '1 sur 5',
      '2 sur 5',
      '3 sur 5',
      '4 sur 5',
      '5 sur 5',
    ])
  })

  it('teintes en jetons, pastilles, écarts', () => {
    expect(scoreToneClass(1)).toBe('bg-bad-soft text-bad')
    expect(scoreToneClass(2)).toBe('bg-warn-soft text-warn')
    expect(scoreToneClass(3)).toBe('bg-surface-2 text-fg')
    expect(scoreToneClass(4)).toBe('bg-accent-soft text-accent')
    expect(scoreToneClass(5)).toBe('bg-accent text-accent-fg')
    expect(scoreToneClass(null)).toContain('text-muted')
    expect(scoreChip(4)).toBe('4 · bien')
    expect(scoreChip(null)).toBe('—')
    expect(gapText(null)).toBe('—')
    expect(gapText(0)).toBe('d’accord')
    expect(gapText(1)).toBe('1 point')
    expect(gapText(2)).toBe('2 points')
  })

  it('cartes : critères notés, après la visite, après avoir vu', () => {
    const { summary } = fakeOpinionSummary(mockupOpinions())
    const chloe = summary.members.find(m => m.memberId === C)
    expect(chloe && memberMeta(chloe)).toBe('7 critères sur 8')
    const visited = {
      ...(chloe as NonNullable<typeof chloe>),
      afterVisit: {
        visitId: 'eeeeeeee-0000-4000-8000-000000000001',
        visitedAt: '2026-11-14T09:00:00.000Z',
      },
      seenBefore: ['Richard'],
    }
    expect(shortDay('2026-11-14T09:00:00.000Z')).toBe('14 nov.')
    expect(afterVisitText(visited)).toBe('après la visite du 14 nov.')
    expect(memberMeta(visited)).toBe(
      '7 critères sur 8 · après la visite du 14 nov. · après avoir vu celui de Richard'
    )
    expect(seenBeforeText([])).toBeNull()
    expect(seenBeforeText(['Chloé', 'Léa'])).toBe(
      'après avoir vu ceux de Chloé et Léa'
    )
    expect(maskedText(visited)).toBe(
      'Chloé a noté 7 critères sur 8, après la visite du 14 nov. Ses notes restent masquées tant que tu n’as pas donné les tiennes.'
    )
    expect(maskedText({ ...visited, afterVisit: null, ratedCount: 1 })).toBe(
      'Chloé a noté 1 critère sur 8. Ses notes restent masquées tant que tu n’as pas donné les tiennes.'
    )
  })

  it('« Ce que vous en dites » : les mots, et qui n’a pas encore noté', () => {
    const { summary } = fakeOpinionSummary(mockupOpinions())
    const row = (key: string) =>
      summary.rows.find(r => r.key === key) as (typeof summary.rows)[number]
    expect(rowNotes(row('quiet'), summary)).toBe(
      'Richard : fenêtres fermées, ça va ; Chloé : bus devant la chambre'
    )
    expect(rowNotes(row('street'), summary)).toBe('Chloé : pas encore d’avis')
    expect(rowNotes(row('layout'), summary)).toBe('—')
  })

  it('liste et comparaison : membres, note commune, désaccords', () => {
    const { summary } = fakeOpinionSummary(mockupOpinions())
    expect(memberCell(summary, R)).toBe('4/5 · 4,0')
    expect(memberCell(summary, C)).toBe('3/5 · 3,1')
    expect(memberSortValue(summary, R)).toBe(4)
    expect(commonScoreText(summary)).toBe('3,6')
    expect(disagreementsText(summary, R)).toBe('2 : calme, on s’y voit')
    expect(compareCell(summary, 'quiet')).toBe('4 / 2')
    expect(compareCell(summary, 'street')).toBe('4 / —')
    expect(compareCell(null, 'quiet')).toBe('—')

    // À l'aveugle, pour Richard qui n'a pas noté.
    const [, chloe] = mockupOpinions()
    const blind = fakeOpinionSummary([chloe as never]).summary
    expect(memberCell(blind, C)).toBe('masqué')
    expect(memberCell(blind, R)).toBe('—')
    expect(memberSortValue(blind, C)).toBe(Number.NEGATIVE_INFINITY)
    expect(commonScoreText(blind)).toBe('en attente')
    expect(disagreementsText(blind, R)).toBe('à toi de noter')
    expect(disagreementsText(blind, null)).toBe('en attente de Richard, Chloé')
    expect(compareCell(blind, 'quiet')).toBe('— / masqué')

    // Chloé n'a pas encore noté ; personne n'a noté.
    const [richard] = mockupOpinions()
    const waiting = fakeOpinionSummary([richard as never]).summary
    expect(disagreementsText(waiting, R)).toBe('en attente de Chloé')
    const empty = fakeOpinionSummary([]).summary
    expect(commonScoreText(empty)).toBe('—')
    expect(disagreementsText(empty, R)).toBe('—')
    expect(commonScoreText(null)).toBe('—')
    expect(disagreementsText(null, R)).toBe('—')
    const agree = fakeOpinionSummary([
      fakeOpinion({ memberId: R, scores: fakeScores({ quiet: 4 }) }),
      fakeOpinion({
        id: 'dddddddd-dddd-4ddd-8ddd-000000000009',
        memberId: C,
        rating: 0,
        scores: fakeScores({ quiet: 4 }),
      }),
    ]).summary
    expect(disagreementsText(agree, R)).toBe('aucun')
    expect(memberCell(agree, C)).toBe('sans note · 4,0')
    expect(memberCell(null, R)).toBe('—')
  })

  it('une tâche ouverte porte déjà le libellé de la contre-visite', () => {
    const label = 'À revoir à la contre-visite : le calme'
    expect(hasOpenTask([{ label, done: false }], label)).toBe(true)
    expect(hasOpenTask([{ label, done: true }], label)).toBe(false)
    expect(hasOpenTask([], label)).toBe(false)
  })
})

describe('lot 20 : le brouillon de « Mon avis »', () => {
  it('relu depuis mon avis, une entrée par critère affiché', () => {
    const [richard] = mockupOpinions()
    const draft = opinionDraft(richard ?? null, KEYS)
    expect(draft.rating).toBe(4)
    expect(draft.scores.quiet).toEqual({
      score: 4,
      word: 'fenêtres fermées, ça va',
    })
    expect(Object.keys(draft.scores)).toEqual(KEYS)
    const blank = opinionDraft(null, ['quiet'])
    expect(blank).toEqual({
      rating: 0,
      text: '',
      scores: { quiet: { score: null, word: '' } },
    })
  })

  it('ne part que ce qui change ; null efface ; garde-fou', () => {
    const [richard] = mockupOpinions()
    const pristine = opinionDraft(richard ?? null, KEYS)
    const draft = opinionDraft(richard ?? null, KEYS)
    expect(isOpinionDraftDirty(draft, pristine)).toBe(false)
    expect(opinionPayload(draft, pristine, '2026-11-03T10:00:00.000Z')).toEqual(
      {
        rating: 4,
        text: 'Lumineux, balcon agréable ; cuisine à refaire.',
        scores: {},
        expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
      }
    )
    draft.scores.condition = { score: 2, word: '' }
    draft.scores.quiet = { score: null, word: '' }
    draft.scores.feel = { score: 4, word: '  coup de cœur ' }
    draft.text = '  Revu  '
    expect(isOpinionDraftDirty(draft, pristine)).toBe(true)
    expect(opinionPayload(draft, pristine, null)).toEqual({
      rating: 4,
      text: 'Revu',
      scores: {
        condition: { score: 2, word: null },
        quiet: null,
        feel: { score: 4, word: 'coup de cœur' },
      },
      expectedUpdatedAt: null,
    })
    const wordOnly = opinionDraft(null, ['quiet'])
    const withWord = opinionDraft(null, ['quiet'])
    withWord.scores.quiet = { score: null, word: 'à revoir' }
    expect(opinionPayload(withWord, wordOnly, null).scores).toEqual({
      quiet: { score: null, word: 'à revoir' },
    })
    const rated = opinionDraft(null, ['quiet'])
    rated.rating = 3
    expect(isOpinionDraftDirty(rated, wordOnly)).toBe(true)
    const texted = opinionDraft(null, ['quiet'])
    texted.text = 'x'
    expect(isOpinionDraftDirty(texted, wordOnly)).toBe(true)
    const extra = opinionDraft(null, ['quiet'])
    extra.scores.other = { score: 3, word: '' }
    expect(isOpinionDraftDirty(extra, wordOnly)).toBe(true)
    expect(opinionPayload(extra, wordOnly, null).scores).toEqual({
      other: { score: 3, word: null },
    })
  })

  it('la moyenne en direct, à titre indicatif', () => {
    const draft = opinionDraft(null, ['quiet', 'feel', 'layout'])
    expect(draftAverage(draft)).toEqual({ average: null, count: 0, total: 3 })
    draft.scores.quiet = { score: 4, word: '' }
    draft.scores.feel = { score: 3, word: '' }
    expect(draftAverage(draft)).toEqual({ average: 3.5, count: 2, total: 3 })
  })
})
