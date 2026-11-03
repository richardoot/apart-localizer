/**
 * Lot 5 : coût d'occupation (E3), scénarios « et si » enregistrables (E4),
 * projection fiscale et revente (E6, E7), loyer de marché par comparables
 * (L4), checklist réglementaire et Géorisques (L5, D6). REST sur PostGIS
 * réel ; Géorisques est scripté (aucun appel réseau).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ISOCHRONE_DOWN, createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { georisquesFetch } from './fixtures/georisques'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

/** L'exemple chiffré du modèle de calcul (§ 8), localisé à Talence. */
const EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  dpeDate: '2023-05-10',
  constructionYear: 1930,
  annualCharges: 1200,
  location: {
    commune: 'Talence',
    inseeCode: '33522',
    point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
    precision: 'exact',
  },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

describe('Phase 1 et phase 2 avancées (e2e)', () => {
  let ctx: E2eContext
  let id: string

  const post = (path: string, body: object, identity = richard) =>
    request(ctx.server).post(path).set(ctx.auth(identity)).send(body)
  const patch = (path: string, body: object, identity = richard) =>
    request(ctx.server).patch(path).set(ctx.auth(identity)).send(body)
  const get = (path: string, identity = richard) =>
    request(ctx.server).get(path).set(ctx.auth(identity))
  const del = (path: string, identity = richard) =>
    request(ctx.server).delete(path).set(ctx.auth(identity))

  /** Hypothèses de l'espace complétées (dates fixes, loyer actuel, TMI). */
  async function setAssumptions(
    values: Record<string, unknown>
  ): Promise<void> {
    const current = await get('/assumptions').expect(200)
    await request(ctx.server)
      .put('/assumptions')
      .set(ctx.auth(richard))
      .send({ values: { ...current.body.values, ...values } })
      .expect(200)
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.georisques.fetchImpl = ISOCHRONE_DOWN
    await ctx.prisma.workspace.create({
      data: {
        name: 'Richard et Chloé',
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email,
              role: 'owner',
            },
            { handle: 'chloe', displayName: 'Chloé', email: chloe.email },
          ],
        },
      },
    })
    const res = await post('/listings', EXAMPLE).expect(201)
    id = res.body.listing.id as string
    await setAssumptions({
      purchaseDate: '2026-01-01',
      rentalStartDate: '2028-01-01',
      currentRent: 850,
      maintenanceAnnual: 600,
    })
  })

  it('les hypothèses portent les champs du lot 5 et leurs valeurs par défaut datées', async () => {
    const res = await get('/assumptions').expect(200)
    expect(res.body.values).toMatchObject({
      currentRent: 850,
      marginalTaxRate: null,
      taxRegime: null,
      furnishedRentalKind: 'long_term',
      horizonYears: 15,
      appreciationRate: 0,
      rentIndexationRate: 0.0157,
      resaleCostsRate: 0.05,
      discountRate: null,
      rentalStartDate: '2028-01-01',
    })
    expect(res.body.values.taxParameters.asOf).toBe('2026-11-03')
    expect(
      res.body.values.taxParameters.socialContributions.landIncomeRate
    ).toBe(0.172)
  })

  describe('GET /listings/:id/occupancy (E3)', () => {
    it('coût d’occupation, part de capital, coût réel, loyer actuel, bascule', async () => {
      const res = await get(`/listings/${id}/occupancy`).expect(200)
      expect(res.body).toMatchObject({
        listingId: id,
        purchaseDate: '2026-01-01',
        rentalStartDate: '2028-01-01',
        phase1Months: 24,
        currentRent: 850,
        chargesKnown: true,
        maintenanceKnown: true,
        propertyTaxEstimated: true,
      })
      expect(res.body.monthly.charges).toBe(100)
      expect(res.body.monthly.maintenance).toBe(50)
      expect(res.body.monthly.propertyTax).toBe(62.5)
      expect(res.body.realCostMonthly).toBeCloseTo(
        res.body.monthly.total - res.body.capitalMonthly,
        6
      )
      expect(res.body.gapToCurrentRent).toBeCloseTo(
        res.body.monthly.total - 850,
        6
      )
      expect(res.body.remainingPrincipalAtSwitch).toBeLessThan(180_000)
    })

    it('annonce d’un autre espace ou inconnue : 404', async () => {
      await get(`/listings/${id}/occupancy`, stranger).expect(404)
      await get(
        '/listings/11111111-1111-4111-8111-111111111111/occupancy'
      ).expect(404)
    })
  })

  describe('GET /listings/:id/projection (E6, E7)', () => {
    it('lignes annuelles, revente, TRI ; sans TMI, l’impôt sur le revenu n’est pas estimé', async () => {
      const res = await get(`/listings/${id}/projection`).expect(200)
      expect(res.body.rows).toHaveLength(15)
      expect(res.body.rows[2].phase2Months).toBe(12)
      expect(res.body.summary.irrBeforeTax).not.toBeNull()
      expect(res.body.summary.irrAfterTax).toBeNull()
      expect(res.body.warnings.join(' ')).toMatch(/TMI du foyer non renseignée/)
      expect(res.body.disclaimer).toMatch(/pas un conseil fiscal/)
      expect(res.body.sale.date).toBe('2041-01-01')
      expect(res.body.regimes.map((r: { regime: string }) => r.regime)).toEqual(
        ['micro_foncier', 'reel_foncier']
      )
    })

    it('horizon et régime en paramètres ; TMI renseignée : TRI après impôt et meilleur régime', async () => {
      await setAssumptions({ marginalTaxRate: 0.3 })
      const res = await get(
        `/listings/${id}/projection?horizonYears=20&regime=reel_foncier`
      ).expect(200)
      expect(res.body.rows).toHaveLength(20)
      expect(res.body.summary.regime).toBe('reel_foncier')
      expect(res.body.summary.irrAfterTax).not.toBeNull()
      expect(res.body.bestRegime).not.toBeNull()
      expect(res.body.parameters.marginalTaxRate).toBe(0.3)
      await get(`/listings/${id}/projection?horizonYears=0`).expect(400)
      await get(`/listings/${id}/projection?regime=pinel`).expect(400)
    })
  })

  describe('scénarios (E4)', () => {
    it('évaluer sans enregistrer : base, scénario, écarts ; rien n’est écrit', async () => {
      const res = await post(`/listings/${id}/scenarios/evaluate`, {
        overrides: { price: 150_000, assumptions: { interestRate: 0.032 } },
      }).expect(200)
      expect(res.body.persisted).toBe(false)
      expect(res.body.result.totalCost).toBeLessThan(res.body.base.totalCost)
      const cost = res.body.deltas.find(
        (d: { key: string }) => d.key === 'totalCost'
      )
      expect(cost.better).toBe(true)
      expect(await ctx.prisma.scenario.count()).toBe(0)
      await post(`/listings/${id}/scenarios/evaluate`, {}).expect(400)
    })

    it('CRUD : créer, lister (annonce et espace), modifier avec garde-fou, évaluer, supprimer ; journal', async () => {
      const created = await post('/scenarios', {
        name: 'Taux négocié',
        listingId: id,
        overrides: { assumptions: { interestRate: 0.03, downPayment: 60_000 } },
      }).expect(201)
      const workspace = await post('/scenarios', {
        name: 'Vacance longue',
        overrides: { assumptions: { vacancyMonths: 2 } },
      }).expect(201)
      expect(workspace.body.listingId).toBeNull()
      const list = await get(`/scenarios?listingId=${id}`).expect(200)
      expect(list.body.map((s: { name: string }) => s.name).sort()).toEqual([
        'Taux négocié',
        'Vacance longue',
      ])
      await patch(`/scenarios/${created.body.id}`, {
        name: 'Taux 3 %',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      }).expect(409)
      const renamed = await patch(`/scenarios/${created.body.id}`, {
        name: 'Taux 3 %',
        expectedUpdatedAt: created.body.updatedAt,
      }).expect(200)
      expect(renamed.body.name).toBe('Taux 3 %')
      await patch(`/scenarios/${created.body.id}`, {}).expect(400)
      const evaluated = await post(`/listings/${id}/scenarios/evaluate`, {
        scenarioId: created.body.id,
        overrides: { targetRent: 800 },
      }).expect(200)
      expect(evaluated.body.scenario).toMatchObject({
        id: created.body.id,
        name: 'Taux 3 %',
        overrides: {
          targetRent: 800,
          assumptions: { interestRate: 0.03, downPayment: 60_000 },
        },
      })
      expect(evaluated.body.result.loanAmount).toBeLessThan(
        evaluated.body.base.loanAmount
      )
      // Un scénario d'une autre annonce ne s'applique pas.
      const other = await post('/listings', {
        ...EXAMPLE,
        title: 'Autre',
      }).expect(201)
      await post(`/listings/${other.body.listing.id}/scenarios/evaluate`, {
        scenarioId: created.body.id,
      }).expect(400)
      await get('/scenarios', stranger).expect(200).expect([])
      await del(`/scenarios/${created.body.id}`, stranger).expect(404)
      await del(`/scenarios/${created.body.id}`).expect(204)
      await post('/scenarios', {
        name: 'Annonce inconnue',
        listingId: '11111111-1111-4111-8111-111111111111',
        overrides: {},
      }).expect(404)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: { startsWith: 'scenario.' } },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'scenario.created',
        'scenario.created',
        'scenario.updated',
        'scenario.deleted',
      ])
    })
  })

  describe('loyer de marché par comparables (L4)', () => {
    it('ajouter, modifier, supprimer ; médiane, loyer estimé, écart du loyer visé', async () => {
      for (const rent of [600, 640, 680, 720]) {
        await post(`/listings/${id}/rent-comparables`, {
          rent,
          surface: 40,
          observedAt: '2026-10-01',
          source: 'leboncoin',
        }).expect(201)
      }
      const fifth = await post(`/listings/${id}/rent-comparables`, {
        rent: 760,
        surface: 40,
      }).expect(201)
      expect(fifth.body.market.enough).toBe(true)
      expect(fifth.body.market.stats.medianRentPerM2).toBe(17)
      expect(fifth.body.market.estimatedRent).toBe(765)
      const listed = await get(`/listings/${id}/rent-comparables`).expect(200)
      expect(listed.body.items).toHaveLength(5)
      const updated = await patch(
        `/listings/${id}/rent-comparables/${fifth.body.comparable.id}`,
        { rent: 1000, furnished: true }
      ).expect(200)
      expect(updated.body.comparable.furnished).toBe(true)
      // Les champs absents du patch ne bougent pas.
      expect(updated.body.comparable.source).toBe('autre')
      expect(updated.body.comparable.surface).toBe(40)
      expect(updated.body.market.enough).toBe(false)
      await patch(
        `/listings/${id}/rent-comparables/${fifth.body.comparable.id}`,
        {}
      ).expect(400)
      const removed = await del(
        `/listings/${id}/rent-comparables/${fifth.body.comparable.id}`
      ).expect(200)
      expect(removed.body.items).toHaveLength(4)
      await post(`/listings/${id}/rent-comparables`, {
        rent: -1,
        surface: 40,
      }).expect(400)
      await get(`/listings/${id}/rent-comparables`, stranger).expect(404)
      await del(
        `/listings/${id}/rent-comparables/${fifth.body.comparable.id}`
      ).expect(404)
      const logs = await ctx.prisma.activityLog.count({
        where: { action: { startsWith: 'rent_comparable.' } },
      })
      expect(logs).toBe(7)
    })

    it('trente comparables au plus', async () => {
      await ctx.prisma.rentComparable.createMany({
        data: Array.from({ length: 30 }, () => ({
          listingId: id,
          rent: 700,
          surface: 40,
          updatedAt: new Date(),
        })),
      })
      const res = await post(`/listings/${id}/rent-comparables`, {
        rent: 700,
        surface: 40,
      }).expect(400)
      expect(res.body.message).toMatch(/30 comparables au plus/)
    })
  })

  describe('GET /listings/:id/compliance (L5, D6)', () => {
    it('checklist datée et sourcée ; Géorisques scripté, mis en cache', async () => {
      const geo = georisquesFetch()
      ctx.georisques.fetchImpl = geo.fetchImpl
      const res = await get(`/listings/${id}/compliance`).expect(200)
      expect(res.body.rentalStartDate).toBe('2028-01-01')
      const byKey = (key: string) =>
        res.body.items.find((i: { key: string }) => i.key === key)
      expect(byKey('dpe_ban').level).toBe('ok')
      expect(byKey('diagnostic_lead').level).toBe('warn')
      expect(byKey('rent_control').level).toBe('ok')
      expect(byKey('georisques_retraitGonflementArgile')).toMatchObject({
        level: 'warn',
        provenance: 'open_data',
      })
      expect(byKey('dpe_ban').source.url).toMatch(/service-public/)
      expect(res.body.georisques.status).toBe('ok')
      expect(res.body.rules.asOf).toBe('2026-11-03')
      expect(geo.calls).toHaveLength(1)
      expect(geo.calls[0]).toContain('latlon=-0.590600%2C44.808300')
      await get(`/listings/${id}/compliance`).expect(200)
      expect(geo.calls).toHaveLength(1)
    })

    it('Géorisques indisponible : « à vérifier », jamais de risque inventé ; table des règles en base', async () => {
      const res = await get(`/listings/${id}/compliance`).expect(200)
      expect(res.body.georisques.status).toBe('unavailable')
      const geoItem = res.body.items.find(
        (i: { key: string }) => i.key === 'georisques'
      )
      expect(geoItem.level).toBe('unknown')
      // Une table déposée en base remplace la table par défaut ; illisible, elle est ignorée.
      await ctx.prisma.referenceData.create({
        data: {
          kind: 'regulatory_rules',
          key: 'current',
          payload: { version: 'bad' },
        },
      })
      const fallback = await get(`/listings/${id}/compliance`).expect(200)
      expect(fallback.body.rules.version).toBe('2026-11-03')
      await ctx.prisma.referenceData.update({
        where: { kind_key: { kind: 'regulatory_rules', key: 'current' } },
        data: {
          payload: {
            version: 'test',
            asOf: '2026-11-03',
            label: 'Table de test',
            rules: [
              {
                key: 'dpe_ban_d',
                kind: 'dpe_rental_ban',
                label: 'D interdit (fictif)',
                dpeClasses: ['D'],
                from: '2027-01-01',
                source: { label: 'Test', url: null, consultedAt: '2026-11-03' },
                note: null,
              },
            ],
          },
        },
      })
      const custom = await get(`/listings/${id}/compliance`).expect(200)
      expect(custom.body.rules.version).toBe('test')
      expect(custom.body.verdict).toBe('incompatible')
    })
  })
})
