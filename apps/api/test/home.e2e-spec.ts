/**
 * Lot 23, l'accueil sur PostGIS réel : « Ce qui t'attend » étendu (visites à
 * venir, messages à valider, relances dues, tâches en retard) par `GET
 * /decisions/overview`, toutes les tâches ouvertes par `GET /tasks/open`
 * (par annonce, en retard d'abord, cochées par la route de l'annonce), la
 * mise en route par `GET /workspace/getting-started`. Avis à l'aveugle :
 * aucune note dans ces réponses. Isolation entre espaces. Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
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

const DAY = 86_400_000

describe('Lot 23 : l’accueil (e2e)', () => {
  let ctx: E2eContext
  let workspaceId: string
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

  /** Vieillit les tâches d'une annonce : créées il y a `days` jours. */
  async function ageTasks(listingId: string, days: number, take?: number) {
    const tasks = await ctx.prisma.task.findMany({
      where: { listingId },
      orderBy: { position: 'asc' },
      ...(take ? { take } : {}),
    })
    await ctx.prisma.task.updateMany({
      where: { id: { in: tasks.map(t => t.id) } },
      data: { createdAt: new Date(Date.now() - days * DAY) },
    })
    return tasks
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
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
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id as string
    await api().get('/workspace').set(ctx.auth(richard)).expect(200)
    await api().get('/workspace').set(ctx.auth(chloe)).expect(200)
  })

  describe('« Ce qui t’attend » étendu', () => {
    it('visites à venir, messages à valider, relances dues, tâches en retard', async () => {
      const a = await listingWith('[Exemple] T3 Bacalan')
      const b = await listingWith('[Exemple] T2 Chartrons')
      const archived = await listingWith('[Exemple] T2 écarté')
      await ctx.prisma.listing.updateMany({
        where: { id: { in: [a, b] } },
        data: { status: 'to_visit' },
      })
      await ctx.prisma.listing.update({
        where: { id: archived },
        data: { status: 'discarded' },
      })
      const soon = new Date(Date.now() + 2 * DAY)
      await ctx.prisma.visit.createMany({
        data: [
          { listingId: a, visitedAt: soon, status: 'planned' },
          {
            listingId: b,
            visitedAt: new Date(Date.now() + 5 * DAY),
            status: 'planned',
          },
          // Une visite faite, une passée non marquée, une sur une annonce écartée.
          { listingId: a, visitedAt: new Date(Date.now() - 9 * DAY) },
          {
            listingId: b,
            visitedAt: new Date(Date.now() - 3 * DAY),
            status: 'planned',
          },
          { listingId: archived, visitedAt: soon, status: 'planned' },
        ],
      })
      // Une demande envoyée il y a vingt jours, une question sans réponse : relance due.
      const asked = await ctx.prisma.task.findFirstOrThrow({
        where: { listingId: b },
        orderBy: { position: 'asc' },
      })
      await ctx.prisma.agencyRequest.createMany({
        data: [
          {
            workspaceId,
            listingId: a,
            channel: 'email',
            subject: 'Questions sur le T3',
            body: 'Bonjour, pourriez-vous nous indiquer…',
          },
          {
            workspaceId,
            listingId: b,
            channel: 'email',
            status: 'sent',
            taskIds: [asked.id],
            subject: 'Questions sur le T2',
            body: 'Bonjour, pourriez-vous nous indiquer…',
            sentAt: new Date(Date.now() - 20 * DAY),
          },
        ],
      })
      await ageTasks(a, 20, 3)
      await ageTasks(archived, 40)

      const res = await api()
        .get('/decisions/overview')
        .set(ctx.auth(richard))
        .expect(200)
      const line = (key: string) =>
        res.body.agenda.find((item: { key: string }) => item.key === key)
      expect(line('upcoming_visits')).toMatchObject({
        count: 2,
        label: 'visites à venir',
        stage: 'a-visiter',
        listingId: null,
      })
      expect(line('upcoming_visits').detail).toMatch(/^prochaine : /)
      expect(line('messages_to_approve')).toMatchObject({
        count: 1,
        label: 'message à valider',
        listingId: a,
      })
      expect(line('follow_ups_due')).toMatchObject({
        count: 1,
        label: 'relance due',
        listingId: b,
      })
      expect(line('overdue_tasks')).toMatchObject({
        count: 3,
        label: 'tâches en retard',
        detail: 'ouvertes depuis plus de 14 jours',
        listingId: a,
      })
      // Les tâches de l'annonce écartée ne comptent pas.
      const perListing = await ctx.prisma.task.count({
        where: { listingId: a },
      })
      expect(res.body.tasks).toEqual({
        open: perListing * 2,
        overdue: 3,
        overdueDays: 14,
      })
    })

    it('avis à l’aveugle : « avis à donner » sans aucune note de l’autre', async () => {
      const id = await listingWith()
      await ctx.prisma.listing.update({
        where: { id },
        data: { status: 'visited' },
      })
      await ctx.prisma.opinion.create({
        data: { listingId: id, memberId: chloeId, rating: 2, text: 'Bruyant' },
      })
      const res = await api()
        .get('/decisions/overview')
        .set(ctx.auth(richard))
        .expect(200)
      expect(
        res.body.agenda.find(
          (i: { key: string }) => i.key === 'opinions_to_give'
        )
      ).toMatchObject({ count: 1, listingId: id })
      const text = JSON.stringify(res.body)
      expect(text).not.toContain('Bruyant')
      expect(text).not.toContain('"rating"')
      expect(text).not.toContain('"score"')
    })
  })

  describe('toutes les tâches ouvertes', () => {
    it('par annonce, en retard d’abord ; cocher par la route de l’annonce les retire', async () => {
      const recent = await listingWith('[Exemple] Récent')
      const old = await listingWith('[Exemple] Ancien')
      const archived = await listingWith('[Exemple] Écarté')
      await ctx.prisma.listing.update({
        where: { id: archived },
        data: { status: 'discarded' },
      })
      const aged = await ageTasks(old, 30, 2)

      const res = await api()
        .get('/tasks/open')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(res.body.overdueDays).toBe(14)
      expect(res.body.overdue).toBe(2)
      expect(
        res.body.groups.map((g: { listing: { id: string } }) => g.listing.id)
      ).toEqual([old, recent])
      const first = res.body.groups[0]
      expect(first.listing).toMatchObject({
        title: '[Exemple] Ancien',
        status: 'to_study',
        stage: 'a-etudier',
        commune: 'Bordeaux',
      })
      expect(first.overdue).toBe(2)
      expect(
        first.tasks
          .slice(0, 2)
          .map((t: { id: string }) => t.id)
          .sort()
      ).toEqual(aged.map(t => t.id).sort())
      expect(first.tasks[0]).toMatchObject({ overdue: true, done: false })
      expect(first.tasks[0].openDays).toBeGreaterThanOrEqual(29)
      expect(first.tasks[2]).toMatchObject({ overdue: false, openDays: 0 })
      const total = res.body.open as number

      // Cocher, comme dans la fiche : la tâche quitte la liste ; rouvrir la remet.
      const taskId = first.tasks[0].id as string
      await api()
        .patch(`/listings/${old}/tasks/${taskId}`)
        .set(ctx.auth(chloe))
        .send({ done: true })
        .expect(200)
      const after = await api()
        .get('/tasks/open')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(after.body.open).toBe(total - 1)
      expect(after.body.overdue).toBe(1)
      await api()
        .patch(`/listings/${old}/tasks/${taskId}`)
        .set(ctx.auth(chloe))
        .send({ done: false })
        .expect(200)
      const again = await api()
        .get('/tasks/open')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(again.body.open).toBe(total)
      // Le journal a les deux écritures, au nom de Chloé.
      const journal = await ctx.prisma.activityLog.findMany({
        where: {
          workspaceId,
          action: { in: ['task.completed', 'task.reopened'] },
        },
      })
      expect(journal.map(j => j.actorMemberId)).toEqual([chloeId, chloeId])
    })

    it('un autre espace n’en voit rien', async () => {
      await listingWith()
      const res = await api()
        .get('/tasks/open')
        .set(ctx.auth(stranger))
        .expect(200)
      expect(res.body).toEqual({
        open: 0,
        overdue: 0,
        overdueDays: 14,
        groups: [],
      })
    })

    it('sans connexion : 401', async () => {
      await api().get('/tasks/open').expect(401)
    })
  })

  describe('la mise en route', () => {
    it('un espace vide : la liste entière, rien de fait', async () => {
      const res = await api()
        .get('/workspace/getting-started')
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.mode).toBe('full')
      expect(res.body.doneCount).toBe(0)
      expect(res.body.steps.map((s: { key: string }) => s.key)).toEqual([
        'assumptions',
        'criteria',
        'listing',
        'claude',
      ])
    })

    it('lire les hypothèses ne compte pas ; les enregistrer, oui ; puis critère, annonce, Claude', async () => {
      const current = await api()
        .get('/assumptions')
        .set(ctx.auth(richard))
        .expect(200)
      let res = await api()
        .get('/workspace/getting-started')
        .set(ctx.auth(richard))
        .expect(200)
      expect(res.body.steps[0].done).toBe(false)

      await api()
        .put('/assumptions')
        .set(ctx.auth(richard))
        .send({
          values: current.body.values,
          label: 'Nos hypothèses',
          expectedVersion: current.body.id,
        })
        .expect(r => expect([200, 201]).toContain(r.status))
      await ctx.prisma.searchCriteria.create({
        data: { workspaceId, name: '[Exemple] Bordeaux rive droite' },
      })
      await listingWith()
      res = await api()
        .get('/workspace/getting-started')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(res.body.mode).toBe('compact')
      expect(res.body.steps.map((s: { done: boolean }) => s.done)).toEqual([
        true,
        true,
        true,
        false,
      ])

      // Une écriture du connecteur au journal : Claude est vu.
      await ctx.prisma.activityLog.create({
        data: { workspaceId, channel: 'mcp', action: 'listing.updated' },
      })
      res = await api()
        .get('/workspace/getting-started')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(res.body).toMatchObject({ mode: 'none', doneCount: 4 })
    })
  })
})
