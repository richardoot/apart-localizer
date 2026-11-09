/**
 * Le connecteur MCP par de vrais appels HTTP JSON-RPC au contrôleur :
 * découverte OAuth, authentification, portées, les dix outils du lot 1 avec
 * leurs garde-fous, le journal d'activité au canal `mcp`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { DEFAULT_TASKS } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import {
  SAMPLE_LISTING_TEXT,
  fakeParsedMessage,
  sampleExtraction,
} from './fixtures/ai-extraction'
import { OAuthDiscoveryService } from '../src/mcp/oauth-discovery.service'
import {
  MCP_PROMPT_NAMES,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
} from '../src/mcp/mcp-tools'
import { DATA_TAG } from '../src/mcp/tool-results'
import { georisquesFetch } from './fixtures/georisques'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
/** Un client OAuth qui n'a obtenu que la lecture. */
const reader = e2eIdentity('richard-reader', { scope: 'openid listings:read' })
/** Le même membre, avec l'écriture. */
const writer = e2eIdentity('richard-writer', {
  scope: 'listings:read listings:write',
})
/**
 * Le même membre derrière un jeton tel que le serveur OAuth de GoTrue le
 * délivre vraiment : une portée OpenID (`email`), aucune de l'application.
 */
const gotrueClient = e2eIdentity('richard-gotrue', { scope: 'email' })

const EXAMPLE = {
  title: 'T2 exemple § 8',
  price: 200_000,
  surface: 45,
  furnitureValue: 5000,
  dpeClass: 'D',
  location: {
    commune: 'Talence',
    point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
    precision: 'exact',
  },
  rentalPlan: { targetRent: 750, demand: 'strong' },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

describe('MCP (e2e)', () => {
  let ctx: E2eContext
  let nextId = 1

  /** Un appel JSON-RPC complet, comme un client MCP sans session l'envoie. */
  async function rpc(
    identity: E2eIdentity | null,
    method: string,
    params?: unknown
  ): Promise<request.Response> {
    const req = request(ctx.server)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
    if (identity) req.set(ctx.auth(identity))
    return req.send({ jsonrpc: '2.0', id: nextId++, method, params })
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

  /** Le JSON encadré dans la balise de données. */
  function fenced(result: ToolResult): Record<string, unknown> {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>
  }

  beforeAll(async () => {
    // Un même membre (Richard) derrière trois jetons : session web, client
    // OAuth en lecture, client OAuth en écriture.
    reader.supabaseId = richard.supabaseId
    reader.email = richard.email
    writer.supabaseId = richard.supabaseId
    writer.email = richard.email
    gotrueClient.supabaseId = richard.supabaseId
    gotrueClient.email = richard.email
    ctx = await createE2eApp([richard, chloe, reader, writer, gotrueClient])
    // La découverte relaie GoTrue : ici, une réponse fabriquée, jamais le réseau.
    const discovery = ctx.app.get(OAuthDiscoveryService)
    discovery.fetchImpl = url =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            issuer: 'http://127.0.0.1:54321/auth/v1',
            authorization_endpoint:
              'http://127.0.0.1:54321/auth/v1/oauth/authorize',
            token_endpoint: 'http://127.0.0.1:54321/auth/v1/oauth/token',
            fetched_from: url,
          }),
      })
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.ai.messages.parse.mockReset()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Richard et Chloé',
        // Lot 21 : ces parcours s'appliquent tout de suite.
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
  })

  describe('découverte et authentification', () => {
    it('publie les métadonnées de ressource protégée avec les portées que GoTrue délivre', async () => {
      const res = await request(ctx.server)
        .get('/.well-known/oauth-protected-resource')
        .expect(200)
      expect(res.body.resource).toMatch(/\/mcp$/)
      expect(res.body.authorization_servers).toEqual([
        'http://127.0.0.1:54321/auth/v1',
      ])
      // GoTrue refuse `listings:*` (« unsupported scope ») : un client qui
      // demanderait ces portées échouerait avant le consentement (ADR 0017).
      expect(res.body.scopes_supported).toEqual(['email'])
      await request(ctx.server)
        .get('/.well-known/oauth-protected-resource/mcp')
        .expect(200)
    })

    it("relaie les métadonnées du serveur d'autorisation de GoTrue", async () => {
      const res = await request(ctx.server)
        .get('/.well-known/oauth-authorization-server')
        .expect(200)
      expect(res.body.token_endpoint).toBe(
        'http://127.0.0.1:54321/auth/v1/oauth/token'
      )
      expect(res.body.fetched_from).toBe(
        'http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server'
      )
    })

    it('sans jeton : 401 et WWW-Authenticate vers la découverte', async () => {
      const res = await rpc(null, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1' },
      })
      expect(res.status).toBe(401)
      expect(res.headers['www-authenticate']).toMatch(
        /^Bearer resource_metadata="http:\/\/[^"]+\/\.well-known\/oauth-protected-resource"$/
      )
      const bad = await request(ctx.server)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', 'Bearer nope')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      expect(bad.status).toBe(401)
      expect(bad.headers['www-authenticate']).toContain('error="invalid_token"')
    })

    it('initialize puis tools/list, sans session', async () => {
      const init = await rpc(richard, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1' },
      })
      expect(init.status).toBe(200)
      expect(init.body.result.serverInfo.name).toBe('apart-localizer')
      expect(init.headers['mcp-session-id']).toBeUndefined()

      const list = await rpc(richard, 'tools/list')
      expect(list.status).toBe(200)
      const names = list.body.result.tools.map((t: { name: string }) => t.name)
      expect(names.sort()).toEqual([...MCP_TOOL_NAMES].sort())
      const create = list.body.result.tools.find(
        (t: { name: string }) => t.name === 'create_listing'
      )
      expect(create.inputSchema.properties.listing).toBeDefined()
      expect(create.inputSchema.properties.provenance).toBeDefined()
      const get = list.body.result.tools.find(
        (t: { name: string }) => t.name === 'get_listing'
      )
      expect(get.annotations.readOnlyHint).toBe(true)
      // Dix-sept outils jusqu'au lot 3, quatre au lot 4 (critères, marché),
      // quatre au lot 5 (scénario, projection, conformité, comparable), trois
      // au lot 6, un au lot 8 (membres, lecture seule), deux au lot 15
      // (vérification des annonces sur le portail), trois au lot 16
      // (exploration des portails par les critères), quatre au lot 17
      // (questions aux agences), un au lot 18 (une annonce, plusieurs
      // portails).
      expect(names).toHaveLength(39)
      const extract = list.body.result.tools.find(
        (t: { name: string }) => t.name === 'extract_listing'
      )
      expect(extract.annotations.readOnlyHint).toBe(true)
      expect(extract.inputSchema.properties.images).toBeDefined()
      expect(
        create.inputSchema.properties.listing.properties.ignoreDuplicates
      ).toBeDefined()
    })

    it('prompts/list et prompts/get : « analyser cette annonce »', async () => {
      const list = await rpc(richard, 'prompts/list')
      expect(list.status).toBe(200)
      const names = list.body.result.prompts.map(
        (p: { name: string }) => p.name
      )
      expect(names).toEqual([...MCP_PROMPT_NAMES])
      const prompt = list.body.result.prompts[0]
      expect(
        prompt.arguments.map((a: { name: string }) => a.name).sort()
      ).toEqual(['notes', 'pageText', 'url'])
      expect(
        prompt.arguments.find((a: { name: string }) => a.name === 'pageText')
          .required
      ).toBe(true)

      const got = await rpc(richard, 'prompts/get', {
        name: 'analyze_listing',
        arguments: {
          pageText: 'T2 Talence 189 000 € FAI',
          url: 'https://agence-fictive.invalid/annonce/1',
          notes: 'Une capture est jointe.',
        },
      })
      expect(got.status).toBe(200)
      const messages = got.body.result.messages as Array<{
        role: string
        content: { type: string; text: string }
      }>
      expect(messages).toHaveLength(1)
      expect(messages[0]?.role).toBe('user')
      const text = messages[0]?.content.text ?? ''
      expect(text).toContain('extract_listing')
      expect(text).toContain('create_listing')
      expect(text).toContain('confirmation explicite')
      expect(text).toContain('https://agence-fictive.invalid/annonce/1')
      expect(text).toContain('Une capture est jointe.')
      expect(text).toContain(
        '<annonce_source>\nT2 Talence 189 000 € FAI\n</annonce_source>'
      )

      const missing = await rpc(richard, 'prompts/get', {
        name: 'analyze_listing',
        arguments: {},
      })
      expect(missing.body.error ?? missing.body.result.isError).toBeTruthy()
    })
  })

  describe('lecture', () => {
    let id: string

    beforeEach(async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      id = res.body.listing.id
    })

    it('list_listings : filtres, point et rayon, pagination, données encadrées', async () => {
      const all = await callTool(richard, 'list_listings', {})
      expect(all.isError).toBeUndefined()
      expect(all.content[0]?.text).toContain(`<${DATA_TAG}>`)
      expect(all.content[0]?.text).toContain('1 annonce(s), page 1/1')
      const page = fenced(all) as { total: number; items: unknown[] }
      expect(page.total).toBe(1)
      expect(all.structuredContent).toEqual(page)

      const near = await callTool(chloe, 'list_listings', {
        near: { longitude: -0.5955, latitude: 44.8077, radiusMeters: 800 },
        newForMe: true,
      })
      const nearPage = fenced(near) as {
        items: Array<{ distanceMeters: number; isNewForMe: boolean }>
      }
      expect(nearPage.items).toHaveLength(1)
      expect(nearPage.items[0]?.distanceMeters).toBeGreaterThan(300)
      expect(nearPage.items[0]?.isNewForMe).toBe(true)

      const far = await callTool(richard, 'list_listings', {
        near: { longitude: -0.6, latitude: 44.865, radiusMeters: 500 },
      })
      expect((fenced(far) as { total: number }).total).toBe(0)

      const invalid = await callTool(richard, 'list_listings', {
        status: ['vendu'],
      })
      expect(invalid.isError).toBe(true)
    })

    it('get_listing : fiche, contrôles, tâches, avis ; refus lisible si inconnue', async () => {
      const result = await callTool(richard, 'get_listing', { listingId: id })
      expect(result.content[0]?.text).toContain('Contrôles de louabilité')
      const item = fenced(result) as {
        listing: { id: string }
        evaluation: { metrics: { totalCost: number } }
        tasks: unknown[]
        context: {
          surroundings: {
            neighbourhood: { status: string }
            supermarkets: { status: string }
          }
        }
      }
      expect(item.listing.id).toBe(id)
      // Lot 11 : quartier et équipements dans `context`, « non disponible »
      // tant que les sources ne sont pas importées.
      expect(item.context.surroundings.neighbourhood.status).toBe('unavailable')
      expect(item.context.surroundings.supermarkets.status).toBe('unavailable')
      expect(result.content[0]?.text).toContain(
        'Quartier : non disponible (source non importée)'
      )
      expect(item.evaluation.metrics.totalCost).toBe(220_000)
      expect(item.tasks).toHaveLength(DEFAULT_TASKS.length)

      const missing = await callTool(richard, 'get_listing', {
        listingId: '99999999-9999-4999-8999-999999999999',
      })
      expect(missing.isError).toBe(true)
      expect(missing.content[0]?.text).toBe('Refusé : Annonce introuvable')
    })

    it('get_assumptions et evaluate_listing', async () => {
      const assumptions = await callTool(richard, 'get_assumptions', {})
      const version = fenced(assumptions) as {
        values: { interestRate: number }
      }
      expect(version.values.interestRate).toBe(0.0365)

      const scenario = await callTool(richard, 'evaluate_listing', {
        listingId: id,
        overrides: { price: 150_000 },
        assumptions: { interestRate: 0.032 },
      })
      expect(scenario.content[0]?.text).toContain('non enregistrée')
      const evaluated = fenced(scenario) as {
        persisted: boolean
        listing: { price: number }
        assumptions: { interestRate: number }
      }
      expect(evaluated.persisted).toBe(false)
      expect(evaluated.listing.price).toBe(150_000)
      expect(evaluated.assumptions.interestRate).toBe(0.032)

      const hypothetical = await callTool(richard, 'evaluate_listing', {
        listing: {
          price: 180_000,
          surface: 40,
          rentalPlan: { targetRent: 700 },
        },
      })
      expect((fenced(hypothetical) as { persisted: boolean }).persisted).toBe(
        false
      )
      const nothing = await callTool(richard, 'evaluate_listing', {})
      expect(nothing.isError).toBe(true)
    })
  })

  describe('extraction et doublons (lot 2)', () => {
    it('extract_listing : fiche pré-remplie, doublons, champs manquants, coût, sans écriture', async () => {
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          ...EXAMPLE,
          title: 'Déjà suivie',
          url: 'https://agence-fictive.invalid/annonce/AGF-12345',
        })
        .expect(201)
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction())
      )
      const result = await callTool(richard, 'extract_listing', {
        text: SAMPLE_LISTING_TEXT,
        url: 'https://agence-fictive.invalid/annonce/AGF-12345',
      })
      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.text ?? ''
      expect(text).toContain('Fiche extraite (non enregistrée)')
      expect(text).toContain('Champs manquants ou douteux : Loyer visé')
      expect(text).toContain('1 doublon(s) probable(s)')
      expect(text).toContain('Même lien')
      expect(text).toContain('Coût : claude-opus-5-5')
      const data = fenced(result) as {
        persisted: boolean
        listing: {
          price: number
          fieldSources: Record<string, { source: string }>
        }
        duplicates: Array<{ title: string }>
        missingFields: Array<{ field: string }>
        usage: { estimatedCostUsd: number }
      }
      expect(data.persisted).toBe(false)
      expect(data.listing.price).toBe(189_000)
      expect(data.listing.fieldSources.surface?.source).toBe('ai')
      expect(data.duplicates.map(d => d.title)).toEqual(['Déjà suivie'])
      expect(data.missingFields.map(m => m.field)).toEqual([
        'rentalPlan.targetRent',
      ])
      expect(data.usage.estimatedCostUsd).toBe(0.0453)
      expect(await ctx.prisma.listing.count()).toBe(1)
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: 'ai.extraction' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.channel).toBe('mcp')

      // Lecture seule : un jeton sans écriture peut extraire.
      const asReader = await callTool(reader, 'extract_listing', {
        text: 'T2 Talence',
      })
      expect(asReader.isError).toBeUndefined()
      const empty = await callTool(richard, 'extract_listing', {})
      expect(empty.isError).toBe(true)
      expect(empty.content[0]?.text).toMatch(/Entrée invalide|validation/i)
    })

    it('extract_listing : refus lisible quand l’IA est indisponible', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(null, { stopReason: 'refusal' })
      )
      const result = await callTool(richard, 'extract_listing', { text: 'x' })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain("refusé d'analyser")
    })

    it('find_duplicates : par lien, adresse, trio ou annonce', async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...EXAMPLE,
          url: 'https://www.seloger.com/annonces/achat/appartement/talence-33/987.htm',
          location: { ...EXAMPLE.location, addressRaw: '12 rue du Forum' },
        })
        .expect(201)
      const id = created.body.listing.id as string

      const byUrl = await callTool(richard, 'find_duplicates', {
        url: 'https://seloger.com/annonces/achat/appartement/talence-33/987.htm?utm_source=x',
      })
      expect(byUrl.content[0]?.text).toContain('Même lien')
      const byTrio = fenced(
        await callTool(richard, 'find_duplicates', {
          commune: 'Talence',
          price: 205_000,
          surface: 44,
        })
      ) as {
        duplicates: Array<{
          listingId: string
          reasons: Array<{ kind: string }>
        }>
      }
      expect(byTrio.duplicates[0]?.listingId).toBe(id)
      expect(byTrio.duplicates[0]?.reasons.map(r => r.kind)).toEqual([
        'same_commune_price_surface',
      ])
      const nearby = fenced(
        await callTool(richard, 'find_duplicates', {
          point: { type: 'Point', coordinates: [-0.5905, 44.8083] },
          surface: 45,
        })
      ) as { duplicates: Array<{ reasons: Array<{ kind: string }> }> }
      expect(nearby.duplicates[0]?.reasons.map(r => r.kind)).toEqual([
        'nearby_similar',
      ])
      const self = await callTool(richard, 'find_duplicates', { listingId: id })
      expect(self.content[0]?.text).toContain('Aucun doublon probable.')
      const nothing = await callTool(richard, 'find_duplicates', {})
      expect(nothing.isError).toBe(true)
    })
  })

  describe('écriture', () => {
    it('create_listing : nouvelle pour Chloé, provenance IA, journal au canal mcp', async () => {
      const result = await callTool(richard, 'create_listing', {
        listing: {
          ...EXAMPLE,
          title: 'T3 vu par Claude',
          url: 'https://exemple.invalid/annonce/1',
          fieldSources: {
            price: { source: 'ai', confidence: 0.95, evidence: '200 000 €' },
          },
        },
      })
      expect(result.isError).toBeUndefined()
      expect(result.content[0]?.text).toContain('Annonce créée')
      const item = fenced(result) as {
        listing: {
          id: string
          fieldSources: Record<string, { source: string }>
        }
      }
      expect(item.listing.fieldSources.price?.source).toBe('ai')
      expect(item.listing.fieldSources.surface?.source).toBe('ai')
      expect(item.listing.fieldSources.commune?.source).toBe('ai')

      const forChloe = await request(ctx.server)
        .get('/listings?newForMe=true')
        .set(ctx.auth(chloe))
        .expect(200)
      expect(forChloe.body.total).toBe(1)
      expect(forChloe.body.items[0].listing.location.point).toEqual(
        EXAMPLE.location.point
      )
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: item.listing.id },
        orderBy: { createdAt: 'asc' },
      })
      expect(logs.map(l => l.action)).toEqual([
        'listing.created',
        'listing.enriched',
      ])
      expect(logs.every(l => l.channel === 'mcp')).toBe(true)
      const prices = await ctx.prisma.priceEvent.findMany({
        where: { listingId: item.listing.id },
      })
      expect(prices[0]?.source).toBe('ai')

      const invalid = await callTool(richard, 'create_listing', {
        listing: { title: '', price: -1 },
      })
      expect(invalid.isError).toBe(true)
    })

    it('create_listing : doublons signalés sans bloquer, ignoreDuplicates journalisé, tâches des champs manquants', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction())
      )
      const extracted = fenced(
        await callTool(richard, 'extract_listing', {
          text: SAMPLE_LISTING_TEXT,
          url: 'https://agence-fictive.invalid/annonce/AGF-12345',
        })
      ) as { listing: Record<string, unknown> }

      const first = await callTool(richard, 'create_listing', {
        listing: extracted.listing,
      })
      expect(first.isError).toBeUndefined()
      expect(first.content[0]?.text).toContain('Aucun doublon probable.')
      expect(first.content[0]?.text).toContain(
        'Tâches créées pour les champs manquants : Fixer le loyer visé'
      )
      const created = fenced(first) as {
        listing: {
          id: string
          fieldSources: Record<string, { source: string }>
        }
        createdTasks: Array<{ origin: string; label: string }>
        duplicates: unknown[]
      }
      expect(created.listing.fieldSources.price?.source).toBe('ai')
      expect(created.createdTasks).toHaveLength(1)
      expect(created.createdTasks[0]?.origin).toBe('missing_field')
      expect(created.duplicates).toEqual([])

      // Lot 18 : le même lien est refusé, même « créer quand même ».
      const sameLink = await callTool(writer, 'create_listing', {
        listing: { ...extracted.listing, ignoreDuplicates: true },
      })
      expect(sameLink.isError).toBe(true)
      expect(sameLink.content[0]?.text).toContain(
        'Refusé : Ce lien est déjà celui de l’annonce'
      )
      // Même agence et même référence : refus qui propose le lien.
      const sameReference = await callTool(writer, 'create_listing', {
        listing: { ...extracted.listing, url: null },
      })
      expect(sameReference.isError).toBe(true)
      expect(sameReference.content[0]?.text).toContain('add_listing_link')
      const again = await callTool(writer, 'create_listing', {
        listing: { ...extracted.listing, url: null, ignoreDuplicates: true },
      })
      expect(again.isError).toBeUndefined()
      expect(again.content[0]?.text).toContain('1 doublon(s) probable(s)')
      expect(again.content[0]?.text).toContain(
        'certain : c’est la même annonce'
      )
      const second = fenced(again) as {
        listing: { id: string }
        duplicates: Array<{
          listingId: string
          reasons: Array<{ kind: string }>
        }>
      }
      expect(second.duplicates[0]?.listingId).toBe(created.listing.id)
      expect(second.duplicates[0]?.reasons.map(r => r.kind)).toContain(
        'same_reference'
      )
      const log = await ctx.prisma.activityLog.findFirst({
        where: { listingId: second.listing.id, action: 'listing.created' },
      })
      expect(log?.channel).toBe('mcp')
      expect(log?.after).toMatchObject({
        ignoreDuplicates: true,
        duplicates: [created.listing.id],
        provenance: 'ai',
      })
    })

    it('update_listing : garde-fous, provenance utilisateur, historique de prix', async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      const id = created.body.listing.id as string
      const updatedAt = created.body.listing.updatedAt as string

      const stale = await callTool(richard, 'update_listing', {
        listingId: id,
        patch: { price: 190_000 },
        expectedPrice: 210_000,
      })
      expect(stale.isError).toBe(true)
      expect(stale.content[0]?.text).toContain('prix attendu')

      const ok = await callTool(richard, 'update_listing', {
        listingId: id,
        patch: { price: 190_000, propertyTax: 900 },
        expectedUpdatedAt: updatedAt,
        expectedPrice: 200_000,
        provenance: 'user',
      })
      expect(ok.isError).toBeUndefined()
      const item = fenced(ok) as {
        listing: {
          price: number
          fieldSources: Record<string, { source: string }>
          updatedAt: string
        }
        priceEvents: Array<{ newPrice: number; source: string }>
      }
      expect(item.listing.price).toBe(190_000)
      expect(item.listing.fieldSources.propertyTax?.source).toBe('user')
      expect(item.priceEvents[0]).toMatchObject({
        newPrice: 190_000,
        source: 'user',
      })

      const replay = await callTool(richard, 'update_listing', {
        listingId: id,
        patch: { notes: 'encore' },
        expectedUpdatedAt: updatedAt,
      })
      expect(replay.isError).toBe(true)
      expect(replay.content[0]?.text).toContain('changé depuis')
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'listing.updated' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.channel).toBe('mcp')
    })

    it('set_listing_status, add_opinion, add_task, complete_task', async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      const id = created.body.listing.id as string

      const refused = await callTool(richard, 'set_listing_status', {
        listingId: id,
        status: 'discarded',
      })
      expect(refused.isError).toBe(true)
      expect(refused.content[0]?.text).toContain('raison')
      const conflict = await callTool(richard, 'set_listing_status', {
        listingId: id,
        status: 'to_visit',
        expectedStatus: 'visited',
      })
      expect(conflict.isError).toBe(true)
      const visited = await callTool(richard, 'set_listing_status', {
        listingId: id,
        status: 'to_visit',
        expectedStatus: 'to_study',
      })
      expect(visited.content[0]?.text).toContain('Statut : À visiter')

      const opinion = await callTool(chloe, 'add_opinion', {
        listingId: id,
        rating: 4,
        text: 'Lumineux',
      })
      expect(opinion.content[0]?.text).toContain("C'est noté pour Chloé")
      expect(
        (fenced(opinion) as { opinion: { rating: number } }).opinion.rating
      ).toBe(4)

      const task = await callTool(richard, 'add_task', {
        listingId: id,
        label: 'Demander le DPE complet',
        assigneeHandle: 'Chloe',
      })
      const taskId = (
        fenced(task) as { task: { id: string; assigneeId: string } }
      ).task.id
      const unknownAssignee = await callTool(richard, 'add_task', {
        listingId: id,
        label: 'x',
        assigneeHandle: 'nobody',
      })
      expect(unknownAssignee.isError).toBe(true)
      expect(unknownAssignee.content[0]?.text).toContain('richard, chloe')

      const done = await callTool(chloe, 'complete_task', {
        listingId: id,
        taskId,
      })
      expect((fenced(done) as { task: { done: boolean } }).task.done).toBe(true)
      const undone = await callTool(chloe, 'complete_task', {
        listingId: id,
        taskId,
        done: false,
      })
      expect((fenced(undone) as { task: { done: boolean } }).task.done).toBe(
        false
      )

      const detail = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(richard))
        .expect(200)
      expect(detail.body.listing.status).toBe('to_visit')
      // Lot 20 : Richard n'a pas noté, l'avis de Chloé lui est masqué
      // (avis à l'aveugle) ; Chloé lit le sien.
      expect(detail.body.opinions).toHaveLength(0)
      const own = await request(ctx.server)
        .get(`/listings/${id}`)
        .set(ctx.auth(chloe))
        .expect(200)
      expect(own.body.opinions).toHaveLength(1)
      expect(detail.body.tasks).toHaveLength(DEFAULT_TASKS.length + 1)
      expect(detail.body.tasks.at(-1).assigneeId).toBe(
        (fenced(task) as { task: { assigneeId: string } }).task.assigneeId
      )
      const channels = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, channel: 'mcp' },
      })
      expect(channels.map(l => l.action).sort()).toEqual(
        [
          'listing.status_changed',
          'opinion.created',
          'task.created',
          'task.completed',
          'task.reopened',
        ].sort()
      )
    })

    it("un jeton en lecture seule lit mais n'écrit pas ; l'écriture passe avec la portée", async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      const id = created.body.listing.id as string

      const read = await callTool(reader, 'get_listing', { listingId: id })
      expect(read.isError).toBeUndefined()
      const denied = await callTool(reader, 'add_task', {
        listingId: id,
        label: 'Interdit',
      })
      expect(denied.isError).toBe(true)
      expect(denied.content[0]?.text).toContain('listings:write')
      const deniedStatus = await callTool(reader, 'set_listing_status', {
        listingId: id,
        status: 'to_visit',
      })
      expect(deniedStatus.isError).toBe(true)

      const allowed = await callTool(writer, 'add_task', {
        listingId: id,
        label: 'Permis',
      })
      expect(allowed.isError).toBeUndefined()
      const tasks = await ctx.prisma.task.findMany({ where: { listingId: id } })
      expect(tasks.map(t => t.label)).toContain('Permis')
      expect(tasks.map(t => t.label)).not.toContain('Interdit')
    })

    it('un jeton OAuth de GoTrue (portée « email » seule) lit et écrit', async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      const id = created.body.listing.id as string

      const read = await callTool(gotrueClient, 'get_listing', {
        listingId: id,
      })
      expect(read.isError).toBeUndefined()
      const written = await callTool(gotrueClient, 'add_task', {
        listingId: id,
        label: 'Écrite par un client OAuth',
      })
      expect(written.isError).toBeUndefined()
      const tasks = await ctx.prisma.task.findMany({ where: { listingId: id } })
      expect(tasks.map(t => t.label)).toContain('Écrite par un client OAuth')
    })

    it("n'expose aucun outil de suppression", async () => {
      const list = await rpc(richard, 'tools/list')
      const names = list.body.result.tools.map((t: { name: string }) => t.name)
      expect(names.some((n: string) => /delete|remove|supprim/i.test(n))).toBe(
        false
      )
    })
  })

  describe('prix cible et négociation (lot 3)', () => {
    let id: string

    beforeEach(async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(EXAMPLE)
        .expect(201)
      id = res.body.listing.id
    })

    it('get_target_price : annonce enregistrée, scénario, hypothétique, sensibilité', async () => {
      const result = await callTool(richard, 'get_target_price', {
        listingId: id,
      })
      expect(result.isError).toBeUndefined()
      expect(result.content[0]?.text).toContain('prix cible')
      expect(result.content[0]?.text).toContain('Rendement brut')
      expect(result.content[0]?.text).toContain('rang 1/1')
      const report = fenced(result) as {
        listingId: string
        targetPrice: { bindingCriterion: string; targetPrice: number }
        rank: { position: number; total: number } | null
        negotiation: { suggestedOffer: number }
        sensitivity: unknown
      }
      expect(report.listingId).toBe(id)
      expect(report.targetPrice.bindingCriterion).toBe('gross_yield')
      expect(Math.round(report.targetPrice.targetPrice / 100) * 100).toBe(
        147_600
      )
      expect(report.rank).toEqual({ position: 1, total: 1 })
      expect(report.negotiation.suggestedOffer).toBe(147_000)
      expect(report.sensitivity).toBeNull()

      const scenario = await callTool(richard, 'get_target_price', {
        listingId: id,
        assumptions: { grossYieldThreshold: 0.045 },
        sensitivity: { rowAxis: 'rate', colAxis: 'rent' },
      })
      const withScenario = fenced(scenario) as {
        rank: unknown
        targetPrice: { targetPrice: number; bindingCriterion: string }
        sensitivity: { rows: unknown[]; cols: unknown[] }
      }
      expect(withScenario.rank).toBeNull()
      // Le brut relâché n'est plus liant : l'effort (≈ 161 900 €) l'est.
      expect(withScenario.targetPrice.targetPrice).toBeGreaterThan(160_000)
      expect(withScenario.targetPrice.bindingCriterion).toBe('effort')
      expect(withScenario.sensitivity.rows).toHaveLength(3)
      expect(scenario.content[0]?.text).toContain('Tableau de sensibilité')

      const hypothetical = await callTool(richard, 'get_target_price', {
        listing: {
          price: 180_000,
          surface: 40,
          rentalPlan: { targetRent: 700 },
        },
      })
      const hypo = fenced(hypothetical) as {
        listingId: string | null
        rank: unknown
        negotiation: { daysOnline: number | null }
      }
      expect(hypo.listingId).toBeNull()
      expect(hypo.rank).toBeNull()
      expect(hypo.negotiation.daysOnline).toBeNull()

      const nothing = await callTool(richard, 'get_target_price', {})
      expect(nothing.isError).toBe(true)
      const unknown = await callTool(richard, 'get_target_price', {
        listingId: '99999999-9999-4999-8999-999999999999',
      })
      expect(unknown.isError).toBe(true)
    })

    it('compare_listings : rangs et meilleure par indicateur ; refus sous deux annonces', async () => {
      const other = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({ ...EXAMPLE, title: 'T2 moins cher', price: 150_000 })
        .expect(201)
      const otherId = other.body.listing.id as string
      const result = await callTool(richard, 'compare_listings', {
        listingIds: [id, otherId],
      })
      expect(result.content[0]?.text).toContain('2 annonces comparées')
      const compared = fenced(result) as {
        items: Array<{ listing: { id: string }; ranks: { grossYield: number } }>
        best: { grossYield: string }
      }
      expect(compared.items.map(i => i.listing.id)).toEqual([id, otherId])
      expect(compared.items[1]?.ranks.grossYield).toBe(1)
      expect(compared.best.grossYield).toBe(otherId)
      const one = await callTool(richard, 'compare_listings', {
        listingIds: [id],
      })
      expect(one.isError).toBe(true)
    })

    it('record_price_change : garde-fou, prix à jour, historique, journal mcp', async () => {
      const stale = await callTool(richard, 'record_price_change', {
        listingId: id,
        newPrice: 190_000,
        expectedPrice: 210_000,
      })
      expect(stale.isError).toBe(true)
      expect(stale.content[0]?.text).toContain('prix attendu')

      const ok = await callTool(richard, 'record_price_change', {
        listingId: id,
        newPrice: 190_000,
        expectedPrice: 200_000,
        source: 'listing',
      })
      expect(ok.isError).toBeUndefined()
      expect(ok.content[0]?.text).toMatch(/200\s000 € → 190\s000 €/)
      const item = fenced(ok) as {
        listing: { price: number }
        priceEvents: Array<{ oldPrice: number | null; newPrice: number }>
      }
      expect(item.listing.price).toBe(190_000)
      expect(item.priceEvents).toHaveLength(2)
      expect(item.priceEvents[0]).toMatchObject({
        oldPrice: 200_000,
        newPrice: 190_000,
      })
      const logs = await ctx.prisma.activityLog.findMany({
        where: { listingId: id, action: 'listing.price_changed' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.channel).toBe('mcp')

      const denied = await callTool(reader, 'record_price_change', {
        listingId: id,
        newPrice: 185_000,
      })
      expect(denied.isError).toBe(true)
    })

    it('record_offer : nouvelle offre, réponse du vendeur, statut proposé jamais forcé', async () => {
      const created = await callTool(writer, 'record_offer', {
        listingId: id,
        amount: 150_000,
        channel: 'phone',
        notes: 'Par téléphone avec l’agence',
      })
      expect(created.isError).toBeUndefined()
      expect(created.content[0]?.text).toContain('Offre enregistrée')
      expect(created.content[0]?.text).toContain(
        'statut proposé : « Offre faite »'
      )
      const result = fenced(created) as {
        offer: { id: string; response: string }
        suggestedStatus: string | null
        currentStatus: string
      }
      expect(result.offer.response).toBe('pending')
      expect(result.suggestedStatus).toBe('offer_made')
      expect(result.currentStatus).toBe('to_study')
      const stillToStudy = await ctx.prisma.listing.findUnique({
        where: { id },
      })
      expect(stillToStudy?.status).toBe('to_study')

      const stale = await callTool(writer, 'record_offer', {
        listingId: id,
        offerId: result.offer.id,
        response: 'accepted',
        expectedResponse: 'refused',
      })
      expect(stale.isError).toBe(true)
      const noChange = await callTool(writer, 'record_offer', {
        listingId: id,
        offerId: result.offer.id,
      })
      expect(noChange.isError).toBe(true)
      const amountOnExisting = await callTool(writer, 'record_offer', {
        listingId: id,
        offerId: result.offer.id,
        amount: 155_000,
      })
      expect(amountOnExisting.isError).toBe(true)

      const answered = await callTool(writer, 'record_offer', {
        listingId: id,
        offerId: result.offer.id,
        response: 'counter_offer',
        counterAmount: 165_000,
        expectedResponse: 'pending',
      })
      expect(answered.isError).toBeUndefined()
      expect(answered.content[0]?.text).toMatch(
        /Contre-proposition à 165\s000 €/
      )
      const updated = fenced(answered) as {
        offer: { response: string; counterAmount: number }
        offers: unknown[]
      }
      expect(updated.offer.response).toBe('counter_offer')
      expect(updated.offer.counterAmount).toBe(165_000)
      expect(updated.offers).toHaveLength(1)

      const neither = await callTool(writer, 'record_offer', { listingId: id })
      expect(neither.isError).toBe(true)
      const denied = await callTool(reader, 'record_offer', {
        listingId: id,
        amount: 100_000,
      })
      expect(denied.isError).toBe(true)
      const logs = await ctx.prisma.activityLog.findMany({
        where: {
          listingId: id,
          action: { in: ['offer.created', 'offer.updated'] },
        },
      })
      expect(logs).toHaveLength(2)
      expect(logs.every(l => l.channel === 'mcp')).toBe(true)
    })

    it('set_assumptions : champs modifiés seulement, garde de version, impact, journal', async () => {
      const before = fenced(await callTool(richard, 'get_assumptions', {})) as {
        id: string
        values: { interestRate: number; downPayment: number }
      }
      const stale = await callTool(writer, 'set_assumptions', {
        values: { interestRate: 0.032 },
        expectedVersion: '99999999-9999-4999-8999-999999999999',
      })
      expect(stale.isError).toBe(true)
      expect(stale.content[0]?.text).toContain('changé depuis')
      const empty = await callTool(writer, 'set_assumptions', { values: {} })
      expect(empty.isError).toBe(true)
      const invalid = await callTool(writer, 'set_assumptions', {
        values: { interestRate: 3.2 },
      })
      expect(invalid.isError).toBe(true)
      expect(
        await ctx.prisma.assumptionsVersion.count({
          where: {
            workspaceId: (await ctx.prisma.workspace.findFirstOrThrow()).id,
          },
        })
      ).toBe(1)

      const ok = await callTool(writer, 'set_assumptions', {
        values: { grossYieldThreshold: 0.04, maxMonthlyEffort: 400 },
        label: 'Cible élargie',
        expectedVersion: before.id,
      })
      expect(ok.isError).toBeUndefined()
      expect(ok.content[0]?.text).toContain(
        'grossYieldThreshold, maxMonthlyEffort'
      )
      expect(ok.content[0]?.text).toContain(
        '1 annonce(s) sur 1 changent de verdict'
      )
      const result = fenced(ok) as {
        id: string
        label: string
        values: {
          grossYieldThreshold: number
          interestRate: number
          downPayment: number
        }
        impact: { changedVerdicts: number; changes: Array<{ after: string }> }
      }
      expect(result.id).not.toBe(before.id)
      expect(result.label).toBe('Cible élargie')
      expect(result.values.grossYieldThreshold).toBe(0.04)
      // Les champs non cités gardent leur valeur en vigueur.
      expect(result.values.interestRate).toBe(before.values.interestRate)
      expect(result.values.downPayment).toBe(before.values.downPayment)
      expect(result.impact.changedVerdicts).toBe(1)
      expect(result.impact.changes[0]?.after).toBe('target')
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: 'assumptions.updated' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.channel).toBe('mcp')

      const denied = await callTool(reader, 'set_assumptions', {
        values: { interestRate: 0.03 },
      })
      expect(denied.isError).toBe(true)
    })

    it('lot 5 : evaluate_scenario sans enregistrement, puis saveAs avec la portée d’écriture', async () => {
      const dry = await callTool(richard, 'evaluate_scenario', {
        listingId: id,
        overrides: { price: 150_000, assumptions: { interestRate: 0.032 } },
      })
      expect(dry.isError).toBeUndefined()
      expect(dry.content[0]?.text).toMatch(
        /Scénario sur T2 exemple § 8 \(non enregistré\)/
      )
      const data = fenced(dry) as {
        persisted: boolean
        savedScenarioId: string | null
        deltas: Array<{ key: string; better: boolean | null }>
      }
      expect(data.persisted).toBe(false)
      expect(data.savedScenarioId).toBeNull()
      expect(data.deltas.find(d => d.key === 'totalCost')?.better).toBe(true)
      expect(await ctx.prisma.scenario.count()).toBe(0)

      const denied = await callTool(reader, 'evaluate_scenario', {
        listingId: id,
        overrides: { price: 150_000 },
        saveAs: { name: 'Prix négocié' },
      })
      expect(denied.isError).toBe(true)
      expect(denied.content[0]?.text).toMatch(/listings:write/)
      expect(await ctx.prisma.scenario.count()).toBe(0)

      const saved = await callTool(writer, 'evaluate_scenario', {
        listingId: id,
        overrides: { price: 150_000 },
        saveAs: { name: 'Prix négocié' },
      })
      expect(saved.isError).toBeUndefined()
      const savedId = (saved.structuredContent as { savedScenarioId: string })
        .savedScenarioId
      expect(savedId).toMatch(/^[0-9a-f-]{36}$/)
      const again = await callTool(reader, 'evaluate_scenario', {
        listingId: id,
        scenarioId: savedId,
      })
      expect(
        (again.structuredContent as { scenario: { name: string } }).scenario
          .name
      ).toBe('Prix négocié')
      const log = await ctx.prisma.activityLog.findFirst({
        where: { action: 'scenario.created' },
      })
      expect(log?.channel).toBe('mcp')
      const invalid = await callTool(richard, 'evaluate_scenario', {
        listingId: id,
      })
      expect(invalid.isError).toBe(true)
    })

    it('lot 5 : get_projection et get_compliance (Géorisques scripté)', async () => {
      const projection = await callTool(richard, 'get_projection', {
        listingId: id,
        horizonYears: 10,
        assumptions: { marginalTaxRate: 0.3, purchaseDate: '2026-01-01' },
      })
      expect(projection.isError).toBeUndefined()
      expect(projection.content[0]?.text).toMatch(
        /Projection de T2 exemple § 8 sur 10 ans/
      )
      expect(projection.content[0]?.text).toMatch(/pas un conseil fiscal/)
      const report = fenced(projection) as {
        rows: unknown[]
        summary: { irrAfterTax: number | null }
      }
      expect(report.rows).toHaveLength(10)
      expect(report.summary.irrAfterTax).not.toBeNull()

      const geo = georisquesFetch()
      ctx.georisques.fetchImpl = geo.fetchImpl
      const compliance = await callTool(richard, 'get_compliance', {
        listingId: id,
      })
      expect(compliance.isError).toBeUndefined()
      expect(compliance.content[0]?.text).toMatch(
        /Conformité de T2 exemple § 8/
      )
      expect(compliance.content[0]?.text).toMatch(
        /Retrait gonflement des argiles/
      )
      const items = (
        compliance.structuredContent as { items: Array<{ key: string }> }
      ).items
      expect(items.some(i => i.key === 'dpe_ban')).toBe(true)
      expect(geo.calls).toHaveLength(1)
      const missing = await callTool(richard, 'get_compliance', {
        listingId: '11111111-1111-4111-8111-111111111111',
      })
      expect(missing.isError).toBe(true)
    })

    it('lot 5 : add_rent_comparable refusé sans la portée, journalisé au canal mcp avec', async () => {
      const denied = await callTool(reader, 'add_rent_comparable', {
        listingId: id,
        rent: 700,
        surface: 40,
      })
      expect(denied.isError).toBe(true)
      expect(await ctx.prisma.rentComparable.count()).toBe(0)
      const added = await callTool(writer, 'add_rent_comparable', {
        listingId: id,
        rent: 700,
        surface: 40,
        furnished: false,
        observedAt: '2026-10-15',
        source: 'leboncoin',
      })
      expect(added.isError).toBeUndefined()
      expect(added.content[0]?.text).toMatch(
        /Comparable ajouté : 700 €\/mois pour 40 m²/
      )
      expect(added.content[0]?.text).toMatch(/il en faut au moins 5/)
      const log = await ctx.prisma.activityLog.findFirst({
        where: { action: 'rent_comparable.created' },
      })
      expect(log?.channel).toBe('mcp')
      const invalid = await callTool(writer, 'add_rent_comparable', {
        listingId: id,
        rent: 700,
      })
      expect(invalid.isError).toBe(true)
    })

    it('ressources : schéma d’annonce et glossaire', async () => {
      const list = await rpc(richard, 'resources/list')
      expect(list.status).toBe(200)
      const uris = list.body.result.resources.map((r: { uri: string }) => r.uri)
      expect(uris.sort()).toEqual([...MCP_RESOURCE_URIS].sort())

      const schema = await rpc(richard, 'resources/read', {
        uri: 'apart://schema/listing',
      })
      expect(schema.status).toBe(200)
      const schemaContent = schema.body.result.contents[0]
      expect(schemaContent.mimeType).toBe('application/schema+json')
      const parsed = JSON.parse(schemaContent.text) as {
        properties: Record<string, { description?: string }>
        required?: string[]
      }
      expect(parsed.properties.price?.description).toContain('euros')
      expect(parsed.properties.rentalPlan).toBeDefined()
      expect(parsed.required).toContain('title')

      const glossary = await rpc(richard, 'resources/read', {
        uri: 'apart://glossaire',
      })
      expect(glossary.status).toBe(200)
      const text = glossary.body.result.contents[0].text as string
      expect(glossary.body.result.contents[0].mimeType).toBe('text/markdown')
      expect(text).toContain('## Rendement brut')
      expect(text).toContain('## Décote nécessaire')
      expect(text).toContain('rdtBrut(P_b) = s_b')
      expect(text).toContain('## TRI (taux de rendement interne)')
      expect(text).toContain('## VAN (valeur actuelle nette)')
      expect(text).toContain('## Cash-flow net d’impôt')
    })
  })
})
