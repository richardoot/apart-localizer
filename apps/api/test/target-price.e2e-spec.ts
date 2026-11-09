/**
 * Lot 3 : « à partir de quel prix ? », tableau de sensibilité, brief de
 * négociation, offres et statut proposé, changement de prix, comparaison,
 * hypothèses avec garde de version et impact. REST sur PostGIS réel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

/** L'exemple chiffré du modèle de calcul (§ 8). */
const EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  location: { commune: 'Talence' },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

describe('Prix cible et négociation (e2e)', () => {
  let ctx: E2eContext
  let id: string

  const post = (path: string, body: string | object, identity = richard) =>
    request(ctx.server).post(path).set(ctx.auth(identity)).send(body)
  const get = (path: string, identity = richard) =>
    request(ctx.server).get(path).set(ctx.auth(identity))

  async function createListing(body: Record<string, unknown>): Promise<string> {
    const res = await post('/listings', body).expect(201)
    return res.body.listing.id as string
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Richard et Chloé',
        decideTogether: false,
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
    id = await createListing(EXAMPLE)
  })

  describe('GET /listings/:id/target-price', () => {
    it('répond « à partir de quel prix » : critères, critère liant, décote, rang, offre suggérée, notaire', async () => {
      const res = await get(`/listings/${id}/target-price`).expect(200)
      const t = res.body.targetPrice
      expect(res.body.listingId).toBe(id)
      expect(res.body.price).toBe(200_000)
      expect(t.bindingCriterion).toBe('gross_yield')
      expect(Math.round(t.targetPrice / 100) * 100).toBe(147_600)
      expect(t.discountClass).toBe('out_of_reach')
      const by = Object.fromEntries(
        (
          t.criteria as Array<{
            criterion: string
            maxPrice: number | null
            discount: number | null
          }>
        ).map(c => [c.criterion, c])
      )
      expect(Math.round((by.effort?.maxPrice ?? 0) / 100) * 100).toBe(161_900)
      expect(Math.round((by.rent_x220?.maxPrice ?? 0) / 100) * 100).toBe(
        148_800
      )
      expect(by.net_yield?.maxPrice).toBeNull()
      expect(Math.round((by.gross_yield?.discount ?? 0) * 100)).toBe(26)
      // Lot 9 : le coût tout compris de chaque critère, et l'annonce au prix cible.
      const costs = Object.fromEntries(
        (
          t.criteria as Array<{
            criterion: string
            maxTotalCost: number | null
          }>
        ).map(c => [c.criterion, c.maxTotalCost])
      )
      expect(Math.round(costs.gross_yield ?? 0)).toBe(163_636)
      expect(Math.round(costs.rent_x220 ?? 0)).toBe(165_000)
      expect(costs.net_yield).toBeNull()
      expect(t.atTarget.price).toBe(t.targetPrice)
      expect(Math.round(t.atTarget.totalCost)).toBe(163_636)
      expect(Math.round(t.atTarget.effort)).toBe(-70)
      expect(t.atTarget.verdict).toBe('target')
      expect(res.body.rank).toEqual({ position: 1, total: 1 })
      expect(res.body.negotiation.suggestedOffer).toBe(147_000)
      expect(res.body.negotiation.marginToTarget).toBeGreaterThan(500)
      expect(res.body.negotiation.daysOnlineSince).toBe('added')
      expect(res.body.negotiation.arguments).toEqual([])
      expect(res.body.notaryFees).toMatchObject({
        mode: 'rate',
        total: 15_000,
        transferTax: null,
        estimated: true,
      })
      expect(res.body.assumptions.notaryMode).toBe('rate')
      expect(res.body.sensitivity).toBeNull()
    })

    it('classe les annonces actives par décote croissante ; une annonce écartée n’a pas de rang', async () => {
      const cheaper = await createListing({
        ...EXAMPLE,
        title: 'T2 moins cher',
        price: 150_000,
      })
      // Sans loyer visé et avec des charges qui mangent l'effort admis,
      // aucun critère ne donne de prix (lot 19 : plus de surcharge par annonce).
      const noRent = await createListing({
        ...EXAMPLE,
        title: 'Sans loyer visé',
        rentalPlan: null,
        annualCharges: 12_000,
      })
      expect(
        (await get(`/listings/${cheaper}/target-price`).expect(200)).body.rank
      ).toEqual({
        position: 1,
        total: 2,
      })
      expect(
        (await get(`/listings/${id}/target-price`).expect(200)).body.rank
      ).toEqual({
        position: 2,
        total: 2,
      })
      // Sans loyer : ni brut ni prix cible, donc pas de rang.
      const unranked = await get(`/listings/${noRent}/target-price`).expect(200)
      expect(unranked.body.rank).toBeNull()
      expect(unranked.body.targetPrice.targetPrice).toBeNull()
      expect(unranked.body.negotiation.suggestedOffer).toBeNull()

      await post(`/listings/${cheaper}/status`, {
        status: 'discarded',
        reason: 'Trop loin',
      }).expect(200)
      expect(
        (await get(`/listings/${cheaper}/target-price`).expect(200)).body.rank
      ).toBeNull()
      expect(
        (await get(`/listings/${id}/target-price`).expect(200)).body.rank
      ).toEqual({
        position: 1,
        total: 1,
      })
    })

    it('inconnue ou hors espace : 404', async () => {
      await get(
        '/listings/99999999-9999-4999-8999-999999999999/target-price'
      ).expect(404)
      await get(`/listings/${id}/target-price`, stranger).expect(404)
      await get(`/listings/${id}/negotiation`, stranger).expect(404)
      await post(`/listings/${id}/sensitivity`, {}, stranger).expect(404)
    })
  })

  describe('POST /listings/:id/sensitivity', () => {
    it('grille prix × loyer par défaut, cellule courante repérée, verdict par cellule', async () => {
      const res = await post(`/listings/${id}/sensitivity`, {}).expect(200)
      expect(res.body.rowAxis).toBe('price')
      expect(res.body.colAxis).toBe('rent')
      expect(res.body.rows).toHaveLength(4)
      expect(res.body.cols).toHaveLength(3)
      expect(res.body.current).toEqual({ row: 3, col: 1 })
      const current = res.body.cells[3][1]
      expect(current.isCurrent).toBe(true)
      expect(current.verdict).toBe('off_target')
      expect(current.totalCost).toBe(220_000)
      expect(res.body.cells[0][2].price).toBe(170_000)
      expect(res.body.cells[0][2].grossYield).toBeGreaterThan(
        current.grossYield
      )
    })

    it('lot 9 : coût tout compris par ligne de prix et ligne du prix cible sur demande', async () => {
      const plain = await post(`/listings/${id}/sensitivity`, {}).expect(200)
      expect(
        plain.body.rows.map((r: { totalCost: number }) => r.totalCost)
      ).toEqual([187_750, 198_500, 209_250, 220_000])
      expect(
        plain.body.rows.some((r: { isTarget: boolean }) => r.isTarget)
      ).toBe(false)
      const res = await post(`/listings/${id}/sensitivity`, {
        includeTargetPrice: true,
      }).expect(200)
      expect(res.body.rows).toHaveLength(5)
      const target = res.body.rows[0]
      expect(target.isTarget).toBe(true)
      expect(Math.round(target.value / 100) * 100).toBe(147_600)
      expect(Math.round(target.totalCost)).toBe(163_636)
      expect(res.body.cells[0][1].verdict).toBe('target')
      expect(res.body.current).toEqual({ row: 4, col: 1 })
    })

    it('axes choisis, pas personnalisés, scénario d’hypothèses', async () => {
      const res = await post(`/listings/${id}/sensitivity`, {
        rowAxis: 'downPayment',
        colAxis: 'duration',
        rowSteps: [-40_000, 0, 60_000],
        colSteps: [-5, 0],
        assumptions: { interestRate: 0.03 },
      }).expect(200)
      expect(res.body.rows.map((r: { value: number }) => r.value)).toEqual([
        0, 40_000, 100_000,
      ])
      expect(res.body.cols.map((c: { value: number }) => c.value)).toEqual([
        20, 25,
      ])
      expect(res.body.cells[1][1].interestRate).toBe(0.03)
      expect(res.body.cells[1][1].isCurrent).toBe(true)
    })

    it('refuse deux axes identiques ou un axe inconnu', async () => {
      const same = await post(`/listings/${id}/sensitivity`, {
        rowAxis: 'rent',
        colAxis: 'rent',
      }).expect(400)
      expect(JSON.stringify(same.body)).toContain('différents')
      await post(`/listings/${id}/sensitivity`, { rowAxis: 'tax' }).expect(400)
    })
  })

  describe('historique des prix et brief de négociation', () => {
    it('un changement de prix met le prix à jour, garde l’historique, journalise et nourrit le brief', async () => {
      const stale = await post(`/listings/${id}/price-events`, {
        newPrice: 190_000,
        expectedPrice: 210_000,
      }).expect(409)
      expect(stale.body.message).toContain('prix attendu')
      await post(`/listings/${id}/price-events`, { newPrice: 200_000 }).expect(
        400
      )

      const res = await post(`/listings/${id}/price-events`, {
        newPrice: 190_000,
        expectedPrice: 200_000,
        source: 'listing',
      }).expect(200)
      expect(res.body.listing.price).toBe(190_000)
      expect(res.body.priceEvents).toHaveLength(2)
      expect(res.body.priceEvents[0]).toMatchObject({
        oldPrice: 200_000,
        newPrice: 190_000,
        source: 'listing',
      })
      const events = await get(`/listings/${id}/price-events`).expect(200)
      expect(events.body).toHaveLength(2)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'listing.price_changed' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.before).toEqual({ price: 200_000 })

      const brief = await get(`/listings/${id}/negotiation`).expect(200)
      expect(brief.body.listedPrice).toBe(190_000)
      expect(brief.body.priceDrops).toMatchObject({
        count: 1,
        firstPrice: 200_000,
        totalDrop: 10_000,
      })
      expect(
        brief.body.arguments.map((a: { kind: string }) => a.kind)
      ).toContain('price_drops')
      expect(brief.body.discountClass).toBe('out_of_reach')
    })
  })

  describe('offres', () => {
    it('enregistre une offre, propose « offre faite » sans le forcer, journalise', async () => {
      const res = await post(`/listings/${id}/offers`, {
        amount: 150_000,
        channel: 'email',
        notes: 'Première offre',
      }).expect(201)
      expect(res.body.offer).toMatchObject({
        listingId: id,
        amount: 150_000,
        channel: 'email',
        response: 'pending',
        counterAmount: null,
        respondedAt: null,
        notes: 'Première offre',
      })
      expect(res.body.offers).toHaveLength(1)
      expect(res.body.currentStatus).toBe('to_study')
      expect(res.body.suggestedStatus).toBe('offer_made')
      // Rien n'est forcé : le statut reste « à étudier » tant que le membre ne change rien.
      const listing = await get(`/listings/${id}`).expect(200)
      expect(listing.body.listing.status).toBe('to_study')
      expect(listing.body.offers).toHaveLength(1)
      expect(listing.body.offers[0].id).toBe(res.body.offer.id)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'offer.created' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.after).toMatchObject({
        amount: 150_000,
        channel: 'email',
      })

      const list = await get(`/listings/${id}/offers`, chloe).expect(200)
      expect(list.body).toHaveLength(1)
      await get(`/listings/${id}/offers`, stranger).expect(404)
    })

    it('réponse du vendeur : garde-fou, contre-proposition, acceptation et statut proposé', async () => {
      const created = await post(`/listings/${id}/offers`, {
        amount: 150_000,
      }).expect(201)
      const offerId = created.body.offer.id as string
      const patch = (body: string | object) =>
        request(ctx.server)
          .patch(`/listings/${id}/offers/${offerId}`)
          .set(ctx.auth(chloe))
          .send(body)

      await patch({}).expect(400)
      const stale = await patch({
        response: 'refused',
        expectedResponse: 'accepted',
      }).expect(409)
      expect(stale.body.message).toContain('réponse attendue')
      await patch({ response: 'counter_offer' }).expect(400)

      const counter = await patch({
        response: 'counter_offer',
        counterAmount: 165_000,
        expectedResponse: 'pending',
      }).expect(200)
      expect(counter.body.offer.response).toBe('counter_offer')
      expect(counter.body.offer.counterAmount).toBe(165_000)
      expect(counter.body.offer.respondedAt).not.toBeNull()
      expect(counter.body.suggestedStatus).toBe('offer_made')

      const accepted = await patch({
        response: 'accepted',
        notes: 'Accord oral le 3 novembre',
      }).expect(200)
      expect(accepted.body.offer.notes).toBe('Accord oral le 3 novembre')
      expect(accepted.body.suggestedStatus).toBe('offer_accepted')
      expect(accepted.body.currentStatus).toBe('to_study')

      await post(`/listings/${id}/status`, {
        status: 'offer_accepted',
        expectedStatus: 'to_study',
      }).expect(200)
      const again = await patch({ notes: 'Compromis le 20 novembre' }).expect(
        200
      )
      expect(again.body.suggestedStatus).toBeNull()

      const brief = await get(`/listings/${id}/negotiation`).expect(200)
      expect(brief.body.lastOffer).toMatchObject({
        amount: 150_000,
        response: 'accepted',
      })
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'offer.updated' },
      })
      expect(logs).toHaveLength(3)

      await request(ctx.server)
        .patch(`/listings/${id}/offers/99999999-9999-4999-8999-999999999999`)
        .set(ctx.auth(richard))
        .send({ response: 'refused' })
        .expect(404)
      await request(ctx.server)
        .delete(`/listings/${id}/offers/${offerId}`)
        .set(ctx.auth(richard))
        .expect(404)
    })
  })

  describe('POST /listings/compare', () => {
    it('compare 2 à 6 annonces dans l’ordre demandé avec rangs et meilleure par indicateur', async () => {
      // Moins cher mais plus petit : meilleur brut, prix au m² plus élevé.
      const cheaper = await createListing({
        ...EXAMPLE,
        title: 'T2 moins cher',
        price: 150_000,
        surface: 30,
      })
      const res = await post('/listings/compare', {
        listingIds: [id, cheaper],
      }).expect(200)
      expect(
        res.body.items.map((i: { listing: { id: string } }) => i.listing.id)
      ).toEqual([id, cheaper])
      expect(res.body.items[1].ranks).toMatchObject({
        score: 1,
        grossYield: 1,
        effort: 1,
        discount: 1,
      })
      expect(res.body.items[0].ranks.pricePerM2).toBe(1)
      expect(res.body.best.grossYield).toBe(cheaper)
      expect(res.body.best.pricePerM2).toBe(id)
      expect(res.body.items[0].evaluation.targetPrice.bindingCriterion).toBe(
        'gross_yield'
      )

      await post('/listings/compare', { listingIds: [id] }).expect(400)
      await post('/listings/compare', {
        listingIds: [id, '99999999-9999-4999-8999-999999999999'],
      }).expect(404)
      await post(
        '/listings/compare',
        { listingIds: [id, cheaper] },
        stranger
      ).expect(404)
    })
  })

  describe('hypothèses : garde de version, impact, barème notaire', () => {
    it('refuse une version périmée, rend l’impact, et l’aperçu n’enregistre rien', async () => {
      const current = await get('/assumptions').expect(200)
      const values = current.body.values
      expect(values.notaryMode).toBe('rate')
      expect(values.notaryScale.departmentalRate).toBe(0.05)
      expect(values.targetCriteria).toEqual(['gross_yield', 'effort'])

      const stale = await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          values,
          expectedVersion: '99999999-9999-4999-8999-999999999999',
        })
        .expect(409)
      expect(stale.body.message).toContain('changé depuis')

      const preview = await post('/assumptions/preview', {
        values: { ...values, grossYieldThreshold: 0.04, maxMonthlyEffort: 400 },
      }).expect(200)
      expect(preview.body.total).toBe(1)
      expect(preview.body.changedVerdicts).toBe(1)
      expect(preview.body.changes[0]).toMatchObject({
        listingId: id,
        before: 'off_target',
        after: 'target',
      })
      expect((await get('/assumptions/history').expect(200)).body).toHaveLength(
        1
      )

      const updated = await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          label: 'Cible élargie',
          values: {
            ...values,
            grossYieldThreshold: 0.04,
            maxMonthlyEffort: 400,
          },
          expectedVersion: current.body.id,
        })
        .expect(200)
      expect(updated.body.label).toBe('Cible élargie')
      expect(updated.body.impact.changedVerdicts).toBe(1)
      expect(updated.body.impact.byVerdictAfter.target).toBe(1)
      expect((await get('/assumptions/history').expect(200)).body).toHaveLength(
        2
      )
      const listing = await get(`/listings/${id}`).expect(200)
      expect(listing.body.evaluation.metrics.verdict).toBe('target')
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: 'assumptions.updated' },
      })
      expect(logs).toHaveLength(1)
      expect(
        (logs[0]?.after as { impact: { changedVerdicts: number } }).impact
          .changedVerdicts
      ).toBe(1)
    })

    it('le mode barème renchérit le coût total et abaisse le prix cible ; le mode taux reste la parité', async () => {
      const current = await get('/assumptions').expect(200)
      await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          label: 'Barème Gironde',
          values: { ...current.body.values, notaryMode: 'scale' },
        })
        .expect(200)
      const listing = await get(`/listings/${id}`).expect(200)
      const m = listing.body.evaluation.metrics
      expect(m.notaryFeesDetail.mode).toBe('scale')
      expect(m.notaryFees).toBeGreaterThan(15_000)
      expect(m.notaryFeesDetail.transferTax).toBeCloseTo(200_000 * 0.063185, 2)
      expect(m.totalCost).toBeCloseTo(205_000 + m.notaryFees, 6)
      const report = await get(`/listings/${id}/target-price`).expect(200)
      expect(report.body.notaryFees.mode).toBe('scale')
      expect(report.body.targetPrice.targetPrice).toBeLessThan(147_600)
      // Au prix cible, le brut vaut le seuil : la propriété tient aussi en mode barème.
      const check = await post('/listings/evaluate', {
        listingId: id,
        overrides: { price: report.body.targetPrice.targetPrice },
      }).expect(200)
      expect(check.body.evaluation.metrics.grossYield).toBeCloseTo(0.055, 6)

      const bad = await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          values: {
            ...current.body.values,
            notaryMode: 'scale',
            notaryScale: {
              ...current.body.values.notaryScale,
              emolumentBands: [],
            },
          },
        })
        .expect(400)
      expect(JSON.stringify(bad.body)).toContain('emolumentBands')
    })
  })
})
