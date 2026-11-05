/**
 * Lot 15 « suivi des mises à jour des annonces » de bout en bout sur
 * PostGIS, par le REST : vérification à blanc (valeurs observées, texte de
 * la page lu par le client IA factice), enregistrement en une transaction
 * (faits, historique des prix, dates, ligne, journal, notifications, « ce
 * qui a changé »), garde-fous optimistes, page inaccessible, plus en ligne
 * (statut proposé, jamais appliqué), file « à revérifier », republication et
 * négociation cumulée, export. Aucune page de portail n'est téléchargée :
 * les liens sont fictifs (`exemple.invalid`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ExportDocumentSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { fakeParsedMessage, sampleExtraction } from './fixtures/ai-extraction'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

const URL_A = 'https://annonces.exemple.invalid/t2-talence-a'
const LISTING = {
  title: 'T2 fictif Talence',
  price: 215_000,
  surface: 45,
  annualCharges: 1_320,
  dpeClass: 'D',
  url: URL_A,
  publishedAt: '2026-10-12T00:00:00.000Z',
  location: { commune: 'Talence' },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\u202f\u00a0]/g, ' ') : value

describe('Lot 15 : vérifications des annonces (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let richardId: string
  let chloeId: string
  const api = () => request(ctx.server)

  async function listing(listingId = id) {
    return (
      await api()
        .get(`/listings/${listingId}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.ai.messages.parse.mockReset()
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
      include: { members: true },
    })
    richardId = workspace.members.find(m => m.handle === 'richard')?.id ?? ''
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = res.body.listing.id
    expect(res.body.listing.lastCheckedAt).toBeNull()
    expect(res.body.lastCheck).toBeNull()
    expect(res.body.republication).toEqual({ from: null, to: null })
  })

  it('vérification à blanc : écarts classés, garde-fous, rien n’est écrit', async () => {
    const before = await listing()
    const res = await api()
      .post(`/listings/${id}/checks/preview`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 205_000, annualCharges: 1_440, online: true },
      })
      .expect(200)
    expect(res.body.persisted).toBe(false)
    expect(res.body.outcome).toBe('changed')
    expect(res.body.problem).toBeNull()
    expect(res.body.applies).toEqual(['price', 'annualCharges'])
    expect(res.body.updatesLastSeenOnline).toBe(true)
    expect(n(res.body.summary)).toBe(
      'Prix 215 000 € → 205 000 € · Charges annuelles 1 320 € → 1 440 €'
    )
    expect(res.body.guards).toEqual({
      expectedUpdatedAt: before.listing.updatedAt,
      expectedPrice: 215_000,
    })
    const after = await listing()
    expect(after.listing.price).toBe(215_000)
    expect(after.listing.updatedAt).toBe(before.listing.updatedAt)
    expect(await ctx.prisma.listingCheck.count()).toBe(0)
    // Une entrée incohérente est signalée, pas refusée.
    const wrong = await api()
      .post(`/listings/${id}/checks/preview`)
      .set(ctx.auth(richard))
      .send({ observed: { price: 205_000 }, outcome: 'unchanged' })
      .expect(200)
    expect(wrong.body.outcome).toBeNull()
    expect(n(wrong.body.problem)).toContain('Prix 215 000 € → 205 000 €')
    await api()
      .post(`/listings/${id}/checks/preview`)
      .set(ctx.auth(richard))
      .send({})
      .expect(400)
  })

  it('vérification à blanc depuis le texte de la page (IA factice, coût signalé)', async () => {
    ctx.ai.messages.parse.mockResolvedValue(
      fakeParsedMessage(
        sampleExtraction({
          price: { value: 199_000, confidence: 0.95, evidence: '199 000 €' },
        })
      )
    )
    const res = await api()
      .post(`/listings/${id}/checks/preview`)
      .set(ctx.auth(richard))
      .send({
        pageText: 'T2 fictif Talence — 199 000 € FAI — 45 m²',
        observed: { online: true },
      })
      .expect(200)
    expect(res.body.observed.price).toBe(199_000)
    expect(res.body.observed.online).toBe(true)
    expect(res.body.observed.description).toBeUndefined()
    expect(res.body.extraction.usage.inputTokens).toBe(3200)
    expect(res.body.changes.map((c: { field: string }) => c.field)).toContain(
      'price'
    )
    expect(ctx.ai.messages.parse).toHaveBeenCalledTimes(1)
  })

  it('enregistre un changement de prix : fiche, historique, dates, ligne, journal, notification, nouveautés', async () => {
    // Chloé a déjà ouvert la fiche : ce qui suit est nouveau pour elle.
    await api().post(`/listings/${id}/seen`).set(ctx.auth(chloe)).expect(200)
    const before = await listing()
    // Garde-fou : une lecture périmée est refusée, rien n'est écrit.
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 205_000 },
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      })
      .expect(409)
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 205_000 },
        expectedUpdatedAt: before.listing.updatedAt,
        expectedPrice: 210_000,
      })
      .expect(409)
    expect(await ctx.prisma.listingCheck.count()).toBe(0)

    const res = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: {
          price: 205_000,
          annualCharges: 1_440,
          sourceUpdatedAt: '2026-11-04',
          online: true,
        },
        evidence:
          'Prix : 205 000 € (baisse). Contact agence : 06 12 34 56 78, agence.fictive@exemple.invalid',
        checkedUrl: URL_A,
        expectedUpdatedAt: before.listing.updatedAt,
        expectedPrice: 215_000,
      })
      .expect(200)
    expect(res.body.check.outcome).toBe('changed')
    expect(res.body.check.channel).toBe('web')
    expect(res.body.check.authorId).toBe(richardId)
    expect(res.body.check.evidence).toBe(
      'Prix : 205 000 € (baisse). Contact agence : [téléphone masqué], [e-mail masqué]'
    )
    expect(res.body.check.checkedUrl).toBe(URL_A)
    expect(res.body.suggestion).toBeNull()
    expect(res.body.listing.listing.price).toBe(205_000)
    expect(res.body.listing.listing.annualCharges).toBe(1_440)
    expect(res.body.listing.listing.sourceUpdatedAt).toBe(
      '2026-11-04T00:00:00.000Z'
    )
    expect(res.body.listing.listing.lastCheckedAt).not.toBeNull()
    expect(res.body.listing.listing.lastSeenOnlineAt).toBe(
      res.body.listing.listing.lastCheckedAt
    )
    expect(res.body.listing.listing.fieldSources.price.source).toBe('listing')
    expect(res.body.listing.lastCheck).toMatchObject({
      outcome: 'changed',
      channel: 'web',
    })
    // L'historique des prix : source « listing », comme record_price_change.
    expect(res.body.listing.priceEvents[0]).toMatchObject({
      oldPrice: 215_000,
      newPrice: 205_000,
      source: 'listing',
    })
    // Le journal : une ligne `listing.checked`, sorte « vérification ».
    const journal = await api()
      .get(`/listings/${id}/activity?kind=check`)
      .set(ctx.auth(chloe))
      .expect(200)
    expect(journal.body.items).toHaveLength(1)
    expect(journal.body.items[0].summary).toBe(
      "a vérifié l'annonce sur le portail : mise à jour"
    )
    expect(
      journal.body.items[0].changes.map((c: { label: string }) => c.label)
    ).toEqual(['Prix', 'Charges annuelles', 'Mise à jour sur le portail'])
    // Chloé est prévenue, vers l'onglet Suivi.
    const notifications = await ctx.prisma.notification.findMany({
      where: { recipientId: chloeId, type: 'listing_checked' },
    })
    expect(
      await ctx.prisma.notification.count({
        where: { recipientId: richardId, type: 'listing_checked' },
      })
    ).toBe(0)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      type: 'listing_checked',
      title: 'Mise à jour : T2 fictif Talence',
      url: `/annonces/${id}?onglet=suivi`,
    })
    // « Ce qui a changé » pour Chloé : un changement de prix.
    const whatsNew = await api()
      .get('/whats-new')
      .set(ctx.auth(chloe))
      .expect(200)
    const item = whatsNew.body.items.find(
      (i: { kind: string }) => i.kind === 'price_change'
    )
    expect(n(item.summary)).toContain(
      'Vérifiée sur le portail par Richard : Prix 215 000 € → 205 000 €'
    )
    // La chronologie de la fiche.
    const checks = await api()
      .get(`/listings/${id}/checks`)
      .set(ctx.auth(chloe))
      .expect(200)
    expect(checks.body).toHaveLength(1)
    expect(checks.body[0].changes[0]).toMatchObject({
      field: 'price',
      disposition: 'applied',
    })
  })

  it('inchangée : datée et vue en ligne, sans « modifier » la fiche ni prévenir personne', async () => {
    const before = await listing()
    const res = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { online: true },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    expect(res.body.check.outcome).toBe('unchanged')
    expect(res.body.check.summary).toBe('Inchangée')
    expect(res.body.listing.listing.updatedAt).toBe(before.listing.updatedAt)
    expect(res.body.listing.listing.lastSeenOnlineAt).not.toBeNull()
    expect(
      await ctx.prisma.notification.count({
        where: { type: 'listing_checked' },
      })
    ).toBe(0)
    const whatsNew = await api()
      .get('/whats-new')
      .set(ctx.auth(chloe))
      .expect(200)
    expect(whatsNew.body.counts.listing_check).toBe(0)
    // Le même garde-fou sert encore : un résultat « changed » sans écart est refusé.
    const refused = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 215_000 },
        outcome: 'changed',
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(400)
    expect(refused.body.message).toContain('unchanged')
  })

  it('plus en ligne : statut proposé, jamais appliqué ; page inaccessible : rien d’appliqué', async () => {
    const before = await listing()
    const offline = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        outcome: 'offline',
        evidence: 'Cette annonce a expiré.',
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    expect(offline.body.check.outcome).toBe('offline')
    expect(offline.body.check.suggestedStatus).toBe('sold_or_withdrawn')
    expect(offline.body.suggestion).toMatchObject({
      listingId: id,
      currentStatus: 'to_study',
      status: 'sold_or_withdrawn',
    })
    expect(offline.body.listing.listing.status).toBe('to_study')
    expect(offline.body.listing.listing.lastSeenOnlineAt).toBeNull()
    expect(offline.body.check.summary).toBe(
      'Plus en ligne : statut proposé « Vendu ou retiré »'
    )
    // Le membre confirme : le statut passe par set_listing_status, à part.
    await api()
      .post(`/listings/${id}/status`)
      .set(ctx.auth(richard))
      .send({ status: 'sold_or_withdrawn', expectedStatus: 'to_study' })
      .expect(200)

    const current = await listing()
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        outcome: 'inaccessible',
        observed: { price: 1 },
        expectedUpdatedAt: current.listing.updatedAt,
      })
      .expect(400)
    const blocked = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        outcome: 'inaccessible',
        checkedUrl: URL_A,
        expectedUpdatedAt: current.listing.updatedAt,
      })
      .expect(200)
    expect(blocked.body.check.summary).toBe('Non vérifiée : page inaccessible')
    expect(blocked.body.check.changes).toEqual([])
    expect(blocked.body.listing.listing.lastCheckedAt).not.toBeNull()
    expect(
      await ctx.prisma.notification.count({
        where: { type: 'listing_checked', recipientId: chloeId },
      })
    ).toBe(1)
  })

  it('file « à revérifier » : staleDays et tri par dernière vérification', async () => {
    const old = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...LISTING,
        title: 'T3 fictif ancien',
        url: null,
        publishedAt: null,
      })
      .expect(201)
    const oldId = old.body.listing.id as string
    const checkedLongAgo = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...LISTING,
        title: 'T1 fictif vérifié',
        url: null,
        publishedAt: null,
      })
      .expect(201)
    const longAgoId = checkedLongAgo.body.listing.id as string
    const day = 86_400_000
    await ctx.prisma.listing.update({
      where: { id: oldId },
      data: { createdAt: new Date(Date.now() - 30 * day) },
    })
    await ctx.prisma.listing.update({
      where: { id: longAgoId },
      data: {
        createdAt: new Date(Date.now() - 60 * day),
        lastCheckedAt: new Date(Date.now() - 10 * day),
      },
    })
    const stale = await api()
      .get('/listings?staleDays=7&sort=lastCheckedAt&order=asc')
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      stale.body.items.map((i: { listing: { id: string } }) => i.listing.id)
    ).toEqual([oldId, longAgoId])
    const fortnight = await api()
      .get('/listings?staleDays=14')
      .set(ctx.auth(richard))
      .expect(200)
    expect(fortnight.body.total).toBe(1)
    const all = await api()
      .get('/listings?sort=lastCheckedAt&order=asc')
      .set(ctx.auth(richard))
      .expect(200)
    expect(all.body.items[all.body.items.length - 1].listing.id).toBe(id)
  })

  it('republication : rattachée à la publication d’origine, négociation cumulée, refus propres', async () => {
    // La publication d'origine, plus ancienne, à 220 000 €.
    const origin = await api()
      .post('/listings')
      .set(ctx.auth(chloe))
      .send({
        ...LISTING,
        title: 'T2 fictif Talence (1re publication)',
        price: 220_000,
        url: 'https://annonces.exemple.invalid/t2-talence-origine',
        publishedAt: '2026-08-02T00:00:00.000Z',
      })
      .expect(201)
    const originId = origin.body.listing.id as string
    const before = await listing()
    const self = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        republishedListingId: id,
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(400)
    expect(self.body.message).toContain('sa propre republication')
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        republishedListingId: '99999999-9999-4999-8999-999999999999',
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(404)

    const res = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { online: true },
        republishedListingId: originId,
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    expect(res.body.check.outcome).toBe('republished')
    expect(res.body.check.linkedListing).toMatchObject({ id: originId })
    expect(res.body.check.summary).toContain(
      'Republication de « T2 fictif Talence (1re publication) »'
    )
    expect(res.body.suggestion).toMatchObject({
      listingId: originId,
      status: 'sold_or_withdrawn',
      currentStatus: 'to_study',
    })
    expect(res.body.listing.listing.republishedFromId).toBe(originId)
    expect(res.body.listing.republication.from).toMatchObject({ id: originId })
    const originAfter = await listing(originId)
    expect(originAfter.republication.to).toMatchObject({ id })
    expect(originAfter.listing.status).toBe('to_study')

    // Le brief de négociation compte depuis la publication d'origine.
    const report = await api()
      .get(`/listings/${id}/target-price`)
      .set(ctx.auth(richard))
      .expect(200)
    const brief = report.body.negotiation
    expect(brief.republication).toMatchObject({
      count: 1,
      firstListingId: originId,
      firstSeenAt: '2026-08-02T00:00:00.000Z',
    })
    expect(brief.daysOnlineSince).toBe('published')
    expect(brief.priceDrops).toMatchObject({
      count: 1,
      firstPrice: 220_000,
      totalDrop: 5_000,
    })
    expect(brief.arguments.map((a: { kind: string }) => a.kind)).toContain(
      'republished'
    )

    // Une troisième annonce ne peut pas reprendre la même publication d'origine.
    const third = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({ ...LISTING, title: 'T2 fictif (troisième)', url: null })
      .expect(201)
    const refused = await api()
      .post(`/listings/${third.body.listing.id}/checks`)
      .set(ctx.auth(richard))
      .send({
        republishedListingId: originId,
        expectedUpdatedAt: third.body.listing.updatedAt,
      })
      .expect(400)
    expect(refused.body.message).toContain('déjà reprise')
    // Rattacher à nouveau la même paire est sans effet.
    const again = await listing()
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        republishedListingId: originId,
        expectedUpdatedAt: again.listing.updatedAt,
      })
      .expect(200)
  })

  it('republiée sous un nouveau lien : le lien de la fiche suit', async () => {
    const before = await listing()
    const res = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        outcome: 'republished',
        observed: {
          url: 'https://annonces.exemple.invalid/t2-talence-a-bis',
          price: 209_000,
        },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    expect(res.body.check.outcome).toBe('republished')
    expect(n(res.body.check.summary)).toBe(
      'Republiée sous un autre lien · Prix 215 000 € → 209 000 € · Lien de l’annonce modifié'
    )
    expect(res.body.listing.listing.url).toBe(
      'https://annonces.exemple.invalid/t2-talence-a-bis'
    )
    expect(res.body.listing.listing.lastSeenOnlineAt).not.toBeNull()
  })

  it('surface changée : le contexte est recalculé ; export CSV et JSON', async () => {
    const before = await listing()
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { surface: 43, rooms: 2 },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    const after = await listing()
    expect(after.listing.surface).toBe(43)
    const csv = await api()
      .get('/export?format=csv')
      .set(ctx.auth(richard))
      .expect(200)
    const [header, row] = csv.text.replace(/^\uFEFF/, '').split('\r\n')
    expect(
      header?.endsWith(
        'Identifiant;Vérifiée le;Vue en ligne le;Dernière vérification'
      )
    ).toBe(true)
    expect(row?.endsWith(';Mise à jour')).toBe(true)
    const json = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const document = ExportDocumentSchema.parse(JSON.parse(json.text))
    expect(document.version).toBe(1)
    expect(document.listings[0]?.checks).toHaveLength(1)
    expect(document.listings[0]?.listing.lastCheckedAt).not.toBeNull()
  })

  it('un autre espace ne lit ni n’écrit rien', async () => {
    await api()
      .get(`/listings/${id}/checks`)
      .set(ctx.auth(stranger))
      .expect(404)
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(stranger))
      .send({ expectedUpdatedAt: '2026-11-05T10:00:00.000Z' })
      .expect(404)
  })
})
