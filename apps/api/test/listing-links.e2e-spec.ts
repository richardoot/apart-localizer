/**
 * Lot 18 « une annonce, plusieurs portails » de bout en bout sur PostGIS, par
 * le REST : lien d'origine à la création, ajout d'un lien (portail reconnu,
 * URL d'une autre fiche refusée avec son nom), prix par lien et prix de la
 * fiche (le plus bas en ligne, proposé quand il a été saisi à la main),
 * écart noté dans l'Historique, lien plus en ligne sans que l'annonce le
 * soit, retrait (jamais le dernier lien), lien principal recopié, vendeur et
 * référence (un particulier n'en a pas), filtres de la liste, journal,
 * notifications, export. Aucune page de portail n'est téléchargée : les liens
 * sont fictifs (identifiants impossibles `0000000…`, `exemple.invalid`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ExportDocumentSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101'
const SL =
  'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple/0000000202.htm'
const BI =
  'https://www.bienici.com/annonce/vente/bordeaux/appartement/0000000303'
const LISTING = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  url: `${LBC}?utm_source=alerte`,
  externalId: '0000000101',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\u202f\u00a0]/g, ' ') : value

describe('Lot 18 : liens des portails et vendeur (e2e, REST)', () => {
  let ctx: E2eContext
  let id: string
  let chloeId: string
  const api = () => request(ctx.server)

  async function get(listingId = id) {
    return (
      await api()
        .get(`/listings/${listingId}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
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
      include: { members: true },
    })
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = res.body.listing.id
  })

  it('à la création, le lien de l’annonce devient son lien d’origine', async () => {
    const item = await get()
    expect(item.links).toHaveLength(1)
    expect(item.links[0]).toMatchObject({
      portal: 'leboncoin',
      url: `${LBC}?utm_source=alerte`,
      normalizedUrl: 'https://leboncoin.fr/ad/ventes_immobilieres/0000000101',
      externalId: '0000000101',
      price: 214_000,
      online: true,
      primary: true,
      origin: 'original',
    })
    expect(item.listing.sellerType).toBe('unknown')
    const links = await api()
      .get(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(links.body).toMatchObject({
      fichePrice: 214_000,
      lowestOnlinePrice: 214_000,
      priceProposal: null,
      summary: '1 lien · en ligne',
    })
    // Le même lien, autrement écrit, ne fait pas une seconde annonce.
    const again = await api()
      .post('/listings')
      .set(ctx.auth(chloe))
      .send({ ...LISTING, url: LBC.replace('www.', ''), title: 'Copie' })
      .expect(409)
    expect(again.body.message).toContain(
      'Ce lien est déjà celui de l’annonce « [Exemple] T3 68 m², balcon sud »'
    )
  })

  it('ajoute un lien : portail reconnu, prix du lien, écart noté, journal, rien de vérifié sans lecture', async () => {
    const before = await get()
    // Collé sans être ouvert : rien n'est vérifié.
    const pasted = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: BI })
      .expect(200)
    expect(pasted.body.link).toMatchObject({
      portal: 'bienici',
      price: null,
      origin: 'manual',
      primary: false,
    })
    expect(pasted.body.check.outcome).toBe('link_added')
    expect(pasted.body.summary).toBe('Lien Bien’ici ajouté (prix à relever)')
    expect(pasted.body.listing.listing.lastCheckedAt).toBeNull()
    expect(pasted.body.listing.listing.updatedAt).not.toBe(
      before.listing.updatedAt
    )
    // Le même lien sur la même fiche, ou sur une autre : refusé.
    await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: `${BI}/` })
      .expect(409)
    const other = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({ ...LISTING, title: '[Exemple] Autre', url: null, price: 150_000 })
      .expect(201)
    const taken = await api()
      .post(`/listings/${other.body.listing.id}/links`)
      .set(ctx.auth(richard))
      .send({ url: SL.replace('https://www.', 'https://') })
      .expect(200)
    expect(taken.body.link.portal).toBe('seloger')
    const refused = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(chloe))
      .send({ url: SL })
      .expect(409)
    expect(refused.body.message).toContain(
      'Ce lien est déjà celui de l’annonce « [Exemple] Autre »'
    )
    // Lu sur la page (prix plus haut) : l'écart est noté, la fiche ne bouge pas.
    const pap = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({
        url: 'https://www.pap.fr/annonces/appartement-bordeaux-r0000000404',
        price: 219_000,
        online: true,
      })
      .expect(200)
    expect(n(pap.body.summary)).toBe(
      'Lien PAP ajouté : 219 000 € · Écart entre portails : PAP affiche 219 000 €, +5 000 € par rapport à Leboncoin (214 000 €) : frais inclus ?'
    )
    expect(pap.body.listing.listing.price).toBe(214_000)
    expect(pap.body.listing.listing.lastCheckedAt).not.toBeNull()
    const checks = await api()
      .get(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(checks.body.map((c: { outcome: string }) => c.outcome)).toEqual([
      'link_added',
      'link_added',
    ])
    expect(checks.body[0].link.portal).toBe('pap')
    expect(
      checks.body[0].changes.map((c: { field: string }) => c.field)
    ).toEqual(['link', 'priceGap'])
    const journal = await api()
      .get(`/listings/${id}/activity`)
      .query({ kind: 'link' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      journal.body.items.map((e: { summary: string }) => n(e.summary))
    ).toEqual([
      'a ajouté le lien PAP : 219 000 € · Écart entre portails : PAP affiche 219 000 €, +5 000 € par rapport à Leboncoin (214 000 €) : frais inclus ?',
      'a ajouté le lien Bien’ici (prix à relever)',
    ])
    // Un lien collé par un membre ne prévient personne.
    expect(
      await ctx.prisma.notification.count({
        where: { recipientId: chloeId, type: 'listing_checked' },
      })
    ).toBe(0)
  })

  it('le prix de la fiche suit le plus bas en ligne ; saisi à la main, il est proposé', async () => {
    const added = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: SL, price: 219_000, online: true })
      .expect(200)
    const slId = added.body.link.id as string
    // SeLoger baisse sous Leboncoin : le prix de la fiche suit.
    const lower = await api()
      .patch(`/listings/${id}/links/${slId}`)
      .set(ctx.auth(richard))
      .send({ price: 209_000 })
      .expect(200)
    expect(lower.body.listing.listing.price).toBe(209_000)
    expect(lower.body.check.outcome).toBe('changed')
    expect(n(lower.body.summary)).toContain('Prix 214 000 € → 209 000 €')
    const events = await ctx.prisma.priceEvent.findMany({
      where: { listingId: id },
      orderBy: { occurredAt: 'desc' },
    })
    expect(Number(events[0]?.newPrice)).toBe(209_000)
    expect(events[0]?.source).toBe('listing')
    // Un prix saisi à la main ne suit plus les liens sans proposition.
    const manual = await get()
    await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({ price: 200_000, expectedUpdatedAt: manual.listing.updatedAt })
      .expect(200)
    const proposed = await api()
      .patch(`/listings/${id}/links/${slId}`)
      .set(ctx.auth(richard))
      .send({ price: 205_000 })
      .expect(200)
    expect(proposed.body.listing.listing.price).toBe(200_000)
    expect(n(proposed.body.priceProposal.text)).toBe(
      'Prix de la fiche saisi à la main : 200 000 €. Le plus bas affiché en ligne est 205 000 € (SeLoger).'
    )
    expect(
      proposed.body.check.changes.find(
        (c: { field: string }) => c.field === 'price'
      ).disposition
    ).toBe('proposed')
    // Le membre prend le prix en ligne : la fiche suit de nouveau les liens.
    const view = await get()
    await api()
      .post(`/listings/${id}/price-events`)
      .set(ctx.auth(richard))
      .send({ newPrice: 205_000, source: 'listing', expectedPrice: 200_000 })
      .expect(200)
    const followed = await get()
    expect(followed.listing.fieldSources.price.source).toBe('listing')
    expect(
      followed.links.find((l: { id: string }) => l.id === slId).price
    ).toBe(205_000)
    expect(view.listing.price).toBe(200_000)
  })

  it('un lien plus en ligne ne retire pas l’annonce ; tous hors ligne, « Vendu ou retiré » est proposé', async () => {
    const added = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: SL, price: 209_000, online: true })
      .expect(200)
    expect(added.body.listing.listing.price).toBe(209_000)
    const slId = added.body.link.id as string
    const lbcId = added.body.listing.links.find(
      (l: { portal: string }) => l.portal === 'leboncoin'
    ).id as string
    const off = await api()
      .patch(`/listings/${id}/links/${slId}`)
      .set(ctx.auth(richard))
      .send({ online: false })
      .expect(200)
    expect(off.body.check.outcome).toBe('changed')
    expect(off.body.check.suggestedStatus).toBeNull()
    // Le plus bas en ligne n'est plus SeLoger : la fiche remonte.
    expect(off.body.listing.listing.price).toBe(214_000)
    expect(n(off.body.summary)).toContain(
      'Plus en ligne sur SeLoger (toujours en ligne sur Leboncoin)'
    )
    const allOff = await api()
      .patch(`/listings/${id}/links/${lbcId}`)
      .set(ctx.auth(richard))
      .send({ online: false })
      .expect(200)
    expect(allOff.body.check.outcome).toBe('offline')
    expect(allOff.body.check.suggestedStatus).toBe('sold_or_withdrawn')
    expect(allOff.body.listing.listing.status).toBe('to_study')
    // Plus en ligne partout : le lien principal reste le plus ancien.
    expect(allOff.body.listing.listing.url).toBe(`${LBC}?utm_source=alerte`)
    // De nouveau en ligne sur SeLoger : il devient le lien principal.
    const back = await api()
      .patch(`/listings/${id}/links/${slId}`)
      .set(ctx.auth(richard))
      .send({ online: true })
      .expect(200)
    expect(back.body.listing.listing.url).toBe(SL)
    expect(back.body.listing.listing.source).toBe('seloger')
    expect(back.body.listing.listing.externalId).toBeNull()
  })

  it('retire un lien (jamais le dernier) ; vérifie un lien désigné ; refuse un lien consulté qui n’est pas sur la fiche', async () => {
    const only = (await get()).links[0].id as string
    const last = await api()
      .delete(`/listings/${id}/links/${only}`)
      .set(ctx.auth(richard))
      .expect(409)
    expect(last.body.message).toContain('Le dernier lien')
    const added = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: SL, price: 210_000, online: true })
      .expect(200)
    expect(added.body.listing.listing.price).toBe(210_000)
    const fresh = await get()
    const check = await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 208_000, online: true },
        linkId: added.body.link.id,
        expectedUpdatedAt: fresh.listing.updatedAt,
      })
      .expect(200)
    expect(check.body.check.link.portal).toBe('seloger')
    expect(check.body.listing.listing.price).toBe(208_000)
    await api()
      .post(`/listings/${id}/checks`)
      .set(ctx.auth(richard))
      .send({
        observed: { price: 1 },
        checkedUrl: 'https://annonces.exemple.invalid/ailleurs',
        expectedUpdatedAt: check.body.listing.listing.updatedAt,
      })
      .expect(400)
    // Retirer SeLoger : la fiche repart du plus bas des liens restants.
    const removed = await api()
      .delete(`/listings/${id}/links/${added.body.link.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(removed.body.link).toBeNull()
    expect(removed.body.listing.links).toHaveLength(1)
    expect(removed.body.listing.listing.price).toBe(214_000)
    const actions = (
      await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: { startsWith: 'listing_link.' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map(a => a.action)
    expect(actions).toEqual(['listing_link.added', 'listing_link.removed'])
    // Le portail corrigé à la main (un site d'agence reconnu « autre »).
    const agency = await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: 'https://agence.exemple.invalid/annonce/EX-2041' })
      .expect(200)
    expect(agency.body.link.portal).toBe('autre')
    const fixed = await api()
      .patch(`/listings/${id}/links/${agency.body.link.id}`)
      .set(ctx.auth(richard))
      .send({ portal: 'agence', externalId: 'EX-2041' })
      .expect(200)
    expect(fixed.body.link).toMatchObject({
      portal: 'agence',
      externalId: 'EX-2041',
    })
  })

  it('vendeur et référence : un particulier n’en a pas ; filtres de la liste ; export', async () => {
    const item = await get()
    const updated = await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({
        sellerType: 'agency',
        sellerName: '  [Exemple]   Immobilier des Chartrons ',
        sellerReference: 'Réf. EX-2041',
        expectedUpdatedAt: item.listing.updatedAt,
      })
      .expect(200)
    expect(updated.body.listing).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      sellerReferenceKey: 'EX2041',
    })
    expect(updated.body.listing.fieldSources.sellerReference.source).toBe(
      'user'
    )
    await api()
      .post(`/listings/${id}/links`)
      .set(ctx.auth(richard))
      .send({ url: SL, price: 219_000, online: true })
      .expect(200)
    const privateSeller = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...LISTING,
        title: '[Exemple] T3 66 m², balcon et cave',
        url: 'https://www.pap.fr/annonces/appartement-bordeaux-r0000000505',
        sellerType: 'private',
        sellerName: 'Mme [Exemple]',
        sellerReference: 'EX-1',
      })
      .expect(201)
    expect(privateSeller.body.listing).toMatchObject({
      sellerType: 'private',
      sellerName: null,
      sellerReference: null,
    })
    const ids = (body: { items: { listing: { id: string } }[] }) =>
      body.items.map(i => i.listing.id)
    const byReference = await api()
      .get('/listings')
      .query({ search: 'ex 2041' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(ids(byReference.body)).toEqual([id])
    const exact = await api()
      .get('/listings')
      .query({ reference: 'EX2041' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(ids(exact.body)).toEqual([id])
    const sellers = await api()
      .get('/listings')
      .query({ sellerType: 'private,unknown' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(ids(sellers.body)).toEqual([privateSeller.body.listing.id])
    const multi = await api()
      .get('/listings')
      .query({ multiPortal: 'true' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(ids(multi.body)).toEqual([id])
    // Export : les liens dans le JSON (version 1), vendeur et liens en fin de CSV.
    const json = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const document = ExportDocumentSchema.parse(JSON.parse(json.text))
    const exported = document.listings.find(l => l.listing.id === id)
    expect(exported?.links.map(l => l.portal)).toEqual(['leboncoin', 'seloger'])
    expect(exported?.listing.sellerReference).toBe('EX-2041')
    const csv = await api()
      .get('/export?format=csv')
      .set(ctx.auth(richard))
      .expect(200)
    const row = csv.text.split('\r\n').find(line => line.includes('balcon sud'))
    expect(row).toMatch(
      /;Agence;\[Exemple\] Immobilier des Chartrons;EX-2041;Leboncoin : https:\/\/www\.leboncoin\.fr\/[^|]+ \| SeLoger : https:\/\/www\.seloger\.com\/[^;]+;;;$/
    )
  })

  it('un seul nom d’agence : le contact du lot 17 lit et écrit celui de l’annonce', async () => {
    const saved = await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send({
        agencyName: '[Exemple] Agence du port',
        contactName: 'Mme [Exemple]',
      })
      .expect(200)
    expect(saved.body.agencyName).toBe('[Exemple] Agence du port')
    const item = await get()
    expect(item.listing.sellerName).toBe('[Exemple] Agence du port')
    expect(item.listing.fieldSources.sellerName.source).toBe('user')
    // Le nom changé sur la fiche (« Qui la vend ») est celui du contact.
    await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({
        sellerName: '[Exemple] Immobilier des Chartrons',
        expectedUpdatedAt: item.listing.updatedAt,
      })
      .expect(200)
    const contact = await api()
      .get(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(contact.body.contact).toMatchObject({
      agencyName: '[Exemple] Immobilier des Chartrons',
      contactName: 'Mme [Exemple]',
    })
    const row = await ctx.prisma.listingContact.findUniqueOrThrow({
      where: { listingId: id },
    })
    expect(row.agencyName).toBeNull()
  })
})
