/**
 * Lot 27 « fusionner les doublons, plusieurs agences, déjà vue » de bout en
 * bout sur PostGIS, par le REST : les annonces ressemblantes classées (une
 * annonce, un brouillon, un texte cherché, écartées comprises), une autre
 * agence enregistrée avec sa référence (à la main, ou lue sur un lien que le
 * membre rattache) et reconnue ensuite comme la même annonce, la fusion de
 * deux fiches (liens, agences, visites, offres, avis, tâches, notes, champs
 * vides, prix le plus bas en ligne), le doublon caché des listes et protégé,
 * l'annulation qui remet tout en place, et « Déjà vue » sur un brouillon.
 * Aucune page de portail n'est téléchargée : liens fictifs (identifiants
 * impossibles `0000000…`), noms « [Exemple] ».
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ListingInputSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101'
const SL =
  'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple/0000000202.htm'
const BI =
  'https://www.bienici.com/annonce/vente/bordeaux/appartement/0000000303'
const PAP = 'https://www.pap.fr/annonces/appartement-bordeaux-r0000000404'
const AGENCY_A = '[Exemple] Immobilier des Chartrons'
const AGENCY_B = '[Exemple] Cabinet Bastide'

const KEPT = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  floor: 2,
  dpeClass: 'C',
  url: LBC,
  sellerType: 'agency',
  sellerName: AGENCY_A,
  sellerReference: 'EX-2041',
  notes: 'Vue de la rue : façade propre.',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}
const DOUBLE = {
  title: '[Exemple] Appartement 3 pièces Caudéran',
  price: 209_000,
  surface: 68,
  rooms: 3,
  floor: 2,
  propertyTax: 1_100,
  annualCharges: 1_500,
  url: SL,
  sellerType: 'agency',
  sellerName: AGENCY_B,
  sellerReference: 'CB-77',
  notes: 'Cave humide d’après l’agent.',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  ignoreDuplicates: true,
}
const OTHER = {
  title: '[Exemple] T2 45 m² Bastide',
  price: 168_000,
  surface: 45,
  rooms: 2,
  dpeClass: 'E',
  url: BI,
  location: { commune: 'Bordeaux', district: 'La Bastide' },
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\u202f\u00a0]/g, ' ') : value

describe('Lot 27 : fusion des doublons, agences multiples, « Déjà vue » (e2e, REST)', () => {
  let ctx: E2eContext
  let workspaceId: string
  let richardId: string
  let chloeId: string
  let keptId: string
  let doubleId: string
  let otherId: string
  const api = () => request(ctx.server)

  const get = async (id: string, who = richard) =>
    (await api().get(`/listings/${id}`).set(ctx.auth(who)).expect(200)).body
  const create = async (body: Record<string, unknown>) =>
    (
      await api()
        .post('/listings')
        .set(ctx.auth(richard))
        .send(body)
        .expect(201)
    ).body.listing.id as string
  const similar = async (query: string) =>
    (
      await api()
        .get(`/listings/similar?${query}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body
  const merge = (keep: string, body: Record<string, unknown>, who = richard) =>
    api().post(`/listings/${keep}/merge`).set(ctx.auth(who)).send(body)

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
    workspaceId = workspace.id
    richardId = workspace.members.find(m => m.handle === 'richard')?.id ?? ''
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    keptId = await create(KEPT)
    doubleId = await create(DOUBLE)
    otherId = await create(OTHER)
  })

  describe('annonces ressemblantes', () => {
    it('classe les annonces de la plus ressemblante à la moins ressemblante, avec pourquoi', async () => {
      const result = await similar(`listingId=${keptId}`)
      expect(result.compared).toBe(2)
      expect(result.items[0]).toMatchObject({
        listingId: doubleId,
        level: 'very_close',
        status: 'to_study',
        sellerName: AGENCY_B,
        sellerReference: 'CB-77',
        linkCount: 1,
      })
      expect(result.items[0].score).toBeGreaterThan(0.9)
      const matches = result.items[0].matches.map((m: { text: string }) =>
        n(m.text)
      )
      expect(matches[0]).toContain('Bordeaux : 68 m² contre 68 m²')
      expect(matches).toContain('Même quartier (Caudéran)')
      expect(matches).toContain('Même nombre de pièces (3)')
      expect(result.items[0].differences).toEqual([])
      // L'autre bien de la même commune n'est pas proposé : trop différent.
      expect(
        result.items.map((i: { listingId: string }) => i.listingId)
      ).not.toContain(otherId)
      expect(n(result.summary)).toBe(
        '1 annonce ressemblante, dont 1 très proche'
      )
    })

    it('un texte cherché trouve une annonce, écartée comprise, et la garde classée', async () => {
      // Écartée (directement : à deux, un écart passe par une proposition).
      await ctx.prisma.listing.update({
        where: { id: otherId },
        data: {
          status: 'discarded',
          discardReason: 'Trop petit',
          discardedAt: new Date(),
        },
      })
      const byText = await similar(`listingId=${keptId}&q=bastide`)
      expect(
        byText.items.map((i: { listingId: string }) => i.listingId)
      ).toEqual([doubleId, otherId])
      expect(byText.items[1]).toMatchObject({
        status: 'discarded',
        level: 'far',
      })
      // Par la référence d'une agence, espaces et tirets ignorés.
      const byReference = await similar('q=cb77')
      expect(
        byReference.items.map((i: { listingId: string }) => i.listingId)
      ).toEqual([doubleId])
      const none = await similar(`listingId=${keptId}&q=introuvable`)
      expect(none.items).toEqual([])
      expect(none.summary).toBe(
        'Aucune annonce suivie ne correspond à « introuvable »'
      )
    })

    it('demande une annonce, un brouillon ou un texte ; ne sort pas de l’espace', async () => {
      await api().get('/listings/similar').set(ctx.auth(richard)).expect(400)
      await api()
        .get('/listings/similar?listingId=11111111-1111-4111-8111-111111111111')
        .set(ctx.auth(richard))
        .expect(404)
    })
  })

  describe('plusieurs agences pour un même bien', () => {
    it('enregistre une autre agence avec sa référence, qui reconnaît ensuite la même annonce', async () => {
      const before = await get(keptId)
      const added = await api()
        .post(`/listings/${keptId}/sellers`)
        .set(ctx.auth(richard))
        .send({
          sellerName: '[Exemple] Agence du Lac',
          sellerReference: 'Réf. AL-900',
          expectedUpdatedAt: before.listing.updatedAt,
        })
        .expect(200)
      expect(added.body.seller).toMatchObject({
        sellerType: 'agency',
        sellerName: '[Exemple] Agence du Lac',
        sellerReference: 'AL-900',
        sellerReferenceKey: 'AL900',
        origin: 'manual',
        addedById: richardId,
      })
      expect(added.body.summary).toBe(
        'Autre agence enregistrée : « [Exemple] Agence du Lac », réf. AL-900'
      )
      const after = await get(keptId)
      expect(after.sellers).toHaveLength(1)
      // L'agence principale n'a pas bougé.
      expect(after.listing).toMatchObject({
        sellerName: AGENCY_A,
        sellerReference: 'EX-2041',
      })
      expect(after.listing.updatedAt).not.toBe(before.listing.updatedAt)

      // La même agence une seconde fois : refusée.
      const again = await api()
        .post(`/listings/${keptId}/sellers`)
        .set(ctx.auth(richard))
        .send({ sellerName: 'Agence du Lac', sellerReference: 'AL 900' })
        .expect(409)
      expect(again.body.message).toContain('Cette agence est déjà sur la fiche')

      // Une annonce lue avec cette agence et cette référence est la même.
      const created = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          title: '[Exemple] Même bien, agence du Lac',
          price: 216_000,
          url: PAP,
          sellerType: 'agency',
          sellerName: '[Exemple] Agence du Lac',
          sellerReference: 'AL-900',
        })
        .expect(409)
      expect(created.body.message).toContain(
        'Même agence et même référence que « [Exemple] T3 68 m², balcon sud »'
      )

      // Le journal le dit ; le retrait aussi (dans l'application seulement).
      const removed = await api()
        .delete(`/listings/${keptId}/sellers/${added.body.seller.id}`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(removed.body.listing.sellers).toEqual([])
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: keptId, action: { startsWith: 'listing.seller' } },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'listing.seller_added',
        'listing.seller_removed',
      ])
      expect(logs[0]?.after).toMatchObject({
        seller: '« [Exemple] Agence du Lac », réf. AL-900',
        origin: 'manual',
      })
    })

    it('refuse une agence et une référence qui sont déjà celles d’une autre annonce : à fusionner', async () => {
      const res = await api()
        .post(`/listings/${keptId}/sellers`)
        .set(ctx.auth(richard))
        .send({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
        .expect(409)
      expect(res.body.message).toContain(
        'déjà celles de l’annonce « [Exemple] Appartement 3 pièces Caudéran »'
      )
      expect(res.body.message).toContain('Fusionne les deux fiches')
      await api()
        .post(`/listings/${keptId}/sellers`)
        .set(ctx.auth(richard))
        .send({})
        .expect(400)
    })

    it('la fiche qui ne sait rien de son vendeur reçoit l’agence comme principale', async () => {
      const res = await api()
        .post(`/listings/${otherId}/sellers`)
        .set(ctx.auth(richard))
        .send({ sellerType: 'mandatary', sellerName: '[Exemple] Réseau Sud' })
        .expect(200)
      expect(res.body.seller).toBeNull()
      expect(res.body.listing.listing).toMatchObject({
        sellerType: 'mandatary',
        sellerName: '[Exemple] Réseau Sud',
      })
      expect(res.body.listing.sellers).toEqual([])
    })

    it('un lien rattaché par un membre enregistre l’autre agence lue sur sa page', async () => {
      const res = await api()
        .post(`/listings/${keptId}/links`)
        .set(ctx.auth(richard))
        .send({
          url: PAP,
          price: 216_000,
          online: true,
          sellerType: 'agency',
          sellerName: '[Exemple] Agence du Lac',
          reference: 'AL-900',
        })
        .expect(200)
      const change = res.body.check.changes.find(
        (c: { field: string }) => c.field === 'otherSeller'
      )
      expect(change).toMatchObject({
        disposition: 'applied',
        text: 'Autre agence enregistrée : « [Exemple] Agence du Lac », réf. AL-900 (même bien, autre mandat)',
      })
      // Plus rien « à vérifier » sur le vendeur : c'est une autre agence.
      expect(
        res.body.check.changes.filter(
          (c: { disposition: string }) => c.disposition === 'proposed'
        )
      ).toEqual([])
      expect(res.body.listing.sellers).toHaveLength(1)
      expect(res.body.listing.sellers[0]).toMatchObject({
        sellerReferenceKey: 'AL900',
        origin: 'link',
      })
      expect(res.body.listing.listing.sellerName).toBe(AGENCY_A)
      // Relu plus tard, ce lien ne propose plus de changer l'agence.
      const link = res.body.link.id
      const checked = await api()
        .post(`/listings/${keptId}/checks`)
        .set(ctx.auth(richard))
        .send({
          observed: {
            online: true,
            sellerName: '[Exemple] Agence du Lac',
            reference: 'AL-900',
          },
          linkId: link,
          expectedUpdatedAt: res.body.listing.listing.updatedAt,
        })
        .expect(200)
      expect(
        checked.body.check.changes.filter((c: { field: string }) =>
          c.field.startsWith('seller')
        )
      ).toEqual([])
    })
  })

  describe('fusion de deux fiches', () => {
    async function withHistory(): Promise<void> {
      await ctx.prisma.visit.create({
        data: {
          listingId: doubleId,
          visitedAt: new Date('2026-11-08T10:00:00.000Z'),
          createdById: chloeId,
        },
      })
      await ctx.prisma.offer.create({
        data: { listingId: doubleId, amount: 198_000, createdById: chloeId },
      })
      // Chloé a un avis sur chaque fiche ; Richard seulement sur le doublon.
      await ctx.prisma.opinion.createMany({
        data: [
          { listingId: keptId, memberId: chloeId, rating: 4 },
          { listingId: doubleId, memberId: chloeId, rating: 2 },
          { listingId: doubleId, memberId: richardId, rating: 3 },
        ],
      })
      await ctx.prisma.task.deleteMany({
        where: { listingId: { in: [keptId, doubleId] } },
      })
      await ctx.prisma.task.createMany({
        data: [
          { listingId: keptId, label: 'Demander la taxe foncière' },
          { listingId: doubleId, label: 'demander la taxe fonciere' },
          { listingId: doubleId, label: 'Vérifier la cave' },
        ],
      })
    }

    it('montre ce que la fusion ferait, sans rien écrire', async () => {
      await withHistory()
      const res = await api()
        .get(`/listings/${keptId}/merge-preview?with=${doubleId}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.refusal).toBeNull()
      expect(res.body.keep).toMatchObject({ id: keptId, links: 1, opinions: 1 })
      expect(res.body.absorb).toMatchObject({
        id: doubleId,
        links: 1,
        visits: 1,
        offers: 1,
        opinions: 2,
      })
      // Le doublon porte plus de suivi : c'est lui qu'il vaudrait mieux garder.
      expect(res.body.suggestedKeepId).toBe(doubleId)
      expect(res.body.suggestionReason).toContain('le plus de suivi')
      expect(res.body.moves).toEqual([
        '1 lien de portail, avec son prix et ses vérifications',
        '1 agence avec sa référence',
        '1 visite et leurs photos',
        '1 offre',
        '1 avis',
        '1 tâche',
        '2 champs vides complétés',
        'ses notes, recopiées à la suite des tiennes',
      ])
      expect(
        res.body.fills.map((f: { field: string }) => f.field).sort()
      ).toEqual(['annualCharges', 'propertyTax'])
      expect(res.body.differences).toEqual([])
      expect(res.body.sellers).toEqual([
        `« ${AGENCY_A} », réf. EX-2041`,
        `« ${AGENCY_B} », réf. CB-77 (reprise de l’autre fiche)`,
      ])
      expect(res.body.leftBehind.join(' ')).toContain('1 avis n’est pas repris')
      expect(res.body.leftBehind.join(' ')).toContain(
        '1 tâche n’est pas reprise'
      )
      // Rien n'a bougé.
      expect((await get(doubleId)).links).toHaveLength(1)
      expect(await ctx.prisma.listingMerge.count()).toBe(0)
    })

    it('fusionne : liens, agences, suivi, champs vides et prix rejoignent la fiche gardée ; le doublon est caché', async () => {
      await withHistory()
      const before = await get(keptId)
      const double = await get(doubleId)
      const res = await merge(keptId, {
        absorbedId: doubleId,
        expectedUpdatedAt: before.listing.updatedAt,
        expectedAbsorbedUpdatedAt: double.listing.updatedAt,
      }).expect(200)
      expect(n(res.body.summary)).toBe(
        'Fusionnée avec « [Exemple] Appartement 3 pièces Caudéran » : 1 lien, 1 agence, 1 visite, 1 offre, 1 avis, 1 tâche, 2 champs complétés, notes recopiées'
      )
      expect(res.body.merge).toMatchObject({
        keptId,
        absorbedId: doubleId,
        mergedById: richardId,
        channel: 'web',
        counts: { links: 1, sellers: 1, visits: 1, offers: 1, opinions: 1 },
      })
      const kept = res.body.listing
      expect(
        kept.links.map((l: { portal: string }) => l.portal).sort()
      ).toEqual(['leboncoin', 'seloger'])
      // Le prix de la fiche suit le plus bas en ligne (lot 18).
      expect(kept.listing.price).toBe(209_000)
      expect(kept.priceEvents[0]).toMatchObject({
        oldPrice: 214_000,
        newPrice: 209_000,
        source: 'listing',
      })
      // L'agence principale reste ; l'autre s'ajoute avec sa référence.
      expect(kept.listing).toMatchObject({
        sellerName: AGENCY_A,
        sellerReference: 'EX-2041',
        url: LBC,
      })
      expect(kept.sellers).toHaveLength(1)
      expect(kept.sellers[0]).toMatchObject({
        sellerName: AGENCY_B,
        sellerReference: 'CB-77',
        sellerReferenceKey: 'CB77',
        origin: 'merge',
      })
      // Champs vides complétés, provenance gardée ; les siens restent.
      expect(kept.listing).toMatchObject({
        propertyTax: 1_100,
        annualCharges: 1_500,
        dpeClass: 'C',
        surface: 68,
      })
      expect(kept.listing.fieldSources.propertyTax).toBeDefined()
      expect(kept.listing.notes).toBe(
        'Vue de la rue : façade propre.\n\n— Notes de « [Exemple] Appartement 3 pièces Caudéran » (fiche fusionnée) —\nCave humide d’après l’agent.'
      )
      expect(kept.offers).toHaveLength(1)
      expect(kept.tasks.map((t: { label: string }) => t.label).sort()).toEqual([
        'Demander la taxe foncière',
        'Vérifier la cave',
      ])
      expect(kept.absorbed).toHaveLength(1)
      expect(kept.absorbed[0].absorbedTitle).toBe(DOUBLE.title)
      expect(
        await ctx.prisma.visit.count({ where: { listingId: keptId } })
      ).toBe(1)
      // Un avis par membre : celui de Chloé sur la fiche gardée reste le sien.
      const opinions = await ctx.prisma.opinion.findMany({
        where: { listingId: keptId },
        orderBy: { rating: 'asc' },
      })
      expect(opinions.map(o => [o.memberId, o.rating])).toEqual([
        [richardId, 3],
        [chloeId, 4],
      ])

      // Le doublon : écarté, lié, sans lien, lisible mais plus dans aucune liste.
      const absorbed = await get(doubleId)
      expect(absorbed.listing).toMatchObject({
        status: 'discarded',
        discardReason:
          'Doublon de « [Exemple] T3 68 m², balcon sud » (fiches fusionnées)',
        url: null,
      })
      expect(absorbed.links).toEqual([])
      expect(absorbed.mergedInto).toMatchObject({
        id: keptId,
        title: KEPT.title,
        mergeId: res.body.merge.id,
      })
      for (const status of ['', '?status=discarded']) {
        const list = await api()
          .get(`/listings${status}`)
          .set(ctx.auth(richard))
          .expect(200)
        expect(
          list.body.items.map((i: { listing: { id: string } }) => i.listing.id)
        ).not.toContain(doubleId)
      }
      // Il n'est plus proposé comme doublon ni comme annonce ressemblante.
      const again = await similar(`listingId=${keptId}&q=caudéran`)
      expect(again.items).toEqual([])

      // Le lien du doublon désigne maintenant la fiche gardée.
      const sameUrl = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ title: 'Copie', price: 209_000, url: SL })
        .expect(409)
      expect(sameUrl.body.message).toContain(
        'Ce lien est déjà celui de l’annonce « [Exemple] T3 68 m², balcon sud »'
      )
      // La référence de l'autre agence aussi.
      const sameReference = await api()
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          title: 'Copie',
          price: 209_000,
          url: PAP,
          sellerType: 'agency',
          sellerName: AGENCY_B,
          sellerReference: 'CB 77',
        })
        .expect(409)
      expect(sameReference.body.message).toContain(
        'Même agence et même référence que « [Exemple] T3 68 m², balcon sud »'
      )

      // Journal des deux côtés ; l'autre membre est prévenu.
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: { in: ['listing.merged', 'listing.absorbed'] } },
        orderBy: { action: 'asc' },
      })
      expect(logs.map(l => [l.action, l.listingId])).toEqual([
        ['listing.absorbed', doubleId],
        ['listing.merged', keptId],
      ])
      expect(logs[1]?.after).toMatchObject({
        absorbedTitle: DOUBLE.title,
        facts: { price: 209_000 },
      })
      const notification = await ctx.prisma.notification.findFirst({
        where: { recipientId: chloeId, listingId: keptId },
        orderBy: { createdAt: 'desc' },
      })
      expect(notification?.title).toBe(
        'Fiches fusionnées : [Exemple] T3 68 m², balcon sud'
      )
    })

    it('protège le doublon fusionné et refuse ce qui ne se fusionne pas', async () => {
      const stale = await merge(keptId, {
        absorbedId: doubleId,
        expectedAbsorbedUpdatedAt: '2020-01-01T00:00:00.000Z',
      }).expect(409)
      expect(stale.body.message).toContain('a changé depuis ta lecture')
      await merge(keptId, { absorbedId: keptId }).expect(400)
      await merge(keptId, {
        absorbedId: '11111111-1111-4111-8111-111111111111',
      }).expect(404)
      await merge(keptId, { absorbedId: doubleId }).expect(200)

      const status = await api()
        .post(`/listings/${doubleId}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'to_study', reason: null })
        .expect(409)
      expect(status.body.message).toContain(
        'Cette fiche a été fusionnée dans « [Exemple] T3 68 m², balcon sud »'
      )
      await api()
        .patch(`/listings/${doubleId}`)
        .set(ctx.auth(richard))
        .send({ notes: 'x' })
        .expect(409)
      const link = await api()
        .post(`/listings/${doubleId}/links`)
        .set(ctx.auth(richard))
        .send({ url: PAP })
        .expect(409)
      expect(link.body.message).toContain('Ajoute le lien à')
      // Ni une seconde fusion du même doublon, ni une fusion dans le doublon.
      const twice = await merge(otherId, { absorbedId: doubleId }).expect(409)
      expect(twice.body.message).toContain(
        'a déjà été fusionnée dans une autre fiche'
      )
      await merge(doubleId, { absorbedId: otherId }).expect(409)
      const preview = await api()
        .get(`/listings/${otherId}/merge-preview?with=${doubleId}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(preview.body.refusal).toContain('a déjà été fusionnée')
    })

    it('annule la fusion : ce qui était venu repart, le doublon retrouve son statut', async () => {
      await withHistory()
      await ctx.prisma.listing.update({
        where: { id: doubleId },
        data: { status: 'to_visit' },
      })
      const merged = await merge(keptId, { absorbedId: doubleId }).expect(200)
      const mergeId = merged.body.merge.id
      // Depuis la fusion : la taxe foncière est corrigée, une tâche ajoutée.
      const kept = await get(keptId)
      await api()
        .patch(`/listings/${keptId}`)
        .set(ctx.auth(richard))
        .send({ propertyTax: 1_250, expectedUpdatedAt: kept.listing.updatedAt })
        .expect(200)
      await api()
        .post(`/listings/${keptId}/tasks`)
        .set(ctx.auth(richard))
        .send({ label: 'Rappeler l’agence' })
        .expect(201)

      const undone = await api()
        .post(`/listing-merges/${mergeId}/undo`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(undone.body.summary).toBe(
        'Fusion annulée : « [Exemple] Appartement 3 pièces Caudéran » redevient une fiche à part'
      )
      const after = undone.body.listing
      expect(after.links.map((l: { portal: string }) => l.portal)).toEqual([
        'leboncoin',
      ])
      expect(after.sellers).toEqual([])
      expect(after.absorbed).toEqual([])
      expect(after.offers).toEqual([])
      // Le prix retrouve le plus bas de ses liens ; le champ retouché reste,
      // celui qui n'a pas bougé se vide ; les notes recopiées s'en vont.
      expect(after.listing).toMatchObject({
        price: 214_000,
        propertyTax: 1_250,
        annualCharges: null,
        notes: 'Vue de la rue : façade propre.',
      })
      expect(after.tasks.map((t: { label: string }) => t.label).sort()).toEqual(
        ['Demander la taxe foncière', 'Rappeler l’agence']
      )

      const restored = await get(doubleId)
      expect(restored.mergedInto).toBeNull()
      expect(restored.listing).toMatchObject({
        status: 'to_visit',
        discardReason: null,
        url: SL,
        price: 209_000,
      })
      expect(restored.links).toHaveLength(1)
      expect(restored.offers).toHaveLength(1)
      expect(
        restored.tasks.map((t: { label: string }) => t.label).sort()
      ).toEqual(['Vérifier la cave', 'demander la taxe fonciere'])
      expect(
        await ctx.prisma.opinion.count({ where: { listingId: doubleId } })
      ).toBe(2)
      expect(
        await ctx.prisma.visit.count({ where: { listingId: doubleId } })
      ).toBe(1)
      const list = await api()
        .get('/listings')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        list.body.items.map((i: { listing: { id: string } }) => i.listing.id)
      ).toContain(doubleId)

      // Une seule fois ; et la fusion se refait.
      await api()
        .post(`/listing-merges/${mergeId}/undo`)
        .set(ctx.auth(richard))
        .expect(409)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: { in: ['listing.unmerged', 'listing.unabsorbed'] } },
      })
      expect(logs).toHaveLength(2)
      await merge(doubleId, { absorbedId: keptId }).expect(200)
      expect((await get(keptId)).mergedInto?.id).toBe(doubleId)
    })

    it('la fiche gardée qui ne savait rien du vendeur reprend l’agence du doublon comme principale', async () => {
      const res = await merge(otherId, { absorbedId: doubleId }).expect(200)
      expect(res.body.listing.listing).toMatchObject({
        sellerType: 'agency',
        sellerName: AGENCY_B,
        sellerReference: 'CB-77',
        sellerReferenceKey: 'CB77',
      })
      expect(res.body.listing.sellers).toEqual([])
      const undone = await api()
        .post(`/listing-merges/${res.body.merge.id}/undo`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(undone.body.listing.listing).toMatchObject({
        sellerType: 'unknown',
        sellerName: null,
        sellerReference: null,
      })
    })
  })

  describe('ce qui n’existe qu’une fois par fiche', () => {
    it('le contact, les travaux et la phase 2 du doublon comblent ceux qui manquent, et repartent à l’annulation', async () => {
      // Le doublon a un contact, des travaux et un loyer visé ; l'autre fiche, rien.
      await ctx.prisma.listingContact.create({
        data: {
          listingId: doubleId,
          workspaceId,
          contactName: '[Exemple] Conseillère',
          email: 'conseillere@exemple.invalid',
        },
      })
      const double = await get(doubleId)
      await api()
        .patch(`/listings/${doubleId}`)
        .set(ctx.auth(richard))
        .send({
          renovation: {
            active: true,
            level: 'refresh',
            items: [{ label: 'Peinture', amount: 3_000 }],
          },
          rentalPlan: { targetRent: 820 },
          expectedUpdatedAt: double.listing.updatedAt,
        })
        .expect(200)
      const merged = await merge(otherId, { absorbedId: doubleId }).expect(200)
      expect(merged.body.listing.listing.rentalPlan).toMatchObject({
        targetRent: 820,
      })
      expect(merged.body.listing.listing.renovation.items).toHaveLength(1)
      expect(
        await ctx.prisma.listingContact.findUnique({
          where: { listingId: otherId },
        })
      ).toMatchObject({ contactName: '[Exemple] Conseillère' })

      const undone = await api()
        .post(`/listing-merges/${merged.body.merge.id}/undo`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(undone.body.listing.listing.rentalPlan).toBeNull()
      expect(undone.body.listing.listing.renovation).toBeNull()
      const restored = await get(doubleId)
      expect(restored.listing.rentalPlan).toMatchObject({ targetRent: 820 })
      expect(restored.listing.renovation.items).toHaveLength(1)
      expect(
        await ctx.prisma.listingContact.count({
          where: { listingId: doubleId },
        })
      ).toBe(1)
    })

    it('la fiche gardée garde les siens quand elle en a déjà', async () => {
      await ctx.prisma.listingContact.createMany({
        data: [
          { listingId: keptId, workspaceId, contactName: '[Exemple] A' },
          { listingId: doubleId, workspaceId, contactName: '[Exemple] B' },
        ],
      })
      const merged = await merge(keptId, { absorbedId: doubleId }).expect(200)
      expect(merged.body.listing.listing.rentalPlan).toMatchObject({
        targetRent: 900,
      })
      expect(
        await ctx.prisma.listingContact.findUnique({
          where: { listingId: keptId },
        })
      ).toMatchObject({ contactName: '[Exemple] A' })
      // Celui du doublon reste sur le doublon.
      expect(
        await ctx.prisma.listingContact.count({
          where: { listingId: doubleId },
        })
      ).toBe(1)
    })
  })

  describe('« Déjà vue » sur un brouillon à valider', () => {
    it('retrouve l’annonce suivie par ressemblance et y rattache le brouillon, autre agence comprise', async () => {
      const input = ListingInputSchema.parse({
        title: '[Exemple] T3 Caudéran, autre agence',
        price: 212_000,
        surface: 67,
        rooms: 3,
        url: PAP,
        sellerType: 'agency',
        sellerName: '[Exemple] Agence du Lac',
        sellerReference: 'AL-900',
        location: { commune: 'Bordeaux', district: 'Caudéran' },
        fieldSources: { price: { source: 'listing' } },
      })
      const draft = await ctx.prisma.listingDraft.create({
        data: {
          workspaceId,
          origin: 'exploration',
          extractedBy: 'claude',
          portal: 'pap',
          url: PAP,
          input,
          // Aucun doublon probable enregistré : c'est le membre qui cherche.
          duplicates: [],
        },
      })
      const found = await similar(`draftId=${draft.id}`)
      expect(
        found.items.map((i: { listingId: string }) => i.listingId)
      ).toEqual([keptId, doubleId])
      expect(found.items[0].level).toBe('very_close')

      const merged = await api()
        .post(`/listing-drafts/${draft.id}/merge`)
        .set(ctx.auth(richard))
        .send({ listingId: keptId })
        .expect(200)
      expect(merged.body).toMatchObject({ status: 'merged', listingId: keptId })
      const kept = await get(keptId)
      expect(kept.links.map((l: { portal: string }) => l.portal)).toContain(
        'pap'
      )
      expect(kept.sellers).toHaveLength(1)
      expect(kept.sellers[0]).toMatchObject({
        sellerName: '[Exemple] Agence du Lac',
        sellerReference: 'AL-900',
        origin: 'link',
      })
      expect(kept.listing.sellerName).toBe(AGENCY_A)
    })
  })
})
