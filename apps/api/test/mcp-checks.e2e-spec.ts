/**
 * Lot 15 au connecteur MCP, par de vrais appels HTTP JSON-RPC : la file
 * « à revérifier » de list_listings, check_listing (lecture, rien n'est
 * écrit), apply_listing_check (écriture) avec son garde-fou optimiste refusé
 * puis accepté, le statut proposé jamais appliqué, la portée d'écriture, le
 * journal au canal `mcp`, et le prompt « tournée de mise à jour ». Les
 * pages ne sont jamais téléchargées : Claude les lit dans le navigateur.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
/** Un client OAuth qui n'a obtenu que la lecture. */
const reader = e2eIdentity('richard-reader', { scope: 'listings:read' })

const LISTING = {
  title: 'T2 fictif Bègles',
  price: 189_000,
  surface: 42,
  annualCharges: 1_200,
  dpeClass: 'C',
  url: 'https://annonces.exemple.invalid/t2-begles',
  publishedAt: '2026-09-15T00:00:00.000Z',
  location: { commune: 'Bègles' },
  rentalPlan: { targetRent: 720 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Lot 15 : vérifications au connecteur MCP (e2e)', () => {
  let ctx: E2eContext
  let id: string
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

  function fenced(result: ToolResult): Record<string, unknown> {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>
  }

  beforeAll(async () => {
    reader.supabaseId = richard.supabaseId
    reader.email = richard.email
    ctx = await createE2eApp([richard, chloe, reader])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.workspace.create({
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
    })
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = res.body.listing.id
    // Ajoutée il y a trois semaines, jamais revérifiée : à revérifier.
    await ctx.prisma.listing.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 21 * 86_400_000) },
    })
  })

  it('outils, annotations et prompt « tournée de mise à jour »', async () => {
    const list = await rpc(richard, 'tools/list')
    const tools = list.body.result.tools as Array<{
      name: string
      annotations: { readOnlyHint: boolean }
      inputSchema: { properties: Record<string, unknown>; required?: string[] }
    }>
    const check = tools.find(t => t.name === 'check_listing')
    const apply = tools.find(t => t.name === 'apply_listing_check')
    expect(check?.annotations.readOnlyHint).toBe(true)
    expect(apply?.annotations.readOnlyHint).toBe(false)
    expect(check?.inputSchema.properties.observed).toBeDefined()
    expect(check?.inputSchema.properties.pageText).toBeDefined()
    expect(apply?.inputSchema.required).toContain('expectedUpdatedAt')

    const prompts = await rpc(richard, 'prompts/list')
    const review = prompts.body.result.prompts.find(
      (p: { name: string }) => p.name === 'review_listings'
    )
    expect(
      review.arguments.map((a: { name: string }) => a.name).sort()
    ).toEqual(['limit', 'notes', 'staleDays'])
    const got = await rpc(richard, 'prompts/get', {
      name: 'review_listings',
      arguments: { staleDays: '10', notes: 'commence par Bègles' },
    })
    const text = got.body.result.messages[0].content.text as string
    expect(text).toContain('`staleDays: 10`')
    expect(text).toContain('check_listing')
    expect(text).toContain('apply_listing_check')
    expect(text).toContain("dans le navigateur de l'utilisateur")
    expect(text).toContain('ne contourne rien')
    expect(text).toContain('Consignes du membre : commence par Bègles')
  })

  it('list_listings : la file « à revérifier », la dernière vérification sur chaque ligne', async () => {
    const queue = await callTool(richard, 'list_listings', {
      staleDays: 7,
      sort: 'lastCheckedAt',
      order: 'asc',
    })
    expect(queue.content[0]?.text).toContain('1 annonce(s)')
    expect(queue.content[0]?.text).toContain('à revérifier (jamais vérifiée)')
    const items = (fenced(queue).items ?? []) as Array<{
      listing: { lastCheckedAt: string | null; lastSeenOnlineAt: string | null }
      lastCheck: unknown
    }>
    expect(items[0]?.listing.lastCheckedAt).toBeNull()
    expect(items[0]?.lastCheck).toBeNull()
  })

  it('check_listing puis apply_listing_check : garde-fou refusé puis accepté, statut jamais appliqué', async () => {
    // 1. Claude a lu la page dans le navigateur : prix en baisse.
    const preview = await callTool(richard, 'check_listing', {
      listingId: id,
      observed: { price: 179_000, annualCharges: 1_200, online: true },
    })
    expect(preview.isError).toBeUndefined()
    expect(n(preview.content[0]?.text)).toContain(
      'Mise à jour — Prix 189 000 € → 179 000 €.'
    )
    const data = fenced(preview)
    expect(data.persisted).toBe(false)
    expect(data.applies).toEqual(['price'])
    const guards = data.guards as {
      expectedUpdatedAt: string
      expectedPrice: number
    }
    expect(guards.expectedPrice).toBe(189_000)
    expect(await ctx.prisma.listingCheck.count()).toBe(0)

    // 2. Entre-temps, Chloé modifie la fiche : le garde-fou refuse.
    await request(ctx.server)
      .patch(`/listings/${id}`)
      .set(ctx.auth(chloe))
      .send({ notes: 'Appeler l’agence' })
      .expect(200)
    const refused = await callTool(richard, 'apply_listing_check', {
      listingId: id,
      observed: { price: 179_000, online: true },
      ...guards,
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain(
      "L'annonce a changé depuis ta lecture"
    )
    expect(await ctx.prisma.listingCheck.count()).toBe(0)
    expect(
      (
        await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })
      ).price.toNumber()
    ).toBe(189_000)

    // 3. Claude relit, refait la vérification à blanc, puis enregistre.
    const again = fenced(
      await callTool(richard, 'check_listing', {
        listingId: id,
        observed: { price: 179_000, online: true },
      })
    )
    const applied = await callTool(richard, 'apply_listing_check', {
      listingId: id,
      observed: { price: 179_000, online: true },
      evidence: 'Prix : 179 000 € — tél. 05 56 00 00 00',
      checkedUrl: LISTING.url,
      ...(again.guards as Record<string, unknown>),
    })
    expect(applied.isError).toBeUndefined()
    expect(n(applied.content[0]?.text)).toContain(
      'Vérification enregistrée (Mise à jour) : Prix 189 000 € → 179 000 €'
    )
    const result = fenced(applied) as {
      check: { channel: string; evidence: string }
      listing: { listing: { price: number; lastCheckedAt: string } }
    }
    expect(result.check.channel).toBe('mcp')
    expect(result.check.evidence).toBe(
      'Prix : 179 000 € — tél. [téléphone masqué]'
    )
    expect(result.listing.listing.price).toBe(179_000)
    const logs = await ctx.prisma.activityLog.findMany({
      where: { listingId: id, action: 'listing.checked' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.channel).toBe('mcp')

    // 4. L'annonce n'est plus en ligne : statut proposé, jamais appliqué.
    const current = fenced(
      await callTool(richard, 'get_listing', { listingId: id })
    ) as { listing: { updatedAt: string; status: string } }
    const offline = await callTool(richard, 'apply_listing_check', {
      listingId: id,
      observed: { online: false },
      evidence: 'Cette annonce n’est plus disponible.',
      expectedUpdatedAt: current.listing.updatedAt,
    })
    expect(offline.isError).toBeUndefined()
    expect(offline.content[0]?.text).toContain(
      'Statut proposé pour « T2 fictif Bègles » : « Vendu ou retiré »'
    )
    expect(offline.content[0]?.text).toContain('set_listing_status')
    const after = await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })
    expect(after.status).toBe('to_study')

    // 5. La file « à revérifier » ne la contient plus.
    const queue = await callTool(richard, 'list_listings', { staleDays: 7 })
    expect(queue.content[0]?.text).toContain('0 annonce(s)')
  })

  it('jeton en lecture : check_listing permis, apply_listing_check refusé', async () => {
    const preview = await callTool(reader, 'check_listing', {
      listingId: id,
      observed: { online: true },
    })
    expect(preview.isError).toBeUndefined()
    const listing = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id },
    })
    const denied = await callTool(reader, 'apply_listing_check', {
      listingId: id,
      observed: { online: true },
      expectedUpdatedAt: listing.updatedAt.toISOString(),
    })
    expect(denied.isError).toBe(true)
    expect(denied.content[0]?.text).toContain('listings:write')
    expect(await ctx.prisma.listingCheck.count()).toBe(0)
  })

  it('entrées refusées en réponse lisible : clé inconnue, page inaccessible avec des valeurs', async () => {
    const unknownKey = await callTool(richard, 'check_listing', {
      listingId: id,
      observed: { charges: 100 },
    })
    expect(unknownKey.isError).toBe(true)
    const listing = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id },
    })
    const inconsistent = await callTool(richard, 'apply_listing_check', {
      listingId: id,
      outcome: 'inaccessible',
      observed: { price: 1 },
      expectedUpdatedAt: listing.updatedAt.toISOString(),
    })
    expect(inconsistent.isError).toBe(true)
    expect(inconsistent.content[0]?.text).toContain('page inaccessible')
  })
})
