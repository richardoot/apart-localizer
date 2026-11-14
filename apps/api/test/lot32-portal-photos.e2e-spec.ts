/**
 * Lot 32 (ADR 0047) sur un vrai PostGIS : les photos du portail (liens
 * https, jamais téléchargés) se gardent sur la fiche et le brouillon, passent
 * du brouillon gardé à l'annonce, se comptent au journal ; le connecteur
 * reçoit ses consignes de lecture à l'initialisation et apprend, à chaque
 * fiche, ce qu'il n'a pas relevé. Aucune page ni image de portail n'est
 * téléchargée : le géocodeur est simulé. Données et liens fictifs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')

const photo = (n: number) => `https://img.example.test/annonce/${n}.jpg`

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Photos du portail et lecture complète (e2e, lot 32)', () => {
  let ctx: E2eContext
  let rpcId = 1
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

  async function callTool(name: string, args: unknown): Promise<ToolResult> {
    const res = await rpc(richard, 'tools/call', { name, arguments: args })
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
  })

  it('REST : les photos se gardent, se remplacent, et un lien http est refusé', async () => {
    const created = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        title: '[Exemple] T2 fictif',
        price: 150_000,
        location: { commune: 'Bordeaux' },
        portalPhotos: [photo(1), photo(2)],
      })
      .expect(201)
    const id = created.body.listing.id as string
    expect(created.body.listing.portalPhotos).toEqual([photo(1), photo(2)])

    const patched = await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({ portalPhotos: [photo(3)] })
      .expect(200)
    expect(patched.body.listing.portalPhotos).toEqual([photo(3)])

    // Une modification d'un autre champ ne touche pas aux photos.
    const other = await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({ notes: 'Note fictive' })
      .expect(200)
    expect(other.body.listing.portalPhotos).toEqual([photo(3)])

    await api()
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({ portalPhotos: ['http://img.example.test/1.jpg'] })
      .expect(400)

    // Le changement est journalisé (le journal l'affiche « 1 photo »).
    const activity = await ctx.prisma.activityLog.findMany({
      where: { listingId: id, action: 'listing.updated' },
    })
    expect(
      activity.some(a =>
        Object.keys((a.after ?? {}) as object).includes('portalPhotos')
      )
    ).toBe(true)
  })

  it('MCP : consignes de lecture à l’initialisation, « Non relevé » à la création', async () => {
    const init = await rpc(richard, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1' },
    })
    const instructions = n(init.body.result.instructions as string)
    expect(instructions).toContain('relève TOUT ce qu’elle affiche')
    expect(instructions).toContain('« 120 €/mois » → 1 440')

    const result = await callTool('create_listing', {
      provenance: 'ai',
      listing: {
        title: '[Exemple] T3 lu sans ses charges',
        price: 210_000,
        surface: 64,
        rooms: 3,
        location: { commune: 'Bordeaux', district: 'Secteur fictif' },
      },
    })
    expect(result.isError).toBeFalsy()
    const text = n(result.content[0]?.text)
    expect(text).toContain('Annonce créée')
    expect(text).toMatch(
      /Non relevé : étage, DPE, charges de copropriété, taxe foncière/
    )
    expect(text).toContain('photos')
  })

  it('exploration : la page ouverte donne au brouillon ses photos et ses faits, gardés à l’ajout', async () => {
    const url = 'https://www.leboncoin.fr/ad/ventes_immobilieres/2800003201'
    const recorded = await callTool('record_exploration', {
      runKey: '0b9e8c3e-2f4a-4c71-9a55-3a1f0d2c3201',
      portals: [{ portal: 'leboncoin', status: 'read', count: 1 }],
      candidates: [
        {
          url,
          portal: 'leboncoin',
          title: '[Exemple] T3 62 m², page ouverte',
          price: 205_000,
          surface: 62,
          rooms: 3,
          dpeClass: 'C',
          commune: 'Bordeaux',
          district: 'Secteur fictif',
          opened: true,
          description: 'Description entière fictive, ascenseur et cave.',
          photos: [photo(1), photo(2), photo(3)],
          floor: 3,
          floorsTotal: 5,
          elevator: true,
          heatingType: 'gaz',
          heatingCollective: true,
          lotsCount: 24,
          annualCharges: 1440,
        },
      ],
      startedAt: '2026-11-14T09:00:00.000Z',
      finishedAt: '2026-11-14T09:10:00.000Z',
    })
    expect(recorded.isError).toBeFalsy()

    const drafts = (
      await api().get('/listing-drafts').set(ctx.auth(richard)).expect(200)
    ).body as Array<{
      id: string
      url: string
      warnings: string[]
      listing: Record<string, unknown>
    }>
    const draft = drafts.find(d => d.url === url)
    expect(draft).toBeDefined()
    expect(draft?.listing).toMatchObject({
      portalPhotos: [photo(1), photo(2), photo(3)],
      floor: 3,
      elevator: true,
      heatingType: 'gaz',
      lotsCount: 24,
      annualCharges: 1440,
      description: 'Description entière fictive, ascenseur et cave.',
    })
    expect(draft?.warnings).toContain(
      'Taxe foncière non affichée : à demander.'
    )

    // get_draft dit ce que la page n'a pas donné.
    const read = await callTool('get_draft', { draftId: draft?.id })
    expect(n(read.content[0]?.text)).toContain('Non relevé : taxe foncière')

    const accepted = await api()
      .post(`/listing-drafts/${draft?.id}/accept`)
      .set(ctx.auth(richard))
      .expect(200)
    const listing = await api()
      .get(`/listings/${accepted.body.listingId}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(listing.body.listing.portalPhotos).toEqual([
      photo(1),
      photo(2),
      photo(3),
    ])
    expect(listing.body.listing.floor).toBe(3)
    expect(listing.body.listing.fieldSources.portalPhotos.source).toBe(
      'listing'
    )
  })
})
