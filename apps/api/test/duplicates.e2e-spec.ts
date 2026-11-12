/**
 * ADR 0041 : la détection des doublons sur PostGIS réel. Un doublon probable
 * fort bloque la création (REST et MCP) tant que le membre n'a pas confirmé ;
 * un fait contraire (autre étage, même agence avec une autre référence) le
 * fait taire ; deux lieux éloignés (contour du quartier, point de
 * l'adresse) aussi, pas un quartier dans sa commune ; les deux formes d'une
 * page Bien'ici sont le même lien. Données et contours fictifs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { NeighbourhoodRow } from '../src/geo/geo.service'

const richard = e2eIdentity('richard')

/** Le même bien, vu une première fois sur un portail. */
const TRACKED = {
  title: '[Exemple] T3 61 m², balcon',
  price: 205_000,
  surface: 61,
  rooms: 3,
  floor: 1,
  dpeClass: 'C',
  url: 'https://www.bienici.com/annonce/exemple-1-9900146',
  sellerType: 'mandatary',
  sellerName: '[Exemple] Réseau Mandataires',
  sellerReference: '9900146',
  location: { commune: 'Mérignac', district: 'Arlac' },
}

const square = (west: number, south: number, size: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ] as [number, number][],
  ],
})

/** Deux quartiers fictifs à 1,6 km l'un de l'autre, et l'IRIS qui couvre la commune. */
const NEIGHBOURHOODS: NeighbourhoodRow[] = [
  {
    kind: 'quartier',
    code: 'Q-OUEST',
    name: 'Quartier fictif Ouest',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'Quartiers fictifs',
    geometry: square(-0.63, 44.84, 0.01),
  },
  {
    kind: 'quartier',
    code: 'Q-EST',
    name: 'Quartier fictif Est',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'Quartiers fictifs',
    geometry: square(-0.6, 44.84, 0.01),
  },
  {
    kind: 'iris',
    code: '330639901',
    name: 'IRIS Témoin',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'IRIS fictifs',
    geometry: square(-0.64, 44.83, 0.06),
  },
]

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

/** Le géocodeur : la commune à son centre, l'adresse fictive dans le quartier Est. */
function geocoder(url: string) {
  const municipality = url.includes('type=municipality')
  return json({
    features: [
      {
        geometry: {
          type: 'Point',
          coordinates: municipality ? [-0.61, 44.86] : [-0.595, 44.845],
        },
        properties: municipality
          ? {
              label: 'Bordeaux',
              score: 0.9,
              type: 'municipality',
              city: 'Bordeaux',
              citycode: '33063',
            }
          : {
              label: '1 Rue Fictive 33000 Bordeaux',
              score: 0.95,
              type: 'housenumber',
              city: 'Bordeaux',
              citycode: '33063',
              id: '33063_9999_00001',
            },
      },
    ],
  })
}

/** Le même T3 fictif, placé ailleurs selon les tests. */
const T3 = {
  price: 199_000,
  surface: 56,
  rooms: 3,
  floor: 1,
  dpeClass: 'D',
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

describe('Doublons : contradictions et blocage (e2e)', () => {
  let ctx: E2eContext
  let trackedId: string
  let nextId = 1

  const post = (path: string, body: object, identity = richard) =>
    request(ctx.server).post(path).set(ctx.auth(identity)).send(body)

  async function callTool(
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
    return res.body.result as ToolResult
  }

  let noGeocoder: E2eContext['geocoding']['fetchImpl']

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
    noGeocoder = ctx.geocoding.fetchImpl
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    ctx.geocoding.fetchImpl = noGeocoder
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

  it('le même bien sur un autre portail, autre agence : refusé, puis créé sur confirmation', async () => {
    const otherPortal = {
      title: '[Exemple] Appartement 3 pièces 61 m²',
      price: 205_000,
      surface: 61,
      rooms: 3,
      dpeClass: 'C',
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000001',
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du Parc',
      sellerReference: 'EX-00990001',
      location: { commune: 'Mérignac', district: 'Capeyron' },
    }
    const refused = await post('/listings', otherPortal).expect(409)
    expect(refused.body.message).toContain('Doublon probable')
    expect(refused.body.message).toContain(`[id ${trackedId}]`)
    expect(await ctx.prisma.listing.count()).toBe(1)

    const created = await post('/listings', {
      ...otherPortal,
      ignoreDuplicates: true,
    }).expect(201)
    expect(created.body.duplicates).toEqual([
      expect.objectContaining({
        listingId: trackedId,
        certain: false,
        score: 0.8,
        reasons: [
          expect.objectContaining({ kind: 'same_commune_price_surface' }),
        ],
      }),
    ])
  })

  it('un autre étage, ou la même agence avec une autre référence : pas un doublon', async () => {
    const sameAgency = await post('/listings/duplicates', {
      commune: 'Mérignac',
      price: 205_000,
      surface: 61,
      sellerType: 'mandatary',
      sellerName: '[Exemple] Réseau Mandataires',
      reference: '9900999',
    }).expect(200)
    expect(sameAgency.body).toEqual([])
    const otherFloor = await post('/listings', {
      ...TRACKED,
      title: '[Exemple] T3 au 4e',
      floor: 4,
      url: null,
      sellerReference: null,
      sellerName: null,
      sellerType: 'unknown',
    }).expect(201)
    expect(otherFloor.body.duplicates).toEqual([])
  })

  it('les deux formes d’une page Bien’ici sont le même lien', async () => {
    const found = await post('/listings/duplicates', {
      url: 'https://www.bienici.com/annonce/vente/merignac/appartement/3pieces/exemple-1-9900146',
    }).expect(200)
    expect(found.body).toEqual([
      expect.objectContaining({
        listingId: trackedId,
        certain: true,
        reasons: [expect.objectContaining({ kind: 'same_url' })],
      }),
    ])
  })

  it('find_duplicates par une annonce enregistrée : ses faits complètent la sonde', async () => {
    const twin = await post('/listings', {
      ...TRACKED,
      title: '[Exemple] T3 au 3e',
      floor: 3,
      url: null,
      sellerReference: null,
      sellerName: null,
      sellerType: 'unknown',
    }).expect(201)
    const result = await callTool(richard, 'find_duplicates', {
      listingId: twin.body.listing.id,
    })
    expect(result.content[0]?.text).toContain('Aucun doublon probable.')
  })

  it('create_listing (MCP) : le refus est rendu en réponse, ignoreDuplicates passe outre', async () => {
    const listing = {
      title: '[Exemple] T3 Mérignac 61 m²',
      price: 204_000,
      surface: 61,
      rooms: 3,
      location: { commune: 'Mérignac' },
    }
    const refused = await callTool(richard, 'create_listing', {
      listing,
      provenance: 'user',
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain('Doublon probable')
    expect(refused.content[0]?.text).toContain('ignoreDuplicates')

    const created = await callTool(richard, 'create_listing', {
      listing: { ...listing, ignoreDuplicates: true },
      provenance: 'user',
    })
    expect(created.isError).toBeUndefined()
    expect(created.content[0]?.text).toContain('1 doublon(s) probable(s)')
  })

  describe('deux lieux éloignés (contours et points, PostGIS)', () => {
    let quarterWest: string

    beforeEach(async () => {
      await ctx.app
        .get(GeoService)
        .replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, NEIGHBOURHOODS)
      ctx.geocoding.fetchImpl = geocoder
      const west = await post('/listings', {
        ...T3,
        title: '[Exemple] T3 Quartier Ouest',
        location: { commune: 'Bordeaux', district: 'Quartier fictif Ouest' },
      }).expect(201)
      expect(west.body.listing.location.precision).toBe('district')
      quarterWest = west.body.listing.id as string
    })

    it('une adresse à plus de 500 m du contour du quartier : pas un doublon', async () => {
      const street = await post('/listings', {
        ...T3,
        title: '[Exemple] T3 rue Fictive',
        location: { commune: 'Bordeaux', addressRaw: '1 rue Fictive' },
      }).expect(201)
      expect(street.body.listing.location.precision).toBe('exact')
      expect(street.body.duplicates).toEqual([])
      const result = await callTool(richard, 'find_duplicates', {
        listingId: quarterWest,
      })
      expect(result.content[0]?.text).toContain('Aucun doublon probable.')
    })

    it('un autre quartier éloigné : pas un doublon ; la commune qui le contient : bloqué', async () => {
      const east = await post('/listings', {
        ...T3,
        title: '[Exemple] T3 Quartier Est',
        location: { commune: 'Bordeaux', district: 'Quartier fictif Est' },
      }).expect(201)
      expect(east.body.duplicates).toEqual([])

      const refused = await post('/listings', {
        ...T3,
        title: '[Exemple] T3 Bordeaux',
        location: { commune: 'Bordeaux' },
      }).expect(409)
      expect(refused.body.message).toContain('Doublon probable')
    })
  })
})
