/**
 * ADR 0041 : la détection des doublons sur PostGIS réel. Un doublon probable
 * fort bloque la création (REST et MCP) tant que le membre n'a pas confirmé ;
 * un fait contraire (autre étage, même agence avec une autre référence) le
 * fait taire ; les deux formes d'une page Bien'ici sont le même lien.
 * Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

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
})
