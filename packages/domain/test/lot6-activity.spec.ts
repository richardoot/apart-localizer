import { describe, expect, it } from 'vitest'
import {
  activityActorName,
  activityChanges,
  describeActivity,
  formatActivityDate,
  formatActivityValue,
} from '../src/index.js'
import type { ActivityRecord } from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const members = new Map([
  [RICHARD, { displayName: 'Richard' }],
  [CHLOE, { displayName: 'Chloé' }],
])

/** Les espaces insécables de fr-FR, en espaces simples pour comparer. */
const n = (value: string | null | undefined): string | null | undefined =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value
const nc = <T extends { before: string | null; after: string | null }>(
  changes: T[]
): T[] =>
  changes.map(c => ({
    ...c,
    before: n(c.before) ?? null,
    after: n(c.after) ?? null,
  }))

const record = (over: Partial<ActivityRecord>): ActivityRecord => ({
  action: 'listing.updated',
  channel: 'web',
  actorMemberId: RICHARD,
  before: null,
  after: null,
  ...over,
})

describe('formatActivityValue', () => {
  it('met en forme euros, m², pourcentages, booléens, dates et libellés', () => {
    expect(n(formatActivityValue('price', 200000))).toBe('200 000 €')
    expect(formatActivityValue('surface', 45.5)).toBe('45,5 m²')
    expect(formatActivityValue('referenceRentPerM2', 14.2)).toBe('14,2 €/m²')
    expect(formatActivityValue('feesPercent', 0.05)).toBe('5 %')
    expect(formatActivityValue('elevator', true)).toBe('oui')
    expect(formatActivityValue('cellar', false)).toBe('non')
    expect(formatActivityValue('status', 'to_visit')).toBe('À visiter')
    expect(formatActivityValue('status', 'planned')).toBe('Planifiée')
    expect(formatActivityValue('status', 'mystery')).toBe('mystery')
    expect(formatActivityValue('response', 'counter_offer')).toBe(
      'Contre-proposition'
    )
    expect(formatActivityValue('channel', 'agency')).toBe('Agence')
    expect(formatActivityValue('channel', 'pigeon')).toBe('pigeon')
    expect(formatActivityValue('leaseType', 'furnished')).toBe(
      'Location meublée'
    )
    expect(formatActivityValue('demand', 'strong')).toBe('forte')
    expect(formatActivityValue('demand', 'odd')).toBe('odd')
    expect(formatActivityValue('decencyCompliant', 'unknown')).toBe(
      'à vérifier'
    )
    expect(formatActivityValue('rooms', 3)).toBe('3')
    expect(formatActivityValue('dpeDate', '2025-03-01')).toBe('1 mars 2025')
    expect(formatActivityValue('visitedAt', '2026-11-12T17:30:00.000Z')).toBe(
      '12 novembre 2026 à 18:30'
    )
    expect(formatActivityValue('notes', 'a'.repeat(300))?.length).toBe(140)
  })

  it('rend null pour une valeur vide et nomme les membres', () => {
    expect(formatActivityValue('price', null)).toBeNull()
    expect(formatActivityValue('price', undefined)).toBeNull()
    expect(formatActivityValue('notes', '')).toBeNull()
    expect(formatActivityValue('assigneeId', CHLOE, members)).toBe('Chloé')
    expect(formatActivityValue('assigneeId', 'inconnu', members)).toBe(
      'un membre'
    )
    expect(
      formatActivityValue('participantIds', [RICHARD, CHLOE, 'x', 3], members)
    ).toBe('Richard, Chloé, un membre, ?')
    expect(formatActivityValue('participantIds', [], members)).toBeNull()
    expect(formatActivityValue('rating', 4)).toBe('4/5')
    expect(formatActivityValue('rating', 0)).toBe('sans note')
  })

  it('résume les tableaux, les points et les objets', () => {
    expect(
      n(
        formatActivityValue('items', [
          { label: 'Peinture', amount: 3000 },
          { label: 'Sols', amount: 2000 },
          { label: 'Divers' },
        ])
      )
    ).toBe('3 poste(s), 5 000 €')
    expect(formatActivityValue('items', [{ label: 'x' }])).toBe('1 poste(s)')
    expect(formatActivityValue('tags', ['a', 'b'])).toBe('2 élément(s)')
    expect(formatActivityValue('tags', [])).toBeNull()
    expect(
      formatActivityValue('point', {
        type: 'Point',
        coordinates: [-0.59, 44.8083],
      })
    ).toBe('44.80830, -0.59000')
    expect(
      formatActivityValue('location', {
        addressRaw: '12 rue du Forum',
        commune: 'Talence',
      })
    ).toBe('12 rue du Forum, Talence')
    expect(
      formatActivityValue('location', { addressRaw: '', commune: '' })
    ).toBeNull()
    expect(formatActivityValue('rentalPlan', { year: 2028 })).toBe('modifié')
    expect(formatActivityValue('weird', Symbol.for('x').description)).toBe('x')
    expect(formatActivityValue('big', 10n as unknown)).toBe('10')
  })

  it('garde une date illisible telle quelle', () => {
    expect(formatActivityDate('pas une date')).toBe('pas une date')
  })
})

describe('activityChanges', () => {
  it('liste les champs du patch qui changent, en descendant dans les sous-objets', () => {
    const changes = activityChanges(
      {
        price: 200000,
        notes: 'idem',
        rentalPlan: { targetRent: 700, year: 2028 },
        location: { commune: 'Talence', addressRaw: null },
      },
      {
        price: 190000,
        notes: 'idem',
        provenance: 'user',
        rentalPlan: { targetRent: 750, year: 2028 },
        location: { commune: 'Pessac', addressRaw: null },
      },
      members
    )
    expect(nc(changes)).toEqual([
      {
        field: 'price',
        label: 'Prix',
        before: '200 000 €',
        after: '190 000 €',
      },
      {
        field: 'rentalPlan.targetRent',
        label: 'Phase 2 (location) · Loyer visé',
        before: '700 €',
        after: '750 €',
      },
      {
        field: 'location.commune',
        label: 'Localisation · Commune',
        before: 'Talence',
        after: 'Pessac',
      },
    ])
  })

  it("traite la suppression d'un sous-objet et un objet sans différence lisible", () => {
    expect(
      activityChanges(
        { renovation: { active: true, level: 'refresh' } },
        { renovation: null }
      )
    ).toEqual([
      {
        field: 'renovation.active',
        label: 'Travaux · Actif',
        before: 'oui',
        after: null,
      },
      {
        field: 'renovation.level',
        label: 'Travaux · Ampleur',
        before: 'Rafraîchissement',
        after: null,
      },
    ])
    // Sous-objet changé seulement par un champ technique : une ligne au niveau parent.
    expect(
      activityChanges({ meta: { id: 'a' } }, { meta: { id: 'b' } })
    ).toEqual([
      { field: 'meta', label: 'meta', before: 'modifié', after: 'modifié' },
    ])
    expect(activityChanges(null, 'pas un objet')).toEqual([])
  })
})

describe('describeActivity', () => {
  const cases: Array<[Partial<ActivityRecord>, string, number?]> = [
    [
      { action: 'listing.created', after: { price: 200000, provenance: 'ai' } },
      "a ajouté l'annonce (fiche lue par l’IA)",
      1,
    ],
    [{ action: 'listing.created', after: {} }, "a ajouté l'annonce", 0],
    [
      {
        action: 'listing.status_changed',
        before: { status: 'to_study' },
        after: { status: 'discarded', reason: 'Trop cher' },
      },
      'a changé le statut',
      2,
    ],
    [
      {
        action: 'listing.price_changed',
        before: { price: 200000 },
        after: { price: 190000 },
      },
      'a enregistré un nouveau prix',
      1,
    ],
    [
      {
        action: 'listing.geocoded',
        before: { precision: 'commune' },
        after: { precision: 'exact' },
      },
      "a relancé le géocodage de l'adresse",
      1,
    ],
    [
      { action: 'listing.enriched', after: { tram: null } },
      'données ouvertes mises à jour (tram, plafond, marché, quartier, équipements)',
      0,
    ],
    [
      {
        action: 'listing.dpe_verified',
        before: { dpeClass: 'E' },
        after: { dpeClass: 'D' },
      },
      'a retenu le DPE vérifié auprès de l’ADEME',
      1,
    ],
    [
      {
        action: 'task.created',
        after: { label: 'Appeler l’agence', assigneeId: CHLOE },
      },
      'a ajouté la tâche « Appeler l’agence », assignée à Chloé',
    ],
    [
      { action: 'task.created', after: { label: 'Relire le PV' } },
      'a ajouté la tâche « Relire le PV »',
    ],
    [
      { action: 'task.completed', before: { label: 'PV' } },
      'a coché la tâche « PV »',
    ],
    [
      { action: 'task.reopened', before: { label: 'PV' } },
      'a décoché la tâche « PV »',
    ],
    [
      {
        action: 'task.updated',
        before: { label: 'PV', assigneeId: null },
        after: { assigneeId: RICHARD },
      },
      'a modifié la tâche « PV »',
      1,
    ],
    [
      { action: 'task.deleted', before: { label: 'PV' } },
      'a supprimé la tâche « PV »',
    ],
    [
      { action: 'opinion.created', after: { rating: 4, text: 'Lumineux' } },
      'a donné son avis',
      2,
    ],
    [
      {
        action: 'opinion.updated',
        before: { rating: 4, text: 'x' },
        after: { rating: 2, text: 'x' },
      },
      'a modifié son avis',
      1,
    ],
    [
      {
        action: 'offer.created',
        after: { amount: 150000, channel: 'agency', response: 'pending' },
      },
      'a enregistré une offre de 150 000 €',
      2,
    ],
    [
      {
        action: 'offer.updated',
        before: { response: 'pending' },
        after: { response: 'counter_offer', counterAmount: 165000 },
      },
      'a enregistré la réponse du vendeur : contre-proposition',
      2,
    ],
    [
      {
        action: 'offer.updated',
        before: { response: 'pending', notes: null },
        after: { response: 'pending', notes: 'relance' },
      },
      "a modifié l'offre",
      1,
    ],
    [
      {
        action: 'criteria.matched',
        after: { criteria: [{ name: 'Talence' }, { name: 'Tram B' }, 3] },
      },
      "l'annonce entre dans le critère « Talence », « Tram B »",
    ],
    [
      { action: 'criteria.unmatched', before: { criteria: [{ name: 'X' }] } },
      "l'annonce sort du critère « X » (hors critères)",
    ],
    [
      { action: 'criteria.created', after: { name: 'Campus' } },
      'a créé le critère « Campus »',
    ],
    [
      {
        action: 'criteria.updated',
        before: { name: 'Campus', active: true },
        after: { active: false },
      },
      'a modifié le critère « Campus »',
      1,
    ],
    [
      { action: 'criteria.deleted', before: { name: 'Campus' } },
      'a supprimé le critère « Campus »',
    ],
    [
      { action: 'ai.extraction', after: { estimatedCostUsd: 0.0421 } },
      'a lancé une extraction par IA (≈ 0,0421 $)',
    ],
    [{ action: 'ai.extraction', after: {} }, 'a lancé une extraction par IA'],
    [
      {
        action: 'assumptions.updated',
        before: { interestRate: 0.035 },
        after: { interestRate: 0.032, impact: { total: 3 } },
      },
      'a modifié les hypothèses',
      1,
    ],
    [
      { action: 'scenario.created', after: { name: 'Prix négocié' } },
      'a enregistré le scénario « Prix négocié »',
    ],
    [
      { action: 'scenario.updated', before: { name: 'A' } },
      'a modifié le scénario « A »',
    ],
    [
      { action: 'scenario.deleted', before: { name: 'A' } },
      'a supprimé le scénario « A »',
    ],
    [
      { action: 'rent_comparable.created', after: { rent: 680, surface: 40 } },
      'a ajouté un loyer comparable (680 €/mois, 40 m²)',
    ],
    [
      { action: 'rent_comparable.created', after: {} },
      'a ajouté un loyer comparable (0 €/mois, ? m²)',
    ],
    [
      {
        action: 'rent_comparable.updated',
        before: { rent: 680 },
        after: { rent: 700 },
      },
      'a modifié un loyer comparable',
      1,
    ],
    [{ action: 'rent_comparable.deleted' }, 'a supprimé un loyer comparable'],
    [
      {
        action: 'visit.created',
        after: {
          visitedAt: '2026-11-12T17:30:00.000Z',
          status: 'planned',
          participantIds: [RICHARD],
          createPrepTask: true,
        },
      },
      'a planifié une visite le 12 novembre 2026 à 18:30',
      1,
    ],
    [
      { action: 'visit.created', after: { status: 'done', rating: 4 } },
      'a ajouté le compte rendu d’une visite',
      1,
    ],
    [
      {
        action: 'visit.updated',
        before: { report: null },
        after: { report: 'Bien' },
      },
      'a modifié une visite',
      1,
    ],
    [{ action: 'visit.deleted' }, 'a supprimé une visite'],
    [{ action: 'visit.photo_added' }, 'a ajouté une photo de visite'],
    [{ action: 'visit.photo_deleted' }, 'a supprimé une photo de visite'],
    [
      {
        action: 'draft.received',
        after: { created: 3, subject: 'Nouvelles annonces SeLoger' },
      },
      '3 annonce(s) reçue(s) par e-mail « Nouvelles annonces SeLoger »',
    ],
    [
      { action: 'draft.received', after: {} },
      '0 annonce(s) reçue(s) par e-mail',
    ],
    [
      { action: 'draft.accepted' },
      'a ajouté à la liste une annonce reçue par e-mail',
    ],
    [{ action: 'draft.dismissed' }, 'a écarté une annonce reçue par e-mail'],
    [{ action: 'mystery.thing', after: { a: 1 } }, 'mystery.thing', 1],
  ]

  it.each(cases)('%o → %s', (over, summary, changeCount) => {
    const description = describeActivity(record(over), members)
    expect(n(description.summary)).toBe(summary)
    if (changeCount !== undefined) {
      expect(description.changes).toHaveLength(changeCount)
    }
  })

  it('donne la sorte et le détail lisible d’une modification', () => {
    const description = describeActivity(
      record({
        action: 'listing.updated',
        before: { surface: 45 },
        after: { surface: 47, provenance: 'user' },
      })
    )
    expect(description.kind).toBe('listing')
    expect(description.changes).toEqual([
      {
        field: 'surface',
        label: 'Surface Carrez',
        before: '45 m²',
        after: '47 m²',
      },
    ])
    expect(
      describeActivity(record({ action: 'listing.status_changed' })).kind
    ).toBe('status')
    expect(describeActivity(record({ action: 'scenario.created' })).kind).toBe(
      'study'
    )
    expect(describeActivity(record({ action: 'mystery' })).kind).toBe('other')
  })
})

describe('activityActorName', () => {
  it('nomme le membre, Claude au MCP, ou le canal', () => {
    expect(
      activityActorName({ channel: 'web', actorMemberId: CHLOE }, members)
    ).toBe('Chloé')
    expect(
      activityActorName({ channel: 'mcp', actorMemberId: RICHARD }, members)
    ).toBe('Claude (MCP, pour Richard)')
    expect(activityActorName({ channel: 'mcp', actorMemberId: null })).toBe(
      'Claude (MCP)'
    )
    expect(activityActorName({ channel: 'web', actorMemberId: 'x' })).toBe(
      'Un membre'
    )
    expect(activityActorName({ channel: 'system', actorMemberId: null })).toBe(
      'Système'
    )
    expect(activityActorName({ channel: 'import', actorMemberId: null })).toBe(
      'Import'
    )
  })
})
