/**
 * ADR 0040 : ce que le connecteur n'écrit pas, par de vrais appels JSON-RPC
 * (MCP) et REST sur PostGIS. Le plafond d'encadrement vient de l'arrêté, le
 * loyer de marché est retenu par un membre dans l'application, l'adresse
 * normalisée, l'identifiant BAN et le code INSEE viennent du géocodeur : une
 * entrée du MCP qui les envoie voit ces clés ignorées ; le REST les accepte
 * toujours. Zonage, arrêté et géocodeur fictifs ; aucun appel réseau.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { RentReferenceTable } from '@apart/contracts'
import { ISOCHRONE_DOWN, createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { DATA_TAG } from '../src/mcp/tool-results'
import { GeoService } from '../src/geo/geo.service'
import { ReferenceCacheService } from '../src/opendata/reference-cache.service'
import { RENT_REFERENCE_KIND } from '../src/opendata/rent-control.service'

const richard = e2eIdentity('richard')

/** Un secteur fictif d'encadrement, zone 1. */
const ZONE = [
  [
    [
      [-0.59, 44.83],
      [-0.57, 44.83],
      [-0.57, 44.85],
      [-0.59, 44.85],
      [-0.59, 44.83],
    ],
  ],
]
const INSIDE: [number, number] = [-0.58, 44.84]
const BAN_ID = '33063_9999_00001'

/** Arrêté fictif en vigueur : 2 pièces, avant 1946, vide → majoré 13 €/m². */
function table(): RentReferenceTable {
  const today = new Date()
  const from = new Date(today.getTime() - 90 * 86_400_000)
  const until = new Date(today.getTime() + 200 * 86_400_000)
  return {
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: from.toISOString().slice(0, 10),
    validFrom: from.toISOString().slice(0, 10),
    validUntil: until.toISOString().slice(0, 10),
    source: {
      url: null,
      file: 'arrete-fictif.xlsx',
      sha256: 'test',
      importedAt: today.toISOString(),
      crossCheck: null,
    },
    rows: [false, true].map(furnished => ({
      zone: 1,
      rooms: 2,
      epoch: 'before_1946' as const,
      furnished,
      referenceRent: 11,
      upperRent: 13 + (furnished ? 1 : 0),
      lowerRent: 7,
    })),
  }
}

/** Le géocodeur : l'adresse au numéro, identifiant BAN fictif. */
const geocoder = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        features: [
          {
            geometry: { type: 'Point', coordinates: INSIDE },
            properties: {
              label: '1 Rue Fictive 33000 Bordeaux',
              score: 0.95,
              type: 'housenumber',
              city: 'Bordeaux',
              citycode: '33063',
              id: BAN_ID,
            },
          },
        ],
      }),
  })

/** Ce qu'une conversation enverrait : des valeurs que le serveur pose lui-même. */
const SENT_BY_CLAUDE = {
  title: '[Exemple] T2 rue Fictive (connecteur)',
  price: 190_000,
  surface: 45,
  rooms: 2,
  floor: 2,
  constructionYear: 1900,
  location: {
    addressRaw: '1 rue Fictive',
    commune: 'Bordeaux',
    addressNormalized: 'Adresse inventée',
    banId: 'INVENTE',
    inseeCode: '99999',
  },
  rentalPlan: { targetRent: 700, referenceRentPerM2: 25, marketRent: 1000 },
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

interface ListingBody {
  listing: {
    id: string
    updatedAt: string
    location: {
      addressNormalized: string | null
      banId: string | null
      inseeCode: string | null
    }
    rentalPlan: {
      targetRent: number | null
      referenceRentPerM2: number | null
      marketRent: number | null
    }
    fieldSources: Record<string, { source: string } | undefined>
  }
  evaluation: { metrics: { rentCap: number | null } }
}

describe('Champs que le connecteur n’écrit pas (e2e)', () => {
  let ctx: E2eContext
  let nextId = 1

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
    expect(res.body.error).toBeUndefined()
    return res.body.result as ToolResult
  }

  function fenced(result: ToolResult): ListingBody {
    expect(result.isError).toBeUndefined()
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    expect(match).not.toBeNull()
    return JSON.parse(match?.[1] ?? '{}') as ListingBody
  }

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.georisques.fetchImpl = ISOCHRONE_DOWN
    await ctx.prisma.workspace.create({
      data: {
        name: '[Exemple] Espace connecteur',
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
    await ctx.app.get(GeoService).replaceRentControlZones('bordeaux', [
      {
        zone: 1,
        label: 'Secteur fictif',
        irisCode: '330630001',
        inseeCode: '33063',
        geometry: { type: 'MultiPolygon', coordinates: ZONE },
        source: 'test',
      },
    ])
    await ctx.app
      .get(ReferenceCacheService)
      .set(RENT_REFERENCE_KIND, 'bordeaux:test', table())
    ctx.geocoding.fetchImpl = geocoder
  })

  it('create_listing : le plafond vient de l’arrêté, le loyer de marché reste vide, la localisation du géocodeur', async () => {
    const item = fenced(
      await callTool(richard, 'create_listing', {
        listing: SENT_BY_CLAUDE,
        provenance: 'ai',
      })
    )
    const { listing } = item
    expect(listing.rentalPlan.targetRent).toBe(700)
    expect(listing.rentalPlan.referenceRentPerM2).toBe(13)
    expect(listing.fieldSources['rentalPlan.referenceRentPerM2']?.source).toBe(
      'open_data'
    )
    expect(item.evaluation.metrics.rentCap).toBe(13 * 45)
    expect(listing.rentalPlan.marketRent).toBeNull()
    expect(listing.location.banId).toBe(BAN_ID)
    expect(listing.location.inseeCode).toBe('33063')
    expect(listing.location.addressNormalized).toBe(
      '1 Rue Fictive 33000 Bordeaux'
    )
    expect(listing.fieldSources.banId?.source).toBe('open_data')
  })

  it('create_listing avec un point : rien n’est géocodé, les sorties du géocodeur restent vides', async () => {
    const item = fenced(
      await callTool(richard, 'create_listing', {
        listing: {
          ...SENT_BY_CLAUDE,
          location: {
            ...SENT_BY_CLAUDE.location,
            point: { type: 'Point', coordinates: INSIDE },
            precision: 'exact',
          },
        },
        provenance: 'ai',
      })
    )
    expect(item.listing.location.banId).toBeNull()
    expect(item.listing.location.inseeCode).toBeNull()
    expect(item.listing.location.addressNormalized).toBeNull()
    expect(item.listing.fieldSources).not.toHaveProperty('banId')
  })

  it('update_listing : la fiche garde le plafond saisi, le loyer de marché retenu et les sorties du géocodeur', async () => {
    // REST : le membre saisit un plafond et retient un loyer de marché.
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...SENT_BY_CLAUDE,
        location: { addressRaw: '1 rue Fictive', commune: 'Bordeaux' },
        rentalPlan: { targetRent: 700 },
      })
      .expect(201)
    const id = (created.body as ListingBody).listing.id
    const retained = await request(ctx.server)
      .patch(`/listings/${id}`)
      .set(ctx.auth(richard))
      .send({
        rentalPlan: {
          targetRent: 700,
          referenceRentPerM2: 15,
          marketRent: 680,
        },
      })
      .expect(200)
    const before = retained.body as ListingBody
    expect(before.listing.rentalPlan.referenceRentPerM2).toBe(15)
    expect(before.listing.rentalPlan.marketRent).toBe(680)
    expect(
      before.listing.fieldSources['rentalPlan.referenceRentPerM2']?.source
    ).toBe('user')

    // MCP : la phase 2 et la localisation remplacées, sans toucher à ces clés.
    const after = fenced(
      await callTool(richard, 'update_listing', {
        listingId: id,
        patch: {
          rentalPlan: SENT_BY_CLAUDE.rentalPlan,
          location: {
            addressRaw: '1 rue Fictive',
            commune: 'Bordeaux',
            district: 'Victoire',
            banId: 'INVENTE',
            inseeCode: '99999',
            addressNormalized: 'Adresse inventée',
          },
        },
        expectedUpdatedAt: before.listing.updatedAt,
        provenance: 'ai',
      })
    )
    expect(after.listing.rentalPlan.targetRent).toBe(700)
    expect(after.listing.rentalPlan.referenceRentPerM2).toBe(15)
    expect(after.listing.rentalPlan.marketRent).toBe(680)
    expect(
      after.listing.fieldSources['rentalPlan.referenceRentPerM2']?.source
    ).toBe('user')
    expect(after.listing.location.banId).toBe(BAN_ID)
    expect(after.listing.location.inseeCode).toBe('33063')
    expect(after.listing.location.addressNormalized).toBe(
      '1 Rue Fictive 33000 Bordeaux'
    )
    expect(after.listing.fieldSources.banId?.source).toBe('open_data')
  })

  it('REST : un membre peut toujours saisir le plafond et le loyer de marché', async () => {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...SENT_BY_CLAUDE,
        location: { addressRaw: '1 rue Fictive', commune: 'Bordeaux' },
      })
      .expect(201)
    const { listing } = res.body as ListingBody
    expect(listing.rentalPlan.referenceRentPerM2).toBe(25)
    expect(listing.rentalPlan.marketRent).toBe(1000)
  })
})
