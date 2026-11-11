import { describe, expect, it } from 'vitest'
import {
  VISIT_EDIT_REFUSAL,
  agendaActionLabel,
  appendVisitRemark,
  canEditVisit,
  describeActivity,
  visitDayLabel,
  visitEditRefusal,
  visitModeVisit,
  visitPoints,
  visitPointsProgress,
  visitRemarkLine,
  workflowOverview,
} from '../src/index.js'
import type {
  VisitPointTaskLike,
  WorkflowListingFact,
  WorkflowVisitFact,
} from '../src/index.js'

/** Mardi 10 novembre 2026, 16 h à Paris. */
const NOW = new Date('2026-11-10T15:00:00.000Z')
const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SAM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const task = (over: Partial<VisitPointTaskLike>): VisitPointTaskLike => ({
  id: 't',
  label: 'Une tâche',
  field: null,
  done: false,
  position: 0,
  origin: 'default',
  ...over,
})

describe('Lot 24 : les points à vérifier pendant la visite', () => {
  const tasks = [
    task({ id: 'ask', label: 'Demander la taxe foncière', position: 0 }),
    task({
      id: 'field',
      label: 'Vérifier les charges',
      field: 'annualCharges',
      position: 1,
    }),
    task({
      id: 'works',
      label: 'Évaluer l’ampleur réelle des travaux',
      position: 2,
    }),
    task({
      id: 'transit',
      label: '  vérifier la desserte (tram)',
      position: 3,
    }),
    task({
      id: 'done',
      label: 'Vérifier le loyer de marché',
      position: 4,
      done: true,
    }),
    task({ id: 'other', label: 'Fixer le loyer visé', position: 5 }),
    task({
      id: 'quiet',
      label: 'À revoir à la contre-visite : le calme',
      origin: 'opinion',
      position: 9,
    }),
    task({
      id: 'prep',
      label: 'Préparer la visite',
      origin: 'visit',
      position: 6,
    }),
  ]

  it('contre-visite d’abord, puis « Vérifier … » et « Évaluer … », jamais une question à l’annonceur', () => {
    expect(visitPoints(tasks)).toEqual([
      {
        id: 'quiet',
        label: 'À revoir à la contre-visite : le calme',
        done: false,
        kind: 'counter_visit',
      },
      {
        id: 'works',
        label: 'Évaluer l’ampleur réelle des travaux',
        done: false,
        kind: 'check',
      },
      {
        id: 'transit',
        label: '  vérifier la desserte (tram)',
        done: false,
        kind: 'check',
      },
      {
        id: 'done',
        label: 'Vérifier le loyer de marché',
        done: true,
        kind: 'check',
      },
    ])
  })

  it('rien d’inventé sans tâche de ce genre ; la progression', () => {
    expect(visitPoints([tasks[0] as VisitPointTaskLike])).toEqual([])
    expect(visitPointsProgress(visitPoints(tasks))).toEqual({
      done: 1,
      total: 4,
    })
    expect(visitPointsProgress([])).toEqual({ done: 0, total: 0 })
  })

  it('deux points du même genre gardent l’ordre de la liste', () => {
    const points = visitPoints([
      task({
        id: 'b',
        label: 'À revoir : rue',
        origin: 'opinion',
        position: 4,
      }),
      task({
        id: 'a',
        label: 'À revoir : calme',
        origin: 'opinion',
        position: 1,
      }),
    ])
    expect(points.map(p => p.id)).toEqual(['a', 'b'])
  })
})

describe('Lot 24 : la visite que l’écran ouvre', () => {
  const v = (id: string, status: 'planned' | 'done', visitedAt: string) => ({
    id,
    status,
    visitedAt,
  })

  it('la visite planifiée d’aujourd’hui, la plus proche de maintenant', () => {
    expect(
      visitModeVisit(
        [
          v('morning', 'planned', '2026-11-10T07:00:00.000Z'),
          v('evening', 'planned', '2026-11-10T17:30:00.000Z'),
          v('done', 'done', '2026-11-10T14:00:00.000Z'),
        ],
        NOW
      )?.id
    ).toBe('evening')
  })

  it('sinon la visite faite aujourd’hui, puis la dernière planifiée passée, puis la prochaine', () => {
    expect(
      visitModeVisit(
        [
          v('done', 'done', '2026-11-10T09:00:00.000Z'),
          v('old', 'planned', '2026-11-08T09:00:00.000Z'),
        ],
        NOW
      )?.id
    ).toBe('done')
    expect(
      visitModeVisit(
        [
          v('older', 'planned', '2026-11-01T09:00:00.000Z'),
          v('old', 'planned', '2026-11-08T09:00:00.000Z'),
          v('next', 'planned', '2026-11-12T09:00:00.000Z'),
          v('past', 'done', '2026-11-02T09:00:00.000Z'),
        ],
        NOW
      )?.id
    ).toBe('old')
    expect(
      visitModeVisit(
        [
          v('later', 'planned', '2026-11-20T09:00:00.000Z'),
          v('next', 'planned', '2026-11-12T09:00:00.000Z'),
          v('bad', 'planned', 'pas une date'),
        ],
        NOW
      )?.id
    ).toBe('next')
    expect(
      visitModeVisit([v('past', 'done', '2026-11-02T09:00:00.000Z')], NOW)
    ).toBeNull()
    expect(visitModeVisit([], NOW)).toBeNull()
  })

  it('le jour de la visite en mots', () => {
    expect(visitDayLabel('2026-11-10T17:30:00.000Z', NOW)).toBe(
      'aujourd’hui, 18 h 30'
    )
    expect(visitDayLabel('2026-11-09T11:30:00.000Z', NOW)).toBe('hier, 12 h 30')
    expect(visitDayLabel('2026-11-11T08:00:00.000Z', NOW)).toBe('demain, 9 h')
    expect(visitDayLabel('2026-11-12T17:30:00.000Z', NOW)).toBe(
      'jeudi 12 novembre, 18 h 30'
    )
  })
})

describe('Lot 24 : qui corrige une visite', () => {
  const done = {
    status: 'done' as const,
    createdById: RICHARD,
    participantIds: [CHLOE],
  }

  it('l’auteur et les participants d’une visite faite, personne d’autre', () => {
    expect(canEditVisit(done, RICHARD)).toBe(true)
    expect(canEditVisit(done, CHLOE)).toBe(true)
    expect(canEditVisit(done, SAM)).toBe(false)
    expect(visitEditRefusal(done, SAM)).toBe(VISIT_EDIT_REFUSAL)
    expect(visitEditRefusal(done, CHLOE)).toBeNull()
  })

  it('une visite planifiée par tout membre ; une visite sans auteur aussi', () => {
    expect(canEditVisit({ ...done, status: 'planned' }, SAM)).toBe(true)
    expect(
      canEditVisit({ ...done, createdById: null, participantIds: [] }, SAM)
    ).toBe(true)
  })
})

describe('Lot 24 : la remarque rapide', () => {
  it('une ligne horodatée à l’heure de Paris', () => {
    expect(
      visitRemarkLine(
        '  fenêtres   en simple vitrage ',
        '2026-11-10T17:42:10.000Z'
      )
    ).toBe('18 h 42 : fenêtres en simple vitrage')
    expect(visitRemarkLine('cave', '2026-11-10T08:05:00.000Z')).toBe(
      '9 h 05 : cave'
    )
  })

  it('ajoutée à la fin du compte rendu, jamais doublée', () => {
    expect(appendVisitRemark(null, '18 h 42 : cave')).toBe('18 h 42 : cave')
    expect(appendVisitRemark('', '18 h 42 : cave')).toBe('18 h 42 : cave')
    expect(appendVisitRemark('Lumineux.\n', '18 h 42 : cave')).toBe(
      'Lumineux.\n18 h 42 : cave'
    )
    expect(
      appendVisitRemark('Lumineux.\n18 h 42 : cave', '18 h 42 : cave')
    ).toBe('Lumineux.\n18 h 42 : cave')
  })

  it('le journal lit la remarque en entier', () => {
    const at = '2026-11-10T17:45:00.000Z'
    const members = new Map([[CHLOE, { id: CHLOE, displayName: 'Chloé' }]])
    const event = (after: Record<string, unknown>) =>
      describeActivity(
        {
          action: 'visit.updated',
          actorMemberId: CHLOE,
          channel: 'web',
          before: { visitId: 'v', rating: 0, report: null },
          after,
          createdAt: at,
        } as never,
        members as never
      )
    expect(event({ visitId: 'v', remark: '18 h 42 : cave' }).summary).toContain(
      'a ajouté une remarque à une visite : « 18 h 42 : cave »'
    )
    const both = event({ visitId: 'v', rating: 4, remark: '18 h 42 : cave' })
    expect(both.summary).toContain(
      'a modifié une visite et ajouté une remarque : « 18 h 42 : cave »'
    )
    expect(both.changes.map(c => c.field)).toEqual(['rating'])
    expect(event({ visitId: 'v', rating: 3 }).summary).toContain(
      'a modifié une visite'
    )
  })
})

describe('Lot 24 : « visite aujourd’hui » sur l’accueil', () => {
  const listing = (id: string): WorkflowListingFact => ({
    id,
    status: 'to_visit',
    fit: { level: 'in', kept: null },
    plannedVisits: 1,
    viewerRated: false,
    lastOffer: null,
    decision: null,
  })
  const overview = (plannedVisits: WorkflowVisitFact[]) =>
    workflowOverview({
      viewerId: RICHARD,
      decideTogether: true,
      activeMembers: [
        { id: RICHARD, displayName: 'Richard' },
        { id: CHLOE, displayName: 'Chloé' },
      ],
      listings: [listing('a'), listing('b')],
      drafts: [],
      proposals: [],
      now: NOW,
      plannedVisits,
    })

  it('une ligne à part, qui ouvre le mode visite de l’annonce', () => {
    const o = overview([
      { listingId: 'a', visitedAt: '2026-11-10T17:30:00.000Z' },
      { listingId: 'b', visitedAt: '2026-11-12T17:30:00.000Z' },
    ])
    expect(o.agenda.find(i => i.key === 'visit_today')).toEqual({
      key: 'visit_today',
      count: 1,
      label: 'visite aujourd’hui',
      stage: 'a-visiter',
      detail: 'à 18 h 30',
      listingId: 'a',
    })
    expect(o.agenda.find(i => i.key === 'upcoming_visits')).toMatchObject({
      count: 1,
      label: 'visite à venir',
      listingId: 'b',
    })
    expect(o.agenda.map(i => i.key).slice(0, 2)).toEqual([
      'visit_today',
      'upcoming_visits',
    ])
    expect(agendaActionLabel('visit_today')).toBe('Mode visite')
  })

  it('deux visites aujourd’hui : la première en précision, sans annonce unique', () => {
    const o = overview([
      { listingId: 'b', visitedAt: '2026-11-10T17:30:00.000Z' },
      { listingId: 'a', visitedAt: '2026-11-10T07:00:00.000Z' },
    ])
    expect(o.agenda.find(i => i.key === 'visit_today')).toMatchObject({
      count: 2,
      label: 'visites aujourd’hui',
      detail: 'première à 8 h',
      listingId: null,
    })
    expect(o.agenda.some(i => i.key === 'upcoming_visits')).toBe(false)
  })
})
