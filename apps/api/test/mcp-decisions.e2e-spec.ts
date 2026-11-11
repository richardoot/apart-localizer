/**
 * Lot 21 au connecteur MCP, par de vrais appels HTTP JSON-RPC : sur une
 * décision à deux, `set_listing_status` propose au nom du membre connecté et
 * répond que l'annonce ne bouge pas ; refus quand un autre membre a déjà
 * proposé ; jamais de confirmation pour l'autre ; lectures qui indiquent la
 * proposition ; 42 outils depuis le lot 27. Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { MCP_TOOL_NAMES } from '../src/mcp/mcp-tools'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const LISTING = {
  title: '[Exemple] T2 Bacalan',
  price: 172_000,
  surface: 42,
  location: { commune: 'Bordeaux' },
  rentalPlan: { targetRent: 720 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

describe('Lot 21 : décisions au connecteur MCP (e2e)', () => {
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

  const text = (result: ToolResult) => result.content[0]?.text ?? ''

  function fenced<T = Record<string, unknown>>(result: ToolResult): T {
    const match = text(result).match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as T
  }

  const statusOf = async () =>
    (await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })).status

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe])
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
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = created.body.listing.id as string
    await request(ctx.server).get('/workspace').set(ctx.auth(chloe)).expect(200)
  })

  it('reste à 42 outils (lot 27 compris)', async () => {
    const res = await rpc(richard, 'tools/list')
    expect(res.body.result.tools).toHaveLength(42)
    expect(MCP_TOOL_NAMES).toHaveLength(42)
  })

  it('propose en son nom : l’annonce ne bouge pas tant que l’autre n’a pas confirmé', async () => {
    const result = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    expect(result.isError).toBeUndefined()
    expect(text(result)).toContain(
      'C’est proposé en ton nom. L’annonce reste À étudier tant que Chloé n’a pas confirmé.'
    )
    expect(await statusOf()).toBe('to_study')
    const proposal = await ctx.prisma.decisionProposal.findFirstOrThrow()
    expect(proposal.channel).toBe('mcp')
    expect(proposal.authorId).toBe(
      (
        await ctx.prisma.member.findFirstOrThrow({
          where: { handle: 'richard' },
        })
      ).id
    )
    const log = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { action: 'decision.proposed' },
    })
    expect(log.channel).toBe('mcp')
  })

  it('écarter sans raison reste refusé ; avec raison, une proposition', async () => {
    const refused = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'discarded',
    })
    expect(refused.isError).toBe(true)
    const proposed = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'discarded',
      reason: 'Trop de travaux',
    })
    expect(text(proposed)).toContain('C’est proposé en ton nom.')
    expect(await statusOf()).toBe('to_study')
  })

  it('le garde-fou expectedStatus reste valable', async () => {
    const result = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
      expectedStatus: 'visited',
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('statut attendu')
    expect(await ctx.prisma.decisionProposal.count()).toBe(0)
  })

  it('Claude ne confirme jamais pour l’autre : refus, renvoi vers l’application', async () => {
    await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    const refused = await callTool(chloe, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toContain(
      'Richard a déjà proposé « À visiter » pour cette annonce. Claude ne confirme jamais pour un autre membre : réponds dans l’application.'
    )
    expect(await statusOf()).toBe('to_study')
    expect(await ctx.prisma.decisionResponse.count()).toBe(0)
    const other = await callTool(chloe, 'set_listing_status', {
      listingId: id,
      status: 'discarded',
      reason: 'Quartier',
    })
    expect(other.isError).toBe(true)
  })

  it('« À trancher ensemble » : Claude ne tranche pas', async () => {
    const proposed = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    const data = fenced<{ proposal: { id: string } }>(proposed)
    await request(ctx.server)
      .post(`/decisions/${data.proposal.id}/respond`)
      .set(ctx.auth(chloe))
      .send({ agree: false, choice: 'discard', reason: 'Quartier' })
      .expect(200)
    const refused = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'discarded',
      reason: 'Quartier',
    })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toContain('tranche-la dans l’application')
    expect(await statusOf()).toBe('to_study')
  })

  it('sa propre proposition, redemandée : rien de plus, le même message', async () => {
    await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    const again = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    expect(again.isError).toBeUndefined()
    expect(text(again)).toContain('C’est proposé en ton nom.')
    expect(await ctx.prisma.decisionProposal.count()).toBe(1)
  })

  it('les lectures indiquent la proposition en cours', async () => {
    await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    const got = await callTool(chloe, 'get_listing', { listingId: id })
    expect(text(got)).toContain(
      'proposition en cours : Richard propose À visiter, en attente de Chloé'
    )
    expect(fenced<{ decision: { state: string } }>(got).decision.state).toBe(
      'open'
    )
    const list = await callTool(chloe, 'list_listings', {})
    expect(text(list)).toContain('proposition en cours')
    const page = fenced<{ items: Array<{ decision: unknown }> }>(list)
    expect(page.items[0]?.decision).not.toBeNull()
  })

  it('un fait s’applique tout de suite et rend la proposition caduque', async () => {
    await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    const sold = await callTool(chloe, 'set_listing_status', {
      listingId: id,
      status: 'sold_or_withdrawn',
    })
    expect(sold.isError).toBeUndefined()
    expect(text(sold)).toContain('Statut : Vendu ou retiré')
    expect(await statusOf()).toBe('sold_or_withdrawn')
    const row = await ctx.prisma.decisionProposal.findFirstOrThrow()
    expect(row.state).toBe('stale')
  })

  it('espace qui décide tout de suite : le statut change, comme avant', async () => {
    await ctx.prisma.workspace.updateMany({ data: { decideTogether: false } })
    const result = await callTool(richard, 'set_listing_status', {
      listingId: id,
      status: 'to_visit',
    })
    expect(text(result)).toContain('Statut : À visiter')
    expect(await statusOf()).toBe('to_visit')
  })

  it('update_listing ne change pas le statut par la bande', async () => {
    const result = await callTool(richard, 'update_listing', {
      listingId: id,
      patch: { status: 'to_visit' },
    })
    expect(result.isError).toBe(true)
    expect(await statusOf()).toBe('to_study')
  })

  it('aucun outil de décision ni de suppression', async () => {
    expect(
      MCP_TOOL_NAMES.filter(name =>
        /confirm|settle|withdraw|decide|delete/.test(name)
      )
    ).toEqual([])
  })
})
