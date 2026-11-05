/**
 * Critères de recherche (lot 4, besoins G3 à G6) par le REST et le MCP sur
 * un vrai PostGIS : un polygone dessiné filtre la liste et le MCP de façon
 * identique ; point et rayon, filtres, distance au tram ; isochrone
 * Géoplateforme scriptée ; alertes à la création et à la mise à jour ;
 * garde-fous, archivage, suppression (REST seulement).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import request from 'supertest'
import type { Polygon } from '@apart/contracts'
import {
  ISOCHRONE_DOWN,
  NO_GEOCODE_RESULT,
  createE2eApp,
  e2eIdentity,
} from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')
const reader = e2eIdentity('richard-reader', { scope: 'listings:read' })
/** Une personne hors de l'espace : la première requête lui crée le sien. */
const stranger = e2eIdentity('stranger')

/** Un rectangle autour de Talence (Forum et campus dedans, CHU dehors). */
const TALENCE_BOX: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-0.62, 44.79],
      [-0.57, 44.79],
      [-0.57, 44.815],
      [-0.62, 44.815],
      [-0.62, 44.79],
    ],
  ],
}
/** Un nœud papillon : ses côtés se croisent. */
const BOW_TIE: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-0.6, 44.8],
      [-0.58, 44.82],
      [-0.58, 44.8],
      [-0.6, 44.82],
      [-0.6, 44.8],
    ],
  ],
}

const point = (lng: number, lat: number) => ({
  type: 'Point',
  coordinates: [lng, lat],
})

const FORUM = { lng: -0.5906, lat: 44.8083 }
const CAMPUS = { lng: -0.5955, lat: 44.8077 }
const CHU = { lng: -0.6039, lat: 44.8277 }

function listing(
  title: string,
  at: { lng: number; lat: number },
  over: Record<string, unknown> = {}
) {
  return {
    title,
    price: 180_000,
    surface: 45,
    rooms: 2,
    dpeClass: 'D',
    location: {
      commune: 'Talence',
      point: point(at.lng, at.lat),
      precision: 'exact',
    },
    rentalPlan: { targetRent: 800 },
    ...over,
  }
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

describe('Critères de recherche (e2e)', () => {
  let ctx: E2eContext
  let nextId = 1

  async function rpc(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await request(ctx.server)
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

  async function create(body: object, as: E2eIdentity = richard) {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(as))
      .send(body)
      .expect(201)
    return res.body
  }

  async function createCriteria(body: object, status = 201) {
    const res = await request(ctx.server)
      .post('/search-criteria')
      .set(ctx.auth(richard))
      .send(body)
      .expect(status)
    return res.body
  }

  async function listIds(query: string): Promise<string[]> {
    const res = await request(ctx.server)
      .get(`/listings?${query}`)
      .set(ctx.auth(richard))
      .expect(200)
    return res.body.items.map((i: { listing: { id: string } }) => i.listing.id)
  }

  beforeAll(async () => {
    reader.supabaseId = richard.supabaseId
    reader.email = richard.email
    ctx = await createE2eApp([richard, chloe, reader, stranger])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.isochrone.fetchImpl = ISOCHRONE_DOWN
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
    const geo = ctx.app.get(GeoService)
    await geo.upsertTransitStops('TBM', [
      {
        externalId: 'forum',
        mode: 'tram',
        name: 'Forum',
        lines: ['B'],
        longitude: -0.5905,
        latitude: 44.8094,
      },
    ])
  })

  it('un polygone dessiné filtre la liste et le MCP de façon identique', async () => {
    const forum = await create(listing('Forum', FORUM))
    const campus = await create(listing('Campus', CAMPUS))
    await create(listing('CHU', CHU))
    const criteria = await createCriteria({
      name: 'Talence',
      perimeter: { type: 'polygon', polygon: TALENCE_BOX },
    })
    expect(criteria.perimeterType).toBe('polygon')
    expect(criteria.perimeter.polygon).toEqual(TALENCE_BOX)
    expect(criteria.listingCount).toBe(2)
    // Rien n'a encore été ouvert : deux nouveautés, même pour l'auteur.
    expect(criteria.newCount).toBe(2)

    const rest = await listIds(`criteriaId=${criteria.id}`)
    expect(new Set(rest)).toEqual(
      new Set([forum.listing.id, campus.listing.id])
    )
    const mcp = fenced(
      await rpc(richard, 'list_listings', { criteriaId: criteria.id })
    ) as { items: Array<{ listing: { id: string } }> }
    expect(mcp.items.map(i => i.listing.id)).toEqual(rest)

    // Richard ouvre le Forum : une seule nouveauté pour lui, deux pour Chloé.
    await request(ctx.server)
      .post(`/listings/${forum.listing.id}/seen`)
      .set(ctx.auth(richard))
      .expect(200)
    const forRichard = await request(ctx.server)
      .get(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(forRichard.body.newCount).toBe(1)
    const forChloe = await request(ctx.server)
      .get('/search-criteria')
      .set(ctx.auth(chloe))
      .expect(200)
    expect(forChloe.body[0].newCount).toBe(2)
    const listed = await rpc(richard, 'list_search_criteria', {})
    expect(listed.content[0]?.text).toContain('« Talence »')
    expect(listed.content[0]?.text).toContain('2 annonce(s)')
  })

  it('alerte : une annonce créée dans le périmètre « entre dans le critère », puis en sort', async () => {
    const criteria = await createCriteria({
      name: 'Talence pas cher',
      filters: { priceMax: 200_000 },
      perimeter: { type: 'polygon', polygon: TALENCE_BOX },
    })
    const created = await create(listing('Forum', FORUM))
    expect(created.criteriaChanges.entered).toEqual([
      expect.objectContaining({ criteriaId: criteria.id, approximate: false }),
    ])
    expect(created.criteriaMatches).toHaveLength(1)
    const read = await request(ctx.server)
      .get(`/listings/${created.listing.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(read.body.criteriaMatches[0].name).toBe('Talence pas cher')
    expect(read.body.criteriaChanges).toBeNull()
    const matched = await ctx.prisma.activityLog.findMany({
      where: { listingId: created.listing.id, action: 'criteria.matched' },
    })
    expect(matched).toHaveLength(1)

    const raised = await request(ctx.server)
      .post(`/listings/${created.listing.id}/price-events`)
      .set(ctx.auth(richard))
      .send({ newPrice: 230_000, source: 'listing' })
      .expect(200)
    // Lot 14 : 230 000 € pour 200 000 € au plus, +15 % : au-delà de la marge.
    expect(raised.body.criteriaChanges.left).toEqual([
      {
        criteriaId: criteria.id,
        name: 'Talence pas cher',
        reasons: [expect.stringContaining('Prix +15 %')],
      },
    ])
    expect(raised.body.criteriaFit.level).toBe('out')
    expect(raised.body.criteriaMatches).toEqual([])
    const unmatched = await ctx.prisma.activityLog.count({
      where: { listingId: created.listing.id, action: 'criteria.unmatched' },
    })
    expect(unmatched).toBe(1)

    // Par le MCP : la réponse de create_listing le dit en toutes lettres.
    const viaMcp = await rpc(richard, 'create_listing', {
      listing: listing('Campus MCP', CAMPUS),
      provenance: 'user',
    })
    expect(viaMcp.content[0]?.text).toContain(
      'Entre dans le critère « Talence pas cher »'
    )
  })

  it('point et rayon, filtres métier et distance au tram ; un DPE inconnu passe, une localisation imprécise est « sous réserve »', async () => {
    const forum = await create(listing('Forum', FORUM))
    const campus = await create(listing('Campus', CAMPUS, { dpeClass: null }))
    await create(listing('Forum F', FORUM, { dpeClass: 'F' }))
    await create(listing('Forum cher', FORUM, { price: 400_000 }))
    const vague = await create(
      listing('Talence centre', FORUM, {
        location: {
          commune: 'Talence',
          point: point(FORUM.lng, FORUM.lat),
          precision: 'commune',
        },
      })
    )
    const radius = await createCriteria({
      name: 'Autour du Forum',
      filters: { priceMax: 250_000, dpeMax: 'D' },
      perimeter: {
        type: 'point_radius',
        longitude: FORUM.lng,
        latitude: FORUM.lat,
        radiusMeters: 800,
      },
    })
    expect(radius.listingCount).toBe(3)
    expect(radius.approximateCount).toBe(1)
    expect(new Set(await listIds(`criteriaId=${radius.id}`))).toEqual(
      new Set([forum.listing.id, campus.listing.id, vague.listing.id])
    )
    const match = await ctx.prisma.criteriaMatch.findFirst({
      where: { criteriaId: radius.id, listingId: vague.listing.id },
    })
    expect(match?.approximate).toBe(true)

    const tram = await createCriteria({
      name: 'À 200 m du tram',
      filters: { maxTramDistanceMeters: 200 },
    })
    // Le Forum est à ~120 m de l'arrêt, le campus à plus de 300 m.
    const nearTram = await listIds(`criteriaId=${tram.id}`)
    expect(nearTram).toContain(forum.listing.id)
    expect(nearTram).not.toContain(campus.listing.id)
    // Filtres de la liste et du critère se cumulent.
    expect(new Set(await listIds(`criteriaId=${radius.id}&dpe=D`))).toEqual(
      new Set([forum.listing.id, vague.listing.id])
    )
  })

  it('isochrone : paramètres Géoplateforme, polygone figé, cache ; service en panne = 503 et refus MCP', async () => {
    await create(listing('Forum', FORUM))
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            url,
            geometry: {
              type: 'Polygon',
              coordinates: TALENCE_BOX.coordinates,
            },
          }),
      })
    )
    ctx.isochrone.fetchImpl = fetchImpl
    const walking = await createCriteria({
      name: '10 minutes à pied',
      perimeter: {
        type: 'isochrone',
        origin: point(FORUM.lng, FORUM.lat),
        mode: 'walking',
        durationMinutes: 10,
      },
    })
    expect(walking.perimeterType).toBe('isochrone')
    expect(walking.perimeter.polygon).toEqual(TALENCE_BOX)
    expect(walking.perimeter.params.provider).toMatchObject({
      resource: 'bdtopo-valhalla',
      profile: 'pedestrian',
      costType: 'time',
      costValue: 10,
    })
    expect(walking.listingCount).toBe(1)
    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string)
    expect(url.origin + url.pathname).toBe(
      'https://data.geopf.fr/navigation/isochrone'
    )
    expect(url.searchParams.get('point')).toBe(`${FORUM.lng},${FORUM.lat}`)
    expect(url.searchParams.get('timeUnit')).toBe('minute')

    const cycling = await createCriteria({
      name: '10 minutes à vélo',
      perimeter: {
        type: 'isochrone',
        origin: point(FORUM.lng, FORUM.lat),
        mode: 'cycling',
        durationMinutes: 10,
      },
    })
    expect(cycling.perimeter.params.provider).toMatchObject({
      profile: 'pedestrian',
      costType: 'distance',
      costValue: 2500,
      unit: 'meter',
    })
    expect(cycling.perimeter.params.approximation).toContain('15 km/h')
    // Même point, même mode, même durée : servi par le cache.
    await createCriteria({
      name: 'Encore 10 minutes à pied',
      perimeter: {
        type: 'isochrone',
        origin: point(FORUM.lng, FORUM.lat),
        mode: 'walking',
        durationMinutes: 10,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    ctx.isochrone.fetchImpl = ISOCHRONE_DOWN
    const down = await createCriteria(
      {
        name: 'En voiture',
        perimeter: {
          type: 'isochrone',
          origin: point(FORUM.lng, FORUM.lat),
          mode: 'driving',
          durationMinutes: 5,
        },
      },
      503
    )
    expect(down.message).toContain('isochrones')
    const refused = await rpc(richard, 'create_search_criteria', {
      name: 'En voiture',
      perimeter: {
        type: 'isochrone',
        origin: point(FORUM.lng, FORUM.lat),
        mode: 'driving',
        durationMinutes: 5,
      },
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain('Refusé')
  })

  it('isochrone par adresse : géocodeur en panne = 503, adresse introuvable = 400', async () => {
    const byAddress = {
      name: 'Depuis une adresse',
      perimeter: {
        type: 'isochrone',
        address: '1 place Fictive, Bordeaux',
        mode: 'walking',
        durationMinutes: 10,
      },
    }
    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve({}),
      })
    const down = await createCriteria(byAddress, 503)
    expect(down.message).toContain('Géocodeur')
    ctx.geocoding.fetchImpl = NO_GEOCODE_RESULT
    const unknown = await createCriteria(byAddress, 400)
    expect(unknown.message).toContain('introuvable')
    expect(await ctx.prisma.searchCriteria.count()).toBe(0)
  })

  it('un autre espace ne lit, ne modifie, ne supprime ni n’applique jamais le critère', async () => {
    await create(listing('Forum', FORUM))
    const criteria = await createCriteria({
      name: 'Talence',
      perimeter: { type: 'polygon', polygon: TALENCE_BOX },
    })
    // L'inconnu a son propre espace, avec une annonce au même endroit.
    await create(listing('Forum ailleurs', FORUM), stranger)
    const as = (req: request.Test) => req.set(ctx.auth(stranger))
    expect(
      (await as(request(ctx.server).get('/search-criteria')).expect(200)).body
    ).toEqual([])
    await as(request(ctx.server).get(`/search-criteria/${criteria.id}`)).expect(
      404
    )
    await as(
      request(ctx.server)
        .patch(`/search-criteria/${criteria.id}`)
        .send({ name: 'Volé' })
    ).expect(404)
    await as(
      request(ctx.server).delete(`/search-criteria/${criteria.id}`)
    ).expect(404)
    await as(
      request(ctx.server).get(`/listings?criteriaId=${criteria.id}`)
    ).expect(404)
    const viaMcp = await rpc(stranger, 'list_listings', {
      criteriaId: criteria.id,
    })
    expect(viaMcp.isError).toBe(true)
    const updated = await rpc(stranger, 'update_search_criteria', {
      criteriaId: criteria.id,
      name: 'Volé',
    })
    expect(updated.isError).toBe(true)
    // Un aperçu ne compte que ses propres annonces.
    const preview = await as(
      request(ctx.server)
        .post('/search-criteria/preview')
        .send({ perimeter: { type: 'polygon', polygon: TALENCE_BOX } })
    ).expect(200)
    expect(preview.body.listingCount).toBe(1)
    // Rien n'a bougé pour Richard ; l'annonce de l'inconnu n'entre pas dans son critère.
    const after = await request(ctx.server)
      .get(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(after.body.name).toBe('Talence')
    expect(after.body.listingCount).toBe(1)
    expect(await ctx.prisma.criteriaMatch.count()).toBe(1)
  })

  it('aperçu sans enregistrer, polygone invalide refusé', async () => {
    await create(listing('Forum', FORUM))
    await create(listing('CHU', CHU))
    const preview = await request(ctx.server)
      .post('/search-criteria/preview')
      .set(ctx.auth(richard))
      .send({ perimeter: { type: 'polygon', polygon: TALENCE_BOX } })
      .expect(200)
    expect(preview.body.listingCount).toBe(1)
    expect(await ctx.prisma.searchCriteria.count()).toBe(0)
    const invalid = await createCriteria(
      { name: 'Papillon', perimeter: { type: 'polygon', polygon: BOW_TIE } },
      400
    )
    expect(invalid.message).toContain('Polygone invalide')
  })

  it('mise à jour avec garde-fou, archivage, suppression REST ; MCP en lecture seule refusé', async () => {
    const forum = await create(listing('Forum', FORUM))
    const criteria = await createCriteria({
      name: 'Talence',
      perimeter: { type: 'polygon', polygon: TALENCE_BOX },
    })
    const stale = await request(ctx.server)
      .patch(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .send({ name: 'x', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })
      .expect(409)
    expect(stale.body.message).toContain('a changé')

    const denied = await rpc(reader, 'update_search_criteria', {
      criteriaId: criteria.id,
      name: 'Talence sud',
    })
    expect(denied.isError).toBe(true)
    expect(denied.content[0]?.text).toContain('listings:write')

    const renamed = fenced(
      await rpc(richard, 'update_search_criteria', {
        criteriaId: criteria.id,
        name: 'Talence sud',
        filters: { priceMax: 150_000 },
        expectedUpdatedAt: criteria.updatedAt,
      })
    ) as {
      criteria: {
        name: string
        listingCount: number
        filters: { priceMax: number }
      }
    }
    expect(renamed.criteria.name).toBe('Talence sud')
    expect(renamed.criteria.filters.priceMax).toBe(150_000)
    expect(renamed.criteria.listingCount).toBe(0)
    // Lot 14 : l'annonce reste comparée au critère, hors critères.
    expect(
      await ctx.prisma.criteriaMatch.count({
        where: { listingId: forum.listing.id, level: { not: 'out' } },
      })
    ).toBe(0)

    const archived = await request(ctx.server)
      .patch(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .send({ active: false })
      .expect(200)
    expect(archived.body.active).toBe(false)
    const active = await request(ctx.server)
      .get('/search-criteria')
      .set(ctx.auth(richard))
      .expect(200)
    expect(active.body).toEqual([])
    const all = await request(ctx.server)
      .get('/search-criteria?includeArchived=true')
      .set(ctx.auth(richard))
      .expect(200)
    expect(all.body).toHaveLength(1)

    await request(ctx.server)
      .delete(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .expect(204)
    await request(ctx.server)
      .get(`/search-criteria/${criteria.id}`)
      .set(ctx.auth(richard))
      .expect(404)
    const logs = await ctx.prisma.activityLog.findMany({
      where: { action: { startsWith: 'criteria.' }, listingId: null },
      orderBy: { createdAt: 'asc' },
    })
    expect(logs.map(l => l.action)).toEqual([
      'criteria.created',
      'criteria.updated',
      'criteria.updated',
      'criteria.deleted',
    ])
    expect(logs[1]?.channel).toBe('mcp')

    const viaMcp = fenced(
      await rpc(richard, 'create_search_criteria', {
        name: 'Autour du Forum',
        perimeter: {
          type: 'point_radius',
          longitude: FORUM.lng,
          latitude: FORUM.lat,
          radiusMeters: 300,
        },
      })
    ) as { criteria: { listingCount: number } }
    expect(viaMcp.criteria.listingCount).toBe(1)
    // Un critère inconnu : 404 en REST, refus en MCP.
    await request(ctx.server)
      .get(`/listings?criteriaId=${criteria.id}`)
      .set(ctx.auth(richard))
      .expect(404)
  })

  it('get_market_context par le MCP sur un point, sans données importées', async () => {
    const result = await rpc(richard, 'get_market_context', {
      point: point(FORUM.lng, FORUM.lat),
      surface: 45,
    })
    expect(result.isError).toBeUndefined()
    const data = fenced(result) as {
      market: { status: string; reasons: string[] }
      rentControl: { status: string }
      transit: { nearestTram: { name: string } }
    }
    expect(data.market.status).toBe('unavailable')
    expect(data.market.reasons[0]).toContain('pnpm import:dvf')
    expect(data.rentControl.status).toBe('not_applicable')
    expect(data.transit.nearestTram.name).toBe('Forum')
    expect(result.content[0]?.text).toContain('Tram le plus proche : Forum')
  })
})
