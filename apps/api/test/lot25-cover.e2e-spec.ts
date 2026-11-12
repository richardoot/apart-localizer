/**
 * Lot 25 « la fiche répond d'abord » sur PostGIS : la photo de couverture
 * (la première photo prête de la première visite, ou celle qu'un membre
 * choisit), en vignettes signées à durée courte, un seul appel au stockage
 * pour toute une liste ; choix journalisé sans toucher à la date de la
 * fiche ; jamais dans le MCP ni dans l'export. Stockage factice.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const stranger = e2eIdentity('stranger')

const EXAMPLE = {
  title: '[Exemple] T2 couverture',
  price: 190_000,
  surface: 42,
  location: { commune: 'Talence' },
}

const JPEG = {
  contentType: 'image/jpeg',
  sizeBytes: 800_000,
  width: 2048,
  height: 1536,
  caption: null,
  thumbnail: { contentType: 'image/webp', sizeBytes: 25_000 },
}

describe('Lot 25 : la photo de couverture (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let other: string
  let rpcId = 1

  const api = () => request(ctx.server)

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.storage.reset()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Espace des couvertures',
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
    })
    await ctx.prisma.workspace.create({
      data: {
        name: 'Ailleurs',
        members: {
          create: [
            {
              handle: 'stranger',
              displayName: 'Inconnu',
              email: stranger.email,
              role: 'owner',
            },
          ],
        },
      },
    })
    id = (
      await api()
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
    ).body.listing.id as string
    other = (
      await api()
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...EXAMPLE,
          title: '[Exemple] T3 sans visite',
          ignoreDuplicates: true,
        })
        .expect(201)
    ).body.listing.id as string
  })

  async function visit(listingId: string, visitedAt: string): Promise<string> {
    const res = await api()
      .post(`/listings/${listingId}/visits`)
      .set(ctx.auth(richard))
      .send({ visitedAt })
      .expect(201)
    return res.body.visit.id as string
  }

  async function photo(
    listingId: string,
    visitId: string,
    complete = true
  ): Promise<string> {
    const upload = await api()
      .post(`/listings/${listingId}/visits/${visitId}/photos`)
      .set(ctx.auth(chloe))
      .send(JPEG)
      .expect(201)
    const photoId = upload.body.photo.id as string
    if (!complete) return photoId
    ctx.storage.put(upload.body.upload.path, 790_000, 'image/jpeg')
    ctx.storage.put(upload.body.thumbnailUpload.path, 24_000, 'image/webp')
    await api()
      .post(
        `/listings/${listingId}/visits/${visitId}/photos/${photoId}/complete`
      )
      .set(ctx.auth(chloe))
      .expect(200)
    return photoId
  }

  const covers = (ids: string[], who = richard) =>
    api()
      .get(`/listing-covers?ids=${ids.join(',')}`)
      .set(ctx.auth(who))

  it('rien avant la première photo de visite ; puis la première photo de la première visite', async () => {
    expect((await covers([id, other]).expect(200)).body).toEqual({
      covers: [],
    })
    const later = await visit(id, '2026-11-08T17:00:00.000Z')
    const first = await visit(id, '2026-11-02T17:00:00.000Z')
    await photo(id, later)
    await photo(id, first, false) // annoncée, jamais terminée : pas une couverture
    const firstPhoto = await photo(id, first)
    await photo(id, first)
    ctx.storage.signCalls.length = 0

    const res = await covers([id, other]).expect(200)
    expect(res.body.covers).toEqual([
      {
        listingId: id,
        photoId: firstPhoto,
        visitId: first,
        thumbnailUrl: expect.stringMatching(
          /\/sign\/.*-thumb\.webp\?expires=600$/
        ),
        urlExpiresAt: expect.any(String),
        chosen: false,
      },
    ])
    // Une seule signature, des vignettes seulement.
    expect(ctx.storage.signCalls).toHaveLength(1)
    expect(
      ctx.storage.signCalls[0]?.every(p => p.endsWith('-thumb.webp'))
    ).toBe(true)
  })

  it('un membre choisit la couverture : journalisé, la fiche garde sa date ; null revient à la première', async () => {
    const first = await visit(id, '2026-11-02T17:00:00.000Z')
    const second = await visit(id, '2026-11-08T17:00:00.000Z')
    const firstPhoto = await photo(id, first)
    const picked = await photo(id, second)
    const before = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id },
      select: { updatedAt: true },
    })

    const chosen = await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(chloe))
      .send({ photoId: picked })
      .expect(200)
    expect(chosen.body.covers[0]).toMatchObject({
      photoId: picked,
      visitId: second,
      chosen: true,
    })
    const after = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id },
      select: { updatedAt: true, coverPhotoId: true },
    })
    expect(after.coverPhotoId).toBe(picked)
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
    const log = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { action: 'visit.cover_chosen' },
    })
    expect(log).toMatchObject({ listingId: id, channel: 'web' })
    expect(log.after).toEqual({ photoId: picked })

    // Une section modifiée avec l'ancienne date s'enregistre sans conflit.
    await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({ notes: 'Belle lumière', expectedUpdatedAt: before.updatedAt })
      .expect(200)

    // Le même choix ne réécrit rien.
    await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(chloe))
      .send({ photoId: picked })
      .expect(200)
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'visit.cover_chosen' },
      })
    ).toBe(1)

    const reset = await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(richard))
      .send({ photoId: null })
      .expect(200)
    expect(reset.body.covers[0]).toMatchObject({
      photoId: firstPhoto,
      chosen: false,
    })
  })

  it('refuse une photo d’une autre annonce, pas encore envoyée, ou un autre espace', async () => {
    const mine = await visit(id, '2026-11-02T17:00:00.000Z')
    const elsewhere = await visit(other, '2026-11-02T17:00:00.000Z')
    const foreign = await photo(other, elsewhere)
    const pending = await photo(id, mine, false)
    await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(richard))
      .send({ photoId: foreign })
      .expect(404)
    const notYet = await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(richard))
      .send({ photoId: pending })
      .expect(400)
    expect(notYet.body.message).toContain('pas encore envoyée')
    await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(stranger))
      .send({ photoId: null })
      .expect(404)
    expect((await covers([other], stranger).expect(200)).body.covers).toEqual(
      []
    )
    await covers(['pas-un-uuid']).expect(400)
  })

  it('la photo choisie supprimée : retour à la première ; stockage en panne : pas d’image', async () => {
    const v = await visit(id, '2026-11-02T17:00:00.000Z')
    const first = await photo(id, v)
    const picked = await photo(id, v)
    await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(richard))
      .send({ photoId: picked })
      .expect(200)
    await api()
      .delete(`/listings/${id}/visits/${v}/photos/${picked}`)
      .set(ctx.auth(chloe))
      .expect(204)
    const fallback = await covers([id]).expect(200)
    expect(fallback.body.covers[0]).toMatchObject({
      photoId: first,
      chosen: false,
    })
    ctx.storage.down = true
    const down = await covers([id]).expect(200)
    expect(down.body.covers[0]).toMatchObject({
      photoId: first,
      thumbnailUrl: null,
      urlExpiresAt: null,
    })
  })

  it('ni le MCP ni l’export ne portent la couverture', async () => {
    const v = await visit(id, '2026-11-02T17:00:00.000Z')
    const picked = await photo(id, v)
    await api()
      .put(`/listings/${id}/cover`)
      .set(ctx.auth(richard))
      .send({ photoId: picked })
      .expect(200)
    const exported = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const text = JSON.stringify(exported.body)
    // Ni l'identifiant de la photo ni une URL signée (« cover » figure dans
    // `nonRecoverableCharges…` : on cherche ce qui identifierait la photo).
    expect(text).not.toContain(picked)
    expect(text).not.toContain('/sign/')
    expect(text).not.toContain('thumbnail')
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(richard))
      .send({
        jsonrpc: '2.0',
        id: rpcId++,
        method: 'tools/call',
        params: { name: 'get_listing', arguments: { id } },
      })
      .expect(200)
    const mcp = JSON.stringify(res.body)
    expect(mcp).not.toContain(picked)
    expect(mcp).not.toContain('/sign/')
    expect(mcp).not.toContain('thumbnail')
  })
})
