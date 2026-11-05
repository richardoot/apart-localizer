/**
 * Alertes e-mail transférées (lot 6, besoin C9) : webhook signé, annonces
 * repérées dans l'e-mail, brouillons « à valider » lus par l'IA (client
 * factice) ou par l'analyseur simple (IA non configurée), doublons signalés,
 * membres prévenus, validation et écartement. Charges fictives seulement.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { fakeParsedMessage, sampleExtraction } from './fixtures/ai-extraction'
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signInboundPayload,
} from '../src/inbound/inbound-signature'

const SECRET = 'e2e-inbound-secret-0123456789abcdefghij'
const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const ALERT = {
  from: 'alertes@exemple.invalid',
  subject: '2 nouvelles annonces pour « T2 Talence »',
  text: [
    'Bonjour,',
    'Appartement 2 pièces 45 m² Talence',
    '189 000 €',
    'https://www.seloger.com/annonces/achat/appartement/talence-33/218765432.htm',
    'T3 Pessac 62 m² 235 000 €',
    'https://www.seloger.com/annonces/achat/appartement/pessac-33/218765999.htm',
    'Se désabonner : https://www.seloger.com/desabonnement?u=123456789',
  ].join('\n'),
}

async function seed(ctx: E2eContext): Promise<string> {
  await ctx.db.truncateAll()
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
          { handle: 'chloe', displayName: 'Chloé', email: chloe.email },
        ],
      },
    },
  })
  return workspace.id
}

function post(
  ctx: E2eContext,
  workspaceId: string,
  body: unknown,
  options: { secret?: string; timestamp?: number } = {}
): request.Test {
  const raw = JSON.stringify(body)
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
  return request(ctx.server)
    .post(`/inbound/email/${workspaceId}`)
    .set('Content-Type', 'application/json')
    .set(TIMESTAMP_HEADER, String(timestamp))
    .set(
      SIGNATURE_HEADER,
      signInboundPayload(options.secret ?? SECRET, timestamp, raw)
    )
    .send(raw)
}

describe('Alertes e-mail entrantes (e2e)', () => {
  describe('avec l’IA', () => {
    let ctx: E2eContext
    let workspaceId: string

    beforeAll(async () => {
      ctx = await createE2eApp([richard, chloe])
    })
    afterAll(async () => {
      delete process.env.INBOUND_EMAIL_SECRET
      await ctx.close()
    })
    beforeEach(async () => {
      process.env.INBOUND_EMAIL_SECRET = SECRET
      workspaceId = await seed(ctx)
      ctx.ai.messages.parse.mockReset()
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction(), { model: 'claude-haiku-5-5' })
      )
    })

    it('refuse un appel non signé, mal signé ou périmé, et se tait sans secret', async () => {
      await request(ctx.server)
        .post(`/inbound/email/${workspaceId}`)
        .send(ALERT)
        .expect(401)
      await post(ctx, workspaceId, ALERT, {
        secret: 'autre-secret-0123456789abcdefghijkl',
      }).expect(401)
      const stale = await post(ctx, workspaceId, ALERT, {
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      }).expect(401)
      expect(stale.body.message).toContain('périmée')
      delete process.env.INBOUND_EMAIL_SECRET
      await post(ctx, workspaceId, ALERT).expect(503)
      expect(await ctx.prisma.listingDraft.count()).toBe(0)
    })

    it('crée un brouillon par annonce, lu par l’IA, doublons signalés, membres prévenus', async () => {
      // Une annonce déjà suivie avec le même lien : doublon signalé.
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Déjà suivie',
          price: 189_000,
          url: 'https://www.seloger.com/annonces/achat/appartement/talence-33/218765432.htm',
          location: { commune: 'Talence' },
        })
        .expect(201)
      const res = await post(ctx, workspaceId, ALERT).expect(202)
      expect(res.body).toMatchObject({
        candidates: 2,
        created: 2,
        skipped: 0,
        extractedBy: 'ai',
      })
      expect(ctx.ai.messages.parse).toHaveBeenCalledTimes(2)
      const drafts = await request(ctx.server)
        .get('/listing-drafts')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(drafts.body).toHaveLength(2)
      const talence = drafts.body.find((d: { url: string }) =>
        d.url.includes('218765432')
      )
      expect(talence).toMatchObject({
        status: 'pending',
        extractedBy: 'ai',
        emailSubject: ALERT.subject,
        listing: { price: 189_000 },
      })
      expect(talence.duplicates[0].title).toBe('Déjà suivie')
      // Chacun est prévenu (action du système).
      const bell = await request(ctx.server)
        .get('/notifications')
        .set(ctx.auth(richard))
        .expect(200)
      expect(bell.body.items[0]).toMatchObject({
        type: 'drafts_received',
        title: '2 annonce(s) reçue(s) par e-mail',
        url: '/annonces?vue=a-valider',
      })
      // La même alerte reçue deux fois ne double pas les brouillons.
      const again = await post(ctx, workspaceId, ALERT).expect(202)
      expect(again.body).toMatchObject({ created: 0, skipped: 2 })
      const log = await ctx.prisma.activityLog.findMany({
        where: { action: 'draft.received' },
      })
      expect(log).toHaveLength(2)
      expect(log[0]?.channel).toBe('system')
    })

    it('valide un brouillon en le liant à l’annonce créée, ou l’écarte', async () => {
      await post(ctx, workspaceId, ALERT).expect(202)
      const drafts = await request(ctx.server)
        .get('/listing-drafts')
        .set(ctx.auth(chloe))
        .expect(200)
      const [first, second] = drafts.body as Array<{
        id: string
        listing: unknown
      }>
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send(first?.listing as object)
        .expect(201)
      await request(ctx.server)
        .patch(`/listing-drafts/${first?.id}`)
        .set(ctx.auth(chloe))
        .send({ status: 'accepted' })
        .expect(400)
      const accepted = await request(ctx.server)
        .patch(`/listing-drafts/${first?.id}`)
        .set(ctx.auth(chloe))
        .send({ status: 'accepted', listingId: created.body.listing.id })
        .expect(200)
      expect(accepted.body).toMatchObject({
        status: 'accepted',
        listingId: created.body.listing.id,
      })
      await request(ctx.server)
        .patch(`/listing-drafts/${first?.id}`)
        .set(ctx.auth(richard))
        .send({ status: 'dismissed' })
        .expect(409)
      await request(ctx.server)
        .patch(`/listing-drafts/${second?.id}`)
        .set(ctx.auth(richard))
        .send({ status: 'dismissed' })
        .expect(200)
      const pending = await request(ctx.server)
        .get('/listing-drafts')
        .set(ctx.auth(richard))
        .expect(200)
      expect(pending.body).toHaveLength(0)
      const dismissed = await request(ctx.server)
        .get('/listing-drafts?status=dismissed')
        .set(ctx.auth(richard))
        .expect(200)
      expect(dismissed.body).toHaveLength(1)
    })

    it('un e-mail sans annonce reconnue ne crée rien ; un espace inconnu répond 404', async () => {
      const res = await post(ctx, workspaceId, {
        subject: 'Newsletter',
        html: '<p>Nos conseils <a href="https://www.seloger.com/aide">aide</a></p>',
      }).expect(202)
      expect(res.body).toMatchObject({ candidates: 0, created: 0 })
      await post(ctx, '99999999-9999-4999-8999-999999999999', ALERT).expect(404)
      await post(ctx, workspaceId, { subject: 'vide' }).expect(400)
    })
  })

  describe('sans IA : analyseur simple', () => {
    let ctx: E2eContext
    let workspaceId: string

    beforeAll(async () => {
      process.env.INBOUND_EMAIL_SECRET = SECRET
      ctx = await createE2eApp([richard, chloe], { ai: false })
    })
    afterAll(async () => {
      delete process.env.INBOUND_EMAIL_SECRET
      await ctx.close()
    })
    beforeEach(async () => {
      process.env.INBOUND_EMAIL_SECRET = SECRET
      workspaceId = await seed(ctx)
    })

    it('lit le lien, le prix, la surface, les pièces et la commune du texte', async () => {
      const res = await post(ctx, workspaceId, {
        subject: 'Alerte Leboncoin',
        html: '<table><tr><td>Bègles T2 40 m² 165 000 € <a href="https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456">Voir</a></td></tr></table>',
      }).expect(202)
      expect(res.body).toMatchObject({ created: 1, extractedBy: 'parser' })
      const [draft] = (
        await request(ctx.server)
          .get('/listing-drafts')
          .set(ctx.auth(richard))
          .expect(200)
      ).body
      expect(draft).toMatchObject({
        extractedBy: 'parser',
        url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
        listing: {
          source: 'leboncoin',
          price: 165_000,
          surface: 40,
          rooms: 2,
          location: { commune: 'Bègles' },
        },
      })
      expect(draft.listing.fieldSources.price).toMatchObject({
        source: 'listing',
        confidence: 0.6,
      })
      expect(draft.warnings[0]).toContain('analyseur simple')
    })
  })
})
