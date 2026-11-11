/**
 * Lot 8 : invitations par e-mail, rôles, retrait, sur PostGIS. Rattachement
 * à la première connexion (e-mail vérifié seulement), expiration,
 * annulation, retrait (accès coupé au REST et au MCP, historique gardé),
 * dernier propriétaire, personne déjà inscrite qui rejoint ou refuse,
 * isolation entre espaces, membres importés sans invitation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { MAX_PENDING_INVITATIONS } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const lea = e2eIdentity('lea')
const sam = e2eIdentity('sam')
const max = e2eIdentity('max')
const stranger = e2eIdentity('stranger')
/** Une identité dont le fournisseur n'a pas vérifié l'adresse de Léa. */
const leaUnverified = e2eIdentity('lea-unverified', {
  email: lea.email,
  emailVerified: false,
})

const DAY = 24 * 3600 * 1000

describe('Invitations, rôles et retrait (e2e)', () => {
  let ctx: E2eContext
  let workspaceId: string
  let listingId: string
  let nextRpc = 1

  beforeAll(async () => {
    ctx = await createE2eApp([
      richard,
      chloe,
      lea,
      sam,
      max,
      stranger,
      leaUnverified,
    ])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.email.reset()
    leaUnverified.emailVerified = false
    // L'espace de l'import : Richard et Chloé pré-créés, sans invitation.
    const workspace = await ctx.prisma.workspace.create({
      data: {
        name: 'Appartement Bordeaux',
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email.toUpperCase(),
              role: 'owner',
            },
            { handle: 'chloe', displayName: 'Chloé', email: chloe.email },
          ],
        },
      },
    })
    workspaceId = workspace.id
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({ title: 'T2 Chartrons', price: 200_000, surface: 45 })
      .expect(201)
    listingId = created.body.listing.id
  })

  const get = (identity: E2eIdentity, path: string) =>
    request(ctx.server).get(path).set(ctx.auth(identity))
  const post = (identity: E2eIdentity, path: string, body?: object) =>
    request(ctx.server)
      .post(path)
      .set(ctx.auth(identity))
      .send(body ?? {})
  const patch = (identity: E2eIdentity, path: string, body: object) =>
    request(ctx.server).patch(path).set(ctx.auth(identity)).send(body)

  const invite = (identity: E2eIdentity, email: string, displayName: string) =>
    post(identity, '/workspace/invitations', { email, displayName })

  async function workspaceOf(identity: E2eIdentity) {
    const res = await get(identity, '/workspace').expect(200)
    return res.body as {
      workspace: {
        id: string
        name: string
        members: Array<{
          id: string
          handle: string
          displayName: string
          role: string
          status: string
          authUserId: string | null
          removedAt: string | null
        }>
        invitations: Array<{ id: string; email: string; state: string }>
      }
      me: { id: string; role: string; status: string; workspaceId: string }
    }
  }

  async function mcpListings(identity: E2eIdentity): Promise<number> {
    const res = await request(ctx.server)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({
        jsonrpc: '2.0',
        id: nextRpc++,
        method: 'tools/call',
        params: { name: 'list_listings', arguments: {} },
      })
    expect(res.status).toBe(200)
    const result = res.body.result as {
      structuredContent: { total: number }
    }
    return result.structuredContent.total
  }

  describe('rattachement', () => {
    it('Richard invite une troisième adresse ; Léa se connecte et arrive dans l’espace partagé', async () => {
      await post(chloe, `/listings/${listingId}/tasks`, {
        label: 'Appeler le syndic',
      }).expect(201)
      await request(ctx.server)
        .put(`/listings/${listingId}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 4, text: 'Lumineux' })
        .expect(200)

      const sent = await invite(richard, '  Lea@E2E.invalid ', ' Léa ').expect(
        201
      )
      expect(sent.body.renewed).toBe(false)
      expect(sent.body.invitation).toMatchObject({
        email: lea.email,
        displayName: 'Léa',
        state: 'pending',
        invitedBy: { displayName: 'Richard' },
        closedAt: null,
      })
      const expires = new Date(sent.body.invitation.expiresAt).getTime()
      expect(Math.abs(expires - Date.now() - 14 * DAY)).toBeLessThan(60_000)
      // Sans envoi configuré : le lien à transmettre soi-même.
      expect(sent.body.delivery).toEqual({
        email: 'disabled',
        link: 'http://localhost:5173/login',
      })
      const owner = await workspaceOf(richard)
      expect(owner.workspace.invitations).toHaveLength(1)
      expect(owner.workspace.members.map(m => m.handle).sort()).toEqual([
        'chloe',
        'richard',
      ])

      // Première connexion de Léa : rattachée, pas d'espace à elle.
      const joined = await workspaceOf(lea)
      expect(joined.workspace.id).toBe(workspaceId)
      expect(joined.me).toMatchObject({ role: 'member', status: 'active' })
      expect(joined.workspace.invitations).toHaveLength(0)
      expect(await ctx.prisma.workspace.count()).toBe(1)

      const listings = await get(lea, '/listings').expect(200)
      expect(listings.body.total).toBe(1)
      const detail = await get(lea, `/listings/${listingId}`).expect(200)
      // Lot 20 : Léa n'a pas encore noté ; l'avis de Chloé lui est masqué
      // (avis à l'aveugle), seulement compté.
      expect(detail.body.opinions).toHaveLength(0)
      expect(
        detail.body.opinionSummary.members.find(
          (m: { displayName: string }) => m.displayName === 'Chloé'
        )?.state
      ).toBe('masked')
      expect(
        detail.body.tasks.some(
          (t: { label: string }) => t.label === 'Appeler le syndic'
        )
      ).toBe(true)
      expect(await mcpListings(lea)).toBe(1)

      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: { startsWith: 'member.' } },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'member.joined', // Richard, pré-créé (première requête)
        'member.joined', // Chloé
        'member.invited',
        'member.joined', // Léa, par l'invitation
      ])
      expect(logs[3]?.after).toMatchObject({ via: 'invitation' })

      // Le propriétaire est prévenu, pas Chloé (membre), ni Léa elle-même.
      const notifications = await ctx.prisma.notification.findMany({
        where: { type: 'member_joined' },
        include: { recipient: true },
      })
      expect(
        notifications
          .filter(n => n.actorName === 'Léa')
          .map(n => n.recipient.handle)
      ).toEqual(['richard'])
      const bell = await get(richard, '/notifications').expect(200)
      expect(
        bell.body.items.some(
          (n: { title: string; url: string }) =>
            n.title === "Léa a rejoint l'espace" && n.url === '/espace'
        )
      ).toBe(true)

      const journal = await get(richard, '/activity?kind=member').expect(200)
      expect(
        journal.body.items.map((e: { summary: string }) => e.summary)
      ).toContain("a rejoint l'espace (invitation acceptée)")
    })

    it("envoie l'e-mail d'invitation si l'envoi est configuré, sinon rend le lien", async () => {
      ctx.email.enabled = true
      const sent = await invite(richard, lea.email, 'Léa').expect(201)
      expect(sent.body.delivery.email).toBe('sent')
      expect(ctx.email.sent).toHaveLength(1)
      expect(ctx.email.sent[0]).toMatchObject({
        to: lea.email,
        subject:
          'Richard t’invite dans « Appartement Bordeaux » (apart-localizer)',
      })
      expect(ctx.email.sent[0]?.text).toContain('http://localhost:5173/login')
      ctx.email.failing = true
      const failed = await invite(richard, sam.email, 'Sam').expect(201)
      expect(failed.body.delivery.email).toBe('failed')
      expect(failed.body.invitation.state).toBe('pending')
    })

    it('membres importés sans invitation : toujours rattachés par e-mail (casse ignorée), jamais avec une adresse non vérifiée', async () => {
      const imported = await ctx.prisma.member.findFirstOrThrow({
        where: { workspaceId, handle: 'richard' },
      })
      expect(imported.invitedAt).toBeNull()
      expect(imported.authUserId).toBe(richard.supabaseId)
      expect(imported.joinedAt).not.toBeNull()

      // Une invitée importée à l'avance (sans invitation) dont l'adresse
      // n'est pas vérifiée : pas de rattachement, un espace à elle.
      await ctx.prisma.member.create({
        data: {
          workspaceId,
          handle: 'lea',
          displayName: 'Léa',
          email: lea.email,
        },
      })
      const own = await workspaceOf(leaUnverified)
      expect(own.workspace.id).not.toBe(workspaceId)
      expect(own.workspace.name).toBe('Mon espace')
      expect(own.me.role).toBe('owner')
      const stillFree = await ctx.prisma.member.findFirstOrThrow({
        where: { workspaceId, handle: 'lea' },
      })
      expect(stillFree.authUserId).toBeNull()
      // Avec l'adresse vérifiée (Google), la même ligne est rattachée.
      const joined = await workspaceOf(lea)
      expect(joined.me.id).toBe(stillFree.id)
    })
  })

  describe('refus', () => {
    it('adresse invalide, déjà membre, invitation en attente, limite, membre qui invite', async () => {
      await invite(richard, 'pas-une-adresse', 'X').expect(400)
      await invite(richard, lea.email, '   ').expect(400)
      const already = await invite(richard, chloe.email.toUpperCase(), 'Chloé')
      expect(already.status).toBe(409)
      expect(already.body.message).toBe(
        "Cette adresse est déjà celle d'un membre de l'espace."
      )
      await invite(richard, lea.email, 'Léa').expect(201)
      const twice = await invite(richard, lea.email, 'Léa')
      expect(twice.status).toBe(409)
      expect(twice.body.message).toBe(
        'Une invitation est déjà en attente pour cette adresse.'
      )
      const forbidden = await invite(chloe, sam.email, 'Sam')
      expect(forbidden.status).toBe(403)
      expect(forbidden.body.message).toBe(
        "Seul un propriétaire de l'espace peut inviter."
      )
      for (let i = 1; i < MAX_PENDING_INVITATIONS; i += 1) {
        await invite(
          richard,
          `personne${i}@e2e.invalid`,
          `Personne ${i}`
        ).expect(201)
      }
      const full = await invite(richard, sam.email, 'Sam')
      expect(full.status).toBe(409)
      expect(full.body.message).toContain('Déjà 10 invitations en attente')
      const logs = await ctx.prisma.activityLog.count({
        where: { action: 'member.invited' },
      })
      expect(logs).toBe(MAX_PENDING_INVITATIONS)
    })
  })

  describe('expiration et annulation', () => {
    it('une invitation expirée laisse la personne dans son espace ; renouvelée, elle la rejoint par le bandeau', async () => {
      const sent = await invite(richard, lea.email, 'Léa').expect(201)
      const id = sent.body.invitation.id as string
      await ctx.prisma.member.update({
        where: { id },
        data: { invitationExpiresAt: new Date(Date.now() - DAY) },
      })
      const own = await workspaceOf(lea)
      expect(own.workspace.id).not.toBe(workspaceId)
      expect(own.workspace.name).toBe('Mon espace')
      expect(
        (await get(lea, '/workspace/invitations/received').expect(200)).body
      ).toEqual([])
      const owner = await workspaceOf(richard)
      expect(owner.workspace.invitations[0]).toMatchObject({
        id,
        state: 'expired',
      })
      await post(lea, `/workspace/invitations/${id}/accept`).expect(404)

      // Le propriétaire renouvelle : même ligne, nouvelle échéance.
      const renewed = await invite(richard, lea.email, 'Léa D.').expect(201)
      expect(renewed.body).toMatchObject({
        renewed: true,
        invitation: { id, state: 'pending', displayName: 'Léa D.' },
      })
      const received = await get(lea, '/workspace/invitations/received').expect(
        200
      )
      expect(received.body).toEqual([
        expect.objectContaining({
          id,
          workspace: { id: workspaceId, name: 'Appartement Bordeaux' },
          invitedByName: 'Richard',
          displayName: 'Léa D.',
        }),
      ])
      const accepted = await post(
        lea,
        `/workspace/invitations/${id}/accept`
      ).expect(200)
      expect(accepted.body.workspace.id).toBe(workspaceId)
      expect(accepted.body.me).toMatchObject({ id, status: 'active' })
      // L'espace personnel quitté reste intact, sans membre actif.
      const old = await ctx.prisma.member.findUniqueOrThrow({
        where: { id: own.me.id },
      })
      expect(old).toMatchObject({
        status: 'removed',
        authUserId: null,
        removedById: own.me.id,
      })
      expect(
        await ctx.prisma.workspace.findUnique({
          where: { id: own.workspace.id },
        })
      ).not.toBeNull()
      expect((await workspaceOf(lea)).workspace.id).toBe(workspaceId)
      const left = await ctx.prisma.activityLog.findFirstOrThrow({
        where: { workspaceId: own.workspace.id, action: 'member.left' },
      })
      expect(left.after).toMatchObject({ reason: 'joined_another_workspace' })
    })

    it("une invitation annulée laisse la personne dans son espace et n'est plus listée", async () => {
      const sent = await invite(richard, lea.email, 'Léa').expect(201)
      const id = sent.body.invitation.id as string
      await post(chloe, `/workspace/invitations/${id}/cancel`).expect(403)
      const canceled = await post(
        richard,
        `/workspace/invitations/${id}/cancel`
      ).expect(200)
      expect(canceled.body).toMatchObject({ id, state: 'canceled' })
      expect(canceled.body.closedAt).not.toBeNull()
      const again = await post(richard, `/workspace/invitations/${id}/cancel`)
      expect(again.status).toBe(409)
      expect((await workspaceOf(richard)).workspace.invitations).toEqual([])
      const own = await workspaceOf(lea)
      expect(own.workspace.id).not.toBe(workspaceId)
      const journal = await get(richard, '/activity?kind=member').expect(200)
      expect(
        journal.body.items.map((e: { summary: string }) => e.summary)
      ).toContain(`a annulé l'invitation de « Léa » (${lea.email})`)
    })
  })

  describe('e-mail non vérifié', () => {
    it("ne rattache pas l'invitation, ne montre pas de bandeau et refuse de rejoindre", async () => {
      const sent = await invite(richard, lea.email, 'Léa').expect(201)
      const id = sent.body.invitation.id as string
      const own = await workspaceOf(leaUnverified)
      expect(own.workspace.id).not.toBe(workspaceId)
      const pending = await ctx.prisma.member.findUniqueOrThrow({
        where: { id },
      })
      expect(pending).toMatchObject({ status: 'invited', authUserId: null })
      expect(
        (
          await get(leaUnverified, '/workspace/invitations/received').expect(
            200
          )
        ).body
      ).toEqual([])
      const refused = await post(
        leaUnverified,
        `/workspace/invitations/${id}/accept`
      )
      expect(refused.status).toBe(403)
      await post(leaUnverified, `/workspace/invitations/${id}/decline`).expect(
        403
      )
      // Une fois l'adresse vérifiée, la personne (déjà inscrite) voit le bandeau.
      leaUnverified.emailVerified = true
      expect(
        (
          await get(leaUnverified, '/workspace/invitations/received').expect(
            200
          )
        ).body
      ).toHaveLength(1)
      await post(leaUnverified, `/workspace/invitations/${id}/accept`).expect(
        200
      )
      expect((await workspaceOf(leaUnverified)).workspace.id).toBe(workspaceId)
    })
  })

  describe('retrait', () => {
    it("coupe l'accès dès la requête suivante (REST et MCP) et garde l'historique", async () => {
      // Chloé se connecte, donne son avis, prend une tâche, fait une visite.
      const chloeId = (await workspaceOf(chloe)).me.id
      await request(ctx.server)
        .put(`/listings/${listingId}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 2, text: 'Trop sombre' })
        .expect(200)
      await post(richard, `/listings/${listingId}/tasks`, {
        label: 'Demander les PV',
        assigneeId: chloeId,
      }).expect(201)
      await post(chloe, `/listings/${listingId}/visits`, {
        visitedAt: '2026-11-02T17:00:00.000Z',
        participantIds: [chloeId],
        report: 'Vue dégagée',
      }).expect(201)
      expect(await mcpListings(chloe)).toBe(1)

      const cut = await post(richard, `/workspace/members/${chloeId}/remove`)
      expect(cut.status).toBe(200)
      expect(cut.body).toMatchObject({
        id: chloeId,
        status: 'removed',
        authUserId: null,
      })
      expect(cut.body.removedAt).not.toBeNull()
      // Déjà retirée : plus rien à retirer.
      await post(richard, `/workspace/members/${chloeId}/remove`).expect(404)

      // Requête suivante : plus rien de l'espace, ni au REST ni au MCP.
      await get(chloe, `/listings/${listingId}`).expect(404)
      expect((await get(chloe, '/listings').expect(200)).body.total).toBe(0)
      expect(await mcpListings(chloe)).toBe(0)
      const elsewhere = await workspaceOf(chloe)
      expect(elsewhere.workspace.id).not.toBe(workspaceId)
      expect(elsewhere.workspace.name).toBe('Mon espace')

      // L'historique reste à son nom (lot 20 : visible une fois que Richard
      // a noté, avis à l'aveugle).
      await request(ctx.server)
        .put(`/listings/${listingId}/opinions/me`)
        .set(ctx.auth(richard))
        .send({ rating: 3 })
        .expect(200)
      const detail = await get(richard, `/listings/${listingId}`).expect(200)
      expect(
        detail.body.opinions.map((o: { memberId: string }) => o.memberId)
      ).toContain(chloeId)
      const roster = await workspaceOf(richard)
      expect(
        roster.workspace.members.find(m => m.id === chloeId)
      ).toMatchObject({ displayName: 'Chloé', status: 'removed' })
      const journal = await get(richard, '/activity?limit=200').expect(200)
      const byChloe = journal.body.items.filter(
        (e: { actor: { id: string } | null }) => e.actor?.id === chloeId
      )
      expect(byChloe.length).toBeGreaterThan(0)
      expect(byChloe[0].actor.displayName).toBe('Chloé')
      expect(
        journal.body.items.map((e: { summary: string }) => e.summary)
      ).toContain("a retiré « Chloé » de l'espace")
      const visits = await get(richard, `/listings/${listingId}/visits`).expect(
        200
      )
      expect(visits.body[0].participantIds).toEqual([chloeId])
      // On n'assigne plus de tâche à un ancien membre.
      await post(richard, `/listings/${listingId}/tasks`, {
        label: 'Rappeler',
        assigneeId: chloeId,
      }).expect(400)
    })

    it('un membre part de lui-même ; réinvité, il retrouve sa ligne et son historique', async () => {
      const chloeId = (await workspaceOf(chloe)).me.id
      await request(ctx.server)
        .put(`/listings/${listingId}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 3, text: 'À revoir' })
        .expect(200)
      // Se retirer soi-même revient à partir.
      const gone = await post(chloe, `/workspace/members/${chloeId}/remove`)
      expect(gone.status).toBe(200)
      expect(gone.body).toMatchObject({ status: 'removed' })
      const removedRow = await ctx.prisma.member.findUniqueOrThrow({
        where: { id: chloeId },
      })
      expect(removedRow.removedById).toBe(chloeId)
      expect((await workspaceOf(chloe)).workspace.id).not.toBe(workspaceId)

      const back = await invite(richard, chloe.email, 'Chloé').expect(201)
      expect(back.body).toMatchObject({
        renewed: true,
        invitation: { id: chloeId, state: 'pending' },
      })
      await post(chloe, `/workspace/invitations/${chloeId}/accept`).expect(200)
      const again = await workspaceOf(chloe)
      expect(again.me).toMatchObject({ id: chloeId, status: 'active' })
      expect(again.me.workspaceId).toBe(workspaceId)
      const mine = await request(ctx.server)
        .put(`/listings/${listingId}/opinions/me`)
        .set(ctx.auth(chloe))
        .send({ rating: 4, text: 'Revu' })
        .expect(200)
      expect(mine.body.memberId).toBe(chloeId)
      // Sa ligne d'avant, retrouvée (pas de second avis) ; Richard n'a pas
      // noté : à l'aveugle, il ne la lit pas encore.
      expect(await ctx.prisma.opinion.count({ where: { listingId } })).toBe(1)
      const opinions = await get(richard, `/listings/${listingId}/opinions`)
      expect(opinions.body).toHaveLength(0)
      const own = await get(chloe, `/listings/${listingId}/opinions`)
      expect(own.body.map((o: { memberId: string }) => o.memberId)).toEqual([
        chloeId,
      ])
    })
  })

  describe('dernier propriétaire et rôles', () => {
    it('ne peut ni être retiré, ni partir, ni perdre son rôle ; un membre ne gère rien', async () => {
      const richardId = (await workspaceOf(richard)).me.id
      const chloeId = (await workspaceOf(chloe)).me.id

      const self = await post(richard, `/workspace/members/${richardId}/remove`)
      expect(self.status).toBe(409)
      const leave = await post(richard, '/workspace/leave')
      expect(leave.status).toBe(409)
      expect(leave.body.message).toBe(
        "Tu es le dernier propriétaire de l'espace : nomme un autre propriétaire avant de partir."
      )
      const demote = await patch(richard, `/workspace/members/${richardId}`, {
        role: 'member',
      })
      expect(demote.status).toBe(409)
      expect(demote.body.message).toBe(
        "L'espace doit garder au moins un propriétaire."
      )

      expect(
        (await post(chloe, `/workspace/members/${richardId}/remove`)).status
      ).toBe(403)
      expect(
        (await patch(chloe, `/workspace/members/${chloeId}`, { role: 'owner' }))
          .status
      ).toBe(403)
      expect((await patch(chloe, '/workspace', { name: 'À moi' })).status).toBe(
        403
      )

      // Richard nomme Chloé propriétaire, puis part.
      const promoted = await patch(richard, `/workspace/members/${chloeId}`, {
        role: 'owner',
      }).expect(200)
      expect(promoted.body.role).toBe('owner')
      await post(richard, '/workspace/leave').expect(204)
      const after = await workspaceOf(chloe)
      expect(
        after.workspace.members.find(m => m.id === richardId)
      ).toMatchObject({ status: 'removed' })
      // Richard, revenu, a un espace à lui ; Chloé est seule propriétaire.
      expect((await workspaceOf(richard)).workspace.id).not.toBe(workspaceId)
      const alone = await post(chloe, `/workspace/members/${chloeId}/remove`)
      expect(alone.status).toBe(409)
      expect(alone.body.message).toContain('seul membre')

      const renamed = await patch(chloe, '/workspace', {
        name: ' Notre appartement ',
      }).expect(200)
      expect(renamed.body.workspace.name).toBe('Notre appartement')
      const kinds = await ctx.prisma.activityLog.findMany({
        where: {
          workspaceId,
          action: {
            in: ['member.role_changed', 'member.left', 'workspace.renamed'],
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      expect(kinds.map(k => k.action)).toEqual([
        'member.role_changed',
        'member.left',
        'workspace.renamed',
      ])
    })
  })

  describe('personne déjà inscrite', () => {
    it('voit le bandeau et refuse', async () => {
      const own = await workspaceOf(sam)
      const sent = await invite(richard, sam.email, 'Sam').expect(201)
      const id = sent.body.invitation.id as string
      // Déjà inscrit : pas de rattachement automatique.
      expect((await workspaceOf(sam)).workspace.id).toBe(own.workspace.id)
      const received = await get(sam, '/workspace/invitations/received').expect(
        200
      )
      expect(received.body).toHaveLength(1)
      await post(sam, `/workspace/invitations/${id}/decline`).expect(204)
      expect(
        (await get(sam, '/workspace/invitations/received').expect(200)).body
      ).toEqual([])
      await post(sam, `/workspace/invitations/${id}/accept`).expect(404)
      const owner = await workspaceOf(richard)
      expect(owner.workspace.invitations[0]).toMatchObject({
        id,
        state: 'declined',
      })
      const journal = await get(richard, '/activity?kind=member').expect(200)
      const declined = journal.body.items.find(
        (e: { action: string }) => e.action === 'member.invitation_declined'
      )
      expect(declined).toMatchObject({
        summary: "a refusé l'invitation à rejoindre l'espace",
        actor: { displayName: 'Sam' },
      })
      // Le propriétaire peut réinviter après un refus.
      await invite(richard, sam.email, 'Sam').expect(201)
    })

    it("seul propriétaire d'un espace qui a d'autres membres : refus, puis rejoint après avoir transmis la propriété", async () => {
      const samSpace = await workspaceOf(sam)
      await invite(sam, max.email, 'Max').expect(201)
      const maxJoined = await workspaceOf(max)
      expect(maxJoined.workspace.id).toBe(samSpace.workspace.id)

      const sent = await invite(richard, sam.email, 'Sam').expect(201)
      const id = sent.body.invitation.id as string
      const refused = await post(sam, `/workspace/invitations/${id}/accept`)
      expect(refused.status).toBe(409)
      expect(refused.body.message).toContain(
        'seul propriétaire de « Mon espace »'
      )

      await patch(sam, `/workspace/members/${maxJoined.me.id}`, {
        role: 'owner',
      }).expect(200)
      const accepted = await post(
        sam,
        `/workspace/invitations/${id}/accept`
      ).expect(200)
      expect(accepted.body.workspace.id).toBe(workspaceId)
      const left = await workspaceOf(max)
      expect(left.workspace.id).toBe(samSpace.workspace.id)
      expect(
        left.workspace.members.find(m => m.id === samSpace.me.id)
      ).toMatchObject({ status: 'removed' })
    })

    it('qui quitte son espace personnel avec des invitations en attente : elles sont annulées', async () => {
      const samSpace = await workspaceOf(sam)
      await invite(sam, max.email, 'Max').expect(201)
      const sent = await invite(richard, sam.email, 'Sam').expect(201)
      await post(
        sam,
        `/workspace/invitations/${sent.body.invitation.id}/accept`
      ).expect(200)
      const orphanInvite = await ctx.prisma.member.findFirstOrThrow({
        where: { workspaceId: samSpace.workspace.id, email: max.email },
      })
      expect(orphanInvite.status).toBe('canceled')
      // Max, à sa première connexion, ne tombe donc pas dans l'espace orphelin.
      expect((await workspaceOf(max)).workspace.id).not.toBe(
        samSpace.workspace.id
      )
    })
  })

  describe('MCP', () => {
    it('liste les membres en lecture seule, sans e-mail ; aucun outil n’invite ni ne retire', async () => {
      await workspaceOf(chloe)
      await invite(richard, lea.email, 'Léa').expect(201)
      const call = await request(ctx.server)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Content-Type', 'application/json')
        .set(ctx.auth(richard))
        .send({
          jsonrpc: '2.0',
          id: nextRpc++,
          method: 'tools/call',
          params: { name: 'list_members', arguments: {} },
        })
        .expect(200)
      const result = call.body.result as {
        content: Array<{ text: string }>
        structuredContent: {
          members: Array<{ handle: string; role: string; you: boolean }>
          pendingInvitations: number
        }
      }
      expect(result.structuredContent.members).toEqual([
        expect.objectContaining({
          handle: 'richard',
          role: 'owner',
          you: true,
        }),
        expect.objectContaining({
          handle: 'chloe',
          role: 'member',
          you: false,
        }),
      ])
      expect(result.structuredContent.pendingInvitations).toBe(1)
      expect(result.content[0]?.text).toContain('Invitations en attente : 1')
      expect(result.content[0]?.text).not.toContain('@')
      const list = await request(ctx.server)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Content-Type', 'application/json')
        .set(ctx.auth(richard))
        .send({ jsonrpc: '2.0', id: nextRpc++, method: 'tools/list' })
        .expect(200)
      const tools = list.body.result.tools as Array<{
        name: string
        annotations: { readOnlyHint?: boolean }
      }>
      const members = tools.find(t => t.name === 'list_members')
      expect(members?.annotations.readOnlyHint).toBe(true)
      expect(
        tools.filter(t => /invit|member|remove/.test(t.name)).map(t => t.name)
      ).toEqual(['list_members'])
    })
  })

  describe('isolation', () => {
    it('un membre ne voit et ne modifie que son espace', async () => {
      const sent = await invite(richard, lea.email, 'Léa').expect(201)
      const id = sent.body.invitation.id as string
      const chloeId = (await workspaceOf(chloe)).me.id
      const strangerSpace = await workspaceOf(stranger)
      expect(strangerSpace.workspace.id).not.toBe(workspaceId)
      expect(strangerSpace.workspace.members).toHaveLength(1)
      expect(strangerSpace.workspace.invitations).toEqual([])

      // Propriétaire de son espace, il ne touche pas aux lignes d'un autre.
      await post(stranger, `/workspace/invitations/${id}/cancel`).expect(404)
      await post(stranger, `/workspace/members/${chloeId}/remove`).expect(404)
      await patch(stranger, `/workspace/members/${chloeId}`, {
        role: 'owner',
      }).expect(404)
      // L'invitation de Léa ne lui est pas adressée.
      await post(stranger, `/workspace/invitations/${id}/accept`).expect(404)
      await post(stranger, `/workspace/invitations/${id}/decline`).expect(404)
      expect(
        (await get(stranger, '/workspace/invitations/received').expect(200))
          .body
      ).toEqual([])
      const pending = await ctx.prisma.member.findUniqueOrThrow({
        where: { id },
      })
      expect(pending.status).toBe('invited')
      await post(stranger, '/workspace/invitations/not-a-uuid/cancel').expect(
        400
      )
    })
  })
})
