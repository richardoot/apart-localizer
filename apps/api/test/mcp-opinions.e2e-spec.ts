/**
 * Lot 20 au connecteur MCP, par de vrais appels HTTP JSON-RPC : add_opinion
 * avec des notes par critère dictées (clé ou libellé, fusion, null efface),
 * toujours pour le membre connecté (un autre membre est refusé, en réponse),
 * critères inconnus ou masqués refusés, garde-fou, portée ; lectures à
 * l'aveugle (get_listing, list_listings, compare_listings, whats_new) qui ne
 * rendent jamais les notes masquées. Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const reader = e2eIdentity('chloe-reader', { scope: 'listings:read' })

const LISTING = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

describe('Lot 20 : nos avis au connecteur MCP (e2e)', () => {
  let ctx: E2eContext
  let id: string
  let other: string
  let chloeId: string
  let rpcId = 1

  async function rpc(
    identity: E2eIdentity,
    method: string,
    params?: unknown
  ): Promise<request.Response> {
    return request(ctx.server)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({ jsonrpc: '2.0', id: rpcId++, method, params })
  }

  async function callTool(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await rpc(identity, 'tools/call', { name, arguments: args })
    expect(res.status).toBe(200)
    expect(res.body.error).toBeUndefined()
    return res.body.result as ToolResult
  }

  const text = (result: ToolResult) => result.content[0]?.text ?? ''

  function fenced<T = Record<string, unknown>>(result: ToolResult): T {
    const match = text(result).match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as T
  }

  beforeAll(async () => {
    reader.supabaseId = chloe.supabaseId
    reader.email = chloe.email
    ctx = await createE2eApp([richard, chloe, reader])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    const workspace = await ctx.prisma.workspace.create({
      data: {
        name: '[Exemple] Bordeaux',
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
    id = (
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(LISTING)
        .expect(201)
    ).body.listing.id
    other = (
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({ ...LISTING, title: '[Exemple] T3 Chartrons, cour' })
        .expect(201)
    ).body.listing.id
  })

  it('add_opinion : notes dictées par critère, clé ou libellé, fusion, null efface', async () => {
    const tools = (await rpc(chloe, 'tools/list')).body.result.tools as Array<{
      name: string
      description: string
      inputSchema: { required?: string[]; properties: Record<string, unknown> }
    }>
    expect(tools).toHaveLength(42)
    const add = tools.find(t => t.name === 'add_opinion')
    expect(add?.inputSchema.required).toEqual(['listingId'])
    expect(Object.keys(add?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['rating', 'text', 'criteria', 'member'])
    )
    expect(add?.description).toContain('notes dictées')
    expect(add?.description).toContain('ne note jamais à sa place')

    const first = await callTool(chloe, 'add_opinion', {
      listingId: id,
      criteria: [
        { criterion: 'Calme', score: 2, word: 'bus devant la chambre' },
        { criterion: 'luminosity', score: 4 },
      ],
    })
    expect(first.isError).toBeUndefined()
    expect(text(first)).toContain(
      "C'est noté pour Chloé (notes dictées) : calme 2 (bof) « bus devant la chambre », luminosité 4 (bien)."
    )
    expect(text(first)).toContain('Sans avis : agencement, état')
    const data = fenced<{
      opinion: { rating: number; scores: Array<{ key: string }> }
    }>(first)
    expect(data.opinion.rating).toBe(0)
    expect(data.opinion.scores.map(s => s.key).sort()).toEqual([
      'luminosity',
      'quiet',
    ])

    const second = await callTool(chloe, 'add_opinion', {
      listingId: id,
      rating: 3,
      text: 'Belle lumière, trop de bruit',
      criteria: [{ criterion: 'calme', score: null }],
    })
    expect(text(second)).toContain('Note globale : 3/5.')
    const after = fenced<{
      opinion: {
        scores: Array<{
          key: string
          score: number | null
          word: string | null
        }>
      }
    }>(second).opinion.scores
    // Le mot du calme reste, la note est effacée ; la luminosité ne bouge pas.
    expect(after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'luminosity', score: 4 }),
        expect.objectContaining({
          key: 'quiet',
          score: null,
          word: 'bus devant la chambre',
        }),
      ])
    )
    const journal = await ctx.prisma.activityLog.findMany({
      where: { listingId: id, action: { startsWith: 'opinion.' } },
      orderBy: { createdAt: 'asc' },
    })
    expect(journal.map(l => [l.action, l.channel])).toEqual([
      ['opinion.created', 'mcp'],
      ['opinion.updated', 'mcp'],
    ])
  })

  it('refus rendus en réponse : un autre membre, critère inconnu ou masqué, rien à écrire, garde-fou, portée', async () => {
    const forOther = await callTool(chloe, 'add_opinion', {
      listingId: id,
      member: 'richard',
      criteria: [{ criterion: 'Calme', score: 4 }],
    })
    expect(forOther.isError).toBe(true)
    expect(text(forOther)).toContain(
      "Claude n'enregistre que l'avis du membre connecté (Chloé)"
    )
    const self = await callTool(chloe, 'add_opinion', {
      listingId: id,
      member: 'Chloé',
      criteria: [{ criterion: 'Calme', score: 4 }],
    })
    expect(self.isError).toBeUndefined()

    const unknown = await callTool(chloe, 'add_opinion', {
      listingId: id,
      criteria: [{ criterion: 'Cuisine', score: 4 }],
    })
    expect(unknown.isError).toBe(true)
    expect(text(unknown)).toContain('aucun critère « Cuisine »')
    expect(text(unknown)).toContain('Calme (quiet)')

    await request(ctx.server)
      .patch('/workspace/opinion-criteria/street')
      .set(ctx.auth(richard))
      .send({ hidden: true })
      .expect(200)
    const hidden = await callTool(chloe, 'add_opinion', {
      listingId: id,
      criteria: [{ criterion: 'Rue et ambiance', score: 3 }],
    })
    expect(hidden.isError).toBe(true)
    expect(text(hidden)).toContain('est masqué')

    const empty = await callTool(chloe, 'add_opinion', { listingId: id })
    expect(empty.isError).toBe(true)
    expect(text(empty)).toContain('Rien à enregistrer')

    const stale = await callTool(chloe, 'add_opinion', {
      listingId: id,
      rating: 5,
      expectedUpdatedAt: null,
    })
    expect(stale.isError).toBe(true)
    expect(text(stale)).toContain('Refusé')

    const bad = await callTool(chloe, 'add_opinion', {
      listingId: id,
      criteria: [{ criterion: 'Calme', score: 9 }],
    })
    expect(bad.isError).toBe(true)

    const readOnly = await callTool(reader, 'add_opinion', {
      listingId: id,
      rating: 4,
    })
    expect(readOnly.isError).toBe(true)
    expect(text(readOnly)).toContain('listings:write')
  })

  it('lectures à l’aveugle : get_listing, list_listings, compare_listings, whats_new', async () => {
    await callTool(chloe, 'add_opinion', {
      listingId: id,
      rating: 3,
      text: 'Trop de bruit côté chambre',
      criteria: [
        { criterion: 'Calme', score: 2, word: 'bus devant la chambre' },
        { criterion: 'On s’y voit', score: 2 },
      ],
    })
    const secret = /bus devant|Trop de bruit|3\/5/

    const listing = await callTool(richard, 'get_listing', { listingId: id })
    expect(text(listing)).toContain(
      "Chloé : a noté 2 critères sur 8 — masqué tant que le membre connecté n'a pas noté"
    )
    expect(text(listing)).not.toMatch(secret)
    const data = fenced<{ opinions: unknown[] }>(listing)
    expect(data.opinions).toEqual([])

    const list = await callTool(richard, 'list_listings', {})
    expect(text(list)).toContain(
      'avis : en attente de Richard et Chloé (masqué)'
    )
    expect(text(list)).not.toMatch(secret)
    const compare = await callTool(richard, 'compare_listings', {
      listingIds: [id, other],
    })
    expect(text(compare)).not.toMatch(secret)
    const news = await callTool(richard, 'whats_new', {
      since: '2020-01-01T00:00:00.000Z',
    })
    expect(text(news)).not.toMatch(secret)
    const pending = await callTool(richard, 'list_listings', {
      opinions: 'pending',
    })
    expect(
      fenced<{ items: Array<{ listing: { id: string } }> }>(pending).items.map(
        i => i.listing.id
      )
    ).toEqual([id])

    // Richard dicte ses notes : la confrontation devient lisible.
    const mine = await callTool(richard, 'add_opinion', {
      listingId: id,
      rating: 4,
      criteria: [
        { criterion: 'calme', score: 4, word: 'fenêtres fermées, ça va' },
        { criterion: 'feel', score: 4 },
      ],
    })
    expect(text(mine)).toContain(
      'Bilan : Désaccord sur le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2).'
    )
    const read = await callTool(richard, 'get_listing', { listingId: id })
    expect(text(read)).toContain('Chloé : 3/5')
    expect(text(read)).toContain('Note commune : 3,0 / 5')
    expect(text(read)).toContain(
      'Calme : Richard 4 « fenêtres fermées, ça va », Chloé 2 « bus devant la chambre » — désaccord de 2 points'
    )
    const discuss = await callTool(richard, 'list_listings', {
      opinions: 'to_discuss',
      sort: 'disagreement',
    })
    expect(text(discuss)).toContain(
      'avis : note commune 3,0, 2 désaccords (calme, on s’y voit)'
    )
    const pair = await callTool(chloe, 'compare_listings', {
      listingIds: [id, other],
    })
    expect(
      fenced<{
        items: Array<{ opinionSummary: { commonScore: number | null } }>
      }>(pair).items[0]?.opinionSummary.commonScore
    ).toBe(3)
    expect(chloeId).toBeTruthy()
  })
})
