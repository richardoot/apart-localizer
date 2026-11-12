/**
 * Lot 30 (ADR 0043) sur PostGIS réel. Claude crée une annonce malgré un
 * doublon probable : l'application pose la question sur les deux fiches.
 * « Non » déclare la paire distincte (plus de doublon, plus de suggestion) ;
 * « Oui » fusionne et tranche la question ; « créer quand même » ne tranche
 * rien. Une fusion s'annule pendant sept
 * jours ; ensuite la fiche absorbée est supprimée à la création ou à la
 * fusion suivante, ce qu'elle a donné reste sur la fiche gardée. Données
 * fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')

/** Le bien suivi, vu une première fois sur un portail. */
const TRACKED = {
  title: '[Exemple] T3 61 m², balcon',
  price: 205_000,
  surface: 61,
  rooms: 3,
  floor: 1,
  url: 'https://www.bienici.com/annonce/exemple-1-9900146',
  location: { commune: 'Mérignac' },
}

/** Le même bien, lu par Claude sur un autre portail. */
const SEEN_AGAIN = {
  title: '[Exemple] Appartement 3 pièces 61 m²',
  price: 204_000,
  surface: 61,
  rooms: 3,
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000002',
  location: { commune: 'Mérignac' },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

const DAY_MS = 86_400_000

describe('Lot 30 : doublons confirmés dans l’application, fiche absorbée supprimée après sept jours (e2e)', () => {
  let ctx: E2eContext
  let trackedId: string
  let nextId = 1
  const api = () => request(ctx.server)

  const post = (path: string, body: object) =>
    api().post(path).set(ctx.auth(richard)).send(body)
  const get = async (id: string) =>
    (await api().get(`/listings/${id}`).set(ctx.auth(richard)).expect(200)).body

  async function callTool(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    expect(res.status).toBe(200)
    return res.body.result as ToolResult
  }

  /** Claude crée le même bien : l'annonce est créée, la question posée. */
  async function createdByClaude(): Promise<string> {
    const result = await callTool(richard, 'create_listing', {
      listing: SEEN_AGAIN,
      provenance: 'user',
    })
    expect(result.isError).toBeUndefined()
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('Annonce créée')
    expect(text).toContain('l’application demandera au membre')
    const id = /\[id ([0-9a-f-]{36})\]/.exec(text)?.[1]
    expect(id).toBeDefined()
    return id as string
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Espace fictif',
        decideTogether: false,
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email,
              role: 'owner',
            },
          ],
        },
      },
    })
    trackedId = (await post('/listings', TRACKED).expect(201)).body.listing
      .id as string
  })

  it('create_listing (MCP) : un doublon probable ne bloque plus, la question est posée sur les deux fiches', async () => {
    const createdId = await createdByClaude()
    expect(await ctx.prisma.listing.count()).toBe(2)

    const created = await get(createdId)
    expect(created.duplicateQuestions).toEqual([
      expect.objectContaining({
        otherId: trackedId,
        otherTitle: TRACKED.title,
        askedChannel: 'mcp',
      }),
    ])
    const tracked = await get(trackedId)
    expect(tracked.duplicateQuestions).toEqual([
      expect.objectContaining({ otherId: createdId, askedChannel: 'mcp' }),
    ])
    const pairs = await ctx.prisma.duplicatePair.findMany()
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.verdict).toBe('pending')

    // get_listing le dit à Claude.
    const read = await callTool(richard, 'get_listing', {
      listingId: trackedId,
    })
    expect(read.content[0]?.text).toContain('Peut-être le même bien')

    // Le formulaire de l'application bloque toujours (le membre est là).
    const refused = await post('/listings', {
      ...SEEN_AGAIN,
      url: 'https://www.seloger.com/annonces/achat/appartement/exemple-9900147.htm',
    }).expect(409)
    expect(refused.body.message).toContain('Doublon probable')
  })

  it('« Non, deux biens différents » : la question disparaît, la paire n’est plus un doublon ni une suggestion', async () => {
    const createdId = await createdByClaude()
    const answered = await post(`/listings/${createdId}/duplicate-distinct`, {
      otherId: trackedId,
    }).expect(200)
    expect(answered.body.duplicateQuestions).toEqual([])
    expect((await get(trackedId)).duplicateQuestions).toEqual([])
    const pair = await ctx.prisma.duplicatePair.findFirstOrThrow()
    expect(pair.verdict).toBe('distinct')
    expect(pair.decidedAt).not.toBeNull()

    const found = await callTool(richard, 'find_duplicates', {
      listingId: createdId,
    })
    expect(found.content[0]?.text).toContain('Aucun doublon probable.')

    // Plus suggérée sans recherche ; retrouvée en la cherchant.
    const suggested = await api()
      .get(`/listings/similar?listingId=${createdId}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      suggested.body.items.map((i: { listingId: string }) => i.listingId)
    ).not.toContain(trackedId)
    const searched = await api()
      .get(`/listings/similar?listingId=${createdId}&q=balcon`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      searched.body.items.map((i: { listingId: string }) => i.listingId)
    ).toContain(trackedId)

    const logs = await ctx.prisma.activityLog.findMany({
      where: { action: 'listing.duplicate_denied' },
    })
    expect(logs.map(log => log.listingId).sort()).toEqual(
      [createdId, trackedId].sort()
    )

    await post(`/listings/${createdId}/duplicate-distinct`, {
      otherId: createdId,
    }).expect(400)
  })

  it('« Oui, fusionner » : la fusion tranche la question', async () => {
    const createdId = await createdByClaude()
    await post(`/listings/${trackedId}/merge`, {
      absorbedId: createdId,
    }).expect(200)
    expect(await ctx.prisma.duplicatePair.count()).toBe(0)
    expect((await get(trackedId)).duplicateQuestions).toEqual([])
  })

  it('créer quand même (REST ou MCP, ignoreDuplicates) : aucune question, rien de tranché', async () => {
    const created = await post('/listings', {
      ...SEEN_AGAIN,
      ignoreDuplicates: true,
    }).expect(201)
    expect(created.body.duplicateQuestions).toEqual([])
    expect(await ctx.prisma.duplicatePair.count()).toBe(0)
    // La ressemblance reste suggérée pour une fusion.
    const suggested = await api()
      .get(`/listings/similar?listingId=${created.body.listing.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      suggested.body.items.map((i: { listingId: string }) => i.listingId)
    ).toContain(trackedId)
  })

  describe('fiche absorbée supprimée après sept jours', () => {
    let absorbedId: string
    let mergeId: string

    beforeEach(async () => {
      absorbedId = (
        await post('/listings', {
          ...SEEN_AGAIN,
          ignoreDuplicates: true,
        }).expect(201)
      ).body.listing.id as string
      const merged = await post(`/listings/${trackedId}/merge`, {
        absorbedId,
      }).expect(200)
      mergeId = merged.body.merge.id as string
      expect(
        Date.parse(merged.body.merge.undoUntil) -
          Date.parse(merged.body.merge.mergedAt)
      ).toBe(7 * DAY_MS)
    })

    /** La fusion a eu lieu il y a `days` jours. */
    async function mergedDaysAgo(days: number): Promise<void> {
      const at = new Date(Date.now() - days * DAY_MS)
      await ctx.prisma.listing.update({
        where: { id: absorbedId },
        data: { mergedAt: at },
      })
      await ctx.prisma.listingMerge.update({
        where: { id: mergeId },
        data: { mergedAt: at },
      })
    }

    it('dans les sept jours, la fiche absorbée reste et la fusion s’annule', async () => {
      await mergedDaysAgo(6)
      await post('/listings', {
        title: '[Exemple] Autre bien',
        price: 150_000,
        surface: 30,
        location: { commune: 'Pessac' },
      }).expect(201)
      expect(await ctx.prisma.listing.count()).toBe(3)
      const kept = await get(trackedId)
      expect(kept.absorbed).toEqual([
        expect.objectContaining({ id: mergeId, undoUntil: expect.any(String) }),
      ])
      await post(`/listing-merges/${mergeId}/undo`, {}).expect(200)
    })

    it('après sept jours, l’annulation est refusée et la création suivante supprime la fiche absorbée', async () => {
      await mergedDaysAgo(8)
      const refused = await post(`/listing-merges/${mergeId}/undo`, {}).expect(
        409
      )
      expect(refused.body.message).toContain('plus de 7 jours')

      await post('/listings', {
        title: '[Exemple] Autre bien',
        price: 150_000,
        surface: 30,
        location: { commune: 'Pessac' },
      }).expect(201)
      expect(
        await ctx.prisma.listing.findUnique({ where: { id: absorbedId } })
      ).toBeNull()
      expect(await ctx.prisma.listingMerge.count()).toBe(0)

      // Le lien venu du doublon et la phrase du journal restent sur la fiche gardée.
      const kept = await get(trackedId)
      expect(kept.links.map((l: { url: string }) => l.url)).toContain(
        SEEN_AGAIN.url
      )
      expect(kept.absorbed).toEqual([])
      const merged = await ctx.prisma.activityLog.count({
        where: { listingId: trackedId, action: 'listing.merged' },
      })
      expect(merged).toBe(1)
    })

    it('après sept jours, une fusion suivante supprime aussi la fiche absorbée', async () => {
      const third = (
        await post('/listings', {
          ...SEEN_AGAIN,
          title: '[Exemple] T3 61 m² troisième portail',
          url: 'https://www.seloger.com/annonces/achat/appartement/exemple-9900148.htm',
          ignoreDuplicates: true,
        }).expect(201)
      ).body.listing.id as string
      await mergedDaysAgo(8)
      await post(`/listings/${trackedId}/merge`, { absorbedId: third }).expect(
        200
      )
      expect(
        await ctx.prisma.listing.findUnique({ where: { id: absorbedId } })
      ).toBeNull()
      // La fusion du jour, elle, s'annule encore.
      const kept = await get(trackedId)
      expect(kept.absorbed).toEqual([
        expect.objectContaining({ absorbedId: third }),
      ])
    })
  })
})
