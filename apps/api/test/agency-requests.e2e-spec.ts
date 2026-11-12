/**
 * Lot 17 « questions aux agences » de bout en bout sur PostGIS, par le
 * REST : contact de l'annonceur (saisi, journal sans coordonnées, effacé),
 * tâches liées à un champ, brouillon au texte poli par défaut, validation
 * par lot (tout ou rien), modification qui retire la validation, envoi
 * enregistré (jamais par le serveur), réponse appliquée ou proposée et
 * tâches cochées, garde-fou, valeur proposée appliquée, adresse donnée,
 * relance due et relance envoyée, signature de l'espace, Synthèse, export,
 * espaces étanches. Données fictives (`exemple.invalid`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { DEFAULT_TASKS, ExportDocumentSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

const LISTING = {
  title: 'T2 fictif Bègles',
  price: 189_000,
  surface: 42,
  annualCharges: 1_200,
  // Saisie à la main : une réponse contraire est proposée, jamais écrasée.
  propertyTax: 900,
  dpeClass: 'C',
  url: 'https://annonces.exemple.invalid/t2-begles',
  externalId: 'EX-17',
  location: { commune: 'Bègles' },
  rentalPlan: { targetRent: 720 },
  // Lu sur le portail : une réponse de l'agence l'emporte.
  fieldSources: { annualCharges: { source: 'listing' } },
}

const CONTACT = {
  agencyName: 'Agence [Exemple]',
  contactName: 'Mme [Exemple]',
  email: 'contact@agence.exemple.invalid',
  phone: '05 00 00 00 00',
  portalMessageUrl: null,
  preferredChannel: 'email',
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\u202f\u00a0]/g, ' ') : value

describe('Lot 17 : questions aux agences (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let richardId: string
  let chloeId: string
  const api = () => request(ctx.server)

  async function exchanges(listingId = id) {
    return (
      await api()
        .get(`/listings/${listingId}/agency-requests`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body
  }

  async function listing(listingId = id) {
    return (
      await api()
        .get(`/listings/${listingId}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body
  }

  const taskId = async (label: string, listingId = id) => {
    const item = await listing(listingId)
    return item.tasks.find((t: { label: string }) => t.label === label).id
  }

  async function sentRequest(taskIds?: string[]) {
    await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send(CONTACT)
      .expect(200)
    const draft = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(richard))
      .send(taskIds ? { taskIds } : {})
      .expect(201)
    const requestId = draft.body.request.id
    await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(richard))
      .send({ requestIds: [requestId] })
      .expect(200)
    await api()
      .post(`/agency-requests/${requestId}/sent`)
      .set(ctx.auth(richard))
      .send({ threadRef: 'thread-fictif-1' })
      .expect(200)
    return requestId as string
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
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
    richardId = workspace.members.find(m => m.handle === 'richard')?.id ?? ''
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    await ctx.prisma.workspace.create({
      data: {
        name: 'Ailleurs',
        members: {
          create: [
            {
              handle: 'stranger',
              displayName: 'Stranger',
              email: stranger.email,
              role: 'owner',
            },
          ],
        },
      },
    })
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = res.body.listing.id
  })

  it('pose la checklist avec le champ de chaque question', async () => {
    const item = await listing()
    const fieldOf = (label: string) =>
      item.tasks.find((t: { label: string }) => t.label === label)?.field
    expect(fieldOf(DEFAULT_TASKS[0] as string)).toBe('annualCharges')
    expect(fieldOf(DEFAULT_TASKS[1] as string)).toBe('propertyTax')
    expect(fieldOf(DEFAULT_TASKS[2] as string)).toBe('proceedings')
    expect(fieldOf(DEFAULT_TASKS[3] as string)).toBeNull()
    expect(item.tasks[0]).toMatchObject({
      requestedAt: null,
      requestId: null,
      answeredAt: null,
    })
    // Une tâche saisie au libellé connu reçoit son champ.
    const task = await api()
      .post(`/listings/${id}/tasks`)
      .set(ctx.auth(chloe))
      .send({ label: 'Demander la surface loi Carrez' })
      .expect(201)
    expect(task.body.field).toBe('surface')
    const free = await api()
      .post(`/listings/${id}/tasks`)
      .set(ctx.auth(chloe))
      .send({ label: 'Demander le nombre de lots', field: 'lotsCount' })
      .expect(201)
    expect(free.body.field).toBe('lotsCount')
    const view = await exchanges()
    expect(view.openQuestions.map((q: { label: string }) => q.label)).toEqual([
      DEFAULT_TASKS[0],
      DEFAULT_TASKS[1],
      DEFAULT_TASKS[2],
      DEFAULT_TASKS[3],
      'Demander la surface loi Carrez',
      'Demander le nombre de lots',
    ])
    expect(view.signature).toBe('Richard et Chloé')
    expect(view.contact).toBeNull()
  })

  it('contact : saisi, journal sans coordonnées, effacé ; étanche entre espaces', async () => {
    const empty = await api()
      .get(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(empty.body).toEqual({ contact: null })
    await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send({ ...CONTACT, email: 'pas-une-adresse' })
      .expect(400)
    await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send({})
      .expect(400)
    const saved = await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send(CONTACT)
      .expect(200)
    expect(saved.body).toMatchObject({
      listingId: id,
      agencyName: 'Agence [Exemple]',
      email: 'contact@agence.exemple.invalid',
      preferredChannel: 'email',
      updatedById: richardId,
    })
    await api()
      .get(`/listings/${id}/contact`)
      .set(ctx.auth(stranger))
      .expect(404)
    const logs = await ctx.prisma.activityLog.findMany({
      where: { action: 'contact.updated' },
    })
    expect(logs).toHaveLength(1)
    expect(JSON.stringify(logs[0])).not.toContain('agence.exemple.invalid')
    expect(JSON.stringify(logs[0])).not.toContain('05 00')
    const journal = await api()
      .get(`/listings/${id}/activity`)
      .set(ctx.auth(chloe))
      .expect(200)
    expect(journal.body.items[0]).toMatchObject({
      kind: 'agency',
      summary: expect.stringContaining("a ajouté le contact de l'annonceur"),
    })
    await api()
      .delete(`/listings/${id}/contact`)
      .set(ctx.auth(chloe))
      .expect(204)
    const after = await api()
      .get(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(after.body.contact).toBeNull()
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'contact.cleared' },
      })
    ).toBe(1)
    // Effacer un contact absent ne journalise rien.
    await api()
      .delete(`/listings/${id}/contact`)
      .set(ctx.auth(chloe))
      .expect(204)
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'contact.cleared' },
      })
    ).toBe(1)
  })

  it('brouillon : texte poli par défaut, sans coordonnée de membre ; une question ne se pose pas deux fois', async () => {
    await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send(CONTACT)
      .expect(200)
    const charges = await taskId(DEFAULT_TASKS[0] as string)
    const tax = await taskId(DEFAULT_TASKS[1] as string)
    const res = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(richard))
      .send({ taskIds: [charges, tax] })
      .expect(201)
    const draft = res.body.request
    expect(draft).toMatchObject({
      status: 'draft',
      channel: 'email',
      recipientName: 'Mme [Exemple], Agence [Exemple]',
      createdChannel: 'web',
      taskIds: [charges, tax],
      approvedAt: null,
      sentAt: null,
      followUpDue: false,
    })
    expect(draft.subject).toBe(
      'Votre annonce « T2 fictif Bègles » (réf. EX-17) : quelques questions'
    )
    expect(n(draft.body)).toContain('Bonjour Mme [Exemple],')
    expect(n(draft.body)).toContain('affichée à 189 000 €')
    expect(draft.body).toContain('https://annonces.exemple.invalid/t2-begles')
    expect(draft.body).toContain(
      '- le montant des charges de copropriété annuelles (budget prévisionnel) ;'
    )
    expect(draft.body).toContain('Bien cordialement,\nRichard et Chloé')
    expect(draft.body).not.toContain(richard.email)
    expect(draft.body).not.toContain(chloe.email)
    expect(draft.questions.map((q: { field: string }) => q.field)).toEqual([
      'annualCharges',
      'propertyTax',
    ])
    // La même question ne se repose pas tant qu'elle est en cours.
    const again = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(richard))
      .send({ taskIds: [charges] })
      .expect(400)
    expect(again.body.message).toContain('déjà dans une demande en cours')
    // Sans liste : les questions encore à poser.
    const rest = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(chloe))
      .send({})
      .expect(201)
    expect(rest.body.request.questions).toHaveLength(2)
    const view = await exchanges()
    expect(view.requests).toHaveLength(2)
    expect(view.openQuestions.map((q: { state: string }) => q.state)).toEqual([
      'draft',
      'draft',
      'draft',
      'draft',
    ])
    const journal = await ctx.prisma.activityLog.findMany({
      where: { action: 'agency_request.drafted' },
    })
    expect(journal).toHaveLength(2)
    // Une tâche d'un autre espace, inconnue.
    await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(stranger))
      .send({})
      .expect(404)
  })

  it('validation par lot, tout ou rien ; modifier un message validé retire la validation', async () => {
    const other = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...LISTING,
        title: 'T3 fictif Talence',
        url: null,
        ignoreDuplicates: true,
      })
      .expect(201)
    const a = (
      await api()
        .post(`/listings/${id}/agency-requests`)
        .set(ctx.auth(richard))
        .send({})
        .expect(201)
    ).body.request
    const b = (
      await api()
        .post(`/listings/${other.body.listing.id}/agency-requests`)
        .set(ctx.auth(richard))
        .send({})
        .expect(201)
    ).body.request
    // Sans contact ni lien : canal « autre » ; avec un lien : messagerie.
    expect(a.channel).toBe('portal_message')
    expect(b.channel).toBe('other')
    const pending = await api()
      .get('/agency-requests/pending')
      .set(ctx.auth(chloe))
      .expect(200)
    expect(pending.body.toApprove.map((r: { id: string }) => r.id)).toEqual([
      a.id,
      b.id,
    ])
    expect(pending.body.toApprove[0].listing.title).toBe('T2 fictif Bègles')
    await api()
      .post(`/agency-requests/${b.id}/cancel`)
      .set(ctx.auth(richard))
      .expect(200)
    const refused = await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(chloe))
      .send({ requestIds: [a.id, b.id] })
      .expect(400)
    expect(refused.body.message).toContain(
      'Seul un message « à valider » se valide'
    )
    expect(
      (
        await ctx.prisma.agencyRequest.findUniqueOrThrow({
          where: { id: a.id },
        })
      ).status
    ).toBe('draft')
    const ok = await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(chloe))
      .send({ requestIds: [a.id] })
      .expect(200)
    expect(ok.body.requests[0]).toMatchObject({
      status: 'approved',
      approvedVia: 'app',
      approvedById: chloeId,
    })
    const edited = await api()
      .patch(`/agency-requests/${a.id}`)
      .set(ctx.auth(richard))
      .send({ body: 'Bonjour,\nQuestions corrigées.\nRichard et Chloé' })
      .expect(200)
    expect(edited.body.request).toMatchObject({
      status: 'draft',
      approvedAt: null,
      approvedVia: null,
      body: 'Bonjour,\nQuestions corrigées.\nRichard et Chloé',
    })
    const journal = await api()
      .get(`/listings/${id}/activity`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(journal.body.items[0].summary).toContain('repasse « à valider »')
    await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(stranger))
      .send({ requestIds: [a.id] })
      .expect(404)
  })

  it('envoi : refusé sans validation ; enregistré après, tâches « demandées »', async () => {
    const charges = await taskId(DEFAULT_TASKS[0] as string)
    const draft = (
      await api()
        .post(`/listings/${id}/agency-requests`)
        .set(ctx.auth(richard))
        .send({ taskIds: [charges] })
        .expect(201)
    ).body.request
    const refused = await api()
      .post(`/agency-requests/${draft.id}/sent`)
      .set(ctx.auth(richard))
      .send({})
      .expect(400)
    expect(refused.body.message).toContain("n'est pas validé")
    // Le REST n'accepte pas d'accord « dans la conversation ».
    await api()
      .post(`/agency-requests/${draft.id}/sent`)
      .set(ctx.auth(richard))
      .send({ approvedInChat: true })
      .expect(400)
    expect(
      (
        await ctx.prisma.agencyRequest.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).status
    ).toBe('draft')
    await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(richard))
      .send({ requestIds: [draft.id] })
      .expect(200)
    const sent = await api()
      .post(`/agency-requests/${draft.id}/sent`)
      .set(ctx.auth(richard))
      .send({
        sentAt: '2026-11-05T09:00:00.000Z',
        channel: 'phone',
        threadRef: 'appel du 5 novembre',
      })
      .expect(200)
    expect(sent.body.request).toMatchObject({
      status: 'sent',
      channel: 'phone',
      sentAt: '2026-11-05T09:00:00.000Z',
      sentById: richardId,
      threadRef: 'appel du 5 novembre',
    })
    const task = (await listing()).tasks.find(
      (t: { id: string }) => t.id === charges
    )
    expect(task).toMatchObject({
      done: false,
      requestedAt: '2026-11-05T09:00:00.000Z',
      requestId: draft.id,
    })
    await api()
      .post(`/agency-requests/${draft.id}/cancel`)
      .set(ctx.auth(richard))
      .expect(400)
    await api()
      .patch(`/agency-requests/${draft.id}`)
      .set(ctx.auth(richard))
      .send({ subject: 'Autre objet' })
      .expect(400)
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'agency_request.sent' },
      })
    ).toBe(1)
  })

  it('réponse : appliquée (source « agence »), proposée, tâches cochées, garde-fou, notification, nouveautés', async () => {
    const charges = await taskId(DEFAULT_TASKS[0] as string)
    const tax = await taskId(DEFAULT_TASKS[1] as string)
    const dtg = await taskId(DEFAULT_TASKS[3] as string)
    const requestId = await sentRequest([charges, tax, dtg])
    // Chloé a déjà vu l'annonce : la réponse est une nouveauté pour elle.
    await ctx.prisma.listingView.create({
      data: { listingId: id, memberId: chloeId, seenAt: new Date() },
    })
    const before = await listing()
    const answer = {
      receivedAt: '2026-11-07T15:00:00.000Z',
      excerpt:
        'Bonjour, les charges sont de 140 € par mois, la taxe foncière de 950 €. Le DTG est joint. Appelez-moi au 06 12 34 56 78 ou écrivez à contact@agence.exemple.invalid.',
      values: { annualCharges: 1_680, propertyTax: 950, lotsCount: 24 },
      answeredTaskIds: [dtg],
    }
    const stale = await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({ ...answer, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })
      .expect(409)
    expect(stale.body.message).toContain('a changé depuis ta lecture')
    await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({
        ...answer,
        values: { charges: 1 },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(400)
    const res = await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({ ...answer, expectedUpdatedAt: before.listing.updatedAt })
      .expect(200)
    expect(res.body.applied.map((c: { key: string }) => c.key)).toEqual([
      'annualCharges',
      'lotsCount',
    ])
    expect(res.body.proposed.map((c: { key: string }) => c.key)).toEqual([
      'propertyTax',
    ])
    expect(n(res.body.proposed[0].text)).toBe(
      'Taxe foncière : 950 € proposé, la fiche garde 900 € (saisi à la main)'
    )
    expect(
      res.body.completedTasks.map((t: { id: string }) => t.id).sort()
    ).toEqual([charges, tax, dtg].sort())
    expect(res.body.answer.excerpt).toContain('[téléphone masqué]')
    expect(res.body.answer.excerpt).toContain('[e-mail masqué]')
    expect(res.body.answer.excerpt).not.toContain('06 12')
    expect(res.body.request).toMatchObject({
      status: 'answered',
      answeredAt: '2026-11-07T15:00:00.000Z',
      followUpDue: false,
    })
    const after = res.body.listing.listing
    expect(after.annualCharges).toBe(1_680)
    expect(after.lotsCount).toBe(24)
    expect(after.propertyTax).toBe(900)
    expect(after.fieldSources.annualCharges).toMatchObject({
      source: 'agency',
      recordedAt: '2026-11-07T15:00:00.000Z',
      evidence: expect.stringContaining('140 € par mois'),
    })
    expect(after.fieldSources.annualCharges.evidence).not.toContain('06 12')
    const task = res.body.listing.tasks.find(
      (t: { id: string }) => t.id === charges
    )
    expect(task).toMatchObject({
      done: true,
      answeredAt: '2026-11-07T15:00:00.000Z',
      requestId,
    })
    // Le journal le dit, Chloé est prévenue, « ce qui a changé » aussi.
    const journal = await api()
      .get(`/listings/${id}/activity`)
      .set(ctx.auth(chloe))
      .expect(200)
    const entry = journal.body.items.find(
      (i: { action: string }) => i.action === 'agency_request.answered'
    )
    expect(n(entry.summary)).toContain("a enregistré la réponse de l'annonceur")
    expect(n(entry.summary)).toContain('(1 valeur proposée, à confirmer)')
    // JSONB ne garde pas l'ordre des clés : on compare sans ordre.
    expect(entry.changes.map((c: { label: string }) => c.label).sort()).toEqual(
      ['Charges annuelles', 'Lots de la copropriété']
    )
    const notifications = await ctx.prisma.notification.findMany({
      where: { type: 'agency_answer' },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipientId: chloeId,
      title: "Réponse de l'agence : T2 fictif Bègles",
      url: `/annonces/${id}?onglet=a-faire`,
    })
    const whatsNew = await api()
      .get('/whats-new')
      .set(ctx.auth(chloe))
      .expect(200)
    expect(whatsNew.body.counts.agency_answer).toBe(1)
    // Valeur proposée : le membre choisit la réponse de l'agence.
    const current = await listing()
    await api()
      .post(`/agency-requests/${requestId}/apply`)
      .set(ctx.auth(chloe))
      .send({ keys: ['surface'], expectedUpdatedAt: current.listing.updatedAt })
      .expect(400)
    const applied = await api()
      .post(`/agency-requests/${requestId}/apply`)
      .set(ctx.auth(chloe))
      .send({
        keys: ['propertyTax'],
        expectedUpdatedAt: current.listing.updatedAt,
      })
      .expect(200)
    expect(applied.body.listing.listing.propertyTax).toBe(950)
    expect(applied.body.listing.listing.fieldSources.propertyTax.source).toBe(
      'agency'
    )
    expect(applied.body.applied[0]).toMatchObject({
      key: 'propertyTax',
      disposition: 'applied',
    })
    expect(
      applied.body.request.answers[0].changes.find(
        (c: { key: string }) => c.key === 'propertyTax'
      ).disposition
    ).toBe('applied')
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'agency_request.value_applied' },
      })
    ).toBe(1)
  })

  it('réponse partielle : la question restante attend, une relance devient due puis part', async () => {
    const charges = await taskId(DEFAULT_TASKS[0] as string)
    const tax = await taskId(DEFAULT_TASKS[1] as string)
    const requestId = await sentRequest([charges, tax])
    const before = await listing()
    await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({
        excerpt: 'Charges : 1 500 € par an. Je reviens vers vous pour la taxe.',
        values: { annualCharges: 1_500 },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    // Vieillie de trois semaines : la relance est due.
    await ctx.prisma.agencyRequest.update({
      where: { id: requestId },
      data: {
        sentAt: new Date(Date.now() - 21 * 86_400_000),
        answeredAt: new Date(Date.now() - 20 * 86_400_000),
      },
    })
    const view = await exchanges()
    const req = view.requests.find((r: { id: string }) => r.id === requestId)
    expect(req.followUpDue).toBe(true)
    expect(
      view.openQuestions.find((q: { taskId: string }) => q.taskId === tax).state
    ).toBe('requested')
    const pending = await api()
      .get('/agency-requests/pending')
      .set(ctx.auth(richard))
      .expect(200)
    expect(pending.body.followUpsDue.map((r: { id: string }) => r.id)).toEqual([
      requestId,
    ])
    const followUp = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(richard))
      .send({ followUpOf: requestId })
      .expect(201)
    expect(followUp.body.request.taskIds).toEqual([tax])
    expect(followUp.body.request.subject).toMatch(/^Relance : /)
    expect(followUp.body.request.channel).toBe('email')
    // En préparation : la demande d'origine n'est plus « à relancer ».
    expect(
      (await exchanges()).requests.find(
        (r: { id: string }) => r.id === requestId
      ).followUpDue
    ).toBe(false)
    await api()
      .post('/agency-requests/approve')
      .set(ctx.auth(richard))
      .send({ requestIds: [followUp.body.request.id] })
      .expect(200)
    await api()
      .post(`/agency-requests/${followUp.body.request.id}/sent`)
      .set(ctx.auth(richard))
      .send({})
      .expect(200)
    const original = await ctx.prisma.agencyRequest.findUniqueOrThrow({
      where: { id: requestId },
    })
    expect(original.status).toBe('no_answer')
    const task = (await listing()).tasks.find(
      (t: { id: string }) => t.id === tax
    )
    expect(task.requestId).toBe(followUp.body.request.id)
    // Une réponse tardive à la demande close s'enregistre encore.
    const late = await listing()
    await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({
        excerpt: 'Taxe foncière 2025 : 900 €.',
        values: { propertyTax: 900 },
        expectedUpdatedAt: late.listing.updatedAt,
      })
      .expect(200)
  })

  it('pas de réponse : la demande est close et ses questions se reposent', async () => {
    const charges = await taskId(DEFAULT_TASKS[0] as string)
    const requestId = await sentRequest([charges])
    const closed = await api()
      .post(`/agency-requests/${requestId}/no-answer`)
      .set(ctx.auth(chloe))
      .expect(200)
    expect(closed.body.request.status).toBe('no_answer')
    expect(closed.body.request.closedAt).not.toBeNull()
    const view = await exchanges()
    expect(view.openQuestions[0]).toMatchObject({
      taskId: charges,
      state: 'open',
    })
    await api()
      .post(`/agency-requests/${requestId}/no-answer`)
      .set(ctx.auth(chloe))
      .expect(400)
  })

  it('adresse donnée : écrite par l’écriture des annonces, provenance « agence »', async () => {
    const address = await api()
      .post(`/listings/${id}/tasks`)
      .set(ctx.auth(richard))
      .send({ label: "Demander l'adresse exacte du bien" })
      .expect(201)
    const requestId = await sentRequest([address.body.id])
    const before = await listing()
    const res = await api()
      .post(`/agency-requests/${requestId}/answer`)
      .set(ctx.auth(richard))
      .send({
        excerpt: 'Le bien est au 12 rue [Exemple].',
        values: { addressRaw: '12 rue [Exemple], Bègles' },
        expectedUpdatedAt: before.listing.updatedAt,
      })
      .expect(200)
    expect(res.body.listing.listing.location.addressRaw).toBe(
      '12 rue [Exemple], Bègles'
    )
    expect(res.body.listing.listing.fieldSources.addressRaw.source).toBe(
      'agency'
    )
    expect(res.body.completedTasks.map((t: { id: string }) => t.id)).toEqual([
      address.body.id,
    ])
  })

  it('signature de l’espace et export JSON (version 1)', async () => {
    const settings = await api()
      .get('/agency-requests/settings')
      .set(ctx.auth(richard))
      .expect(200)
    expect(settings.body).toEqual({
      signature: 'Richard et Chloé',
      custom: false,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    const custom = await api()
      .put('/agency-requests/settings')
      .set(ctx.auth(chloe))
      .send({ signature: 'Chloé et Richard [Exemple]' })
      .expect(200)
    expect(custom.body).toMatchObject({
      signature: 'Chloé et Richard [Exemple]',
      custom: true,
    })
    const draft = await api()
      .post(`/listings/${id}/agency-requests`)
      .set(ctx.auth(richard))
      .send({})
      .expect(201)
    expect(draft.body.request.body).toContain(
      'Bien cordialement,\nChloé et Richard [Exemple]'
    )
    await api()
      .put('/agency-requests/settings')
      .set(ctx.auth(chloe))
      .send({ signature: null })
      .expect(200)
    await api()
      .put(`/listings/${id}/contact`)
      .set(ctx.auth(richard))
      .send(CONTACT)
      .expect(200)
    const exported = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const document = ExportDocumentSchema.parse(JSON.parse(exported.text))
    expect(document.version).toBe(1)
    expect(document.listings[0]?.contact).toMatchObject({
      agencyName: 'Agence [Exemple]',
    })
    expect(document.listings[0]?.agencyRequests).toHaveLength(1)
    expect(document.listings[0]?.tasks[0]?.field).toBe('annualCharges')
    // Un export antérieur au lot 17 se lit encore (défauts).
    const legacy = JSON.parse(exported.text)
    delete legacy.listings[0].contact
    delete legacy.listings[0].agencyRequests
    for (const t of legacy.listings[0].tasks) {
      delete t.field
      delete t.requestedAt
      delete t.requestId
      delete t.answeredAt
    }
    const old = ExportDocumentSchema.parse(legacy)
    expect(old.listings[0]?.contact).toBeNull()
    expect(old.listings[0]?.agencyRequests).toEqual([])
    expect(old.listings[0]?.tasks[0]?.field).toBeNull()
    // Le CSV ne porte aucune coordonnée de l'annonceur.
    const csv = await api()
      .get('/export?format=csv')
      .set(ctx.auth(richard))
      .expect(200)
    expect(csv.text).not.toContain('agence.exemple.invalid')
  })
})
