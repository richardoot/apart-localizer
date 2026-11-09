/**
 * Lot 20 au connecteur : la ligne courte des avis (liste, comparaison), le
 * détail de get_listing (avis masqué : qui et combien seulement), « est-ce
 * le membre connecté ? », et l'avis lu depuis la base (première note
 * dérivée pour une ligne d'avant le lot 20). Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { EvaluatedListingSchema } from '@apart/contracts'
import { confrontOpinions, defaultOpinionCriteria } from '@apart/domain'
import type { OpinionLike } from '@apart/domain'
import { toOpinionDto } from '../opinions/opinion-context'
import {
  describeOpinions,
  describeOpinionsShort,
  isConnectedMember,
} from './mcp-opinions'

const R = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'
const L = '33333333-3333-4333-8333-333333333333'
const AT = '2026-11-15T20:00:00.000Z'
const members = [
  { id: R, displayName: 'Richard' },
  { id: C, displayName: 'Chloé' },
]

const opinion = (
  memberId: string,
  rating: number,
  scores: Record<string, [number, string?]>,
  extra: Partial<OpinionLike> = {}
): OpinionLike => ({
  memberId,
  rating,
  text: '',
  scores: Object.entries(scores).map(([key, [score, word]]) => ({
    key,
    score,
    word: word ?? null,
  })),
  updatedAt: AT,
  ...extra,
})

function summary(visible: OpinionLike[], masked: OpinionLike[] = []) {
  return confrontOpinions({
    criteria: defaultOpinionCriteria(),
    members,
    visible,
    masked,
    blind: true,
    revealed: false,
    viewerRated: visible.some(o => o.memberId === R),
  })
}

describe('describeOpinionsShort', () => {
  it('rien quand personne n’a noté ; la note commune et les désaccords sinon', () => {
    expect(describeOpinionsShort(null)).toBeNull()
    expect(describeOpinionsShort(summary([]))).toBeNull()
    expect(
      describeOpinionsShort(
        summary([
          opinion(R, 4, { quiet: [4], feel: [4] }),
          opinion(C, 3, { quiet: [2], feel: [2] }),
        ])
      )
    ).toBe('avis : note commune 3,0, 2 désaccords (calme, on s’y voit)')
    expect(
      describeOpinionsShort(
        summary([opinion(R, 4, { quiet: [4] }), opinion(C, 4, { quiet: [3] })])
      )
    ).toBe('avis : note commune 3,5')
    expect(
      describeOpinionsShort(summary([], [opinion(C, 3, { quiet: [2] })]))
    ).toBe('avis : en attente de Richard et Chloé (masqué)')
    expect(
      describeOpinionsShort(
        summary([opinion(R, 4, {}), opinion(C, 3, { quiet: [2] })])
      )
    ).toBe('avis : aucun critère noté par tous')
  })
})

describe('describeOpinions', () => {
  const item = (opinionSummary: ReturnType<typeof summary> | null) =>
    ({
      opinions: [
        {
          memberId: R,
          text: 'Lumineux',
        },
      ],
      opinionSummary,
    }) as unknown as Parameters<typeof describeOpinions>[0]

  it('à l’aveugle : qui a noté, combien, après la visite ; jamais les notes', () => {
    const text = describeOpinions(
      item(
        summary(
          [],
          [
            opinion(
              C,
              3,
              { quiet: [2, 'bus devant la chambre'] },
              {
                afterVisit: {
                  visitId: L,
                  visitedAt: '2026-11-14T10:00:00.000Z',
                },
              }
            ),
          ]
        )
      )
    )
    expect(text).toContain(
      "  - Chloé : a noté 1 critère sur 8, après la visite du 14 novembre 2026 — masqué tant que le membre connecté n'a pas noté"
    )
    expect(text).toContain('  - Richard : pas encore noté')
    expect(text).toContain('Note commune : en attente')
    expect(text).not.toContain('bus devant')
  })

  it('les avis visibles : note, moyenne, phrase, « après avoir vu », détail par critère', () => {
    const text = describeOpinions(
      item(
        confrontOpinions({
          criteria: defaultOpinionCriteria(),
          members,
          visible: [
            opinion(
              R,
              4,
              { quiet: [4, 'fenêtres fermées'], layout: [4] },
              {
                seenBefore: [C],
              }
            ),
            opinion(C, 0, { quiet: [2], layout: [3], street: [4] }),
          ],
          masked: [],
          blind: true,
          revealed: true,
          viewerRated: true,
        })
      )
    )
    expect(text).toContain(
      '  - Richard : 4/5, critères 4,0 en moyenne (2 sur 8), après avoir vu celui de Chloé — « Lumineux »'
    )
    expect(text).toContain(
      '  - Chloé : sans note globale, critères 3,0 en moyenne (3 sur 8)'
    )
    expect(text).toContain(
      '  - Calme : Richard 4 « fenêtres fermées », Chloé 2 — désaccord de 2 points'
    )
    expect(text).toContain(
      '  - Agencement : Richard 4, Chloé 3 — 1 point d’écart'
    )
    expect(text).toContain('  - Rue et ambiance : Richard —, Chloé 4')
    expect(text).toContain('Note commune : 3,3 / 5')
    const agreed = describeOpinions(
      item(
        summary([opinion(R, 4, { quiet: [4] }), opinion(C, 4, { quiet: [4] })])
      )
    )
    expect(agreed).toContain('  - Calme : Richard 4, Chloé 4 — d’accord')
    const none = describeOpinions(
      item(summary([opinion(R, 4, {}), opinion(C, 4, { quiet: [3] })]))
    )
    expect(none).not.toContain('Note commune')
    expect(describeOpinions(item(null))).toBe('Avis : non disponibles.')
  })
})

describe('isConnectedMember', () => {
  const me = { handle: 'chloe', displayName: 'Chloé' }
  it('le membre connecté par son identifiant, son prénom, « moi » ; personne d’autre', () => {
    expect(isConnectedMember(me, 'chloe')).toBe(true)
    expect(isConnectedMember(me, ' CHLOE ')).toBe(true)
    expect(isConnectedMember(me, 'Chloé')).toBe(true)
    expect(isConnectedMember(me, 'moi')).toBe(true)
    expect(isConnectedMember(me, 'richard')).toBe(false)
  })
})

describe('toOpinionDto', () => {
  const row = {
    id: L,
    listingId: R,
    memberId: C,
    rating: 4,
    text: 'Bien',
    createdAt: new Date('2026-11-01T09:00:00.000Z'),
    updatedAt: new Date('2026-11-02T09:00:00.000Z'),
    ratedAt: null,
    seenMemberIds: [],
    scores: [
      {
        id: L,
        opinionId: L,
        criterionKey: 'quiet',
        score: 2,
        word: null,
        createdAt: new Date(AT),
        updatedAt: new Date(AT),
      },
      {
        id: R,
        opinionId: L,
        criterionKey: 'street',
        score: 4,
        word: 'animée',
        createdAt: new Date(AT),
        updatedAt: new Date(AT),
      },
    ],
  }

  it('une ligne d’avant le lot 20 : première note à la création, si notée', () => {
    const dto = toOpinionDto(row, { visibleKeys: new Set(['quiet']) })
    expect(dto.ratedAt).toBe('2026-11-01T09:00:00.000Z')
    expect(dto.scores.map(s => s.key)).toEqual(['quiet'])
    expect(dto.afterVisit).toBeNull()
    expect(
      toOpinionDto({ ...row, rating: 0 }, { visibleKeys: null }).ratedAt
    ).toBeNull()
    // L'export : toutes les notes, masquées comprises.
    expect(
      toOpinionDto(row, { visibleKeys: null }).scores.map(s => s.key)
    ).toEqual(['quiet', 'street'])
    expect(
      toOpinionDto(row, {
        visibleKeys: null,
        visits: [
          {
            id: R,
            visitedAt: '2026-11-01T18:00:00.000Z',
            status: 'done',
            participantIds: [C],
          },
        ],
      }).afterVisit
    ).toEqual({ visitId: R, visitedAt: '2026-11-01T18:00:00.000Z' })
    expect(EvaluatedListingSchema.shape.opinions.parse(undefined)).toEqual([])
  })
})
