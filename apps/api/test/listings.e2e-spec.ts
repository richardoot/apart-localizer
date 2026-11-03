/**
 * La chaîne complète : contrats → DTO nestjs-zod → service → Prisma →
 * réponse calculée par `domain`, sur un vrai Postgres avec PostGIS.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { DEFAULT_TASKS } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

/** L'exemple chiffré du modèle de calcul (§ 8), sous forme d'annonce. */
const DOC_EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  location: { commune: 'Talence' },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

describe('Listings (e2e)', () => {
  let ctx: E2eContext
  let workspaceId: string

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    // Richard et Chloé sont pré-créés dans un même espace, sans authUserId,
    // comme l'import le fait ; la première requête les rattache par e-mail.
    const workspace = await ctx.prisma.workspace.create({
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
            {
              handle: 'chloe',
              displayName: 'Chloé',
              email: chloe.email.toUpperCase(),
            },
          ],
        },
      },
    })
    workspaceId = workspace.id
  })

  describe('workspace et membres', () => {
    it('rattache un membre pré-importé par e-mail à sa première connexion', async () => {
      const res = await request(ctx.server)
        .get('/workspace')
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.workspace.id).toBe(workspaceId)
      expect(res.body.workspace.name).toBe('Richard et Chloé')
      expect(res.body.me.handle).toBe('richard')
      expect(res.body.me.authUserId).toBe(richard.supabaseId)
      expect(res.body.workspace.members).toHaveLength(2)
      // L'e-mail de Chloé est enregistré en majuscules : le rattachement est insensible à la casse.
      const chloeRes = await request(ctx.server)
        .get('/workspace')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(chloeRes.body.me.handle).toBe('chloe')
      expect(chloeRes.body.workspace.id).toBe(workspaceId)
    })

    it("une identité inconnue reçoit un espace à elle et ne voit rien d'autre", async () => {
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(DOC_EXAMPLE)
        .expect(201)
      const res = await request(ctx.server)
        .get('/workspace')
        .set(ctx.auth(stranger))
        .expect(200)
      expect(res.body.workspace.id).not.toBe(workspaceId)
      expect(res.body.me.role).toBe('owner')
      expect(res.body.me.handle).toBe('stranger')
      const listings = await request(ctx.server)
        .get('/listings')
        .set(ctx.auth(stranger))
        .expect(200)
      expect(listings.body.total).toBe(0)
    })
  })

  describe('hypothèses', () => {
    it("sert les hypothèses de l'artefact par défaut, puis versionne", async () => {
      const first = await request(ctx.server)
        .get('/assumptions')
        .set(ctx.auth(richard))
        .expect(200)
      expect(first.body.values.downPayment).toBe(40_000)
      expect(first.body.values.interestRate).toBe(0.0365)
      expect(first.body.values.grossYieldMargin).toBe(0.007)

      const updated = await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          label: 'Taux négocié',
          values: { ...first.body.values, interestRate: 0.032 },
        })
        .expect(200)
      expect(updated.body.values.interestRate).toBe(0.032)
      expect(updated.body.label).toBe('Taux négocié')

      const history = await request(ctx.server)
        .get('/assumptions/history')
        .set(ctx.auth(richard))
        .expect(200)
      expect(history.body).toHaveLength(2)
      expect(history.body[0].id).toBe(updated.body.id)

      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: 'assumptions.updated' },
      })
      expect(logs).toHaveLength(1)
    })

    it('refuse un taux en pourcentage', async () => {
      const current = await request(ctx.server)
        .get('/assumptions')
        .set(ctx.auth(richard))
        .expect(200)
      const res = await request(ctx.server)
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({ values: { ...current.body.values, interestRate: 3.65 } })
        .expect(400)
      expect(JSON.stringify(res.body)).toContain('interestRate')
    })
  })

  describe('création et calcul', () => {
    it("crée l'exemple § 8 et renvoie les calculs du modèle", async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(DOC_EXAMPLE)
        .expect(201)
      const { listing, evaluation, isNewForMe } = res.body
      expect(listing.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(listing.workspaceId).toBe(workspaceId)
      expect(listing.status).toBe('to_study')
      expect(listing.source).toBe('autre')
      expect(listing.rentalPlan.targetRent).toBe(750)
      expect(listing.rentalPlan.leaseType).toBe('unfurnished')
      expect(listing.location.commune).toBe('Talence')
      expect(listing.location.point).toBeNull()
      expect(isNewForMe).toBe(true)

      const m = evaluation.metrics
      expect(m.notaryFees).toBe(15_000)
      expect(m.totalCost).toBe(220_000)
      expect(m.loanAmount).toBe(180_000)
      expect(Math.round(m.monthlyPayment)).toBe(931)
      expect(m.netOperating).toBe(6825)
      expect(m.propertyTaxEstimated).toBe(true)
      expect(m.grossYield).toBeCloseTo(0.0409, 4)
      expect(Math.round(m.effort)).toBe(-362)
      expect(m.verdict).toBe('off_target')
      expect(evaluation.rental.verdict).toBe('conditional')
      expect(evaluation.targetPrice.bindingCriterion).toBe('gross_yield')
      expect(Math.round(evaluation.targetPrice.targetPrice / 100) * 100).toBe(
        147_600
      )
      expect(evaluation.targetPrice.discountClass).toBe('out_of_reach')
    })

    it('pose la checklist par défaut, un premier événement de prix et une ligne de journal', async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(DOC_EXAMPLE)
        .expect(201)
      const tasks = await ctx.prisma.task.findMany({
        where: { listingId: res.body.listing.id },
        orderBy: { position: 'asc' },
      })
      expect(tasks.map(t => t.label)).toEqual([...DEFAULT_TASKS])
      expect(tasks.every(t => t.origin === 'default' && !t.done)).toBe(true)
      const prices = await ctx.prisma.priceEvent.findMany({
        where: { listingId: res.body.listing.id },
      })
      expect(prices).toHaveLength(1)
      expect(Number(prices[0]?.newPrice)).toBe(200_000)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: res.body.listing.id },
      })
      expect(logs.map(l => l.action)).toEqual(['listing.created'])
      expect(logs[0]?.channel).toBe('web')
    })

    it('enregistre le point géographique par le module geo', async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...DOC_EXAMPLE,
          location: {
            commune: 'Talence',
            addressRaw: '1 rue du Forum',
            point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
            precision: 'exact',
          },
        })
        .expect(201)
      expect(res.body.listing.location.point).toEqual({
        type: 'Point',
        coordinates: [-0.5906, 44.8083],
      })
      expect(res.body.listing.location.precision).toBe('exact')
      const [row] = await ctx.db.query<{ wkt: string }>(
        `SELECT ST_AsText("geom"::geometry) AS wkt FROM "app"."listings" WHERE "id" = $1`,
        [res.body.listing.id]
      )
      expect(row?.wkt).toBe('POINT(-0.5906 44.8083)')
    })

    it('refuse une annonce invalide avec les champs fautifs', async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: '',
          price: -5,
          dpeClass: 'Z',
          location: { point: { type: 'Point', coordinates: [500, 0] } },
        })
        .expect(400)
      const text = JSON.stringify(res.body)
      expect(text).toContain('title')
      expect(text).toContain('price')
      expect(text).toContain('dpeClass')
      expect(text).toContain('coordinates')
    })

    it("applique les travaux et une surcharge d'hypothèses par annonce", async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...DOC_EXAMPLE,
          renovation: {
            active: true,
            level: 'renovation',
            items: [
              { label: 'Peinture', amount: 2500 },
              { label: 'Sols', amount: 2500 },
            ],
          },
          assumptionsOverride: { downPayment: 60_000 },
        })
        .expect(201)
      expect(res.body.evaluation.metrics.renovationTotal).toBe(5000)
      expect(res.body.evaluation.metrics.totalCost).toBe(225_000)
      expect(res.body.evaluation.metrics.loanAmount).toBe(165_000)
      expect(res.body.listing.renovation.items).toHaveLength(2)
      expect(res.body.listing.renovation.items[0].position).toBe(0)
    })
  })

  describe('lecture, mise à jour, statut, vu par', () => {
    let id: string

    beforeEach(async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(DOC_EXAMPLE)
        .expect(201)
      id = res.body.listing.id
    })

    it('liste et filtre, avec le drapeau « nouveau pour moi » par membre', async () => {
      const forChloe = await request(ctx.server)
        .get('/listings')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(forChloe.body.total).toBe(1)
      expect(forChloe.body.items[0].isNewForMe).toBe(true)

      await request(ctx.server)
        .post(`/listings/${id}/seen`)
        .set(ctx.auth(chloe))
        .expect(200)
      const seen = await request(ctx.server)
        .get('/listings?newForMe=true')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(seen.body.total).toBe(0)
      const stillNew = await request(ctx.server)
        .get('/listings?newForMe=true')
        .set(ctx.auth(richard))
        .expect(200)
      expect(stillNew.body.total).toBe(1)

      const byCommune = await request(ctx.server)
        .get('/listings?commune=talence')
        .set(ctx.auth(richard))
        .expect(200)
      expect(byCommune.body.total).toBe(1)
      const other = await request(ctx.server)
        .get('/listings?commune=Pessac')
        .set(ctx.auth(richard))
        .expect(200)
      expect(other.body.total).toBe(0)
      const verdict = await request(ctx.server)
        .get('/listings?verdict=target')
        .set(ctx.auth(richard))
        .expect(200)
      expect(verdict.body.total).toBe(0)
      const bad = await request(ctx.server)
        .get('/listings?status=vendu')
        .set(ctx.auth(richard))
        .expect(400)
      expect(JSON.stringify(bad.body)).toContain('status')
    })

    it('trie par le critère demandé', async () => {
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({ ...DOC_EXAMPLE, title: 'Moins cher', price: 120_000 })
        .expect(201)
      const byPrice = await request(ctx.server)
        .get('/listings?sort=price&order=asc')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        byPrice.body.items.map(
          (i: { listing: { title: string } }) => i.listing.title
        )
      ).toEqual(['Moins cher', 'T2 exemple § 8'])
      const byScore = await request(ctx.server)
        .get('/listings')
        .set(ctx.auth(richard))
        .expect(200)
      expect(byScore.body.items[0].listing.title).toBe('Moins cher')
    })

    it('filtre par point et rayon via PostGIS', async () => {
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...DOC_EXAMPLE,
          title: 'Près du Forum',
          location: {
            commune: 'Talence',
            point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
            precision: 'exact',
          },
        })
        .expect(201)
      const res = await request(ctx.server)
        .get('/listings?lng=-0.5955&lat=44.8077&radius=800')
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.total).toBe(1)
      expect(res.body.items[0].listing.title).toBe('Près du Forum')
      expect(res.body.items[0].distanceMeters).toBeGreaterThan(300)
      expect(res.body.items[0].distanceMeters).toBeLessThan(500)
    })

    it('met à jour partiellement, historise le prix et journalise', async () => {
      const res = await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({ price: 190_000, propertyTax: 900 })
        .expect(200)
      expect(res.body.listing.price).toBe(190_000)
      expect(res.body.listing.title).toBe('T2 exemple § 8')
      expect(res.body.listing.rentalPlan.targetRent).toBe(750)
      expect(res.body.listing.surface).toBe(45)
      expect(res.body.evaluation.metrics.propertyTaxEstimated).toBe(false)
      expect(res.body.evaluation.metrics.propertyTax).toBe(900)
      const prices = await ctx.prisma.priceEvent.findMany({
        where: { listingId: id },
        orderBy: { occurredAt: 'asc' },
      })
      expect(prices.map(p => Number(p.newPrice))).toEqual([200_000, 190_000])
      expect(Number(prices[1]?.oldPrice)).toBe(200_000)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'listing.updated' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.before).toMatchObject({ price: 200_000 })
      expect(logs[0]?.after).toMatchObject({ price: 190_000, propertyTax: 900 })
    })

    it('remplace la phase 2 fournie et laisse les autres champs', async () => {
      const res = await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({
          rentalPlan: {
            targetRent: 800,
            marketRent: 820,
            coOwnershipAllowsRental: 'yes',
          },
        })
        .expect(200)
      expect(res.body.listing.rentalPlan.targetRent).toBe(800)
      expect(res.body.listing.rentalPlan.demand).toBeNull()
      expect(res.body.evaluation.metrics.rent).toBe(800)
      expect(
        res.body.evaluation.rental.checks.find(
          (c: { key: string }) => c.key === 'co_ownership'
        ).level
      ).toBe('ok')
    })

    it('change le statut avec raison et garde-fou optimiste', async () => {
      await request(ctx.server)
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'discarded' })
        .expect(400)
      const conflict = await request(ctx.server)
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'to_visit', expectedStatus: 'visited' })
        .expect(409)
      expect(conflict.body.message).toContain('to_study')
      const ok = await request(ctx.server)
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({
          status: 'discarded',
          reason: 'Trop cher',
          expectedStatus: 'to_study',
        })
        .expect(200)
      expect(ok.body.listing.status).toBe('discarded')
      expect(ok.body.listing.discardReason).toBe('Trop cher')
      expect(ok.body.listing.discardedAt).not.toBeNull()
      // Écartée : hors de la liste par défaut, visible sur demande.
      const active = await request(ctx.server)
        .get('/listings')
        .set(ctx.auth(richard))
        .expect(200)
      expect(active.body.total).toBe(0)
      const discarded = await request(ctx.server)
        .get('/listings?status=discarded')
        .set(ctx.auth(richard))
        .expect(200)
      expect(discarded.body.total).toBe(1)
    })

    it("n'expose pas les annonces d'un autre espace", async () => {
      await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(stranger))
        .expect(404)
      await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(stranger))
        .send({ price: 1 })
        .expect(404)
      await request(ctx.server)
        .get('/listings/not-a-uuid')
        .set(ctx.auth(richard))
        .expect(400)
    })
  })
})
