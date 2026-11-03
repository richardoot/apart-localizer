/**
 * Avis, tâches, historique des prix, évaluation sans enregistrement,
 * pagination et garde-fous optimistes : la chaîne complète sur PostGIS.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { DEFAULT_TASKS } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

const EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  location: { commune: 'Talence' },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

describe('Collaboration et garde-fous (e2e)', () => {
  let ctx: E2eContext
  let id: string

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
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(EXAMPLE)
      .expect(201)
    id = res.body.listing.id
  })

  describe('avis', () => {
    it('chaque membre écrit le sien, voit celui de l’autre, et le remplace', async () => {
      const mine = await request(ctx.server)
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(richard))
        .send({ rating: 4, text: 'Bien placé' })
        .expect(200)
      expect(mine.body.rating).toBe(4)
      await request(ctx.server)
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 2, text: 'Trop sombre' })
        .expect(200)
      const again = await request(ctx.server)
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(richard))
        .send({ rating: 5, text: 'Revu : très bien' })
        .expect(200)
      expect(again.body.id).toBe(mine.body.id)

      const detail = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(chloe))
        .expect(200)
      const ratings = detail.body.opinions.map(
        (o: { rating: number }) => o.rating
      )
      expect(ratings.sort()).toEqual([2, 5])
      const list = await request(ctx.server)
        .get(`/listings/${id}/opinions`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(list.body).toHaveLength(2)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: { startsWith: 'opinion.' } },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'opinion.created',
        'opinion.created',
        'opinion.updated',
      ])
      await request(ctx.server)
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(richard))
        .send({ rating: 7 })
        .expect(400)
      await request(ctx.server)
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(stranger))
        .send({ rating: 1 })
        .expect(404)
    })
  })

  describe('tâches', () => {
    it('ajoute, coche, décoche, et ne supprime qu’une tâche saisie à la main', async () => {
      const created = await request(ctx.server)
        .post(`/listings/${id}/tasks`)
        .set(ctx.auth(chloe))
        .send({ label: "Appeler l'agence" })
        .expect(201)
      expect(created.body.origin).toBe('manual')
      expect(created.body.position).toBe(DEFAULT_TASKS.length)
      expect(created.body.done).toBe(false)

      const done = await request(ctx.server)
        .patch(`/listings/${id}/tasks/${created.body.id}`)
        .set(ctx.auth(richard))
        .send({ done: true })
        .expect(200)
      expect(done.body.done).toBe(true)
      expect(done.body.doneAt).not.toBeNull()
      const reopened = await request(ctx.server)
        .patch(`/listings/${id}/tasks/${created.body.id}`)
        .set(ctx.auth(richard))
        .send({ done: false })
        .expect(200)
      expect(reopened.body.doneAt).toBeNull()
      await request(ctx.server)
        .patch(`/listings/${id}/tasks/${created.body.id}`)
        .set(ctx.auth(richard))
        .send({})
        .expect(400)

      const tasks = await request(ctx.server)
        .get(`/listings/${id}/tasks`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(tasks.body).toHaveLength(DEFAULT_TASKS.length + 1)
      const defaultTask = tasks.body[0]
      const refused = await request(ctx.server)
        .delete(`/listings/${id}/tasks/${defaultTask.id}`)
        .set(ctx.auth(richard))
        .expect(400)
      expect(refused.body.message).toContain('saisies à la main')
      await request(ctx.server)
        .delete(`/listings/${id}/tasks/${created.body.id}`)
        .set(ctx.auth(richard))
        .expect(204)
      const after = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(after.body.tasks).toHaveLength(DEFAULT_TASKS.length)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: { startsWith: 'task.' } },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'task.created',
        'task.completed',
        'task.reopened',
        'task.deleted',
      ])
    })

    it("assigne à un membre de l'espace seulement", async () => {
      const me = await request(ctx.server)
        .get('/workspace')
        .set(ctx.auth(richard))
        .expect(200)
      const chloeId = me.body.workspace.members.find(
        (m: { handle: string }) => m.handle === 'chloe'
      ).id
      const task = await request(ctx.server)
        .post(`/listings/${id}/tasks`)
        .set(ctx.auth(richard))
        .send({ label: 'Visiter', assigneeId: chloeId })
        .expect(201)
      expect(task.body.assigneeId).toBe(chloeId)
      await request(ctx.server)
        .post(`/listings/${id}/tasks`)
        .set(ctx.auth(richard))
        .send({
          label: 'x',
          assigneeId: '99999999-9999-4999-8999-999999999999',
        })
        .expect(400)
    })
  })

  describe('historique des prix', () => {
    it('enregistre une baisse, met le prix à jour et refuse un garde-fou faux', async () => {
      const conflict = await request(ctx.server)
        .post(`/listings/${id}/price-events`)
        .set(ctx.auth(richard))
        .send({ newPrice: 185_000, expectedPrice: 210_000 })
        .expect(409)
      expect(conflict.body.message).toContain('200000')
      const ok = await request(ctx.server)
        .post(`/listings/${id}/price-events`)
        .set(ctx.auth(richard))
        .send({
          newPrice: 185_000,
          expectedPrice: 200_000,
          source: 'listing',
          occurredAt: '2026-11-01T09:00:00.000Z',
        })
        .expect(200)
      expect(ok.body.listing.price).toBe(185_000)
      expect(ok.body.evaluation.metrics.price).toBe(185_000)
      expect(ok.body.priceEvents).toHaveLength(2)
      // Daté d'avant la création : l'historique, du plus récent au plus
      // ancien, le place après l'événement de création.
      expect(ok.body.priceEvents[1]).toMatchObject({
        oldPrice: 200_000,
        newPrice: 185_000,
        source: 'listing',
        occurredAt: '2026-11-01T09:00:00.000Z',
      })
      const history = await request(ctx.server)
        .get(`/listings/${id}/price-events`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(history.body.map((e: { newPrice: number }) => e.newPrice)).toEqual(
        [200_000, 185_000]
      )
      const later = await request(ctx.server)
        .post(`/listings/${id}/price-events`)
        .set(ctx.auth(richard))
        .send({ newPrice: 180_000 })
        .expect(200)
      expect(later.body.priceEvents[0]).toMatchObject({
        oldPrice: 185_000,
        newPrice: 180_000,
        source: 'user',
      })
      await request(ctx.server)
        .post(`/listings/${id}/price-events`)
        .set(ctx.auth(richard))
        .send({ newPrice: 180_000 })
        .expect(400)
    })
  })

  describe('mise à jour avec garde-fous et provenance', () => {
    it('refuse quand updatedAt ou le prix attendu ne correspondent plus', async () => {
      const before = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      const stale = await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({ notes: 'x', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })
        .expect(409)
      expect(stale.body.message).toContain('changé depuis')
      await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({ notes: 'x', expectedPrice: 1 })
        .expect(409)
      const ok = await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({
          notes: 'Vu avec Chloé',
          expectedUpdatedAt: before.body.listing.updatedAt,
          expectedPrice: 200_000,
        })
        .expect(200)
      expect(ok.body.listing.notes).toBe('Vu avec Chloé')
      expect(ok.body.listing.fieldSources.notes.source).toBe('user')
      expect(ok.body.listing.fieldSources.price.source).toBe('user')
      await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({})
        .expect(400)
    })
  })

  describe('évaluation sans enregistrement', () => {
    it('évalue une annonce hypothétique et une annonce existante surchargée', async () => {
      const hypothetical = await request(ctx.server)
        .post('/listings/evaluate')
        .set(ctx.auth(richard))
        .send({
          listing: {
            price: 200_000,
            surface: 45,
            furnitureValue: 5000,
            location: { commune: 'Talence' },
            rentalPlan: { targetRent: 750 },
          },
        })
        .expect(200)
      expect(hypothetical.body.persisted).toBe(false)
      expect(hypothetical.body.evaluation.metrics.totalCost).toBe(220_000)
      expect(hypothetical.body.listing.title).toBe('Annonce hypothétique')

      const scenario = await request(ctx.server)
        .post('/listings/evaluate')
        .set(ctx.auth(richard))
        .send({
          listingId: id,
          overrides: { price: 150_000 },
          assumptions: { interestRate: 0.03 },
        })
        .expect(200)
      expect(scenario.body.listing.price).toBe(150_000)
      expect(scenario.body.listing.surface).toBe(45)
      expect(scenario.body.assumptions.interestRate).toBe(0.03)
      expect(scenario.body.assumptions.downPayment).toBe(40_000)
      expect(scenario.body.evaluation.metrics.grossYield).toBeGreaterThan(
        hypothetical.body.evaluation.metrics.grossYield
      )
      const unchanged = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(unchanged.body.listing.price).toBe(200_000)
      await request(ctx.server)
        .post('/listings/evaluate')
        .set(ctx.auth(richard))
        .send({})
        .expect(400)
      await request(ctx.server)
        .post('/listings/evaluate')
        .set(ctx.auth(stranger))
        .send({ listingId: id })
        .expect(404)
    })
  })

  describe('liste : bornes et pagination', () => {
    beforeEach(async () => {
      for (const [i, price] of [120_000, 160_000, 240_000].entries()) {
        await request(ctx.server)
          .post('/listings')
          .set(ctx.auth(richard))
          .send({
            ...EXAMPLE,
            title: `Annonce ${i}`,
            price,
            surface: 30 + i * 10,
            rooms: 1 + i,
          })
          .expect(201)
      }
    })

    it('filtre par prix, surface et pièces en base', async () => {
      const byPrice = await request(ctx.server)
        .get('/listings?priceMin=150000&priceMax=210000&sort=price&order=asc')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        byPrice.body.items.map(
          (i: { listing: { price: number } }) => i.listing.price
        )
      ).toEqual([160_000, 200_000])
      const bySurface = await request(ctx.server)
        .get('/listings?surfaceMax=40')
        .set(ctx.auth(richard))
        .expect(200)
      expect(bySurface.body.total).toBe(2)
      const byRooms = await request(ctx.server)
        .get('/listings?roomsMin=3')
        .set(ctx.auth(richard))
        .expect(200)
      expect(byRooms.body.total).toBe(1)
    })

    it('pagine après tri et renvoie le compte total', async () => {
      const first = await request(ctx.server)
        .get('/listings?sort=price&order=asc&limit=2&page=1')
        .set(ctx.auth(richard))
        .expect(200)
      expect(first.body).toMatchObject({
        total: 4,
        page: 1,
        limit: 2,
        pageCount: 2,
      })
      expect(
        first.body.items.map(
          (i: { listing: { price: number } }) => i.listing.price
        )
      ).toEqual([120_000, 160_000])
      const second = await request(ctx.server)
        .get('/listings?sort=price&order=asc&limit=2&page=2')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        second.body.items.map(
          (i: { listing: { price: number } }) => i.listing.price
        )
      ).toEqual([200_000, 240_000])
      const beyond = await request(ctx.server)
        .get('/listings?limit=2&page=9')
        .set(ctx.auth(richard))
        .expect(200)
      expect(beyond.body.items).toEqual([])
      expect(beyond.body.total).toBe(4)
      await request(ctx.server)
        .get('/listings?limit=999')
        .set(ctx.auth(richard))
        .expect(400)
    })
  })
})
