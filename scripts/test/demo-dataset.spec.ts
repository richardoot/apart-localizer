import {
  AssumptionsSchema,
  ListingInputSchema,
  OfferInputSchema,
  OpinionInputSchema,
  RentComparableInputSchema,
  ScenarioInputSchema,
  SearchCriteriaInputSchema,
  VisitInputSchema,
} from '@apart/contracts'
import { describeActivity, notificationsForActivity } from '@apart/domain'
import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS } from '../lib/demo/accounts.js'
import {
  buildDemoDataset,
  currentAssumptions,
  demoMetrics,
} from '../lib/demo/dataset.js'
import { DEMO_WORKSPACE_ID, demoId } from '../lib/demo/ids.js'

const NOW = new Date('2026-11-03T15:00:00Z')
const dataset = buildDemoDataset(NOW)

/** Communes de Bordeaux Métropole utilisées par le jeu. */
const METROPOLE = new Set([
  'Bordeaux',
  'Talence',
  'Mérignac',
  'Pessac',
  'Bègles',
  'Le Bouscat',
  'Cenon',
  'Villenave-d’Ornon',
  'Lormont',
])

describe('jeu de démonstration', () => {
  it('a 12 à 15 annonces, un espace « Démo » à deux membres, des identifiants stables', () => {
    expect(dataset.listings.length).toBeGreaterThanOrEqual(12)
    expect(dataset.listings.length).toBeLessThanOrEqual(15)
    expect(dataset.workspace).toMatchObject({
      id: DEMO_WORKSPACE_ID,
      name: 'Démo',
    })
    expect(dataset.members.map(m => m.email)).toEqual(
      DEMO_ACCOUNTS.map(a => a.email)
    )
    expect(buildDemoDataset(NOW)).toEqual(dataset)
    expect(demoId('x')).toBe(demoId('x'))
    expect(demoId('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    const ids = [
      ...dataset.listings.flatMap(l => [
        l.id,
        ...l.tasks.map(t => t.id),
        ...l.offers.map(o => o.id),
        ...l.visits.map(v => v.id),
        ...l.rentComparables.map(c => c.id),
      ]),
      ...dataset.activity.map(a => a.id),
      ...dataset.criteria.map(c => c.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('valide chaque objet par les schémas de contracts', () => {
    for (const a of dataset.assumptions)
      expect(AssumptionsSchema.parse(a.values)).toEqual(a.values)
    for (const l of dataset.listings) {
      expect(ListingInputSchema.parse(l.input)).toEqual(l.input)
      for (const o of l.opinions)
        OpinionInputSchema.parse({ rating: o.rating, text: o.text })
      for (const o of l.offers)
        OfferInputSchema.parse({
          amount: o.amount,
          channel: o.channel,
          response: o.response,
          counterAmount: o.counterAmount,
          notes: o.notes,
        })
      for (const v of l.visits)
        VisitInputSchema.parse({
          visitedAt: v.visitedAt,
          status: v.status,
          rating: v.rating,
          report: v.report,
        })
      for (const c of l.rentComparables)
        expect(RentComparableInputSchema.parse(c.input)).toEqual(c.input)
    }
    for (const c of dataset.criteria)
      expect(SearchCriteriaInputSchema.parse(c.input)).toEqual(c.input)
    for (const s of dataset.scenarios)
      expect(ScenarioInputSchema.parse(s.input)).toEqual(s.input)
    for (const d of dataset.drafts)
      expect(ListingInputSchema.parse(d.input)).toEqual(d.input)
  })

  it('calcule les indicateurs par domain, avec des verdicts variés', () => {
    const assumptions = currentAssumptions(dataset)
    const verdicts = new Set<string>()
    for (const l of dataset.listings) {
      const m = demoMetrics(l, assumptions, NOW)
      expect(Number.isFinite(m.grossYield)).toBe(true)
      expect(Number.isFinite(m.totalCost)).toBe(true)
      verdicts.add(m.verdict)
    }
    expect([...verdicts].sort()).toEqual(['off_target', 'target', 'to_dig'])
  })

  it('varie les statuts et couvre travaux, phase 2, avis à deux, tâches, offres, prix, visites, comparables', () => {
    const l = dataset.listings
    expect(new Set(l.map(x => x.input.status)).size).toBeGreaterThanOrEqual(7)
    expect(
      l.filter(x => x.input.renovation?.items.length).length
    ).toBeGreaterThanOrEqual(3)
    expect(l.every(x => x.input.rentalPlan?.targetRent)).toBe(true)
    expect(l.some(x => new Set(x.opinions.map(o => o.handle)).size === 2)).toBe(
      true
    )
    expect(l.some(x => x.tasks.some(t => t.assignee === 'demo2'))).toBe(true)
    expect(l.flatMap(x => x.offers).map(o => o.response)).toEqual(
      expect.arrayContaining([
        'pending',
        'accepted',
        'refused',
        'counter_offer',
      ])
    )
    expect(l.filter(x => x.prices.length > 1).length).toBeGreaterThanOrEqual(3)
    const visits = l.flatMap(x => x.visits)
    expect(
      visits.some(
        v => v.status === 'planned' && v.visitedAt > NOW.toISOString()
      )
    ).toBe(true)
    expect(visits.some(v => v.status === 'done')).toBe(true)
    expect(l.flatMap(x => x.rentComparables).length).toBeGreaterThanOrEqual(6)
    expect(dataset.criteria.map(c => c.input.perimeter?.type).sort()).toEqual([
      'point_radius',
      'point_radius',
      'polygon',
    ])
    // Lot 14 : un critère montre une marge de tolérance réglée.
    expect(
      dataset.criteria.some(c => c.input.tolerance.perimeterMeters === 400)
    ).toBe(true)
  })

  it('est fictif : adresses marquées, liens en .invalid, points dans la métropole', () => {
    for (const l of dataset.listings) {
      expect(l.input.location.addressRaw).toMatch(/\(adresse fictive\)$/)
      expect(l.input.url).toMatch(/^https:\/\/exemple\.invalid\//)
      expect(METROPOLE.has(l.input.location.commune ?? '')).toBe(true)
      const [lon, lat] = l.input.location.point?.coordinates ?? [0, 0]
      expect(lon).toBeGreaterThan(-0.75)
      expect(lon).toBeLessThan(-0.45)
      expect(lat).toBeGreaterThan(44.75)
      expect(lat).toBeLessThan(44.95)
    }
    expect(dataset.drafts.every(d => d.url.includes('exemple.invalid'))).toBe(
      true
    )
    expect(dataset.members.every(m => m.email.endsWith('@apart.local'))).toBe(
      true
    )
  })

  it('a un journal lisible et des notifications pour les deux membres (règles de domain)', () => {
    const members = dataset.members.map(m => ({
      id: m.id,
      displayName: m.displayName,
    }))
    const names = new Map(
      members.map(m => [m.id, { displayName: m.displayName }])
    )
    const memberOf = new Map(dataset.members.map(m => [m.handle, m.id]))
    const recipients = new Map<string, number>()
    const actions = new Set<string>()
    for (const a of dataset.activity) {
      const event = {
        action: a.action,
        channel: a.channel,
        actorMemberId: a.actor ? (memberOf.get(a.actor) ?? null) : null,
        before: a.before,
        after: a.after,
      }
      actions.add(a.action)
      expect(describeActivity(event, names).summary).not.toBe(a.action)
      const listing = dataset.listings.find(l => l.key === a.listingKey)
      for (const n of notificationsForActivity(
        { ...event, listingId: listing?.id ?? null },
        { members, listingTitle: listing?.input.title ?? null }
      )) {
        recipients.set(n.recipientId, (recipients.get(n.recipientId) ?? 0) + 1)
      }
    }
    expect(dataset.activity.length).toBeGreaterThan(50)
    expect([...recipients.keys()].sort()).toEqual(
      dataset.members.map(m => m.id).sort()
    )
    for (const action of [
      'listing.created',
      'listing.status_changed',
      'listing.price_changed',
      'opinion.created',
      'offer.created',
      'offer.updated',
      'visit.created',
      'task.created',
      'criteria.created',
      'assumptions.updated',
      'draft.received',
      'listing.checked',
    ]) {
      expect(actions).toContain(action)
    }
  })

  it('lot 15 : des vérifications fictives (prix trouvé, inchangée, plus en ligne, republiée, inaccessible)', () => {
    const byKey = new Map(dataset.listings.map(l => [l.key, l]))
    const peixotto = byKey.get('talence-peixotto-t3')
    expect(peixotto?.checks.map(c => c.outcome)).toEqual([
      'unchanged',
      'changed',
      'unchanged',
    ])
    expect(peixotto?.checks[1]?.changes[0]).toMatchObject({
      field: 'price',
      before: 239_000,
      after: 225_000,
      disposition: 'applied',
    })
    expect(peixotto?.lastCheckedAt).toBe(peixotto?.checks[2]?.at)
    expect(peixotto?.lastSeenOnlineAt).toBe(peixotto?.checks[2]?.at)
    // Le changement de prix trouvé par la vérification n'est journalisé qu'une fois.
    expect(
      dataset.activity.filter(
        a =>
          a.listingKey === 'talence-peixotto-t3' &&
          a.action === 'listing.price_changed'
      )
    ).toEqual([])
    // La publication d'origine : inchangée, prix, plus en ligne, republiée.
    const origin = byKey.get('cenon-t3-origine')
    const republished = byKey.get('cenon-t3')
    expect(origin?.checks.map(c => c.outcome)).toEqual([
      'unchanged',
      'changed',
      'offline',
      'republished',
    ])
    expect(origin?.checks[2]?.suggestedStatus).toBe('sold_or_withdrawn')
    expect(origin?.checks[3]).toMatchObject({
      linkedListingId: republished?.id,
      suggestedStatus: null,
      summary: expect.stringContaining(
        'Republiée : reprise par « T3 avec vue sur la ville, Cenon »'
      ),
    })
    expect(origin?.lastSeenOnlineAt).toBe(origin?.checks[1]?.at)
    expect(republished?.republishedFromId).toBe(origin?.id)
    expect(republished?.input.publishedAt).not.toBeNull()
    expect(byKey.get('talence-forum-t2')?.checks[0]?.summary).toBe(
      'Non vérifiée : page inaccessible'
    )
    for (const listing of dataset.listings) {
      for (const check of listing.checks) {
        expect(check.evidence?.length ?? 0).toBeLessThanOrEqual(500)
        expect(check.checkedUrl).toMatch(/^https:\/\/exemple\.invalid\//)
      }
    }
  })

  it('laisse des annonces « nouvelles » à chacun : sans vue du membre', () => {
    for (const handle of ['demo', 'demo2'] as const) {
      expect(
        dataset.listings.filter(l => !l.views.some(v => v.handle === handle))
          .length
      ).toBeGreaterThanOrEqual(2)
    }
  })
})
