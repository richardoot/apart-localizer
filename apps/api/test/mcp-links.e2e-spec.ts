/**
 * Lot 18 au connecteur MCP, par de vrais appels HTTP JSON-RPC : l'outil
 * add_listing_link (la même annonce sur un autre portail, seulement si
 * l'agence et la référence sont les mêmes) et ses refus rendus en réponse
 * (lien d'une autre fiche, vendeur qui contredit, garde-fou, portée), la
 * vérification d'un lien désigné, get_listing et list_listings avec les
 * liens et le vendeur ; puis le rattachement d'office à l'exploration (même
 * agence, même référence), montré dans « Liens rattachés d'office », son
 * détachement (« Ce n'est pas la même ») et « C'est la même » qui ajoute le
 * lien. Aucune page de portail n'est téléchargée : liens fictifs
 * (identifiants impossibles `0000000…`), noms « [Exemple] ».
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
const BI =
  'https://www.bienici.com/annonce/vente/bordeaux/appartement/0000000303'
const LI = 'https://www.logic-immo.com/detail-vente-0000000404.htm'
const AGENCY = '[Exemple] Immobilier des Chartrons'
const LISTING = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  url: LBC,
  sellerType: 'agency',
  sellerName: AGENCY,
  sellerReference: 'EX-2041',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Lot 18 : une annonce, plusieurs portails au connecteur MCP (e2e)', () => {
  let ctx: E2eContext
  let id: string
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

  async function updatedAt(listingId = id): Promise<string> {
    return (
      await api()
        .get(`/listings/${listingId}`)
        .set(ctx.auth(richard))
        .expect(200)
    ).body.listing.updatedAt as string
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
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(LISTING)
      .expect(201)
    id = res.body.listing.id
  })

  it('add_listing_link : même agence et même référence, écart noté, l’autre membre prévenu', async () => {
    const tools = (await rpc(richard, 'tools/list')).body.result
      .tools as Array<{
      name: string
      annotations: { readOnlyHint: boolean; destructiveHint?: boolean }
      inputSchema: { required?: string[]; properties: Record<string, unknown> }
    }>
    const add = tools.find(t => t.name === 'add_listing_link')
    expect(add?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    })
    expect(add?.inputSchema.required).toEqual(
      expect.arrayContaining(['listingId', 'url', 'expectedUpdatedAt'])
    )
    expect(add?.inputSchema.properties.reference).toBeDefined()

    const added = await callTool(richard, 'add_listing_link', {
      listingId: id,
      url: `${SL}?xtor=AL-1`,
      price: 219_000,
      sellerType: 'agency',
      sellerName: 'Immobilier des Chartrons',
      reference: 'Réf. EX 2041',
      evidence: 'Réf. EX 2041 — 219 000 € — contact 06 12 34 56 78',
      expectedUpdatedAt: await updatedAt(),
    })
    expect(added.isError).toBeUndefined()
    const text = n(added.content[0]?.text)
    expect(text).toContain('Lien SeLoger ajouté : 219 000 €')
    expect(text).toContain(
      'Écart entre portails : SeLoger affiche 219 000 €, +5 000 € par rapport à Leboncoin (214 000 €) : frais inclus ?'
    )
    const result = fenced<{
      link: {
        id: string
        origin: string
        evidence: string
        readReference: string
      }
      listing: { listing: { price: number }; links: unknown[] }
    }>(added)
    expect(result.link.origin).toBe('claude')
    expect(result.link.evidence).toContain('[téléphone masqué]')
    expect(result.link.readReference).toBe('EX 2041')
    expect(result.listing.listing.price).toBe(214_000)
    expect(result.listing.links).toHaveLength(2)
    const notification = await ctx.prisma.notification.findFirst({
      where: { recipientId: chloeId, type: 'listing_checked' },
    })
    expect(notification?.title).toBe(
      'Nouveau lien : [Exemple] T3 68 m², balcon sud'
    )
    const log = await ctx.prisma.activityLog.findFirst({
      where: { action: 'listing_link.added' },
    })
    expect(log?.channel).toBe('mcp')

    // get_listing : « Où la trouver » et « Qui la vend ».
    const read = n(
      (await callTool(richard, 'get_listing', { listingId: id })).content[0]
        ?.text
    )
    expect(read).toContain(`Vendeur : agence « ${AGENCY} », réf. EX-2041.`)
    expect(read).toContain('Liens (2 liens · 2 en ligne) :')
    expect(read).toContain('- SeLoger · 219 000 € · +5 000 € : frais inclus ?')
    // list_listings : la référence, sans espaces ni tirets ; plusieurs portails.
    const listed = await callTool(richard, 'list_listings', {
      reference: 'ex2041',
      multiPortal: true,
    })
    expect(n(listed.content[0]?.text)).toContain('sur 2 portails')
    expect(fenced<{ total: number }>(listed).total).toBe(1)
    const none = await callTool(richard, 'list_listings', {
      sellerType: ['private'],
    })
    expect(fenced<{ total: number }>(none).total).toBe(0)

    // check_listing puis apply_listing_check sur le lien SeLoger.
    const preview = await callTool(richard, 'check_listing', {
      listingId: id,
      linkId: result.link.id,
      observed: { price: 209_000, online: true },
    })
    expect(n(preview.content[0]?.text)).toContain(
      `sur SeLoger [lien ${result.link.id}]`
    )
    const guards = fenced<{
      guards: { expectedUpdatedAt: string }
      link: { id: string }
    }>(preview)
    expect(guards.link.id).toBe(result.link.id)
    const applied = await callTool(richard, 'apply_listing_check', {
      listingId: id,
      linkId: result.link.id,
      observed: { price: 209_000, online: true },
      expectedUpdatedAt: guards.guards.expectedUpdatedAt,
    })
    expect(applied.isError).toBeUndefined()
    expect(n(applied.content[0]?.text)).toContain(
      'Vérification enregistrée sur SeLoger (Mise à jour) : Prix 214 000 € → 209 000 €'
    )
  })

  it('add_listing_link : refus rendus en réponse', async () => {
    const other = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...LISTING,
        title: '[Exemple] T2 52 m², parquet',
        url: BI,
        sellerReference: 'EX-1987',
      })
      .expect(201)
    const stamp = await updatedAt()
    const taken = await callTool(richard, 'add_listing_link', {
      listingId: id,
      url: BI,
      price: 214_000,
      sellerName: AGENCY,
      reference: 'EX-2041',
      expectedUpdatedAt: stamp,
    })
    expect(taken.isError).toBe(true)
    expect(taken.content[0]?.text).toContain(
      `Refusé : Ce lien est déjà celui de l’annonce « [Exemple] T2 52 m², parquet » [id ${other.body.listing.id}]`
    )
    const contradicts = await callTool(richard, 'add_listing_link', {
      listingId: id,
      url: SL,
      sellerName: '[Exemple] Agence du port',
      reference: 'EX-9',
      expectedUpdatedAt: stamp,
    })
    expect(contradicts.isError).toBe(true)
    expect(contradicts.content[0]?.text).toContain(
      'Ce n’est peut-être pas la même annonce : l’agence lue (« [Exemple] Agence du port ») n’est pas celle de la fiche'
    )
    expect(contradicts.content[0]?.text).toContain('record_exploration')
    const own = await callTool(richard, 'add_listing_link', {
      listingId: id,
      url: `${LBC}/`,
      expectedUpdatedAt: stamp,
    })
    expect(own.isError).toBe(true)
    expect(own.content[0]?.text).toContain('Ce lien est déjà sur cette fiche')
    const stale = await callTool(richard, 'add_listing_link', {
      listingId: id,
      url: SL,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(stale.isError).toBe(true)
    expect(stale.content[0]?.text).toContain(
      "L'annonce a changé depuis votre lecture"
    )
    const denied = await callTool(reader, 'add_listing_link', {
      listingId: id,
      url: SL,
      expectedUpdatedAt: stamp,
    })
    expect(denied.isError).toBe(true)
    expect(denied.content[0]?.text).toContain('listings:write')
    expect(
      await ctx.prisma.listingLink.count({ where: { listingId: id } })
    ).toBe(1)
  })

  it('exploration : rattachement d’office (même agence, même référence), « Ce n’est pas la même », « C’est la même »', async () => {
    const candidates = [
      {
        url: BI,
        portal: 'bienici',
        title: '[Exemple] T3 68 m², balcon sud',
        price: 214_000,
        surface: 68,
        rooms: 3,
        commune: 'Bordeaux',
        sellerType: 'agency',
        sellerName: AGENCY,
        reference: 'EX-2041',
      },
      {
        url: LI,
        portal: 'logicimmo',
        title: '[Exemple] T3 68 m² (autre agence)',
        price: 219_000,
        commune: 'Bordeaux',
        sellerType: 'agency',
        sellerName: '[Exemple] Agence du port',
        reference: 'EX 2041',
      },
    ]
    const triage = fenced<{
      items: Array<{ outcome: string; listing: { id: string } | null }>
    }>(await callTool(richard, 'triage_candidates', { candidates }))
    expect(triage.items.map(i => i.outcome)).toEqual([
      'attached',
      'duplicate_probable',
    ])
    expect(triage.items[0]?.listing?.id).toBe(id)
    const recorded = await callTool(richard, 'record_exploration', {
      runKey: 'lot18-e2e-0001',
      portals: [
        { portal: 'bienici', status: 'read', count: 1 },
        { portal: 'logicimmo', status: 'read', count: 1 },
      ],
      candidates,
    })
    expect(recorded.isError).toBeUndefined()
    const record = fenced<{
      attached: Array<{ applied: boolean; listingId: string; linkId: string }>
      drafts: Array<{ id: string }>
      exploration: { counts: { attached: number; duplicateProbable: number } }
    }>(recorded)
    expect(record.attached).toHaveLength(1)
    expect(record.attached[0]).toMatchObject({ applied: true, listingId: id })
    expect(record.exploration.counts).toMatchObject({
      attached: 1,
      duplicateProbable: 1,
    })
    expect(n(recorded.content[0]?.text)).toContain(
      'Lien rattaché d’office à « [Exemple] T3 68 m², balcon sud »'
    )
    const withLinks = (
      await api().get(`/listings/${id}`).set(ctx.auth(richard)).expect(200)
    ).body
    expect(
      withLinks.links.map((l: { portal: string; origin: string }) => [
        l.portal,
        l.origin,
      ])
    ).toEqual([
      ['leboncoin', 'original'],
      ['bienici', 'exploration'],
    ])
    // « Liens rattachés d'office » de l'onglet « À valider ».
    const attached = await api()
      .get('/listing-drafts')
      .query({ status: 'merged', attached: 'true' })
      .set(ctx.auth(richard))
      .expect(200)
    expect(attached.body).toHaveLength(1)
    expect(attached.body[0].attachment).toMatchObject({
      listingId: id,
      listingTitle: '[Exemple] T3 68 m², balcon sud',
      portal: 'bienici',
      fichePrice: 214_000,
      sellerReference: 'EX-2041',
    })
    expect(attached.body[0].attachment.linkId).toBe(record.attached[0]?.linkId)
    // La même référence chez une autre agence : à trancher.
    const pending = (
      await api().get('/listing-drafts').set(ctx.auth(richard)).expect(200)
    ).body as Array<{
      id: string
      url: string
      duplicates: Array<{ listingId: string; reasons: Array<{ kind: string }> }>
    }>
    expect(pending.map(d => d.url)).toEqual([LI])
    expect(pending[0]?.duplicates[0]?.reasons.map(r => r.kind)).toContain(
      'same_reference_other_agency'
    )

    // « Ce n'est pas la même » : le lien quitte la fiche, le brouillon revient.
    const detached = await api()
      .post(`/listing-drafts/${attached.body[0].id}/detach`)
      .set(ctx.auth(chloe))
      .expect(200)
    expect(detached.body).toMatchObject({
      status: 'pending',
      listingId: null,
      attachment: null,
      distinct: true,
    })
    expect(detached.body.detachedAt).not.toBeNull()
    const afterDetach = (
      await api().get(`/listings/${id}`).set(ctx.auth(richard)).expect(200)
    ).body
    expect(afterDetach.links.map((l: { portal: string }) => l.portal)).toEqual([
      'leboncoin',
    ])
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'listing_link.detached', listingId: id },
      })
    ).toBe(1)
    await api()
      .post(`/listing-drafts/${attached.body[0].id}/detach`)
      .set(ctx.auth(chloe))
      .expect(409)
    // Revu à la prochaine exploration : il attend toujours, pas de nouveau rattachement.
    const again = fenced<{
      items: Array<{ outcome: string; alreadyPending: boolean }>
    }>(
      await callTool(richard, 'triage_candidates', {
        candidates: [candidates[0]],
      })
    )
    expect(again.items[0]).toMatchObject({
      outcome: 'duplicate_probable',
      alreadyPending: true,
    })

    // « C'est la même : ajouter ce lien à la fiche » sur la référence d'une autre agence.
    const merged = await api()
      .post(`/listing-drafts/${pending[0]?.id}/merge`)
      .set(ctx.auth(richard))
      .send({ listingId: id })
      .expect(200)
    expect(merged.body.status).toBe('merged')
    expect(n(merged.body.merge.summary)).toContain(
      'Lien Logic-Immo ajouté : 219 000 €'
    )
    // L'agence lue diffère : elle est proposée, jamais écrasée.
    expect(n(merged.body.merge.summary)).toContain(
      'Agence lu « [Exemple] Agence du port », la fiche dit « [Exemple] Immobilier des Chartrons » : à vérifier'
    )
    const final = (
      await api().get(`/listings/${id}`).set(ctx.auth(richard)).expect(200)
    ).body
    expect(final.listing.sellerName).toBe(AGENCY)
    expect(final.links.map((l: { portal: string }) => l.portal)).toEqual([
      'leboncoin',
      'logicimmo',
    ])
  })
})
