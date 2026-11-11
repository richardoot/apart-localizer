/**
 * Lot 27 au connecteur MCP, par de vrais appels HTTP JSON-RPC : les trois
 * outils (find_similar_listings en lecture, merge_listings et
 * add_listing_seller en écriture), l'accord du membre exigé avant toute
 * fusion ou ajout d'agence, les refus rendus en réponse (garde-fou, portée,
 * fiche déjà fusionnée), une autre agence enregistrée qui rend acceptable le
 * lien de sa page, et ce que get_listing et list_listings disent ensuite.
 * Aucune page de portail n'est téléchargée : liens fictifs (identifiants
 * impossibles `0000000…`), noms « [Exemple] ».
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

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101'
const SL =
  'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple/0000000202.htm'
const PAP = 'https://www.pap.fr/annonces/appartement-bordeaux-r0000000404'
const AGENCY_A = '[Exemple] Immobilier des Chartrons'
const AGENCY_B = '[Exemple] Cabinet Bastide'
const KEPT = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  url: LBC,
  sellerType: 'agency',
  sellerName: AGENCY_A,
  sellerReference: 'EX-2041',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}
const DOUBLE = {
  title: '[Exemple] Appartement 3 pièces Caudéran',
  price: 209_000,
  surface: 68,
  rooms: 3,
  url: SL,
  sellerType: 'agency',
  sellerName: AGENCY_B,
  sellerReference: 'CB-77',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  ignoreDuplicates: true,
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Lot 27 : fusion des doublons et autres agences au connecteur MCP (e2e)', () => {
  let ctx: E2eContext
  let keptId: string
  let doubleId: string
  let chloeId: string
  let rpcId = 1
  const api = () => request(ctx.server)

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

  function fenced<T = Record<string, unknown>>(result: ToolResult): T {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as T
  }

  async function updatedAt(listingId: string): Promise<string> {
    return (
      await api()
        .get(`/listings/${listingId}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body.listing.updatedAt as string
  }

  async function create(body: Record<string, unknown>): Promise<string> {
    return (
      await api()
        .post('/listings')
        .set(ctx.auth(richard))
        .send(body)
        .expect(201)
    ).body.listing.id as string
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
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    keptId = await create(KEPT)
    doubleId = await create(DOUBLE)
  })

  it('déclare les trois outils : une lecture, deux écritures sans suppression', async () => {
    const list = await rpc(richard, 'tools/list')
    const tools = list.body.result.tools as Array<{
      name: string
      annotations: { readOnlyHint?: boolean; destructiveHint?: boolean }
      inputSchema: { required?: string[]; properties: Record<string, unknown> }
    }>
    const tool = (name: string) => tools.find(t => t.name === name)
    expect(tool('find_similar_listings')?.annotations.readOnlyHint).toBe(true)
    expect(tool('merge_listings')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    })
    expect(tool('merge_listings')?.inputSchema.required).toEqual(
      expect.arrayContaining([
        'keepId',
        'mergeId',
        'confirmedInChat',
        'expectedKeepUpdatedAt',
        'expectedMergeUpdatedAt',
      ])
    )
    expect(tool('add_listing_seller')?.inputSchema.required).toEqual(
      expect.arrayContaining(['listingId', 'confirmedInChat'])
    )
    expect(tools.some(t => /unmerge|undo|remove_listing/.test(t.name))).toBe(
      false
    )
  })

  it('find_similar_listings classe par ressemblance, pour une annonce ou des caractéristiques lues', async () => {
    const result = await callTool(richard, 'find_similar_listings', {
      listingId: keptId,
    })
    expect(result.isError).toBeUndefined()
    const text = n(result.content[0]?.text)
    expect(text).toContain('1 annonce ressemblante, dont 1 très proche')
    expect(text).toContain(
      '« [Exemple] Appartement 3 pièces Caudéran » (209 000 €, 68 m², Bordeaux, À étudier)'
    )
    expect(text).toContain('Concorde : ')
    const data = fenced<{ items: Array<{ listingId: string; level: string }> }>(
      result
    )
    expect(data.items[0]).toMatchObject({
      listingId: doubleId,
      level: 'very_close',
    })
    // Des caractéristiques lues sur une page, sans annonce enregistrée.
    const read = fenced<{ items: Array<{ listingId: string }> }>(
      await callTool(reader, 'find_similar_listings', {
        commune: 'Bordeaux',
        district: 'Caudéran',
        surface: 67,
        price: 211_000,
        rooms: 3,
      })
    )
    expect(read.items.map(i => i.listingId).sort()).toEqual(
      [keptId, doubleId].sort()
    )
    // La référence d'une agence désigne la même annonce.
    const byReference = fenced<{ items: Array<{ level: string }> }>(
      await callTool(richard, 'find_similar_listings', {
        sellerName: AGENCY_B,
        reference: 'cb 77',
      })
    )
    expect(byReference.items[0]?.level).toBe('certain')
    const invalid = await callTool(richard, 'find_similar_listings', {})
    expect(invalid.isError).toBe(true)
  })

  it('merge_listings demande l’accord du membre, puis fusionne sans rien supprimer', async () => {
    const guards = {
      keepId: keptId,
      mergeId: doubleId,
      expectedKeepUpdatedAt: await updatedAt(keptId),
      expectedMergeUpdatedAt: await updatedAt(doubleId),
    }
    const unconfirmed = await callTool(richard, 'merge_listings', {
      ...guards,
      confirmedInChat: false,
    })
    expect(unconfirmed.isError).toBe(true)
    expect(unconfirmed.content[0]?.text).toContain(
      'une fusion demande l’accord du membre'
    )
    const denied = await callTool(reader, 'merge_listings', {
      ...guards,
      confirmedInChat: true,
    })
    expect(denied.isError).toBe(true)
    expect(denied.content[0]?.text).toContain('listings:write')
    const stale = await callTool(richard, 'merge_listings', {
      ...guards,
      expectedMergeUpdatedAt: '2020-01-01T00:00:00.000Z',
      confirmedInChat: true,
    })
    expect(stale.isError).toBe(true)
    expect(stale.content[0]?.text).toContain('a changé depuis ta lecture')
    expect(await ctx.prisma.listingMerge.count()).toBe(0)

    const merged = await callTool(richard, 'merge_listings', {
      ...guards,
      confirmedInChat: true,
    })
    expect(merged.isError).toBeUndefined()
    const text = n(merged.content[0]?.text)
    expect(text).toContain(
      'Fusionnée avec « [Exemple] Appartement 3 pièces Caudéran » : 1 lien, 1 agence'
    )
    expect(text).toContain('gardée mais cachée des listes')
    expect(text).toContain('s’annule dans l’application')
    expect(text).toContain(`« ${AGENCY_B} », réf. CB-77`)
    const data = fenced<{
      merge: { channel: string }
      listing: { listing: { price: number }; links: unknown[] }
    }>(merged)
    expect(data.merge.channel).toBe('mcp')
    expect(data.listing.listing.price).toBe(209_000)
    expect(data.listing.links).toHaveLength(2)

    // Rien n'est supprimé : le doublon existe toujours, lié à la fiche gardée.
    const double = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: doubleId },
    })
    expect(double).toMatchObject({ mergedIntoId: keptId, status: 'discarded' })
    const logs = await ctx.prisma.activityLog.findMany({
      where: { action: { in: ['listing.merged', 'listing.absorbed'] } },
    })
    expect(logs.map(l => l.channel)).toEqual(['mcp', 'mcp'])
    const notification = await ctx.prisma.notification.findFirst({
      where: { recipientId: chloeId, listingId: keptId },
      orderBy: { createdAt: 'desc' },
    })
    expect(notification?.title).toContain('Fiches fusionnées')

    // Les lectures : la fiche gardée dit ses agences et son doublon ; le
    // doublon dit où il est passé ; la liste ne le montre plus.
    const kept = await callTool(richard, 'get_listing', { listingId: keptId })
    expect(kept.content[0]?.text).toContain('Vendue par 2 agences')
    expect(kept.content[0]?.text).toContain(
      'Doublons fusionnés dans cette fiche'
    )
    const absorbed = await callTool(richard, 'get_listing', {
      listingId: doubleId,
    })
    expect(absorbed.content[0]?.text).toContain(
      `FICHE FUSIONNÉE : doublon de « [Exemple] T3 68 m², balcon sud » [id ${keptId}]`
    )
    const list = fenced<{ items: Array<{ listing: { id: string } }> }>(
      await callTool(richard, 'list_listings', { status: ['discarded'] })
    )
    expect(list.items.map(i => i.listing.id)).not.toContain(doubleId)

    // Une seconde fusion du même doublon, ou une écriture dessus : refusées.
    const again = await callTool(richard, 'merge_listings', {
      ...guards,
      expectedKeepUpdatedAt: await updatedAt(keptId),
      expectedMergeUpdatedAt: await updatedAt(doubleId),
      confirmedInChat: true,
    })
    expect(again.isError).toBe(true)
    expect(again.content[0]?.text).toContain(
      'a déjà été fusionnée dans une autre fiche'
    )
    const write = await callTool(richard, 'update_listing', {
      listingId: doubleId,
      patch: { notes: 'x' },
    })
    expect(write.isError).toBe(true)
  })

  it('add_listing_seller enregistre une autre agence après accord, et son lien devient acceptable', async () => {
    const reading = {
      listingId: keptId,
      url: PAP,
      price: 216_000,
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du Lac',
      reference: 'AL-900',
    }
    // Sans cette agence sur la fiche, Claude ne rattache pas le lien.
    const refused = await callTool(richard, 'add_listing_link', {
      ...reading,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain(
      'Ce n’est peut-être pas la même annonce'
    )
    expect(refused.content[0]?.text).toContain('add_listing_seller')

    const seller = {
      listingId: keptId,
      sellerName: '[Exemple] Agence du Lac',
      reference: 'Réf. AL-900',
    }
    const unconfirmed = await callTool(richard, 'add_listing_seller', {
      ...seller,
      confirmedInChat: false,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(unconfirmed.isError).toBe(true)
    expect(unconfirmed.content[0]?.text).toContain('record_exploration')
    const denied = await callTool(reader, 'add_listing_seller', {
      ...seller,
      confirmedInChat: true,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(denied.isError).toBe(true)

    const added = await callTool(richard, 'add_listing_seller', {
      ...seller,
      confirmedInChat: true,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(added.isError).toBeUndefined()
    expect(added.content[0]?.text).toContain(
      'Autre agence enregistrée : « [Exemple] Agence du Lac », réf. AL-900'
    )
    const data = fenced<{
      seller: { origin: string; sellerReferenceKey: string }
    }>(added)
    expect(data.seller).toMatchObject({
      origin: 'claude',
      sellerReferenceKey: 'AL900',
    })
    const log = await ctx.prisma.activityLog.findFirst({
      where: { action: 'listing.seller_added' },
    })
    expect(log?.channel).toBe('mcp')

    // Le lien de cette agence est maintenant celui de la même annonce.
    const linked = await callTool(richard, 'add_listing_link', {
      ...reading,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(linked.isError).toBeUndefined()
    expect(linked.content[0]?.text).toContain('Lien PAP ajouté')
    // L'agence et la référence du doublon : c'est une fusion qu'il faut.
    const other = await callTool(richard, 'add_listing_seller', {
      listingId: keptId,
      sellerName: AGENCY_B,
      reference: 'CB-77',
      confirmedInChat: true,
      expectedUpdatedAt: await updatedAt(keptId),
    })
    expect(other.isError).toBe(true)
    expect(other.content[0]?.text).toContain('merge_listings')
  })
})
