import { describe, expect, it } from 'vitest'
import {
  VISIT_SESSION_GAP_MS,
  computeWhatsNew,
  currentWhatsNewSince,
  isOwnAppAction,
  listingChangedFields,
  nextVisitWindow,
  notificationRecipients,
  notificationTypeOf,
  notificationsForActivity,
  whatsNewKindOf,
} from '../src/index.js'
import type { NotificationEvent, WhatsNewEvent } from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const L3 = '33333333-3333-4333-8333-333333333333'
const actors = new Map([
  [RICHARD, { id: RICHARD, handle: 'richard', displayName: 'Richard' }],
  [CHLOE, { id: CHLOE, handle: 'chloe', displayName: 'Chloé' }],
])
const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value

let counter = 0
const event = (over: Partial<WhatsNewEvent>): WhatsNewEvent => ({
  id: `e${++counter}`,
  action: 'listing.updated',
  channel: 'web',
  actorMemberId: CHLOE,
  listingId: L1,
  before: null,
  after: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  ...over,
})

describe('whatsNewKindOf', () => {
  it('classe les événements et ignore ce que le membre a fait à l’écran', () => {
    expect(whatsNewKindOf(event({ action: 'listing.created' }), RICHARD)).toBe(
      'new_listing'
    )
    expect(
      whatsNewKindOf(
        event({ action: 'listing.created', actorMemberId: RICHARD }),
        RICHARD
      )
    ).toBeNull()
    expect(
      whatsNewKindOf(
        event({
          action: 'listing.created',
          actorMemberId: RICHARD,
          channel: 'mcp',
        }),
        RICHARD
      )
    ).toBe('new_listing')
    expect(
      whatsNewKindOf(event({ action: 'listing.price_changed' }), RICHARD)
    ).toBe('price_change')
    expect(
      whatsNewKindOf(
        event({ before: { price: 1 }, after: { price: 2 } }),
        RICHARD
      )
    ).toBe('price_change')
    expect(
      whatsNewKindOf(
        event({ before: { price: 1 }, after: { price: 1 } }),
        RICHARD
      )
    ).toBeNull()
    expect(whatsNewKindOf(event({ after: { surface: 3 } }), RICHARD)).toBeNull()
    expect(whatsNewKindOf(event({ after: null }), RICHARD)).toBeNull()
    expect(
      whatsNewKindOf(event({ action: 'listing.status_changed' }), RICHARD)
    ).toBe('status_change')
    expect(whatsNewKindOf(event({ action: 'opinion.updated' }), RICHARD)).toBe(
      'opinion'
    )
    // Son propre avis, même par Claude, n'est pas une nouvelle.
    expect(
      whatsNewKindOf(
        event({
          action: 'opinion.created',
          actorMemberId: RICHARD,
          channel: 'mcp',
        }),
        RICHARD
      )
    ).toBeNull()
    expect(whatsNewKindOf(event({ action: 'task.completed' }), RICHARD)).toBe(
      'task'
    )
    expect(
      whatsNewKindOf(
        event({ action: 'task.created', actorMemberId: null }),
        RICHARD
      )
    ).toBeNull()
    expect(
      whatsNewKindOf(
        event({
          action: 'criteria.matched',
          actorMemberId: null,
          channel: 'system',
        }),
        RICHARD
      )
    ).toBe('criteria_match')
    expect(
      whatsNewKindOf(event({ action: 'visit.created' }), RICHARD)
    ).toBeNull()
    expect(
      isOwnAppAction({ actorMemberId: RICHARD, channel: 'web' }, RICHARD)
    ).toBe(true)
  })
})

describe('computeWhatsNew', () => {
  const since = '2026-11-03T10:00:00.000Z'
  const listings = new Map([
    [L1, { title: 'T2 Talence', seenAt: '2026-11-03T09:00:00.000Z' }],
    [L2, { title: 'T3 Pessac', seenAt: null }],
    [L3, { title: 'T2 Bègles', seenAt: '2026-11-03T13:00:00.000Z' }],
  ])
  const events: WhatsNewEvent[] = [
    // Avant la dernière visite : ignoré.
    event({
      action: 'listing.price_changed',
      createdAt: '2026-11-03T09:30:00.000Z',
      before: { price: 210000 },
      after: { price: 205000 },
    }),
    event({
      action: 'listing.price_changed',
      createdAt: '2026-11-03T11:00:00.000Z',
      before: { price: 205000 },
      after: { price: 199000 },
    }),
    event({
      action: 'listing.status_changed',
      createdAt: '2026-11-03T11:30:00.000Z',
      before: { status: 'to_study' },
      after: { status: 'to_visit' },
    }),
    event({
      action: 'opinion.created',
      createdAt: '2026-11-03T11:40:00.000Z',
      after: { rating: 4, text: 'Lumineux' },
    }),
    event({
      action: 'task.created',
      createdAt: '2026-11-03T11:45:00.000Z',
      after: { label: 'Appeler le syndic' },
    }),
    // Le membre lui-même, à l'écran : ignoré.
    event({
      action: 'listing.status_changed',
      actorMemberId: RICHARD,
      createdAt: '2026-11-03T11:50:00.000Z',
    }),
    // Nouvelle annonce par Claude, puis ses premiers changements (absorbés), puis un critère.
    event({
      listingId: L2,
      action: 'listing.created',
      channel: 'mcp',
      actorMemberId: RICHARD,
      createdAt: '2026-11-03T12:00:00.000Z',
      after: { price: 180000 },
    }),
    event({
      listingId: L2,
      action: 'listing.status_changed',
      createdAt: '2026-11-03T12:05:00.000Z',
      before: { status: 'to_study' },
      after: { status: 'to_visit' },
    }),
    event({
      listingId: L2,
      action: 'criteria.matched',
      channel: 'mcp',
      actorMemberId: RICHARD,
      createdAt: '2026-11-03T12:00:01.000Z',
      after: { criteria: [{ name: 'Campus' }] },
    }),
    // Avant la dernière ouverture de la fiche L3 : ignoré.
    event({
      listingId: L3,
      action: 'listing.status_changed',
      createdAt: '2026-11-03T12:30:00.000Z',
    }),
    // Sans annonce, ou annonce disparue : ignoré.
    event({ listingId: null, action: 'assumptions.updated' }),
    event({
      listingId: '44444444-4444-4444-8444-444444444444',
      action: 'listing.created',
    }),
  ]

  it('compte et décrit les nouveautés, de la plus récente à la plus ancienne', () => {
    const report = computeWhatsNew({
      memberId: RICHARD,
      since,
      sinceSource: 'previous_visit',
      now: '2026-11-03T14:00:00.000Z',
      events,
      listings,
      members: actors,
    })
    expect(report.total).toBe(6)
    expect(report.counts).toEqual({
      new_listing: 1,
      price_change: 1,
      status_change: 1,
      opinion: 1,
      task: 1,
      criteria_match: 1,
    })
    expect(report.items.map(i => i.kind)).toEqual([
      'criteria_match',
      'new_listing',
      'task',
      'opinion',
      'status_change',
      'price_change',
    ])
    const [criteria, created, task, opinion, status, price] = report.items
    expect(criteria?.summary).toBe("L'annonce entre dans le critère « Campus »")
    expect(created?.summary).toBe('Ajoutée par Claude (MCP, pour Richard)')
    expect(task?.summary).toBe('Chloé a ajouté la tâche « Appeler le syndic »')
    expect(opinion?.summary).toBe('Avis de Chloé : 4/5 — Lumineux')
    expect(status?.summary).toBe('Statut : À étudier → À visiter (Chloé)')
    expect(n(price?.summary)).toBe('Prix : 205 000 € → 199 000 € (Chloé)')
    expect(n(price?.before)).toBe('205 000 €')
    expect(price?.actor?.displayName).toBe('Chloé')
    expect(report.listings.map(l => [l.title, l.count, l.kinds])).toEqual([
      ['T3 Pessac', 2, ['criteria_match', 'new_listing']],
      ['T2 Talence', 4, ['task', 'opinion', 'status_change', 'price_change']],
    ])
    expect(report.since).toBe(since)
    expect(report.sinceSource).toBe('previous_visit')
  })

  it('tronque la liste à la limite sans fausser les comptes', () => {
    const report = computeWhatsNew({
      memberId: RICHARD,
      since,
      sinceSource: 'marked_seen',
      now: '2026-11-03T14:00:00.000Z',
      events,
      listings,
      members: actors,
      limit: 2,
    })
    expect(report.items).toHaveLength(2)
    expect(report.total).toBe(6)
  })

  it('vu de Chloé, ses propres actions disparaissent et celles de Claude pour Richard restent', () => {
    const report = computeWhatsNew({
      memberId: CHLOE,
      since,
      sinceSource: 'member_created',
      now: '2026-11-03T14:00:00.000Z',
      events,
      listings: new Map([
        [L2, { title: 'T3 Pessac', seenAt: null }],
        [L1, { title: 'T2 Talence', seenAt: null }],
      ]),
      members: new Map(),
    })
    expect(report.items.map(i => i.kind).sort()).toEqual([
      'criteria_match',
      'new_listing',
      'status_change',
    ])
    expect(
      report.items.find(i => i.kind === 'status_change')?.summary
    ).toContain('Un membre')
  })
})

describe('listingChangedFields', () => {
  it('donne les champs modifiés par d’autres depuis la dernière ouverture', () => {
    const seenAt = '2026-11-03T10:00:00.000Z'
    const fields = listingChangedFields(
      [
        event({
          createdAt: '2026-11-03T09:00:00.000Z',
          after: { notes: 'avant' },
          before: {},
        }),
        event({
          after: { surface: 47, rentalPlan: { targetRent: 750 } },
          before: { surface: 45, rentalPlan: { targetRent: 700 } },
        }),
        event({ action: 'listing.price_changed' }),
        event({ action: 'listing.status_changed' }),
        event({ action: 'listing.geocoded' }),
        event({
          action: 'listing.dpe_verified',
          before: { dpeClass: 'E' },
          after: { dpeClass: 'D' },
        }),
        event({ action: 'task.created' }),
        event({ actorMemberId: RICHARD, after: { title: 'moi' }, before: {} }),
      ],
      RICHARD,
      seenAt
    )
    expect(fields).toEqual([
      'dpeClass',
      'location',
      'price',
      'rentalPlan',
      'rentalPlan.targetRent',
      'status',
      'surface',
    ])
    expect(listingChangedFields([event({})], RICHARD, null)).toEqual([])
  })
})

describe('nextVisitWindow', () => {
  const created = '2026-11-01T08:00:00.000Z'
  it("part de l'arrivée du membre à la toute première visite", () => {
    const window = nextVisitWindow(
      {
        lastVisitAt: null,
        whatsNewSince: null,
        whatsNewSource: null,
        memberCreatedAt: created,
      },
      '2026-11-03T10:00:00.000Z'
    )
    expect(window).toEqual({
      lastVisitAt: '2026-11-03T10:00:00.000Z',
      since: created,
      sinceSource: 'member_created',
      newSession: true,
    })
  })

  it('avance à la fin de la visite précédente après trente minutes sans activité', () => {
    const window = nextVisitWindow(
      {
        lastVisitAt: '2026-11-02T21:00:00.000Z',
        whatsNewSince: '2026-11-02T20:00:00.000Z',
        whatsNewSource: 'previous_visit',
        memberCreatedAt: created,
      },
      '2026-11-03T08:00:00.000Z'
    )
    expect(window.since).toBe('2026-11-02T21:00:00.000Z')
    expect(window.sinceSource).toBe('previous_visit')
    expect(window.newSession).toBe(true)
  })

  it('ne bouge pas pendant une visite ni avant « tout marquer comme vu »', () => {
    const during = nextVisitWindow(
      {
        lastVisitAt: '2026-11-03T08:00:00.000Z',
        whatsNewSince: '2026-11-02T21:00:00.000Z',
        whatsNewSource: 'previous_visit',
        memberCreatedAt: created,
      },
      new Date(
        Date.parse('2026-11-03T08:00:00.000Z') + VISIT_SESSION_GAP_MS - 1
      ).toISOString()
    )
    expect(during.newSession).toBe(false)
    expect(during.since).toBe('2026-11-02T21:00:00.000Z')
    const marked = nextVisitWindow(
      {
        lastVisitAt: '2026-11-03T08:00:00.000Z',
        whatsNewSince: '2026-11-03T09:00:00.000Z',
        whatsNewSource: 'marked_seen',
        memberCreatedAt: created,
      },
      '2026-11-03T18:00:00.000Z'
    )
    expect(marked.since).toBe('2026-11-03T09:00:00.000Z')
    expect(marked.sinceSource).toBe('marked_seen')
    expect(
      currentWhatsNewSince({
        lastVisitAt: null,
        whatsNewSince: '2026-11-03T09:00:00.000Z',
        whatsNewSource: null,
        memberCreatedAt: created,
      }).sinceSource
    ).toBe('previous_visit')
  })
})

describe('notifications', () => {
  const members = [
    { id: RICHARD, displayName: 'Richard' },
    { id: CHLOE, displayName: 'Chloé' },
  ]
  const ev = (over: Partial<NotificationEvent>): NotificationEvent => ({
    action: 'listing.created',
    channel: 'web',
    actorMemberId: CHLOE,
    listingId: L1,
    before: null,
    after: null,
    ...over,
  })

  it("annonce une nouvelle annonce à l'autre membre, et à l'auteur si Claude l'a ajoutée", () => {
    const web = notificationsForActivity(ev({ after: { price: 200000 } }), {
      members,
      listingTitle: 'T2 Talence',
    })
    expect(web).toHaveLength(1)
    expect(web[0]).toMatchObject({
      recipientId: RICHARD,
      type: 'listing_created',
      title: 'Nouvelle annonce : T2 Talence',
      url: `/annonces/${L1}`,
      listingId: L1,
    })
    expect(n(web[0]?.body)).toBe('Ajoutée par Chloé, 200 000 €.')
    const mcp = notificationsForActivity(
      ev({ channel: 'mcp', actorMemberId: RICHARD }),
      { members, listingTitle: null }
    )
    expect(mcp.map(d => d.recipientId)).toEqual([RICHARD, CHLOE])
    expect(mcp[0]?.title).toBe('Nouvelle annonce : une annonce')
    expect(mcp[0]?.body).toBe('Ajoutée par Claude (MCP, pour Richard).')
  })

  it('statut, critère, réponse à une offre, brouillons reçus', () => {
    const status = notificationsForActivity(
      ev({
        action: 'listing.status_changed',
        before: { status: 'to_study' },
        after: { status: 'to_visit' },
      }),
      { members, listingTitle: 'T2' }
    )
    expect(status.map(s => [s.recipientId, s.body])).toEqual([
      [RICHARD, 'Chloé : À étudier → À visiter.'],
    ])
    expect(
      notificationsForActivity(
        ev({ action: 'listing.status_changed', after: { status: 'odd' } }),
        { members, listingTitle: 'T2' }
      )[0]?.body
    ).toBe('Chloé : — → odd.')
    const criteria = notificationsForActivity(
      ev({
        action: 'criteria.matched',
        after: { criteria: [{ name: 'Campus' }, {}] },
      }),
      { members, listingTitle: 'T2' }
    )
    expect(criteria[0]?.body).toBe("L'annonce entre dans « Campus ».")
    expect(
      notificationsForActivity(ev({ action: 'criteria.matched', after: {} }), {
        members,
        listingTitle: 'T2',
      })[0]?.body
    ).toBe("L'annonce entre dans un critère.")
    const offer = notificationsForActivity(
      ev({
        action: 'offer.updated',
        before: { response: 'pending' },
        after: { response: 'counter_offer', counterAmount: 165000 },
      }),
      { members, listingTitle: 'T2' }
    )
    expect(n(offer[0]?.body)).toBe(
      'Contre-proposition à 165 000 € (enregistrée par Chloé).'
    )
    expect(
      notificationsForActivity(
        ev({
          action: 'offer.updated',
          before: { response: 'pending' },
          after: { response: 'accepted' },
        }),
        { members, listingTitle: 'T2' }
      )[0]?.body
    ).toBe('Acceptée (enregistrée par Chloé).')
    const drafts = notificationsForActivity(
      ev({
        action: 'draft.received',
        channel: 'system',
        actorMemberId: null,
        listingId: null,
        after: { created: 2, subject: 'Alerte SeLoger' },
      }),
      { members, listingTitle: null }
    )
    expect(drafts.map(d => d.recipientId)).toEqual([RICHARD, CHLOE])
    expect(drafts[0]).toMatchObject({
      title: '2 annonce(s) reçue(s) par e-mail',
      body: 'À valider : « Alerte SeLoger ».',
      url: '/?brouillons=1',
    })
    expect(
      notificationsForActivity(
        ev({
          action: 'draft.received',
          channel: 'system',
          actorMemberId: null,
          after: {},
        }),
        { members, listingTitle: null }
      )
    ).toEqual([])
  })

  it('une tâche assignée ne notifie que le membre assigné, jamais soi-même', () => {
    const assigned = notificationsForActivity(
      ev({
        action: 'task.created',
        after: { label: 'Appeler', assigneeId: RICHARD },
      }),
      { members, listingTitle: 'T2' }
    )
    expect(assigned).toEqual([
      expect.objectContaining({
        recipientId: RICHARD,
        type: 'task_assigned',
        title: 'Tâche pour vous : Appeler',
        body: 'Assignée par Chloé, annonce « T2 ».',
      }),
    ])
    expect(
      notificationsForActivity(
        ev({
          action: 'task.created',
          after: { label: 'Moi', assigneeId: CHLOE },
        }),
        { members, listingTitle: 'T2' }
      )
    ).toEqual([])
    expect(
      notificationsForActivity(
        ev({
          action: 'task.updated',
          before: { label: 'PV', assigneeId: null },
          after: { assigneeId: RICHARD },
        }),
        { members, listingTitle: 'T2' }
      )[0]?.title
    ).toBe('Tâche pour vous : PV')
    expect(
      notificationsForActivity(
        ev({
          action: 'task.updated',
          before: { assigneeId: RICHARD },
          after: { assigneeId: RICHARD },
        }),
        { members, listingTitle: 'T2' }
      )
    ).toEqual([])
    expect(
      notificationsForActivity(ev({ action: 'task.updated', after: {} }), {
        members,
        listingTitle: 'T2',
      })[0]
    ).toBeUndefined()
    expect(
      notificationRecipients(
        ev({ action: 'task.created', after: { assigneeId: 'étranger' } }),
        'task_assigned',
        [RICHARD, CHLOE]
      )
    ).toEqual([])
    expect(
      notificationsForActivity(
        ev({ action: 'task.created', after: { assigneeId: RICHARD } }),
        { members, listingTitle: 'T2' }
      )[0]?.title
    ).toBe('Tâche pour vous : nouvelle tâche')
  })

  it("rien pour les actions qui n'en font pas naître", () => {
    expect(
      notificationTypeOf(ev({ action: 'task.created', after: {} }))
    ).toBeNull()
    expect(
      notificationTypeOf(
        ev({
          action: 'offer.updated',
          before: { response: 'pending' },
          after: { response: 'pending' },
        })
      )
    ).toBeNull()
    expect(notificationTypeOf(ev({ action: 'opinion.created' }))).toBeNull()
    expect(
      notificationsForActivity(ev({ action: 'visit.created' }), {
        members,
        listingTitle: 'T2',
      })
    ).toEqual([])
  })
})
