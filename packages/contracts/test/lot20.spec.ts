/**
 * Lot 20, nos avis critère par critère : les huit critères par défaut, les
 * bornes (1 à 5, mot court, dix critères), les clés inconnues ou mal formées
 * refusées, la fusion par clé, les réglages, l'entrée MCP, les filtres et
 * tris de la liste, l'export, les notifications et le journal.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_OPINION_CRITERIA,
  EvaluatedListingSchema,
  ExportDocumentSchema,
  ListingFiltersSchema,
  ListingListQuerySchema,
  ListingSortSchema,
  McpAddOpinionInputSchema,
  NOTIFICATION_TYPE_LABELS,
  NotificationTypeSchema,
  OPINIONS_FILTER_LABELS,
  OPINION_CRITERIA_MAX,
  OPINION_SCORE_LABELS,
  OPINION_WORD_MAX,
  OpinionCriteriaOrderSchema,
  OpinionCriterionCreateSchema,
  OpinionCriterionKeySchema,
  OpinionCriterionUpdateSchema,
  OpinionInputSchema,
  OpinionSchema,
  OpinionScoresInputSchema,
  OpinionSettingsUpdateSchema,
  OpinionSummarySchema,
  TASK_DETAILS_MAX,
  TaskInputSchema,
  TaskOriginSchema,
  activityKindOf,
  listingFiltersFromQuery,
  listingFiltersToQuery,
  resolveNotificationPreferences,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const AT = '2026-11-15T20:00:00.000Z'

describe('critères des avis', () => {
  it('huit critères par défaut, clés stables et valides, libellés en français', () => {
    expect(DEFAULT_OPINION_CRITERIA.map(c => c.key)).toEqual([
      'luminosity',
      'layout',
      'condition',
      'quiet',
      'outdoor',
      'building',
      'street',
      'feel',
    ])
    expect(DEFAULT_OPINION_CRITERIA.map(c => c.label)).toEqual([
      'Luminosité',
      'Agencement',
      'État',
      'Calme',
      'Extérieur et vue',
      'Immeuble',
      'Rue et ambiance',
      'On s’y voit',
    ])
    for (const c of DEFAULT_OPINION_CRITERIA) {
      expect(OpinionCriterionKeySchema.parse(c.key)).toBe(c.key)
      expect(c.hint.length).toBeGreaterThan(0)
    }
    expect(OPINION_CRITERIA_MAX).toBe(10)
    expect(OPINION_SCORE_LABELS).toEqual({
      1: 'rédhibitoire',
      2: 'bof',
      3: 'correct',
      4: 'bien',
      5: 'excellent',
    })
  })

  it('une clé mal formée est refusée', () => {
    for (const bad of [
      'Quiet',
      '1quiet',
      'q',
      'quiet-room',
      'a'.repeat(41),
      '',
    ]) {
      expect(OpinionCriterionKeySchema.safeParse(bad).success).toBe(false)
    }
    expect(OpinionCriterionKeySchema.parse('custom_cuisine_2')).toBe(
      'custom_cuisine_2'
    )
  })

  it('réglages : ajout, modification, ordre, aveugle ; clés inconnues refusées', () => {
    expect(OpinionCriterionCreateSchema.parse({ label: ' Cuisine ' })).toEqual({
      label: 'Cuisine',
      hint: '',
    })
    expect(OpinionCriterionCreateSchema.safeParse({ label: ' ' }).success).toBe(
      false
    )
    expect(
      OpinionCriterionCreateSchema.safeParse({ label: 'x'.repeat(41) }).success
    ).toBe(false)
    expect(
      OpinionCriterionCreateSchema.safeParse({ label: 'Cuisine', key: 'x' })
        .success
    ).toBe(false)
    expect(OpinionCriterionUpdateSchema.parse({ hidden: true })).toEqual({
      hidden: true,
    })
    expect(OpinionCriterionUpdateSchema.safeParse({}).success).toBe(false)
    expect(
      OpinionCriterionUpdateSchema.safeParse({ label: 'Calme', origin: 'x' })
        .success
    ).toBe(false)
    expect(OpinionCriteriaOrderSchema.safeParse({ keys: [] }).success).toBe(
      false
    )
    expect(
      OpinionCriteriaOrderSchema.safeParse({
        keys: Array.from({ length: 11 }, (_, i) => `k${i}x`),
      }).success
    ).toBe(false)
    expect(OpinionSettingsUpdateSchema.parse({ blind: false })).toEqual({
      blind: false,
    })
    expect(
      OpinionSettingsUpdateSchema.safeParse({ blind: true, other: 1 }).success
    ).toBe(false)
  })
})

describe('notes par critère', () => {
  it('de 1 à 5, null = pas d’avis, mot court ; entrée null = effacer', () => {
    const parsed = OpinionScoresInputSchema.parse({
      quiet: { score: 2, word: '  bus devant la chambre  ' },
      layout: { score: null },
      feel: null,
      street: { score: 4, word: '' },
    })
    expect(parsed).toEqual({
      quiet: { score: 2, word: 'bus devant la chambre' },
      layout: { score: null },
      feel: null,
      street: { score: 4, word: null },
    })
    for (const bad of [
      { quiet: { score: 0 } },
      { quiet: { score: 6 } },
      { quiet: { score: 2.5 } },
      { quiet: { score: 3, word: 'x'.repeat(OPINION_WORD_MAX + 1) } },
      { quiet: { score: 3, extra: true } },
      { quiet: { word: 'sans note' } },
      { Quiet: { score: 3 } },
      Object.fromEntries(
        Array.from({ length: 11 }, (_, i) => [`k${i}x`, { score: 3 }])
      ),
    ]) {
      expect(OpinionScoresInputSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('mon avis : note globale et phrase comme avant, notes fusionnées, garde-fou', () => {
    expect(OpinionInputSchema.parse({ rating: 4 })).toEqual({
      rating: 4,
      text: '',
      scores: {},
    })
    expect(
      OpinionInputSchema.parse({
        rating: 0,
        text: 'Lumineux',
        scores: { quiet: { score: 4 } },
        expectedUpdatedAt: null,
      }).expectedUpdatedAt
    ).toBeNull()
    expect(OpinionInputSchema.safeParse({ rating: 7 }).success).toBe(false)
    expect(OpinionInputSchema.safeParse({ text: 'sans note' }).success).toBe(
      false
    )
    expect(
      OpinionInputSchema.safeParse({ rating: 3, expectedUpdatedAt: 'hier' })
        .success
    ).toBe(false)
  })

  it('un avis lu : notes, première note, après visite, vu avant de noter', () => {
    const legacy = OpinionSchema.parse({
      id: ID,
      listingId: ID,
      memberId: ID,
      rating: 4,
      text: 'Bien',
      createdAt: AT,
      updatedAt: AT,
    })
    expect(legacy).toMatchObject({
      scores: [],
      ratedAt: null,
      afterVisit: null,
      seenBefore: [],
    })
    expect(
      OpinionSchema.parse({
        ...legacy,
        scores: [{ key: 'quiet', score: 2, word: null, updatedAt: AT }],
        afterVisit: { visitId: ID, visitedAt: AT },
      }).scores
    ).toHaveLength(1)
    // Une annonce lue avant le lot 20 : pas de confrontation.
    expect(
      EvaluatedListingSchema.shape.opinionSummary.parse(undefined)
    ).toBeNull()
  })

  it('la confrontation : statuts, désaccords, jamais une note masquée', () => {
    const summary = OpinionSummarySchema.parse({
      blind: true,
      masked: true,
      revealed: false,
      viewerRated: false,
      members: [
        {
          memberId: ID,
          displayName: 'Chloé',
          state: 'masked',
          rating: null,
          average: null,
          ratedCount: 7,
          criteriaCount: 8,
          afterVisit: null,
          seenBefore: [],
          updatedAt: AT,
        },
      ],
      rows: [],
      agreements: 0,
      disagreementKeys: [],
      maxGap: null,
      commonScore: null,
      status: 'pending',
      pendingMemberIds: [ID],
      sentence: 'L’avis de Chloé reste masqué tant que tu n’as pas noté.',
    })
    expect(summary.members[0]?.state).toBe('masked')
    expect(OpinionSummarySchema.shape.status.safeParse('waiting').success).toBe(
      false
    )
  })
})

describe('tâche proposée, MCP, liste, export, notifications, journal', () => {
  it('une tâche porte un contexte facultatif et peut venir des avis', () => {
    expect(TaskOriginSchema.options).toContain('opinion')
    expect(
      TaskInputSchema.parse({
        label: 'À revoir à la contre-visite : le calme',
        origin: 'opinion',
        details: ' Vos notes s’écartent de 2 points. ',
      }).details
    ).toBe('Vos notes s’écartent de 2 points.')
    expect(TaskInputSchema.parse({ label: 'Appeler' }).details).toBeNull()
    expect(
      TaskInputSchema.safeParse({
        label: 'x',
        details: 'x'.repeat(TASK_DETAILS_MAX + 1),
      }).success
    ).toBe(false)
  })

  it('add_opinion : critères par clé ou libellé, tout facultatif, pour qui', () => {
    const input = McpAddOpinionInputSchema.parse({
      listingId: ID,
      criteria: [
        { criterion: 'Calme', score: 2, word: 'bus' },
        { criterion: 'luminosity', score: null },
      ],
      member: 'chloe',
    })
    expect(input.rating).toBeUndefined()
    expect(input.text).toBeUndefined()
    expect(input.criteria?.[1]).toEqual({
      criterion: 'luminosity',
      score: null,
    })
    expect(
      McpAddOpinionInputSchema.parse({ listingId: ID, rating: 4 })
    ).toEqual({ listingId: ID, rating: 4 })
    for (const bad of [
      { listingId: ID, criteria: [{ criterion: 'Calme', score: 9 }] },
      { listingId: ID, criteria: [{ criterion: '', score: 3 }] },
      { listingId: ID, criteria: [{ criterion: 'Calme', score: 3, note: 1 }] },
      {
        listingId: ID,
        criteria: Array.from({ length: 11 }, () => ({
          criterion: 'Calme',
          score: 3,
        })),
      },
      { listingId: ID, rating: 6 },
    ]) {
      expect(McpAddOpinionInputSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('filtres « À rediscuter », « Avis en attente » et tris dans l’URL', () => {
    expect(ListingSortSchema.options).toEqual(
      expect.arrayContaining(['commonScore', 'disagreement'])
    )
    expect(OPINIONS_FILTER_LABELS).toEqual({
      to_discuss: 'À rediscuter',
      pending: 'Avis en attente',
    })
    const filters = listingFiltersFromQuery(
      ListingListQuerySchema.parse({
        opinions: 'to_discuss',
        sort: 'disagreement',
      })
    )
    expect(filters.opinions).toBe('to_discuss')
    expect(filters.sort).toBe('disagreement')
    expect(listingFiltersToQuery(filters)).toMatchObject({
      opinions: 'to_discuss',
      sort: 'disagreement',
    })
    expect(
      listingFiltersToQuery(ListingFiltersSchema.parse({}))
    ).not.toHaveProperty('opinions')
    expect(
      ListingListQuerySchema.safeParse({ opinions: 'disputes' }).success
    ).toBe(false)
  })

  it('export : critères de l’espace et réglage aveugle, absents d’un export antérieur', () => {
    const shape = ExportDocumentSchema.shape
    expect(shape.opinionCriteria.parse(undefined)).toEqual([])
    expect(shape.opinionSettings.parse(undefined)).toEqual({ blind: true })
    expect(
      shape.listings.element.shape.opinionSummary.parse(undefined)
    ).toBeNull()
  })

  it('notification « avis d’un autre membre », réglable comme les autres', () => {
    expect(NotificationTypeSchema.options).toContain('opinion_added')
    expect(NOTIFICATION_TYPE_LABELS.opinion_added).toBe(
      'Avis d’un autre membre'
    )
    expect(DEFAULT_NOTIFICATION_PREFERENCES.opinion_added).toEqual({
      in_app: true,
      push: true,
      email: false,
    })
    expect(
      resolveNotificationPreferences({ opinion_added: { push: false } })
        .opinion_added
    ).toEqual({ in_app: true, push: false, email: false })
  })

  it('le journal : avis et réglages des critères sont des « Avis »', () => {
    expect(activityKindOf('opinion.created')).toBe('opinion')
    expect(activityKindOf('opinion.revealed')).toBe('opinion')
    expect(activityKindOf('opinion_settings.criterion_added')).toBe('opinion')
  })
})
