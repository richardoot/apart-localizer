/**
 * Lot 16 : exploration par les critères (ADR 0026) sur un vrai PostGIS, par
 * le MCP (JSON-RPC réel : get_search_brief, triage_candidates,
 * record_exploration, prompt explore_listings) et le REST (brief d'un
 * critère, explorations et compte rendu, brouillons « À valider » :
 * ajout direct, écart avec raison et annulation, « c'est la même », « c'en
 * est une autre », « ajouter celles dans les critères »). Claude n'ajoute
 * jamais une annonce ; une annonce écartée n'est jamais reproposée ; une
 * annonce suivie revue au même lien devient une vérification (lot 15) ; une
 * annonce hors critères n'est qu'une ligne. Aucune page de portail n'est
 * téléchargée : le géocodeur est simulé. Données et lieux fictifs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { Polygon } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { NeighbourhoodRow } from '../src/geo/geo.service'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
/** Un client OAuth qui n'a obtenu que la lecture. */
const reader = e2eIdentity('richard-reader', { scope: 'listings:read' })

const square = (west: number, south: number, w: number, h = w): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [west + w, south],
      [west + w, south + h],
      [west, south + h],
      [west, south],
    ],
  ],
})

/** Un secteur fictif de Bordeaux, dans le périmètre. */
const SECTOR: NeighbourhoodRow = {
  kind: 'quartier',
  code: 'S-FICTIF',
  name: 'Secteur fictif Ouest',
  parent: null,
  commune: 'Bordeaux',
  inseeCode: '33063',
  source: 'Secteurs fictifs',
  geometry: square(-0.6, 44.85, 0.01),
}
/** Le périmètre du critère : il couvre le secteur et la rue fictive. */
const BOX = square(-0.61, 44.84, 0.03, 0.03)

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

/** Le géocodeur simulé : la commune au centre, « rue fictive » au numéro dans le périmètre. */
function geocoder() {
  return (url: string) =>
    url.includes('type=municipality')
      ? json({
          features: [
            {
              geometry: { type: 'Point', coordinates: [-0.59, 44.85] },
              properties: {
                label: 'Bordeaux',
                score: 0.9,
                type: 'municipality',
                city: 'Bordeaux',
                citycode: '33063',
              },
            },
          ],
        })
      : json({
          features: decodeURIComponent(url.replace(/\+/g, ' '))
            .toLowerCase()
            .includes('rue fictive')
            ? [
                {
                  geometry: { type: 'Point', coordinates: [-0.592, 44.856] },
                  properties: {
                    label: '1 Rue Fictive 33000 Bordeaux',
                    score: 0.95,
                    type: 'housenumber',
                    city: 'Bordeaux',
                    citycode: '33063',
                    id: '33063_9999_00001',
                  },
                },
              ]
            : [],
        })
}

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/'
const SUIVIE = `${LBC}2800000010`
const ECARTEE = 'https://www.pap.fr/annonces/appartement-bordeaux-r900000001'
const DRAFT_ECARTE =
  'https://www.bienici.com/annonce/vente/bordeaux/appartement/ag-fictif-1'

/** Les annonces lues par « Claude » sur les portails, toutes fictives. */
function candidates() {
  const at = { commune: 'Bordeaux', address: '1 rue fictive' }
  return [
    // Déjà suivie, même lien (ancienne forme, suivi) : le prix a baissé.
    {
      url: 'https://www.leboncoin.fr/ventes_immobilieres/2800000010.htm?utm_source=alerte',
      portal: 'leboncoin',
      title: '[Exemple] T3 75 m², traversant',
      price: 212_000,
      surface: 75,
      rooms: 3,
    },
    // Écartée de la liste, même lien.
    { url: `${ECARTEE}?ref=liste`, portal: 'pap', price: 205_000 },
    // Brouillon écarté, même lien.
    { url: DRAFT_ECARTE, portal: 'bienici', price: 200_000 },
    // Même bien qu'une annonce suivie, autre portail : doublon probable.
    {
      url: 'https://www.pap.fr/annonces/appartement-bordeaux-r900000002',
      portal: 'pap',
      title: '[Exemple] T3 66 m², balcon et cave',
      price: 210_000,
      surface: 66,
      rooms: 3,
      dpeClass: 'C',
      commune: 'Bordeaux',
      district: 'Secteur fictif Ouest',
    },
    // Nouvelle, dans les critères.
    {
      url: `${LBC}2800000011`,
      portal: 'leboncoin',
      title: '[Exemple] T3 72 m², balcon sud',
      price: 214_000,
      surface: 72,
      rooms: 3,
      dpeClass: 'C',
      excerpt: 'Exemple fictif : balcon, cave. Contact 06 12 34 56 78.',
      ...at,
    },
    // À la marge : prix +2,7 %.
    {
      url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/0000009001.htm',
      portal: 'seloger',
      title: '[Exemple] T3 63 m², proche tram',
      price: 226_000,
      surface: 63,
      rooms: 3,
      dpeClass: 'D',
      ...at,
    },
    // À confirmer : surface inconnue.
    {
      url: `${LBC}2800000012`,
      portal: 'leboncoin',
      title: '[Exemple] T3, surface non indiquée',
      price: 199_000,
      rooms: 3,
      ...at,
    },
    // Hors critères : prix et pièces.
    {
      url: `${LBC}2800000013`,
      portal: 'leboncoin',
      title: '[Exemple] T4 94 m², séjour double',
      price: 289_000,
      surface: 94,
      rooms: 4,
      ...at,
    },
    {
      url: `${LBC}2800000014`,
      portal: 'leboncoin',
      title: '[Exemple] T2 58 m²',
      price: 168_000,
      surface: 58,
      rooms: 2,
      ...at,
    },
    // Envoyée deux fois : comptée une fois.
    { url: `${LBC}2800000011/`, portal: 'leboncoin', price: 214_000 },
  ]
}

const PORTALS = [
  { portal: 'leboncoin', status: 'read', count: 6 },
  { portal: 'seloger', status: 'read', count: 1 },
  { portal: 'pap', status: 'read', count: 2 },
  { portal: 'bienici', status: 'read', count: 1 },
  {
    portal: 'logicimmo',
    status: 'blocked',
    note: 'Vérification anti-robot : non contournée',
  },
]

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Exploration par les critères (e2e, lot 16)', () => {
  let ctx: E2eContext
  let rpcId = 1
  let criteriaId: string
  let suivieId: string
  let doublonId: string
  let ecarteeId: string

  const api = () => request(ctx.server)

  async function rpc(identity: E2eIdentity, method: string, params?: unknown) {
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({ jsonrpc: '2.0', id: rpcId++, method, params })
    expect(res.status).toBe(200)
    expect(res.body.error).toBeUndefined()
    return res
  }

  async function callTool(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await rpc(identity, 'tools/call', { name, arguments: args })
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

  async function createListing(body: object): Promise<string> {
    const res = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send(body)
      .expect(201)
    return res.body.listing.id as string
  }

  async function record(runKey: string, cands = candidates(), as = richard) {
    return callTool(as, 'record_exploration', {
      runKey,
      portals: PORTALS,
      candidates: cands,
      startedAt: '2026-11-05T17:34:00.000Z',
      finishedAt: '2026-11-05T17:40:00.000Z',
    })
  }

  async function pending() {
    return (
      await api().get('/listing-drafts').set(ctx.auth(richard)).expect(200)
    ).body as Array<{
      id: string
      url: string
      status: string
      origin: string
      extractedBy: string
      portal: string
      excerpt: string | null
      duplicates: Array<{ listingId: string }>
      fit: { level: string; reasons: string[] } | null
      listing: {
        title: string
        price: number
        location: { precision: string | null }
      }
      warnings: string[]
    }>
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
    await ctx.app
      .get(GeoService)
      .replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [SECTOR])
    ctx.geocoding.fetchImpl = geocoder()
    criteriaId = (
      await api()
        .post('/search-criteria')
        .set(ctx.auth(richard))
        .send({
          name: '[Exemple] Ouest fictif, T3',
          filters: {
            priceMax: 220_000,
            surfaceMin: 60,
            roomsMin: 3,
            dpeMax: 'D',
          },
          perimeter: { type: 'polygon', polygon: BOX },
        })
        .expect(201)
    ).body.id
    suivieId = await createListing({
      title: '[Exemple] T3 75 m², traversant',
      url: SUIVIE,
      source: 'leboncoin',
      price: 219_000,
      surface: 75,
      rooms: 3,
      dpeClass: 'C',
      location: { commune: 'Bordeaux' },
    })
    doublonId = await createListing({
      title: '[Exemple] T3 66 m², balcon et cave',
      url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/0000009099.htm',
      source: 'seloger',
      price: 215_000,
      surface: 66,
      rooms: 3,
      location: { commune: 'Bordeaux', district: 'Secteur fictif Ouest' },
    })
    ecarteeId = await createListing({
      title: '[Exemple] T3 58 m², rez-de-chaussée',
      url: ECARTEE,
      source: 'pap',
      price: 205_000,
      surface: 58,
      rooms: 3,
      location: { commune: 'Bordeaux' },
    })
    await api()
      .post(`/listings/${ecarteeId}/status`)
      .set(ctx.auth(chloe))
      .send({ status: 'discarded', reason: 'rez-de-chaussée sur rue' })
      .expect(200)
    const chloeId = workspace.members.find(m => m.handle === 'chloe')?.id
    await ctx.prisma.listingDraft.create({
      data: {
        workspaceId: workspace.id,
        origin: 'email',
        status: 'dismissed',
        extractedBy: 'parser',
        input: { title: '[Exemple] T2 sombre', price: 200_000 },
        url: DRAFT_ECARTE,
        dismissReason: 'trop sombre',
        decidedAt: new Date('2026-10-30T10:00:00.000Z'),
        decidedById: chloeId ?? null,
      },
    })
  })

  it('déclare les trois outils et le prompt, annotations et schémas', async () => {
    const tools = (await rpc(richard, 'tools/list')).body.result
      .tools as Array<{
      name: string
      annotations: { readOnlyHint: boolean; idempotentHint?: boolean }
      inputSchema: { properties: Record<string, unknown>; required?: string[] }
    }>
    const brief = tools.find(t => t.name === 'get_search_brief')
    const triage = tools.find(t => t.name === 'triage_candidates')
    const recordTool = tools.find(t => t.name === 'record_exploration')
    expect(brief?.annotations.readOnlyHint).toBe(true)
    expect(triage?.annotations.readOnlyHint).toBe(true)
    expect(recordTool?.annotations.readOnlyHint).toBe(false)
    expect(recordTool?.annotations.idempotentHint).toBe(true)
    expect(recordTool?.inputSchema.required).toEqual(
      expect.arrayContaining(['runKey', 'portals'])
    )
    const prompts = (await rpc(richard, 'prompts/list')).body.result.prompts
    const explore = prompts.find(
      (p: { name: string }) => p.name === 'explore_listings'
    )
    expect(
      explore.arguments.map((a: { name: string }) => a.name).sort()
    ).toEqual(['criteriaId', 'notes', 'portals'])
    const got = await rpc(richard, 'prompts/get', {
      name: 'explore_listings',
      arguments: { portals: 'pap, Bien’ici', notes: 'commence par PAP' },
    })
    const text = got.body.result.messages[0].content.text as string
    expect(text).toContain('get_search_brief')
    expect(text).toContain('record_exploration')
    expect(text).toContain('seulement Bien’ici, PAP')
    expect(text).toContain('ne contourne rien')
    expect(text).toContain("N'ajoute JAMAIS une annonce toi-même")
    expect(text).toContain('Consignes du membre : commence par PAP')
  })

  it('le brief : seuils marge comprise, zone recoupée, portails et liens sans réseau, déjà connues', async () => {
    const result = await callTool(richard, 'get_search_brief', {})
    expect(result.isError).toBeUndefined()
    const brief = fenced<{
      criteria: Array<{
        id: string
        thresholds: { priceMax: number; surfaceMin: number; dpeMax: string }
        zones: Array<{ commune: string; districts: string[] }>
        portals: Array<{
          portal: string
          url: string
          mode: string
          enabled: boolean
        }>
        lines: Array<{ key: string; text: string }>
        listingCount: number
      }>
      known: { tracked: number; dismissed: number; pending: number }
      lastExploration: unknown
    }>(result)
    expect(brief.criteria).toHaveLength(1)
    const c = brief.criteria[0]
    expect(c?.thresholds).toMatchObject({
      priceMax: 231_000,
      surfaceMin: 57,
      dpeMax: 'E',
    })
    expect(c?.zones).toEqual([
      {
        commune: 'Bordeaux',
        inseeCode: '33063',
        districts: ['Secteur fictif Ouest'],
      },
    ])
    expect(n(c?.lines.find(l => l.key === 'zone')?.text)).toBe(
      'Bordeaux (Secteur fictif Ouest), plus 300 m autour du polygone'
    )
    const lbc = c?.portals.find(p => p.portal === 'leboncoin')
    expect(lbc?.mode).toBe('parameters')
    expect(new URL(lbc?.url ?? '').searchParams.get('price')).toBe('min-231000')
    expect(c?.portals.find(p => p.portal === 'pap')?.mode).toBe('manual')
    expect(c?.portals.every(p => p.enabled)).toBe(true)
    expect(brief.known).toEqual({ tracked: 2, dismissed: 2, pending: 0 })
    expect(brief.lastExploration).toBeNull()
    expect(result.content[0]?.text).toContain('filtres à saisir')

    // Le même brief par le REST, pour un critère ; décocher un portail ne recalcule rien.
    const patched = await api()
      .patch(`/search-criteria/${criteriaId}`)
      .set(ctx.auth(richard))
      .send({ portals: ['leboncoin', 'pap'] })
      .expect(200)
    expect(patched.body.portals).toEqual(['leboncoin', 'pap'])
    expect(patched.body.fitChanges).toBeNull()
    const rest = await api()
      .get(`/search-criteria/${criteriaId}/brief`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      rest.body.criteria[0].portals.map(
        (p: { portal: string; enabled: boolean }) => [p.portal, p.enabled]
      )
    ).toEqual([
      ['leboncoin', true],
      ['seloger', false],
      ['bienici', false],
      ['pap', true],
      ['logicimmo', false],
    ])
    expect(rest.body.request).toBe(
      'Explore pour « [Exemple] Ouest fictif, T3 ».'
    )
    await api()
      .get('/search-criteria/00000000-0000-4000-8000-000000000000/brief')
      .set(ctx.auth(richard))
      .expect(404)
    const all = await api()
      .get('/explorations/brief')
      .set(ctx.auth(richard))
      .expect(200)
    expect(all.body.request).toBe(
      'Explore pour « [Exemple] Ouest fictif, T3 ».'
    )
  })

  it('le tri à blanc : chaque décision, rien n’est écrit', async () => {
    const result = await callTool(richard, 'triage_candidates', {
      candidates: candidates(),
    })
    expect(result.isError).toBeUndefined()
    const triage = fenced<{
      items: Array<{
        index: number
        outcome: string
        why: string
        fit: { level: string } | null
        listing: { id: string } | null
        duplicates: Array<{ listingId: string }>
        check: { outcome: string; summary: string } | null
      }>
      counts: Record<string, number>
      persisted: boolean
    }>(result)
    expect(triage.persisted).toBe(false)
    expect(triage.items.map(i => i.outcome)).toEqual([
      'known',
      'dismissed',
      'dismissed',
      'duplicate_probable',
      'new',
      'new',
      'new',
      'out',
      'out',
    ])
    const [known, listingGone, draftGone, dup, inside, margin, confirm, out] =
      triage.items
    expect(known?.listing?.id).toBe(suivieId)
    expect(n(known?.check?.summary)).toBe('Prix 219 000 € → 212 000 €')
    expect(n(known?.why)).toBe(
      'Même lien : prix 219 000 € → 212 000 €, à appliquer (vérification)'
    )
    expect(listingGone?.why).toContain('« rez-de-chaussée sur rue »')
    expect(draftGone?.why).toBe(
      'Écartée par Chloé le 30 octobre 2026 : « trop sombre »'
    )
    expect(dup?.duplicates[0]?.listingId).toBe(doublonId)
    expect(inside?.fit).toMatchObject({ level: 'in', reasons: [] })
    expect(margin?.fit?.level).toBe('margin')
    expect(n(margin?.why)).toBe(
      'À la marge : Prix +2,7 % (maximum 220 000 €, marge 5 %)'
    )
    expect(confirm?.fit?.level).toBe('to_confirm')
    expect(out?.why).toContain('Prix +31 %')
    expect(triage.counts).toMatchObject({
      seen: 9,
      toValidate: 4,
      known: 1,
      dismissed: 2,
      out: 2,
    })
    expect(result.content[0]?.text).toContain("Tri à blanc (rien n'est écrit)")
    expect(await ctx.prisma.exploration.count()).toBe(0)
    expect(
      await ctx.prisma.listingDraft.count({ where: { status: 'pending' } })
    ).toBe(0)
    expect(await ctx.prisma.listingCheck.count()).toBe(0)
  })

  it('enregistre : brouillons « À valider », vérification appliquée, compte rendu, journal, Chloé prévenue ; runKey idempotent', async () => {
    const result = await record('run-e2e-0001')
    expect(result.isError).toBeUndefined()
    const recorded = fenced<{
      replayed: boolean
      drafts: Array<{ id: string; title: string }>
      checks: Array<{
        listingId: string
        applied: boolean
        outcome: string
        summary: string
      }>
      exploration: {
        id: string
        counts: Record<string, number>
        summary: string
        lines: Array<{
          outcome: string
          why: string
          draftId: string | null
          listing: { id: string } | null
          excerpt: string | null
          level: string | null
        }>
        bilan: Array<{
          portal: string
          count: string
          note: string
          blocked: boolean
        }>
        outDigest: string | null
      }
    }>(result)
    expect(recorded.replayed).toBe(false)
    expect(recorded.drafts).toHaveLength(4)
    expect(recorded.checks).toEqual([
      expect.objectContaining({
        listingId: suivieId,
        applied: true,
        outcome: 'changed',
      }),
    ])
    const e = recorded.exploration
    expect(e.summary).toBe(
      '9 annonces vues : 4 à valider, 1 déjà suivie, 2 déjà écartées, 2 hors critères ; Logic-Immo bloqué'
    )
    expect(e.counts).toMatchObject({
      seen: 9,
      draftsCreated: 4,
      checksChanged: 1,
      blockedPortals: 1,
    })
    expect(n(e.lines[0]?.why)).toBe(
      'Même lien : prix 219 000 € → 212 000 €, appliqué dans « Mises à jour »'
    )
    expect(e.lines[4]?.excerpt).toBe(
      'Exemple fictif : balcon, cave. Contact [téléphone masqué].'
    )
    expect(e.lines.filter(l => l.draftId !== null)).toHaveLength(5)
    expect(e.bilan.find(b => b.portal === 'logicimmo')).toMatchObject({
      count: 'arrêté',
      blocked: true,
      note: 'Vérification anti-robot : non contournée',
    })
    expect(e.outDigest).toBe(
      'prix au-delà de la marge (1), pas assez de pièces (1)'
    )
    expect(result.content[0]?.text).toContain("Rien n'a été ajouté à la liste")

    // Le prix entre dans l'historique de l'annonce suivie ; aucune annonce n'est créée.
    const suivie = await api()
      .get(`/listings/${suivieId}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(suivie.body.listing.price).toBe(212_000)
    expect(await ctx.prisma.listing.count()).toBe(3)
    const checks = await ctx.prisma.listingCheck.findMany({
      where: { listingId: suivieId },
    })
    expect(checks).toHaveLength(1)
    expect(checks[0]?.channel).toBe('mcp')
    expect(checks[0]?.checkedUrl).toContain('2800000010')

    // Journal au canal MCP ; Chloé prévenue, Richard (qui l'a vu dans la conversation) non.
    const log = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { action: 'exploration.recorded' },
    })
    expect(log.channel).toBe('mcp')
    const chloeBell = await api()
      .get('/notifications')
      .set(ctx.auth(chloe))
      .expect(200)
    expect(
      chloeBell.body.items.find(
        (i: { type: string }) => i.type === 'drafts_received'
      )
    ).toMatchObject({
      title: 'Claude a trouvé 4 annonces à valider',
      url: '/annonces?vue=a-valider',
    })
    const richardBell = await api()
      .get('/notifications')
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      richardBell.body.items.some(
        (i: { type: string }) => i.type === 'drafts_received'
      )
    ).toBe(false)

    // Le même runKey : rien n'est écrit.
    const again = fenced<{ replayed: boolean; exploration: { id: string } }>(
      await record('run-e2e-0001')
    )
    expect(again.replayed).toBe(true)
    expect(again.exploration.id).toBe(e.id)
    expect(await ctx.prisma.exploration.count()).toBe(1)
    expect(
      await ctx.prisma.listingDraft.count({ where: { status: 'pending' } })
    ).toBe(4)
    expect(await ctx.prisma.listingCheck.count()).toBe(1)

    // REST : la liste et le compte rendu.
    const list = await api()
      .get('/explorations')
      .set(ctx.auth(richard))
      .expect(200)
    expect(list.body).toHaveLength(1)
    expect(list.body[0].author).toEqual({
      id: expect.any(String),
      displayName: 'Richard',
    })
    const detail = await api()
      .get(`/explorations/${e.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(detail.body.lines).toHaveLength(9)
    await api()
      .get(`/explorations/${e.id}`)
      .set(ctx.auth(e2eIdentity('stranger')))
      .expect(401)

    // Le brief connaît la dernière exploration et le portail bloqué.
    const brief = fenced<{
      lastExploration: { id: string }
      known: { pending: number }
      criteria: Array<{
        portals: Array<{ portal: string; lastRun: { status: string } | null }>
      }>
    }>(await callTool(richard, 'get_search_brief', {}))
    expect(brief.lastExploration.id).toBe(e.id)
    expect(brief.known.pending).toBe(4)
    expect(
      brief.criteria[0]?.portals.find(p => p.portal === 'logicimmo')?.lastRun
        ?.status
    ).toBe('blocked')
  })

  it('un jeton en lecture ne peut pas enregistrer', async () => {
    const result = await record('run-e2e-lecture', candidates(), reader)
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('listings:write')
    expect(await ctx.prisma.exploration.count()).toBe(0)
  })

  it('« À valider » : adéquation à la lecture, ajout direct, écart avec raison et annulation, c’est la même, c’en est une autre', async () => {
    await record('run-e2e-0002')
    const drafts = await pending()
    expect(drafts).toHaveLength(4)
    const byUrl = (part: string) => drafts.find(d => d.url.includes(part))
    const inside = byUrl('2800000011')
    const margin = byUrl('0000009001')
    const confirm = byUrl('2800000012')
    const dup = byUrl('r900000002')
    expect(inside).toMatchObject({
      origin: 'exploration',
      extractedBy: 'claude',
      portal: 'leboncoin',
      fit: { level: 'in' },
    })
    expect(inside?.listing.location.precision).toBe('exact')
    expect(margin?.fit?.level).toBe('margin')
    expect(confirm?.fit?.level).toBe('to_confirm')
    expect(confirm?.warnings).toContain('Surface à demander.')
    expect(dup?.duplicates[0]?.listingId).toBe(doublonId)
    expect(inside?.fit?.reasons).toEqual([])

    // Ajouter à la liste, sans formulaire.
    const accepted = await api()
      .post(`/listing-drafts/${inside?.id}/accept`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(accepted.body.draft.status).toBe('accepted')
    const created = await api()
      .get(`/listings/${accepted.body.listingId}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(created.body.listing).toMatchObject({
      title: '[Exemple] T3 72 m², balcon sud',
      price: 214_000,
      source: 'leboncoin',
    })
    expect(created.body.listing.fieldSources.price.source).toBe('listing')
    await api()
      .post(`/listing-drafts/${inside?.id}/accept`)
      .set(ctx.auth(richard))
      .expect(409)

    // Écarter avec une raison, annuler, écarter de nouveau.
    const dismissed = await api()
      .patch(`/listing-drafts/${margin?.id}`)
      .set(ctx.auth(chloe))
      .send({ status: 'dismissed', reason: 'trop cher' })
      .expect(200)
    expect(dismissed.body).toMatchObject({
      status: 'dismissed',
      dismissReason: 'trop cher',
    })
    const restored = await api()
      .patch(`/listing-drafts/${margin?.id}`)
      .set(ctx.auth(chloe))
      .send({ status: 'pending' })
      .expect(200)
    expect(restored.body).toMatchObject({
      status: 'pending',
      dismissReason: null,
    })
    await api()
      .patch(`/listing-drafts/${margin?.id}`)
      .set(ctx.auth(chloe))
      .send({ status: 'dismissed', reason: 'trop cher' })
      .expect(200)
    await api()
      .patch(`/listing-drafts/${inside?.id}`)
      .set(ctx.auth(chloe))
      .send({ status: 'pending' })
      .expect(409)

    // « C'est la même » : la fiche suivie est mise à jour, le brouillon reconnu.
    await api()
      .post(`/listing-drafts/${dup?.id}/merge`)
      .set(ctx.auth(richard))
      .send({ listingId: suivieId })
      .expect(400)
    const merged = await api()
      .post(`/listing-drafts/${dup?.id}/merge`)
      .set(ctx.auth(richard))
      .send({ listingId: doublonId })
      .expect(200)
    expect(merged.body.status).toBe('merged')
    expect(merged.body.listingId).toBe(doublonId)
    // Lot 18 : « C'est la même » ajoute aussi le lien à la fiche.
    expect(n(merged.body.merge.summary)).toContain(
      'Lien PAP ajouté : 210 000 €'
    )
    expect(n(merged.body.merge.summary)).toContain(
      'Prix 215 000 € → 210 000 € · DPE : C (nouveau)'
    )
    expect(n(merged.body.merge.summary)).toContain(
      'Écart entre portails : SeLoger affiche 215 000 €'
    )
    const doublon = await api()
      .get(`/listings/${doublonId}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(doublon.body.listing.price).toBe(210_000)
    expect(doublon.body.listing.url).toContain('0000009099')
    expect(
      doublon.body.links.map((l: { portal: string; origin: string }) => [
        l.portal,
        l.origin,
      ])
    ).toEqual([
      ['seloger', 'original'],
      ['pap', 'exploration'],
    ])

    // « C'en est une autre » : les doublons ne sont plus proposés.
    const distinct = await api()
      .post(`/listing-drafts/${confirm?.id}/distinct`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(distinct.body.distinct).toBe(true)

    // Journal des décisions.
    const actions = (
      await ctx.prisma.activityLog.findMany({
        where: { action: { startsWith: 'draft.' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map(a => a.action)
    expect(actions).toEqual([
      'draft.accepted',
      'draft.dismissed',
      'draft.restored',
      'draft.dismissed',
      'draft.merged',
      'draft.distinct',
    ])

    // L'exploration suivante reconnaît tout : l'ajoutée et la reconnue sont
    // suivies, l'écartée ne revient pas.
    const second = fenced<{
      items: Array<{
        url: string
        outcome: string
        why: string
        alreadyPending: boolean
      }>
    }>(
      await callTool(richard, 'triage_candidates', { candidates: candidates() })
    )
    const outcome = (part: string) =>
      second.items.find(i => i.url.includes(part))
    expect(outcome('2800000011')?.outcome).toBe('known')
    expect(outcome('r900000002')?.outcome).toBe('known')
    expect(outcome('0000009001')).toMatchObject({ outcome: 'dismissed' })
    expect(outcome('0000009001')?.why).toContain('« trop cher »')
    // Toujours à valider (même lien) ; l'annonce ajoutée à la même adresse
    // en fait un doublon probable, sans nouveau brouillon.
    expect(outcome('2800000012')).toMatchObject({
      outcome: 'duplicate_probable',
      alreadyPending: true,
    })
  })

  it('« Ajouter celles dans les critères » : sans les doublons à trancher ; export JSON', async () => {
    await record('run-e2e-0003')
    const batch = await api()
      .post('/listing-drafts/accept-in-criteria')
      .set(ctx.auth(richard))
      .send({})
      .expect(200)
    expect(batch.body.accepted.map((a: { title: string }) => a.title)).toEqual([
      '[Exemple] T3 72 m², balcon sud',
    ])
    expect(batch.body.skipped).toBe(3)
    expect(await pending()).toHaveLength(3)

    const exported = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const doc = JSON.parse(exported.text) as {
      version: number
      explorations: Array<{
        summary: string
        lines: Array<{ excerpt: string | null }>
      }>
    }
    expect(doc.version).toBe(1)
    expect(doc.explorations).toHaveLength(1)
    expect(doc.explorations[0]?.lines).toHaveLength(9)
    expect(JSON.stringify(doc.explorations)).not.toContain('06 12 34 56 78')
  })

  it('refus lisibles : critère inconnu, fin avant le début', async () => {
    const unknown = await callTool(richard, 'record_exploration', {
      runKey: 'run-e2e-refus-1',
      portals: PORTALS,
      criteriaIds: ['00000000-0000-4000-8000-000000000000'],
    })
    expect(unknown.isError).toBe(true)
    expect(unknown.content[0]?.text).toContain('introuvable')
    const backwards = await callTool(richard, 'record_exploration', {
      runKey: 'run-e2e-refus-2',
      portals: PORTALS,
      startedAt: '2026-11-05T18:00:00.000Z',
      finishedAt: '2026-11-05T17:00:00.000Z',
    })
    expect(backwards.isError).toBe(true)
    const invalid = await callTool(richard, 'triage_candidates', {
      candidates: [{ url: SUIVIE, portal: 'leboncoin', prix: 1 }],
    })
    expect(invalid.isError).toBe(true)
    // Une exploration où tout a bloqué s'enregistre quand même.
    const blocked = fenced<{
      exploration: { summary: string }
      drafts: unknown[]
    }>(
      await callTool(richard, 'record_exploration', {
        runKey: 'run-e2e-bloque',
        portals: [{ portal: 'leboncoin', status: 'blocked' }],
      })
    )
    expect(blocked.exploration.summary).toBe(
      'Aucune annonce lue ; Leboncoin bloqué'
    )
    expect(blocked.drafts).toEqual([])
  })
})
