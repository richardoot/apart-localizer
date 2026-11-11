/**
 * Lot 6 « confort » de bout en bout sur PostGIS : visites et photos
 * (stockage factice), journal lisible, « ce qui a changé », notifications
 * (cloche, web push et e-mail factices), export CSV et JSON, et les trois
 * outils MCP du lot (add_visit, list_visits, whats_new).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ExportDocumentSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')
const reader = e2eIdentity('richard-reader', { scope: 'listings:read' })

const EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  location: { commune: 'Talence' },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

const JPEG = {
  contentType: 'image/jpeg',
  sizeBytes: 800_000,
  width: 2048,
  height: 1536,
  caption: 'Séjour',
  thumbnail: { contentType: 'image/webp', sizeBytes: 25_000 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

describe('Lot 6 : confort (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let richardId: string
  let chloeId: string
  let rpcId = 1

  const api = () => request(ctx.server)

  async function callTool(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({
        jsonrpc: '2.0',
        id: rpcId++,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    expect(res.status).toBe(200)
    return res.body.result as ToolResult
  }

  function fenced(result: ToolResult): Record<string, unknown> {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    return JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>
  }

  beforeAll(async () => {
    reader.supabaseId = richard.supabaseId
    reader.email = richard.email
    ctx = await createE2eApp([richard, chloe, stranger, reader])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.storage.reset()
    ctx.push.reset()
    ctx.email.reset()
    const workspace = await ctx.prisma.workspace.create({
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
      include: { members: true },
    })
    richardId = workspace.members.find(m => m.handle === 'richard')?.id ?? ''
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(EXAMPLE)
      .expect(201)
    id = res.body.listing.id
  })

  describe('visites', () => {
    it('une visite faite propose « visité » sans changer le statut', async () => {
      const res = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({
          visitedAt: '2026-11-02T17:00:00.000Z',
          participantIds: [richardId, chloeId],
          report: 'Lumineux, cuisine à refaire',
          pros: 'Exposition sud',
          cons: 'Bruit de la rue',
          rating: 4,
        })
        .expect(201)
      expect(res.body.visit).toMatchObject({
        status: 'done',
        rating: 4,
        participantIds: [richardId, chloeId],
        photoCount: 0,
        createdById: richardId,
      })
      expect(res.body.currentStatus).toBe('to_study')
      expect(res.body.suggestedStatus).toBe('visited')
      expect(res.body.createdTask).toBeNull()
      const listing = await api()
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(listing.body.listing.status).toBe('to_study')
    })

    it('une visite planifiée crée « préparer la visite » et propose « à visiter »', async () => {
      const res = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(chloe))
        .send({
          visitedAt: '2026-11-12T17:30:00.000Z',
          status: 'planned',
          createPrepTask: true,
        })
        .expect(201)
      expect(res.body.suggestedStatus).toBe('to_visit')
      expect(res.body.createdTask).toMatchObject({ origin: 'visit' })
      expect(res.body.createdTask.label).toContain(
        'Préparer la visite du 12 novembre 2026 à 18:30'
      )
      expect(res.body.visit.prepTaskId).toBe(res.body.createdTask.id)
      // Passée « faite » : le statut proposé suit.
      const done = await api()
        .patch(`/listings/${id}/visits/${res.body.visit.id}`)
        .set(ctx.auth(chloe))
        .send({
          status: 'done',
          report: 'Vue dégagée',
          expectedUpdatedAt: res.body.visit.updatedAt,
        })
        .expect(200)
      expect(done.body.visit).toMatchObject({
        status: 'done',
        report: 'Vue dégagée',
      })
      expect(done.body.suggestedStatus).toBe('visited')
      // Garde-fou : l'ancienne date de mise à jour ne vaut plus.
      await api()
        .patch(`/listings/${id}/visits/${res.body.visit.id}`)
        .set(ctx.auth(chloe))
        .send({ rating: 2, expectedUpdatedAt: res.body.visit.updatedAt })
        .expect(409)
      const list = await api()
        .get(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(list.body).toHaveLength(1)
    })

    it('refuse un participant étranger à l’espace et une annonce d’un autre espace', async () => {
      await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({
          visitedAt: '2026-11-02T17:00:00.000Z',
          participantIds: ['99999999-9999-4999-8999-999999999999'],
        })
        .expect(400)
      await api()
        .get(`/listings/${id}/visits`)
        .set(ctx.auth(stranger))
        .expect(404)
    })

    it('photos : URL d’envoi signées, vérification à la fin, URL de lecture, suppression par l’auteur', async () => {
      const visit = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({ visitedAt: '2026-11-02T17:00:00.000Z' })
        .expect(201)
      const visitId = visit.body.visit.id as string
      const upload = await api()
        .post(`/listings/${id}/visits/${visitId}/photos`)
        .set(ctx.auth(chloe))
        .send(JPEG)
        .expect(201)
      const workspaceId = (
        await ctx.prisma.workspace.findFirstOrThrow({ select: { id: true } })
      ).id
      expect(upload.body.upload.path).toBe(
        `${workspaceId}/${id}/${visitId}/${upload.body.photo.id}.jpg`
      )
      expect(upload.body.thumbnailUpload.path).toMatch(/-thumb\.webp$/)
      expect(upload.body.upload.signedUrl).toContain(
        'storage.e2e.invalid/upload/'
      )
      expect(upload.body.photo).toMatchObject({ status: 'pending', url: null })
      const photoId = upload.body.photo.id as string
      const complete = `/listings/${id}/visits/${visitId}/photos/${photoId}/complete`
      // Rien n'est encore arrivé dans le stockage.
      await api().post(complete).set(ctx.auth(chloe)).expect(409)
      ctx.storage.put(upload.body.upload.path, 790_000, 'image/jpeg')
      ctx.storage.put(upload.body.thumbnailUpload.path, 24_000, 'image/webp')
      // Seul l'auteur de l'envoi le termine.
      await api().post(complete).set(ctx.auth(richard)).expect(403)
      const ready = await api().post(complete).set(ctx.auth(chloe)).expect(200)
      expect(ready.body).toMatchObject({ status: 'ready', sizeBytes: 790_000 })
      expect(ready.body.url).toContain('/sign/')
      expect(ready.body.thumbnailUrl).toContain('-thumb.webp')
      expect(ready.body.url).toContain('expires=600')
      const list = await api()
        .get(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(list.body[0].photoCount).toBe(1)
      expect(list.body[0].photos[0].thumbnailUrl).toContain('/sign/')
      // Richard ne peut ni supprimer la photo de Chloé, ni la visite qui la porte.
      await api()
        .delete(`/listings/${id}/visits/${visitId}/photos/${photoId}`)
        .set(ctx.auth(richard))
        .expect(403)
      await api()
        .delete(`/listings/${id}/visits/${visitId}`)
        .set(ctx.auth(richard))
        .expect(409)
      await api()
        .delete(`/listings/${id}/visits/${visitId}/photos/${photoId}`)
        .set(ctx.auth(chloe))
        .expect(204)
      expect(ctx.storage.removed).toEqual([
        upload.body.upload.path,
        upload.body.thumbnailUpload.path,
      ])
      await api()
        .delete(`/listings/${id}/visits/${visitId}`)
        .set(ctx.auth(richard))
        .expect(204)
    })

    it('refuse une photo trop lourde ou d’un mauvais type une fois envoyée', async () => {
      const visit = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({ visitedAt: '2026-11-02T17:00:00.000Z' })
        .expect(201)
      const visitId = visit.body.visit.id as string
      await api()
        .post(`/listings/${id}/visits/${visitId}/photos`)
        .set(ctx.auth(richard))
        .send({ ...JPEG, contentType: 'image/gif' })
        .expect(400)
      await api()
        .post(`/listings/${id}/visits/${visitId}/photos`)
        .set(ctx.auth(richard))
        .send({ ...JPEG, sizeBytes: 50 * 1024 * 1024 })
        .expect(400)
      const upload = await api()
        .post(`/listings/${id}/visits/${visitId}/photos`)
        .set(ctx.auth(richard))
        .send(JPEG)
        .expect(201)
      ctx.storage.put(upload.body.upload.path, 30 * 1024 * 1024, 'image/jpeg')
      ctx.storage.put(upload.body.thumbnailUpload.path, 1000, 'text/html')
      const refused = await api()
        .post(
          `/listings/${id}/visits/${visitId}/photos/${upload.body.photo.id}/complete`
        )
        .set(ctx.auth(richard))
        .expect(400)
      expect(refused.body.message).toContain('dépasse la taille permise')
      expect(ctx.storage.objects.size).toBe(0)
      expect(await ctx.prisma.visitPhoto.count()).toBe(0)
    })

    it('le stockage en panne : 503 à l’envoi, les visites restent lisibles', async () => {
      const visit = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({ visitedAt: '2026-11-02T17:00:00.000Z' })
        .expect(201)
      ctx.storage.down = true
      const res = await api()
        .post(`/listings/${id}/visits/${visit.body.visit.id}/photos`)
        .set(ctx.auth(richard))
        .send(JPEG)
        .expect(503)
      expect(res.body.message).toContain('Stockage des photos indisponible')
      expect(await ctx.prisma.visitPhoto.count()).toBe(0)
      await api()
        .get(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .expect(200)
    })
  })

  describe('journal', () => {
    it('lisible par annonce et par espace, filtré par membre, canal et sorte', async () => {
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(chloe))
        .send({ status: 'to_visit' })
        .expect(200)
      await api()
        .patch(`/listings/${id}`)
        .set(ctx.auth(chloe))
        .send({ price: 195_000, surface: 46 })
        .expect(200)
      const page = await api()
        .get(`/listings/${id}/activity`)
        .set(ctx.auth(richard))
        .expect(200)
      const updated = page.body.items.find(
        (e: { action: string }) => e.action === 'listing.updated'
      )
      expect(updated).toMatchObject({
        kind: 'listing',
        channel: 'web',
        channelLabel: 'Web',
        actor: { displayName: 'Chloé', handle: 'chloe' },
        listing: { id, title: 'T2 exemple § 8' },
        summary: "a modifié l'annonce",
      })
      expect(
        updated.changes.map((c: { label: string; after: string }) => [
          c.label,
          c.after.replace(/[\u202f\u00a0]/g, ' '),
        ])
      ).toEqual([
        ['Prix', '195 000 €'],
        ['Surface Carrez', '46 m²'],
      ])
      const status = page.body.items.find(
        (e: { action: string }) => e.action === 'listing.status_changed'
      )
      expect(status.changes[0]).toMatchObject({
        before: 'À étudier',
        after: 'À visiter',
      })
      const byChloe = await api()
        .get(`/activity?memberId=${chloeId}&kind=status`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(byChloe.body.total).toBe(1)
      expect(byChloe.body.items[0].summary).toBe('a changé le statut')
      const mcp = await api()
        .get('/activity?channel=mcp')
        .set(ctx.auth(richard))
        .expect(200)
      expect(mcp.body.total).toBe(0)
      const paged = await api()
        .get('/activity?limit=1&page=2')
        .set(ctx.auth(richard))
        .expect(200)
      expect(paged.body).toMatchObject({ page: 2, limit: 1 })
      expect(paged.body.items).toHaveLength(1)
      expect(paged.body.total).toBeGreaterThan(2)
      const other = await api()
        .get('/activity?kind=other')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        other.body.items.every((e: { kind: string }) => e.kind === 'other')
      ).toBe(true)
      await api()
        .get(`/listings/${id}/activity`)
        .set(ctx.auth(stranger))
        .expect(404)
      const strangerFeed = await api()
        .get('/activity')
        .set(ctx.auth(stranger))
        .expect(200)
      expect(strangerFeed.body.total).toBe(0)
    })
  })

  describe('ce qui a changé', () => {
    it("vu de Richard : l'annonce de Chloé, son avis, le prix et le statut ; « tout marquer comme vu »", async () => {
      // Richard ouvre sa fiche, puis Chloé y change le prix et le statut.
      await api()
        .post(`/listings/${id}/seen`)
        .set(ctx.auth(richard))
        .expect(200)
      await api()
        .post(`/listings/${id}/price-events`)
        .set(ctx.auth(chloe))
        .send({ newPrice: 190_000, source: 'listing' })
        .expect(200)
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(chloe))
        .send({ status: 'to_visit' })
        .expect(200)
      await api()
        .put(`/listings/${id}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 3, text: 'À voir' })
        .expect(200)
      const created = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...EXAMPLE, title: 'T3 de Chloé', price: 230_000 })
        .expect(201)
      const report = await api()
        .get('/whats-new')
        .set(ctx.auth(richard))
        .expect(200)
      expect(report.body.sinceSource).toBe('member_created')
      expect(report.body.counts).toMatchObject({
        new_listing: 1,
        price_change: 1,
        status_change: 1,
        opinion: 1,
      })
      expect(
        report.body.listings.map((l: { title: string }) => l.title)
      ).toEqual(['T3 de Chloé', 'T2 exemple § 8'])
      // La fiche dit ce qui a changé depuis la dernière ouverture, avant d'être marquée vue.
      const changes = await api()
        .get(`/listings/${id}/changes`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(changes.body.changedFields).toEqual(['price', 'status'])
      expect(changes.body.entries.length).toBeGreaterThanOrEqual(3)
      // Pour Chloé, rien sur ses propres actions : seule la fiche de Richard,
      // qu'elle n'a jamais ouverte, est nouvelle (ses changements s'y fondent).
      const forChloe = await api()
        .get('/whats-new')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(forChloe.body.counts.new_listing).toBe(1)
      expect(forChloe.body.items[0].listingTitle).toBe('T2 exemple § 8')
      expect(forChloe.body.counts.price_change).toBe(0)
      expect(forChloe.body.counts.opinion).toBe(0)
      // Une première visite garde le point de départ ; « tout marquer comme vu » le remet à zéro.
      const visit = await api()
        .post('/whats-new/visit')
        .set(ctx.auth(richard))
        .expect(200)
      expect(visit.body.newSession).toBe(true)
      const marked = await api()
        .post('/whats-new/mark-seen')
        .set(ctx.auth(richard))
        .expect(200)
      expect(marked.body.markedListings).toBe(2)
      const after = await api()
        .get('/whats-new')
        .set(ctx.auth(richard))
        .expect(200)
      expect(after.body).toMatchObject({ total: 0, sinceSource: 'marked_seen' })
      const list = await api()
        .get('/listings')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        list.body.items.find(
          (i: { listing: { id: string } }) =>
            i.listing.id === created.body.listing.id
        ).isNewForMe
      ).toBe(false)
      // Une date explicite relit l'historique sans rien marquer.
      const explicit = await api()
        .get('/whats-new?since=2020-01-01T00:00:00.000Z')
        .set(ctx.auth(richard))
        .expect(200)
      expect(explicit.body.sinceSource).toBe('explicit')
    })
  })

  describe('notifications', () => {
    it("cloche, push et e-mail pour l'autre membre ; jamais pour l'auteur", async () => {
      await api()
        .post('/notifications/push/subscriptions')
        .set(ctx.auth(richard))
        .send({
          endpoint: 'https://push.e2e.invalid/richard-phone',
          keys: { p256dh: 'BKey', auth: 'auth' },
          userAgent: 'Android',
        })
        .expect(200)
      await api()
        .post('/notifications/push/subscriptions')
        .set(ctx.auth(richard))
        .send({
          endpoint: 'https://push.e2e.invalid/richard-old',
          keys: { p256dh: 'BKey2', auth: 'auth2' },
        })
        .expect(200)
      ctx.push.failures.set('https://push.e2e.invalid/richard-old', 410)
      ctx.email.enabled = true
      await api()
        .put('/notifications/preferences')
        .set(ctx.auth(richard))
        .send({ listing_created: { email: true } })
        .expect(200)
      const created = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...EXAMPLE, title: 'T3 de Chloé', price: 230_000 })
        .expect(201)
      const bell = await api()
        .get('/notifications')
        .set(ctx.auth(richard))
        .expect(200)
      expect(bell.body.unreadCount).toBe(1)
      expect(bell.body.items[0]).toMatchObject({
        type: 'listing_created',
        title: 'Nouvelle annonce : T3 de Chloé',
        url: `/annonces/${created.body.listing.id}`,
        actorName: 'Chloé',
        readAt: null,
      })
      expect(ctx.push.sent).toHaveLength(1)
      expect(ctx.push.sent[0]).toMatchObject({
        endpoint: 'https://push.e2e.invalid/richard-phone',
        payload: { title: 'Nouvelle annonce : T3 de Chloé' },
      })
      // L'abonnement expiré (410) est retiré.
      expect(
        await ctx.prisma.pushSubscription.count({
          where: { memberId: richardId },
        })
      ).toBe(1)
      expect(ctx.email.sent).toHaveLength(1)
      expect(ctx.email.sent[0]).toMatchObject({
        to: richard.email,
        subject: '[apart-localizer] Nouvelle annonce : T3 de Chloé',
      })
      // Chloé, autrice, n'est prévenue que de l'annonce de Richard.
      const chloeBell = await api()
        .get('/notifications')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(
        chloeBell.body.items.map((n: { title: string }) => n.title)
      ).toEqual(['Nouvelle annonce : T2 exemple § 8'])
      // Ouvrir la fiche lit sa notification.
      await api()
        .post(`/listings/${created.body.listing.id}/seen`)
        .set(ctx.auth(richard))
        .expect(200)
      const read = await api()
        .get('/notifications?unreadOnly=true')
        .set(ctx.auth(richard))
        .expect(200)
      expect(read.body.total).toBe(0)
    })

    it('tâche assignée, statut, réponse à une offre ; préférences et lu / non lu', async () => {
      await api()
        .put('/notifications/preferences')
        .set(ctx.auth(chloe))
        .send({ status_changed: { in_app: false, push: false } })
        .expect(200)
      await api()
        .post(`/listings/${id}/tasks`)
        .set(ctx.auth(richard))
        .send({ label: "Appeler l'agence", assigneeId: chloeId })
        .expect(201)
      await api()
        .post(`/listings/${id}/tasks`)
        .set(ctx.auth(richard))
        .send({ label: 'Pour moi', assigneeId: richardId })
        .expect(201)
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'to_visit' })
        .expect(200)
      const offer = await api()
        .post(`/listings/${id}/offers`)
        .set(ctx.auth(richard))
        .send({ amount: 180_000 })
        .expect(201)
      await api()
        .patch(`/listings/${id}/offers/${offer.body.offer.id}`)
        .set(ctx.auth(richard))
        .send({ response: 'counter_offer', counterAmount: 190_000 })
        .expect(200)
      const bell = await api()
        .get('/notifications')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(bell.body.items.map((n: { type: string }) => n.type)).toEqual([
        'offer_response',
        'task_assigned',
        'listing_created',
      ])
      expect(bell.body.items[1].title).toBe("Tâche pour toi : Appeler l'agence")
      // Le statut n'apparaît pas dans la cloche (préférence), ni en push.
      expect(
        await ctx.prisma.notification.count({
          where: { type: 'status_changed' },
        })
      ).toBe(0)
      const one = await api()
        .post(`/notifications/${bell.body.items[0].id}/read`)
        .set(ctx.auth(chloe))
        .send({})
        .expect(200)
      expect(one.body.readAt).not.toBeNull()
      await api()
        .post(`/notifications/${bell.body.items[0].id}/read`)
        .set(ctx.auth(richard))
        .send({})
        .expect(404)
      const all = await api()
        .post('/notifications/read-all')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(all.body.updated).toBe(2)
      const settings = await api()
        .get('/notifications/settings')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(settings.body).toMatchObject({
        preferences: {
          status_changed: { in_app: false, push: false, email: false },
          task_assigned: { in_app: true, push: true, email: false },
        },
        push: { enabled: true, subscriptions: 0 },
        email: { enabled: false, address: chloe.email },
        inbound: { enabled: false },
      })
      expect(settings.body.push.publicKey).toContain('BE2E')
      expect(settings.body.inbound.path).toMatch(/^\/inbound\/email\//)
      await api()
        .post('/notifications/push/unsubscribe')
        .set(ctx.auth(chloe))
        .send({ endpoint: 'https://push.e2e.invalid/none' })
        .expect(200)
      await api()
        .post('/notifications/push/subscriptions')
        .set(ctx.auth(chloe))
        .send({
          endpoint: 'http://insecure.invalid/x',
          keys: { p256dh: 'a', auth: 'b' },
        })
        .expect(400)
    })
  })

  describe('export', () => {
    it('CSV pour Excel : BOM, « ; », colonnes en français, indicateurs calculés', async () => {
      await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...EXAMPLE, title: 'Écartée; "test"', price: 150_000 })
        .expect(201)
      const res = await api()
        .get('/export?format=csv')
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="apart-localizer-\d{4}-\d{2}-\d{2}\.csv"/
      )
      expect(res.headers['cache-control']).toBe('no-store')
      const text = res.text
      expect(text.charCodeAt(0)).toBe(0xfeff)
      const lines = text.slice(1).trim().split('\r\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toContain('Titre;Statut;Portail;Lien;Commune')
      expect(lines[0]).toContain('Rendement brut (%)')
      const example = lines.find(l => l.startsWith('T2 exemple'))
      expect(example).toContain(';200000;')
      // Rendement brut de l'exemple : 12 × 750 / 220 000 = 4,09 % ; effort
      // négatif écrit en nombre, sans apostrophe.
      expect(example).toContain(';4,09;')
      expect(example).toContain(';-361,92;')
      expect(lines.some(l => l.startsWith('"Écartée; ""test"""'))).toBe(true)
    })

    it('JSON complet et versionné, visites sans photos ; sélection par identifiants', async () => {
      const visit = await api()
        .post(`/listings/${id}/visits`)
        .set(ctx.auth(richard))
        .send({ visitedAt: '2026-11-02T17:00:00.000Z', report: 'Bien' })
        .expect(201)
      const upload = await api()
        .post(`/listings/${id}/visits/${visit.body.visit.id}/photos`)
        .set(ctx.auth(richard))
        .send(JPEG)
        .expect(201)
      ctx.storage.put(upload.body.upload.path, 1000, 'image/jpeg')
      ctx.storage.put(upload.body.thumbnailUpload.path, 100, 'image/webp')
      await api()
        .post(
          `/listings/${id}/visits/${visit.body.visit.id}/photos/${upload.body.photo.id}/complete`
        )
        .set(ctx.auth(richard))
        .expect(200)
      const other = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...EXAMPLE, title: 'Autre' })
        .expect(201)
      const res = await api()
        .get('/export?format=json')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(res.headers['content-type']).toContain('application/json')
      const document = ExportDocumentSchema.parse(JSON.parse(res.text))
      expect(document).toMatchObject({
        format: 'apart-localizer.export',
        version: 1,
        scope: 'workspace',
      })
      expect(document.members.map(m => m.handle)).toEqual(['richard', 'chloe'])
      expect(JSON.stringify(document.members)).not.toContain('@')
      expect(document.listings).toHaveLength(2)
      const exported = document.listings.find(l => l.listing.id === id)
      expect(exported?.visits).toHaveLength(1)
      expect(exported?.visits[0]).toMatchObject({
        report: 'Bien',
        photoCount: 1,
      })
      expect(res.text).not.toContain('storage.e2e.invalid')
      expect(exported?.tasks.length).toBeGreaterThan(0)
      expect(exported?.indicators.metrics.price).toBe(200_000)
      const selection = await api()
        .get(`/export?format=json&scope=selection&ids=${other.body.listing.id}`)
        .set(ctx.auth(chloe))
        .expect(200)
      const chosen = JSON.parse(selection.text) as {
        listings: unknown[]
        scope: string
      }
      expect(chosen.scope).toBe('selection')
      expect(chosen.listings).toHaveLength(1)
      const outsider = await api()
        .get('/export?format=json')
        .set(ctx.auth(stranger))
        .expect(200)
      expect(
        (JSON.parse(outsider.text) as { listings: unknown[] }).listings
      ).toHaveLength(0)
      await api().get('/export?format=xlsx').set(ctx.auth(richard)).expect(400)
      await api().get('/export').expect(401)
    })
  })

  describe('MCP', () => {
    it('lot 26 : GET /activity/claude ne voit Claude qu’à sa première écriture', async () => {
      const read = async (identity: E2eIdentity) =>
        (
          await api()
            .get('/activity/claude')
            .set(ctx.auth(identity))
            .expect(200)
        ).body as {
          usage: { state: string; writes: number; text: string }
          members: { memberId: string; writes: number }[]
        }
      expect((await read(richard)).usage.state).toBe('never')
      // Une lecture par Claude ne laisse pas de trace.
      await callTool(reader, 'list_visits', { listingId: id })
      expect((await read(richard)).usage).toMatchObject({
        state: 'never',
        writes: 0,
      })
      await callTool(richard, 'add_visit', {
        listingId: id,
        visitedAt: '2026-11-12T17:30:00.000Z',
        status: 'planned',
      })
      const mine = await read(richard)
      expect(mine.usage.state).toBe('me')
      expect(mine.usage.writes).toBeGreaterThanOrEqual(1)
      expect(mine.members.map(m => m.memberId)).toEqual([richardId])
      const other = await read(chloe)
      expect(other.usage.state).toBe('workspace')
      expect(other.usage.text).toContain('Richard l’utilise')
      // Un autre espace n'en voit rien.
      const foreign = await read(stranger)
      expect(foreign).toMatchObject({ usage: { state: 'never' }, members: [] })
      await api().get('/activity/claude').expect(401)
    })

    it('add_visit, list_visits et whats_new', async () => {
      const added = await callTool(richard, 'add_visit', {
        listingId: id,
        visitedAt: '2026-11-12T17:30:00.000Z',
        status: 'planned',
        participantHandles: ['richard', 'Chloe'],
        createPrepTask: true,
      })
      expect(added.isError).toBeUndefined()
      expect(added.content[0]?.text).toContain('Statut proposé : « À visiter »')
      expect(added.content[0]?.text).toContain('Préparer la visite')
      const data = fenced(added) as { visit: { participantIds: string[] } }
      expect(data.visit.participantIds).toEqual([richardId, chloeId])
      const unknown = await callTool(richard, 'add_visit', {
        listingId: id,
        visitedAt: '2026-11-12T17:30:00.000Z',
        participantHandles: ['paul'],
      })
      expect(unknown.isError).toBe(true)
      expect(unknown.content[0]?.text).toContain('aucun membre « paul »')
      const denied = await callTool(reader, 'add_visit', {
        listingId: id,
        visitedAt: '2026-11-12T17:30:00.000Z',
      })
      expect(denied.isError).toBe(true)
      expect(denied.content[0]?.text).toContain('listings:write')
      const listed = await callTool(reader, 'list_visits', { listingId: id })
      expect(listed.content[0]?.text).toContain('Planifiée le 12 novembre 2026')
      expect(listed.content[0]?.text).toContain('avec Richard, Chloé')
      // Une visite par Claude est journalisée au canal mcp ; Chloé la voit dans ses nouveautés ? Non : ce n'est pas une sorte suivie.
      const log = await ctx.prisma.activityLog.findFirst({
        where: { action: 'visit.created' },
      })
      expect(log?.channel).toBe('mcp')
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(chloe))
        .send({ status: 'to_visit' })
        .expect(200)
      const news = await callTool(reader, 'whats_new', {})
      expect(news.isError).toBeUndefined()
      expect(news.content[0]?.text).toContain('Changements de statut : 1')
      expect(news.content[0]?.text).toContain(
        'Statut : À étudier → À visiter (Chloé)'
      )
      const quiet = await callTool(reader, 'whats_new', {
        since: new Date(Date.now() + 60_000).toISOString(),
      })
      expect(quiet.content[0]?.text).toContain('Rien de nouveau depuis le')
    })
  })
})
