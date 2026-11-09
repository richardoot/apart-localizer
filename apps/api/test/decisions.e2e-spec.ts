/**
 * Lot 21, décider à plusieurs sur PostGIS réel : proposition sur une annonce
 * et sur un brouillon, accord complet qui applique, brouillon créé à l'accord
 * seulement, désaccord puis tranché, retrait, décider sans attendre,
 * caducité, espace à un membre, réglage réservé aux propriétaires, une seule
 * proposition ouverte, membre retiré, journal, une notification par session,
 * isolation entre espaces, export. Données fictives.
 */
import { randomUUID } from 'node:crypto'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import request from 'supertest'
import { ListingInputSchema } from '@apart/contracts'
import { ListingsService } from '../src/listings/listings.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const lea = e2eIdentity('lea')
const stranger = e2eIdentity('stranger')

const LISTING = {
  title: '[Exemple] T3 Bacalan',
  price: 172_000,
  surface: 62,
  rooms: 3,
  dpeClass: 'C',
  location: { commune: 'Bordeaux', district: 'Bacalan' },
  rentalPlan: { targetRent: 850 },
}

describe('Lot 21 : décider à plusieurs (e2e)', () => {
  let ctx: E2eContext
  let workspaceId: string
  let richardId: string
  let chloeId: string

  const api = () => request(ctx.server)

  async function listingWith(title = LISTING.title): Promise<string> {
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({ ...LISTING, title })
      .expect(201)
    return res.body.listing.id as string
  }

  async function draft(title = '[Exemple] T2 Bastide'): Promise<string> {
    const row = await ctx.prisma.listingDraft.create({
      data: {
        workspaceId,
        origin: 'email',
        extractedBy: 'parser',
        input: ListingInputSchema.parse({
          title,
          price: 176_000,
          surface: 44,
          location: { commune: 'Bordeaux' },
        }),
        url: `https://exemple.invalid/annonces/0000000${Math.floor(Math.random() * 1000)}`,
      },
    })
    return row.id
  }

  const decide = (
    identity: E2eIdentity,
    target: { kind: 'listing' | 'draft'; id: string },
    choice: string,
    extra: Record<string, unknown> = {}
  ) =>
    api()
      .post('/decisions')
      .set(ctx.auth(identity))
      .send({ target, choice, ...extra })

  const respond = (
    identity: E2eIdentity,
    id: string,
    body: Record<string, unknown>
  ) => api().post(`/decisions/${id}/respond`).set(ctx.auth(identity)).send(body)

  const statusOf = async (id: string) =>
    (await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })).status

  const journal = async (action?: string) =>
    ctx.prisma.activityLog.findMany({
      where: { workspaceId, ...(action ? { action } : {}) },
      orderBy: { createdAt: 'asc' },
    })

  const notificationsFor = (recipientId: string) =>
    ctx.prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: 'asc' },
    })

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, lea, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.geocoding.fetchImpl = undefined as never
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
              email: chloe.email,
              role: 'member',
            },
          ],
        },
      },
      include: { members: true },
    })
    workspaceId = workspace.id
    richardId = workspace.members.find(m => m.handle === 'richard')
      ?.id as string
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id as string
    // Le rattachement des identités se fait à la première requête.
    await api().get('/workspace').set(ctx.auth(richard)).expect(200)
    await api().get('/workspace').set(ctx.auth(chloe)).expect(200)
  })

  describe('sur une annonce', () => {
    it('passer À visiter : une proposition, l’annonce ne bouge pas, marquée en attente', async () => {
      const id = await listingWith()
      const res = await decide(richard, { kind: 'listing', id }, 'to_visit', {
        reason: 'Prix correct, à voir sur place.',
      }).expect(200)
      expect(res.body.outcome).toBe('proposed')
      expect(res.body.message).toBe('C’est proposé. En attente de Chloé.')
      expect(await statusOf(id)).toBe('to_study')

      const seen = await api().get(`/listings/${id}`).set(ctx.auth(chloe))
      expect(seen.body.listing.status).toBe('to_study')
      expect(seen.body.decision).toMatchObject({
        choice: 'to_visit',
        choiceLabel: 'À visiter',
        state: 'open',
        reason: 'Prix correct, à voir sur place.',
        author: { displayName: 'Richard' },
        waitingFor: [{ displayName: 'Chloé' }],
        viewer: { canRespond: true, isAuthor: false },
      })
      const mine = await api().get(`/listings/${id}`).set(ctx.auth(richard))
      expect(mine.body.decision.viewer).toMatchObject({
        isAuthor: true,
        canWithdraw: true,
        canDecideNow: true,
        canRespond: false,
      })
    })

    it('écarter demande une raison ; le garde-fou expectedStatus reste valable', async () => {
      const id = await listingWith()
      await decide(richard, { kind: 'listing', id }, 'discard').expect(400)
      const stale = await api()
        .post('/decisions')
        .set(ctx.auth(richard))
        .send({
          target: { kind: 'listing', id },
          choice: 'to_visit',
          expectedStatus: 'visited',
        })
        .expect(409)
      expect(stale.body.message).toContain('statut attendu')
      expect(
        await ctx.prisma.decisionProposal.count({ where: { workspaceId } })
      ).toBe(0)
    })

    it('une annonce déjà à l’étape demandée : refus, rien d’enregistré', async () => {
      const id = await listingWith()
      await ctx.prisma.listing.update({
        where: { id },
        data: { status: 'to_visit' },
      })
      const res = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      ).expect(409)
      expect(res.body.message).toContain('déjà')
      expect(
        await ctx.prisma.decisionProposal.count({ where: { workspaceId } })
      ).toBe(0)
    })

    it('une réponse dont l’application échoue ne compte pas : on peut répondre à nouveau', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const listings = ctx.app.get(ListingsService)
      const spy = vi
        .spyOn(listings, 'setStatus')
        .mockRejectedValueOnce(new Error('panne fictive'))
      await respond(chloe, proposed.body.proposal.id, { agree: true }).expect(
        500
      )
      spy.mockRestore()
      expect(await ctx.prisma.decisionResponse.count()).toBe(0)
      expect(await statusOf(id)).toBe('to_study')
      const again = await respond(chloe, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(again.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('to_visit')
    })

    it('répondre deux fois : refus, une seule réponse', async () => {
      const lea2 = await ctx.prisma.member.create({
        data: {
          workspaceId,
          handle: 'lea',
          displayName: 'Léa',
          email: lea.email,
          role: 'member',
        },
      })
      await api().get('/workspace').set(ctx.auth(lea)).expect(200)
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      await respond(chloe, proposed.body.proposal.id, { agree: true }).expect(
        200
      )
      await respond(chloe, proposed.body.proposal.id, { agree: true }).expect(
        409
      )
      expect(
        await ctx.prisma.decisionResponse.count({
          where: { proposalId: proposed.body.proposal.id },
        })
      ).toBe(1)
      expect(lea2.id).toBeTruthy()
    })

    it('le changement de statut historique suit la même règle', async () => {
      const id = await listingWith()
      const res = await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'to_visit', expectedStatus: 'to_study' })
        .expect(200)
      expect(res.body.listing.status).toBe('to_study')
      expect(res.body.decision.choice).toBe('to_visit')
      // Tout le reste s'applique tout de suite.
      const visited = await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'visited' })
        .expect(200)
      expect(visited.body.listing.status).toBe('visited')
    })

    it('une modification ne peut pas changer le statut par la bande', async () => {
      const id = await listingWith()
      const res = await api()
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({ status: 'to_visit' })
        .expect(400)
      expect(res.body.message).toContain('changement de statut')
      expect(await statusOf(id)).toBe('to_study')
    })

    it('d’accord de tous : la décision s’applique, seule ligne de statut au journal', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const res = await respond(chloe, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(res.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('to_visit')

      const statusLines = await journal('listing.status_changed')
      expect(statusLines).toHaveLength(1)
      expect(statusLines[0]?.actorMemberId).toBe(chloeId)
      const page = await api()
        .get(`/listings/${id}/activity`)
        .set(ctx.auth(richard))
      const summaries = page.body.items.map(
        (e: { summary: string }) => e.summary
      )
      expect(summaries).toContain(
        'a confirmé : À étudier vers À visiter, proposé par Richard'
      )
      expect(summaries).toContain('propose À visiter')
      const row = await ctx.prisma.decisionProposal.findFirstOrThrow()
      expect(row.state).toBe('applied')
      expect(row.resolution).toBe('agreed')
    })

    it('trois membres : l’accord de tous, un par un', async () => {
      await ctx.prisma.member.create({
        data: {
          workspaceId,
          handle: 'lea',
          displayName: 'Léa',
          email: lea.email,
        },
      })
      await api().get('/workspace').set(ctx.auth(lea)).expect(200)
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const first = await respond(chloe, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(first.body.outcome).toBe('waiting')
      expect(first.body.message).toBe('C’est noté. En attente de Léa.')
      expect(await statusOf(id)).toBe('to_study')
      const second = await respond(lea, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(second.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('to_visit')
    })

    it('non : à trancher ensemble, les deux choix ; un clic suffit', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit',
        {
          reason: 'La vue est rare à ce prix.',
        }
      )
      const proposalId = proposed.body.proposal.id as string
      const res = await respond(chloe, proposalId, {
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
      }).expect(200)
      expect(res.body.outcome).toBe('to_settle')
      expect(await statusOf(id)).toBe('to_study')

      const cards = await api()
        .get('/decisions/cards?kind=settle')
        .set(ctx.auth(richard))
        .expect(200)
      expect(cards.body).toHaveLength(1)
      expect(cards.body[0].proposal.settleOptions).toEqual([
        'to_visit',
        'discard',
      ])
      expect(cards.body[0].listing.listing.id).toBe(id)

      // Un choix qui n'est pas sur la table est refusé.
      await api()
        .post(`/decisions/${proposalId}/settle`)
        .set(ctx.auth(richard))
        .send({ choice: 'keep' })
        .expect(409)

      const settled = await api()
        .post(`/decisions/${proposalId}/settle`)
        .set(ctx.auth(richard))
        .send({ choice: 'discard' })
        .expect(200)
      expect(settled.body.outcome).toBe('applied')
      const listing = await ctx.prisma.listing.findUniqueOrThrow({
        where: { id },
      })
      expect(listing.status).toBe('discarded')
      expect(listing.discardReason).toBe('Quartier')
      const page = await api()
        .get(`/listings/${id}/activity`)
        .set(ctx.auth(chloe))
      expect(
        page.body.items.map((e: { summary: string }) => e.summary)
      ).toContain('a tranché : Écarté (Richard : À visiter, Chloé : Écarter)')
    })

    it('à trancher : garder l’annonce où elle est ne change rien', async () => {
      const id = await listingWith()
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'visited' })
        .expect(200)
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'discard',
        {
          reason: 'Trop cher',
        }
      )
      const proposalId = proposed.body.proposal.id as string
      await respond(chloe, proposalId, { agree: false, choice: 'keep' }).expect(
        200
      )
      const settled = await api()
        .post(`/decisions/${proposalId}/settle`)
        .set(ctx.auth(chloe))
        .send({ choice: 'keep' })
        .expect(200)
      expect(settled.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('visited')
      expect(await journal('decision.kept')).toHaveLength(1)
    })

    it('« On en reparle » n’écrit rien ; « plus tard » non plus', async () => {
      const id = await listingWith()
      await decide(richard, { kind: 'listing', id }, 'to_visit')
      const overview = await api()
        .get('/decisions/overview')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(overview.body.proposals).toHaveLength(1)
      expect(await statusOf(id)).toBe('to_study')
    })

    it('retirer sa proposition ; pas celle d’un autre', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const proposalId = proposed.body.proposal.id as string
      await api()
        .post(`/decisions/${proposalId}/withdraw`)
        .set(ctx.auth(chloe))
        .expect(403)
      const res = await api()
        .post(`/decisions/${proposalId}/withdraw`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.outcome).toBe('withdrawn')
      expect(await statusOf(id)).toBe('to_study')
      const seen = await api().get(`/listings/${id}`).set(ctx.auth(richard))
      expect(seen.body.decision).toBeNull()
      // On peut reproposer.
      await decide(richard, { kind: 'listing', id }, 'to_visit').expect(200)
    })

    it('décider sans attendre : l’auteur seulement, journalisé avec cette mention', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const proposalId = proposed.body.proposal.id as string
      await api()
        .post(`/decisions/${proposalId}/decide-now`)
        .set(ctx.auth(chloe))
        .expect(403)
      const res = await api()
        .post(`/decisions/${proposalId}/decide-now`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('to_visit')
      const page = await api()
        .get(`/listings/${id}/activity`)
        .set(ctx.auth(richard))
      expect(
        page.body.items.map((e: { summary: string }) => e.summary)
      ).toContain('a décidé sans attendre Chloé : À visiter')
      const notes = await notificationsFor(chloeId)
      expect(notes.some(n => n.title.includes('a décidé sans attendre'))).toBe(
        true
      )
    })

    it('caducité : un fait appliqué directement ferme la proposition', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      await api()
        .post(`/listings/${id}/status`)
        .set(ctx.auth(richard))
        .send({ status: 'sold_or_withdrawn' })
        .expect(200)
      const row = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: proposed.body.proposal.id },
      })
      expect(row.state).toBe('stale')
      const seen = await api().get(`/listings/${id}`).set(ctx.auth(chloe))
      expect(seen.body.decision).toBeNull()
      // Répondre après coup : la proposition n'est plus en cours.
      await respond(chloe, row.id, { agree: true }).expect(409)
    })

    it('caducité au moment d’appliquer : rien n’est appliqué, l’interface le dit', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      // Le statut bouge hors du service (import, autre onglet…).
      await ctx.prisma.listing.update({
        where: { id },
        data: { status: 'visited' },
      })
      const res = await respond(chloe, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(res.body.outcome).toBe('stale')
      expect(res.body.message).toContain('caduque')
      expect(await statusOf(id)).toBe('visited')
    })

    it('au plus une proposition ouverte, y compris à trancher', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      await decide(chloe, { kind: 'listing', id }, 'discard', {
        reason: 'Quartier',
      }).expect(409)
      await respond(chloe, proposed.body.proposal.id, {
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
      }).expect(200)
      await decide(chloe, { kind: 'listing', id }, 'to_visit').expect(409)
      // La contrainte est en base : un doublon direct est refusé.
      await expect(
        ctx.prisma.decisionProposal.create({
          data: {
            workspaceId,
            listingId: id,
            authorId: chloeId,
            choice: 'discard',
            fromStatus: 'to_study',
          },
        })
      ).rejects.toThrow()
    })

    it('une proposition vise une annonce ou un brouillon, jamais les deux', async () => {
      const id = await listingWith()
      const draftId = await draft()
      await expect(
        ctx.prisma.decisionProposal.create({
          data: {
            workspaceId,
            listingId: id,
            draftId,
            authorId: richardId,
            choice: 'discard',
          },
        })
      ).rejects.toThrow()
      await expect(
        ctx.prisma.decisionProposal.create({
          data: { workspaceId, authorId: richardId, choice: 'discard' },
        })
      ).rejects.toThrow()
    })

    it('annuler une réponse, ou le changement de statut qu’elle a appliqué', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const proposalId = proposed.body.proposal.id as string
      await respond(chloe, proposalId, {
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
      }).expect(200)
      const undone = await api()
        .post(`/decisions/${proposalId}/undo`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(undone.body.proposal.state).toBe('open')
      expect(undone.body.proposal.responses).toEqual([])

      await respond(chloe, proposalId, { agree: true }).expect(200)
      expect(await statusOf(id)).toBe('to_visit')
      const back = await api()
        .post(`/decisions/${proposalId}/undo`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(back.body.proposal.state).toBe('open')
      expect(await statusOf(id)).toBe('to_study')
      // La proposition est de nouveau à confirmer.
      const cards = await api()
        .get('/decisions/cards?kind=confirm')
        .set(ctx.auth(chloe))
      expect(cards.body).toHaveLength(1)
      // Annuler sa proposition : c'est la retirer.
      const withdrawn = await api()
        .post(`/decisions/${proposalId}/undo`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(withdrawn.body.outcome).toBe('withdrawn')
    })

    it('annuler une décision tranchée la remet à trancher ; pas celle d’un autre', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      const proposalId = proposed.body.proposal.id as string
      await respond(chloe, proposalId, {
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
      }).expect(200)
      await api()
        .post(`/decisions/${proposalId}/settle`)
        .set(ctx.auth(richard))
        .send({ choice: 'to_visit' })
        .expect(200)
      await api()
        .post(`/decisions/${proposalId}/undo`)
        .set(ctx.auth(chloe))
        .expect(409)
      await api()
        .post(`/decisions/${proposalId}/undo`)
        .set(ctx.auth(richard))
        .expect(200)
      const row = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: proposalId },
      })
      expect(row.state).toBe('to_settle')
      expect(await statusOf(id)).toBe('to_study')
    })
  })

  describe('sur un brouillon', () => {
    it('l’annonce naît à l’accord complet seulement', async () => {
      const id = await draft()
      const proposed = await decide(
        richard,
        { kind: 'draft', id },
        'keep'
      ).expect(200)
      expect(proposed.body.outcome).toBe('proposed')
      expect(await ctx.prisma.listing.count({ where: { workspaceId } })).toBe(0)
      const stored = await ctx.prisma.listingDraft.findUniqueOrThrow({
        where: { id },
      })
      expect(stored.status).toBe('pending')

      const res = await respond(chloe, proposed.body.proposal.id, {
        agree: true,
      }).expect(200)
      expect(res.body.outcome).toBe('applied')
      expect(res.body.createdListing).toBe(true)
      expect(res.body.undoable).toBe(false)
      const listing = await ctx.prisma.listing.findFirstOrThrow({
        where: { workspaceId },
      })
      expect(listing.id).toBe(res.body.listingId)
      expect(listing.status).toBe('to_study')
      const after = await ctx.prisma.listingDraft.findUniqueOrThrow({
        where: { id },
      })
      expect(after.status).toBe('accepted')
      expect(after.listingId).toBe(listing.id)
      const page = await api()
        .get(`/listings/${listing.id}/activity`)
        .set(ctx.auth(richard))
      expect(
        page.body.items.map((e: { summary: string }) => e.summary)
      ).toContain('a confirmé : À valider vers À étudier, proposé par Richard')
      // Pas d'annulation : on ne supprime pas une annonce.
      const refused = await api()
        .post(`/decisions/${proposed.body.proposal.id}/undo`)
        .set(ctx.auth(chloe))
        .expect(409)
      expect(refused.body.message).toContain('ouvre sa fiche')
    })

    it('écarter un brouillon d’un commun accord ; il n’est plus reproposé', async () => {
      const id = await draft()
      await decide(richard, { kind: 'draft', id }, 'discard').expect(400)
      const proposed = await decide(richard, { kind: 'draft', id }, 'discard', {
        reason: 'Déjà vue',
      }).expect(200)
      await respond(chloe, proposed.body.proposal.id, { agree: true }).expect(
        200
      )
      const stored = await ctx.prisma.listingDraft.findUniqueOrThrow({
        where: { id },
      })
      expect(stored.status).toBe('dismissed')
      expect(stored.dismissReason).toBe('Déjà vue')
      // Annuler l'écart : le brouillon revient à valider, à confirmer.
      await api()
        .post(`/decisions/${proposed.body.proposal.id}/undo`)
        .set(ctx.auth(chloe))
        .expect(200)
      const back = await ctx.prisma.listingDraft.findUniqueOrThrow({
        where: { id },
      })
      expect(back.status).toBe('pending')
    })

    it('« Ajouter à la liste » et l’écart historiques deviennent des propositions', async () => {
      const id = await draft()
      const res = await api()
        .post(`/listing-drafts/${id}/accept`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.listingId).toBeNull()
      expect(res.body.draft.decision.choice).toBe('keep')
      const other = await draft('[Exemple] T3 Nansouty')
      await api()
        .patch(`/listing-drafts/${other}`)
        .set(ctx.auth(richard))
        .send({ status: 'dismissed' })
        .expect(400)
      const dismissed = await api()
        .patch(`/listing-drafts/${other}`)
        .set(ctx.auth(richard))
        .send({ status: 'dismissed', reason: 'Trop petit' })
        .expect(200)
      expect(dismissed.body.status).toBe('pending')
      expect(dismissed.body.decision.choice).toBe('discard')
      // L'ajout par formulaire ne contourne pas l'accord.
      await api()
        .patch(`/listing-drafts/${other}`)
        .set(ctx.auth(richard))
        .send({
          status: 'accepted',
          listingId: '99999999-9999-4999-8999-999999999999',
        })
        .expect(409)
    })

    it('« c’est la même » s’applique tout de suite et rend la proposition caduque', async () => {
      const listingId = await listingWith('[Exemple] T3 suivi')
      const row = await ctx.prisma.listingDraft.create({
        data: {
          workspaceId,
          origin: 'email',
          extractedBy: 'parser',
          input: ListingInputSchema.parse({
            title: '[Exemple] même bien',
            price: 170_000,
          }),
          duplicates: [
            {
              listingId,
              title: '[Exemple] T3 suivi',
              price: 172_000,
              surface: 62,
              commune: 'Bordeaux',
              url: null,
              status: 'to_study',
              reasons: [{ kind: 'same_url', score: 1, detail: 'même lien' }],
              certain: true,
              score: 1,
            },
          ],
        },
      })
      const proposed = await decide(
        richard,
        { kind: 'draft', id: row.id },
        'keep'
      ).expect(200)
      await api()
        .post(`/listing-drafts/${row.id}/merge`)
        .set(ctx.auth(chloe))
        .send({ listingId })
        .expect(200)
      const closed = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: proposed.body.proposal.id },
      })
      expect(closed.state).toBe('stale')
    })

    it('la lecture d’un brouillon porte ses chiffres et sa proposition', async () => {
      const id = await draft()
      await decide(richard, { kind: 'draft', id }, 'keep').expect(200)
      const list = await api()
        .get('/listing-drafts')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(list.body[0].decision.viewer.canRespond).toBe(true)
      expect(list.body[0].evaluation.metrics.price).toBe(176_000)
    })

    it('ajouter celles « dans les critères » : une proposition chacune, une notification', async () => {
      await draft('[Exemple] A')
      await draft('[Exemple] B')
      const before = (await notificationsFor(chloeId)).length
      const res = await api()
        .post('/listing-drafts/accept-in-criteria')
        .set(ctx.auth(richard))
        .send({})
        .expect(200)
      expect(res.body.proposed).toBe(2)
      expect(res.body.accepted).toHaveLength(2)
      expect(res.body.accepted[0].listingId).toBeNull()
      expect(await ctx.prisma.listing.count({ where: { workspaceId } })).toBe(0)
      const notes = await notificationsFor(chloeId)
      expect(notes.length - before).toBe(1)
      expect(notes.at(-1)?.title).toBe('Richard a trié 2 annonces')
    })
  })

  describe('espace à un seul membre, réglage désactivé', () => {
    it('à un membre actif : tout est immédiat, sans proposition', async () => {
      await ctx.prisma.member.update({
        where: { id: chloeId },
        data: { status: 'removed', authUserId: null },
      })
      const id = await listingWith()
      const res = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      ).expect(200)
      expect(res.body.outcome).toBe('applied')
      expect(await statusOf(id)).toBe('to_visit')
      const draftId = await draft()
      const kept = await decide(richard, { kind: 'draft', id: draftId }, 'keep')
      expect(kept.body.outcome).toBe('applied')
      expect(kept.body.createdListing).toBe(true)
      expect(
        await ctx.prisma.decisionProposal.count({ where: { workspaceId } })
      ).toBe(0)
    })

    it('réglage désactivé : immédiat ; les propositions ouvertes se résolvent', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      await api()
        .patch('/workspace/decisions')
        .set(ctx.auth(richard))
        .send({ decideTogether: false })
        .expect(200)
      const other = await listingWith('[Exemple] autre')
      const direct = await decide(
        richard,
        { kind: 'listing', id: other },
        'to_visit'
      ).expect(200)
      expect(direct.body.outcome).toBe('applied')
      await respond(chloe, proposed.body.proposal.id, { agree: true }).expect(
        200
      )
      expect(await statusOf(id)).toBe('to_visit')
    })

    it('le réglage : propriétaires seulement, journalisé, lisible par tous', async () => {
      await api()
        .patch('/workspace/decisions')
        .set(ctx.auth(chloe))
        .send({ decideTogether: false })
        .expect(403)
      const res = await api()
        .patch('/workspace/decisions')
        .set(ctx.auth(richard))
        .send({ decideTogether: false })
        .expect(200)
      expect(res.body.workspace.decideTogether).toBe(false)
      const seen = await api()
        .get('/workspace')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(seen.body.workspace.decideTogether).toBe(false)
      expect(await journal('workspace.decide_together_changed')).toHaveLength(1)
      // Le même réglage une seconde fois n'écrit rien.
      await api()
        .patch('/workspace/decisions')
        .set(ctx.auth(richard))
        .send({ decideTogether: false })
        .expect(200)
      expect(await journal('workspace.decide_together_changed')).toHaveLength(1)
    })
  })

  describe('un membre retiré ou parti', () => {
    it('ses propositions sont retirées ; on ne l’attend plus, rien d’appliqué d’office', async () => {
      const id = await listingWith()
      const other = await listingWith('[Exemple] autre')
      const fromChloe = await decide(chloe, { kind: 'listing', id }, 'to_visit')
      const fromRichard = await decide(
        richard,
        { kind: 'listing', id: other },
        'to_visit'
      )
      await api()
        .post(`/workspace/members/${chloeId}/remove`)
        .set(ctx.auth(richard))
        .expect(200)
      const withdrawn = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: fromChloe.body.proposal.id },
      })
      expect(withdrawn.state).toBe('withdrawn')
      const kept = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: fromRichard.body.proposal.id },
      })
      expect(kept.state).toBe('open')
      expect(await statusOf(other)).toBe('to_study')

      const seen = await api().get(`/listings/${other}`).set(ctx.auth(richard))
      expect(seen.body.decision.waitingFor).toEqual([])
      expect(seen.body.decision.viewer.nobodyLeft).toBe(true)
      const overview = await api()
        .get('/decisions/overview')
        .set(ctx.auth(richard))
      expect(
        overview.body.agenda.some((a: { key: string }) => a.key === 'ready')
      ).toBe(true)

      await api()
        .post(`/decisions/${fromRichard.body.proposal.id}/decide-now`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(await statusOf(other)).toBe('to_visit')
    })

    it('un membre qui part retire aussi ses propositions', async () => {
      const id = await listingWith()
      const fromChloe = await decide(chloe, { kind: 'listing', id }, 'to_visit')
      await api().post('/workspace/leave').set(ctx.auth(chloe)).expect(204)
      const row = await ctx.prisma.decisionProposal.findUniqueOrThrow({
        where: { id: fromChloe.body.proposal.id },
      })
      expect(row.state).toBe('withdrawn')
    })
  })

  describe('les sessions de tri', () => {
    it('une seule notification à la fin, puis plus rien', async () => {
      const a = await listingWith('[Exemple] A')
      const b = await listingWith('[Exemple] B')
      const d = await draft('[Exemple] C')
      const sessionId = randomUUID()
      const before = (await notificationsFor(chloeId)).length
      await decide(richard, { kind: 'listing', id: a }, 'to_visit', {
        sessionId,
      }).expect(200)
      await decide(richard, { kind: 'listing', id: b }, 'discard', {
        reason: 'Trop cher',
        sessionId,
      }).expect(200)
      await decide(richard, { kind: 'draft', id: d }, 'keep', {
        sessionId,
      }).expect(200)
      // Rien avant la fin de la session.
      expect((await notificationsFor(chloeId)).length).toBe(before)

      const finished = await api()
        .post(`/decisions/sessions/${sessionId}/finish`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(finished.body.notified).toBe(true)
      const notes = await notificationsFor(chloeId)
      expect(notes.length - before).toBe(1)
      expect(notes.at(-1)).toMatchObject({
        type: 'decision_proposed',
        title: 'Richard a trié 3 annonces',
        body: '2 à garder, 1 à écarter : à toi de confirmer.',
      })
      // Terminer deux fois, ou quitter après, ne notifie plus.
      const again = await api()
        .post(`/decisions/sessions/${sessionId}/finish`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(again.body.notified).toBe(false)
      expect((await notificationsFor(chloeId)).length - before).toBe(1)
    })

    it('un onglet fermé sans terminer : pas de notification, les propositions restent', async () => {
      const a = await listingWith('[Exemple] A')
      await decide(richard, { kind: 'listing', id: a }, 'to_visit', {
        sessionId: randomUUID(),
      }).expect(200)
      const decisions = (await notificationsFor(chloeId)).filter(n =>
        n.type.startsWith('decision_')
      )
      expect(decisions).toHaveLength(0)
      const overview = await api()
        .get('/decisions/overview')
        .set(ctx.auth(chloe))
      expect(overview.body.agenda.map((a: { key: string }) => a.key)).toContain(
        'to_confirm'
      )
    })

    it('le retour : une notification à l’auteur, regroupée', async () => {
      const ids = [
        await listingWith('[Exemple] A'),
        await listingWith('[Exemple] B'),
        await listingWith('[Exemple] C'),
      ]
      const proposals: string[] = []
      for (const id of ids) {
        const res = await decide(richard, { kind: 'listing', id }, 'to_visit')
        proposals.push(res.body.proposal.id)
      }
      const sessionId = randomUUID()
      const before = (await notificationsFor(richardId)).length
      await respond(chloe, proposals[0] as string, {
        agree: true,
        sessionId,
      }).expect(200)
      await respond(chloe, proposals[1] as string, {
        agree: true,
        sessionId,
      }).expect(200)
      await respond(chloe, proposals[2] as string, {
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
        sessionId,
      }).expect(200)
      expect((await notificationsFor(richardId)).length).toBe(before)
      await api()
        .post(`/decisions/sessions/${sessionId}/finish`)
        .set(ctx.auth(chloe))
        .expect(200)
      const notes = await notificationsFor(richardId)
      expect(notes.length - before).toBe(1)
      expect(notes.at(-1)).toMatchObject({
        type: 'decision_resolved',
        title: 'Chloé a confirmé ton tri',
        body: '2 annonces changent d’étape, 1 reste à trancher.',
      })
    })

    it('décider sans attendre à la fin d’une session : tout s’applique, une notification', async () => {
      const a = await listingWith('[Exemple] A')
      const d = await draft('[Exemple] B')
      const sessionId = randomUUID()
      await decide(richard, { kind: 'listing', id: a }, 'to_visit', {
        sessionId,
      }).expect(200)
      await decide(richard, { kind: 'draft', id: d }, 'keep', {
        sessionId,
      }).expect(200)
      const before = (await notificationsFor(chloeId)).length
      const res = await api()
        .post(`/decisions/sessions/${sessionId}/decide-now`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body).toMatchObject({ applied: 2, stale: 0 })
      expect(res.body.message).toContain('sans attendre Chloé')
      expect(await statusOf(a)).toBe('to_visit')
      expect(await ctx.prisma.listing.count({ where: { workspaceId } })).toBe(2)
      expect((await notificationsFor(chloeId)).length - before).toBe(1)
    })

    it('hors session : une proposition notifie aussitôt', async () => {
      const a = await listingWith('[Exemple] A')
      await decide(richard, { kind: 'listing', id: a }, 'to_visit').expect(200)
      const notes = await notificationsFor(chloeId)
      expect(notes.at(-1)).toMatchObject({
        type: 'decision_proposed',
        title: 'Richard propose À visiter : [Exemple] A',
      })
    })

    it('les préférences de notification s’appliquent', async () => {
      await api()
        .put('/notifications/preferences')
        .set(ctx.auth(chloe))
        .send({ decision_proposed: { in_app: false, push: false } })
        .expect(200)
      const a = await listingWith('[Exemple] A')
      await decide(richard, { kind: 'listing', id: a }, 'to_visit').expect(200)
      expect(
        (await notificationsFor(chloeId)).filter(
          n => n.type === 'decision_proposed'
        )
      ).toHaveLength(0)
    })
  })

  describe('les compteurs', () => {
    it('étapes et « Ce qui t’attend » selon le membre, sans note révélée', async () => {
      const toStudy = await listingWith('[Exemple] A')
      await listingWith('[Exemple] B')
      await draft('[Exemple] brouillon')
      await decide(richard, { kind: 'listing', id: toStudy }, 'to_visit')

      const forRichard = await api()
        .get('/decisions/overview')
        .set(ctx.auth(richard))
        .expect(200)
      const count = (
        body: { stages: Array<{ stage: string }> },
        stage: string
      ) => body.stages.find(s => s.stage === stage)
      expect(count(forRichard.body, 'a-valider')).toMatchObject({
        count: 1,
        toSort: 1,
      })
      expect(count(forRichard.body, 'a-etudier')).toMatchObject({
        count: 2,
        toSort: 1,
      })
      expect(forRichard.body.agreementRequired).toBe(true)
      expect(forRichard.body.others).toEqual([
        expect.objectContaining({ displayName: 'Chloé' }),
      ])
      expect(forRichard.body.agenda.map((a: { key: string }) => a.key)).toEqual(
        ['to_sort']
      )

      const forChloe = await api()
        .get('/decisions/overview')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(forChloe.body.agenda.map((a: { key: string }) => a.key)).toEqual([
        'to_sort',
        'to_confirm',
      ])
    })

    it('les avis à donner et les visites à planifier', async () => {
      const visited = await listingWith('[Exemple] visitée')
      const planned = await listingWith('[Exemple] à planifier')
      await ctx.prisma.listing.update({
        where: { id: visited },
        data: { status: 'visited' },
      })
      await ctx.prisma.listing.update({
        where: { id: planned },
        data: { status: 'to_visit' },
      })
      await ctx.prisma.opinion.create({
        data: { listingId: visited, memberId: chloeId, rating: 2, text: 'Bof' },
      })
      const overview = await api()
        .get('/decisions/overview')
        .set(ctx.auth(richard))
        .expect(200)
      const agenda = overview.body.agenda as Array<{
        key: string
        count: number
      }>
      expect(agenda.find(a => a.key === 'opinions_to_give')?.count).toBe(1)
      expect(agenda.find(a => a.key === 'visits_to_plan')?.count).toBe(1)
      expect(JSON.stringify(overview.body)).not.toContain('Bof')
    })
  })

  describe('isolation et export', () => {
    it('un autre espace ne voit ni ne touche une proposition', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit'
      )
      await api().get('/workspace').set(ctx.auth(stranger)).expect(200)
      await respond(stranger, proposed.body.proposal.id, {
        agree: true,
      }).expect(404)
      await decide(stranger, { kind: 'listing', id }, 'to_visit').expect(404)
      const overview = await api()
        .get('/decisions/overview')
        .set(ctx.auth(stranger))
      expect(overview.body.proposals).toEqual([])
    })

    it('l’export JSON porte les propositions, sans changer de version ; le CSV une colonne', async () => {
      const id = await listingWith()
      const proposed = await decide(
        richard,
        { kind: 'listing', id },
        'to_visit',
        {
          reason: 'À voir',
        }
      )
      const json = await api()
        .get('/export?format=json')
        .set(ctx.auth(richard))
        .expect(200)
      const doc = JSON.parse(json.text) as {
        version: number
        decisions: Array<{ id: string; state: string; viewer?: unknown }>
        decideTogether: boolean
      }
      expect(doc.version).toBe(1)
      expect(doc.decideTogether).toBe(true)
      expect(doc.decisions).toHaveLength(1)
      expect(doc.decisions[0]).toMatchObject({
        id: proposed.body.proposal.id,
        state: 'open',
      })
      expect(doc.decisions[0]?.viewer).toBeUndefined()
      const csv = await api()
        .get('/export?format=csv')
        .set(ctx.auth(richard))
        .expect(200)
      expect(csv.text).toContain('Décision en attente')
      expect(csv.text).toContain(
        'À visiter, proposé par Richard, En attente de Chloé'
      )
    })
  })
})
