/**
 * Lot 24 « mode visite » sur PostGIS : la visite se corrige après coup par
 * son auteur ou un participant, « Marquer faite » porte le compte rendu, la
 * remarque rapide s'ajoute au compte rendu (horodatée, jamais doublée, deux
 * à la fois), tout entre au journal ; « visite aujourd'hui » dans « Ce qui
 * t'attend ».
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const sam = e2eIdentity('sam')

const EXAMPLE = {
  title: '[Exemple] T2 mode visite',
  price: 190_000,
  surface: 42,
  location: { commune: 'Talence' },
}

describe('Lot 24 : mode visite (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let richardId: string
  let chloeId: string

  const api = () => request(ctx.server)

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, sam])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.storage.reset()
    const workspace = await ctx.prisma.workspace.create({
      data: {
        name: 'Espace de visite',
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
            { handle: 'sam', displayName: 'Sam', email: sam.email },
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

  async function plannedVisit(participantIds: string[]) {
    const res = await api()
      .post(`/listings/${id}/visits`)
      .set(ctx.auth(richard))
      .send({
        visitedAt: new Date(Date.now() + 3600_000).toISOString(),
        status: 'planned',
        participantIds,
      })
      .expect(201)
    return res.body.visit as { id: string; updatedAt: string }
  }

  it('« Marquer faite » porte le compte rendu, puis seuls l’auteur et les participants corrigent', async () => {
    const visit = await plannedVisit([richardId, chloeId])
    // Une visite planifiée se modifie par tout membre : Sam la marque faite.
    const done = await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(sam))
      .send({
        status: 'done',
        report: 'Lumineux, parquet d’origine.',
        pros: 'Lumière',
        cons: 'Bruit de la rue',
        rating: 4,
        expectedUpdatedAt: visit.updatedAt,
      })
      .expect(200)
    expect(done.body.visit).toMatchObject({
      status: 'done',
      report: 'Lumineux, parquet d’origine.',
      pros: 'Lumière',
      cons: 'Bruit de la rue',
      rating: 4,
    })
    expect(done.body.suggestedStatus).toBe('visited')

    // Faite : Sam n'est ni l'auteur ni un participant.
    const refused = await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(sam))
      .send({ rating: 1 })
      .expect(403)
    expect(refused.body.message).toBe(
      'Seuls l’auteur de la visite et ses participants peuvent corriger son compte rendu.'
    )
    // Chloé, participante, corrige le compte rendu et la note.
    const fixed = await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(chloe))
      .send({
        report: 'Lumineux, parquet d’origine, cave saine.',
        rating: 3,
        participantIds: [chloeId],
        expectedUpdatedAt: done.body.visit.updatedAt,
      })
      .expect(200)
    expect(fixed.body.visit).toMatchObject({
      rating: 3,
      participantIds: [chloeId],
    })
    expect(fixed.body.suggestedStatus).toBeNull()
    // Richard, l'auteur, garde la main même sans être participant.
    await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(richard))
      .send({ cons: 'Bruit de la rue le soir' })
      .expect(200)
    // Le garde-fou : la date lue avant la correction de Chloé ne vaut plus.
    await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(chloe))
      .send({ rating: 5, expectedUpdatedAt: done.body.visit.updatedAt })
      .expect(409)

    const journal = await ctx.prisma.activityLog.findMany({
      where: { listingId: id, action: 'visit.updated' },
      orderBy: { createdAt: 'asc' },
    })
    expect(journal).toHaveLength(3)
    expect(journal[1]?.after).toMatchObject({
      rating: 3,
      participantIds: [chloeId],
    })
    expect(journal[1]?.before).toMatchObject({ rating: 4 })
  })

  it('la remarque rapide : horodatée, ajoutée au compte rendu, jamais doublée, deux à la fois', async () => {
    const visit = await plannedVisit([richardId, chloeId])
    const remark = {
      text: 'fenêtres en simple vitrage',
      at: '2026-11-10T17:42:00.000Z',
    }
    const first = await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(chloe))
      .send({ remark })
      .expect(200)
    expect(first.body.visit.report).toBe('18 h 42 : fenêtres en simple vitrage')
    // Renvoyée (réponse perdue), elle n'est pas doublée.
    const again = await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(chloe))
      .send({ remark })
      .expect(200)
    expect(again.body.visit.report).toBe('18 h 42 : fenêtres en simple vitrage')
    // Deux membres en même temps : aucune remarque perdue.
    await Promise.all([
      api()
        .patch(`/listings/${id}/visits/${visit.id}`)
        .set(ctx.auth(richard))
        .send({
          remark: { text: 'cave saine', at: '2026-11-10T17:45:00.000Z' },
        })
        .expect(200),
      api()
        .patch(`/listings/${id}/visits/${visit.id}`)
        .set(ctx.auth(chloe))
        .send({
          remark: { text: 'parquet abîmé', at: '2026-11-10T17:46:00.000Z' },
        })
        .expect(200),
    ])
    const list = await api()
      .get(`/listings/${id}/visits`)
      .set(ctx.auth(richard))
      .expect(200)
    const lines = (list.body[0].report as string).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('18 h 42 : fenêtres en simple vitrage')
    expect(lines).toContain('18 h 45 : cave saine')
    expect(lines).toContain('18 h 46 : parquet abîmé')
    // Une remarque vide est refusée.
    await api()
      .patch(`/listings/${id}/visits/${visit.id}`)
      .set(ctx.auth(chloe))
      .send({ remark: { text: '   ', at: remark.at } })
      .expect(400)

    const journal = await api()
      .get(`/listings/${id}/activity`)
      .set(ctx.auth(richard))
      .expect(200)
    const sentences = (journal.body.items as Array<{ summary: string }>).map(
      item => item.summary
    )
    expect(
      sentences.some(s =>
        s.includes(
          'a ajouté une remarque à une visite : « 18 h 42 : fenêtres en simple vitrage »'
        )
      )
    ).toBe(true)
  })

  it('« visite aujourd’hui » dans « Ce qui t’attend », vers l’annonce', async () => {
    await api()
      .post(`/listings/${id}/status`)
      .set(ctx.auth(richard))
      .send({ status: 'to_visit' })
      .expect(200)
    // Aujourd'hui à Paris, quelle que soit l'heure du test : midi UTC du jour.
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/Paris',
    })
    await ctx.prisma.visit.create({
      data: {
        listingId: id,
        visitedAt: new Date(`${today}T11:00:00.000Z`),
        status: 'planned',
        participantIds: [richardId],
      },
    })
    const res = await api()
      .get('/decisions/overview')
      .set(ctx.auth(chloe))
      .expect(200)
    const line = res.body.agenda.find(
      (item: { key: string }) => item.key === 'visit_today'
    )
    expect(line).toMatchObject({
      count: 1,
      label: 'visite aujourd’hui',
      stage: 'a-visiter',
      listingId: id,
    })
    expect(line.detail).toMatch(/^à 1[23] h$/)
    expect(
      res.body.agenda.some(
        (item: { key: string }) => item.key === 'upcoming_visits'
      )
    ).toBe(false)
  })
})
