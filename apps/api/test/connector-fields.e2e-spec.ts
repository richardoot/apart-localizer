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
    propertyTax: number | null
    nonRecoverableChargesMonthly: number | null
    location: {
      addressNormalized: string | null
      banId: string | null
      inseeCode: string | null
      point: { coordinates: [number, number] } | null
      placement: { method: string } | null
    }
    rentalPlan: {
      targetRent: number | null
      referenceRentPerM2: number | null
      marketRent: number | null
    }
    fieldSources: Record<string, { source: string } | undefined>
  }
  evaluation: {
    metrics: {
      rentCap: number | null
      propertyTaxEstimated: boolean
      nonRecoverableChargesEstimated: boolean
    }
  }
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

  it('create_listing avec un point : le repère ne bouge pas, l’adresse donne le BAN et l’INSEE', async () => {
    const near: [number, number] = [-0.5801, 44.8401]
    const item = fenced(
      await callTool(richard, 'create_listing', {
        listing: {
          ...SENT_BY_CLAUDE,
          location: {
            ...SENT_BY_CLAUDE.location,
            point: { type: 'Point', coordinates: near },
            precision: 'exact',
          },
        },
        provenance: 'ai',
      })
    )
    const { location, fieldSources } = item.listing
    expect(location.point?.coordinates).toEqual(near)
    expect(location.placement?.method).toBe('manual')
    expect(location.banId).toBe(BAN_ID)
    expect(location.inseeCode).toBe('33063')
    expect(location.addressNormalized).toBe('1 Rue Fictive 33000 Bordeaux')
    expect(fieldSources.banId?.source).toBe('open_data')
  })

  it('create_listing avec un point loin de l’adresse : seul le code INSEE est gardé', async () => {
    const far: [number, number] = [-0.57, 44.84]
    const item = fenced(
      await callTool(richard, 'create_listing', {
        listing: {
          ...SENT_BY_CLAUDE,
          location: {
            ...SENT_BY_CLAUDE.location,
            point: { type: 'Point', coordinates: far },
            precision: 'exact',
          },
        },
        provenance: 'ai',
      })
    )
    const { location, fieldSources } = item.listing
    expect(location.point?.coordinates).toEqual(far)
    expect(location.banId).toBeNull()
    expect(location.addressNormalized).toBeNull()
    expect(location.inseeCode).toBe('33063')
    expect(fieldSources).not.toHaveProperty('banId')
  })

  it('create_listing : une taxe foncière sans extrait n’est pas gardée, l’application l’estime', async () => {
    const result = await callTool(richard, 'create_listing', {
      listing: {
        ...SENT_BY_CLAUDE,
        annualCharges: 1200,
        propertyTax: 700,
        nonRecoverableChargesMonthly: 40,
        fieldSources: {
          nonRecoverableChargesMonthly: {
            source: 'ai',
            evidence: 'dont 40 € par mois non récupérables',
          },
        },
      },
      provenance: 'ai',
    })
    const item = fenced(result)
    expect(item.listing.propertyTax).toBeNull()
    expect(item.listing.fieldSources).not.toHaveProperty('propertyTax')
    expect(item.listing.nonRecoverableChargesMonthly).toBe(40)
    expect(item.evaluation.metrics.propertyTaxEstimated).toBe(true)
    expect(item.evaluation.metrics.nonRecoverableChargesEstimated).toBe(false)
    expect(result.content[0]?.text).toContain('Non gardé : Taxe foncière.')

    // Dictée par le membre : gardée.
    const dictated = fenced(
      await callTool(richard, 'create_listing', {
        listing: {
          ...SENT_BY_CLAUDE,
          title: '[Exemple] T2 dicté',
          propertyTax: 700,
        },
        provenance: 'user',
      })
    )
    expect(dictated.listing.propertyTax).toBe(700)
    expect(dictated.evaluation.metrics.propertyTaxEstimated).toBe(false)
  })

  it('update_listing : une estimation seule est refusée en le disant, avec son extrait elle est écrite', async () => {
    const { listing } = fenced(
      await callTool(richard, 'create_listing', {
        listing: SENT_BY_CLAUDE,
        provenance: 'ai',
      })
    )
    const refused = await callTool(richard, 'update_listing', {
      listingId: listing.id,
      patch: { propertyTax: 700 },
      provenance: 'ai',
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain('Non gardé : Taxe foncière.')

    const mixed = await callTool(richard, 'update_listing', {
      listingId: listing.id,
      patch: { propertyTax: 700, floor: 3 },
      provenance: 'ai',
    })
    const afterMixed = fenced(mixed)
    expect(afterMixed.listing.propertyTax).toBeNull()
    expect(mixed.content[0]?.text).toContain('Annonce modifiée (floor)')
    expect(mixed.content[0]?.text).toContain('Non gardé : Taxe foncière.')

    const read = fenced(
      await callTool(richard, 'update_listing', {
        listingId: listing.id,
        patch: {
          propertyTax: 700,
          fieldSources: {
            propertyTax: { source: 'ai', evidence: 'Taxe foncière : 700 €' },
          },
        },
        provenance: 'ai',
      })
    )
    expect(read.listing.propertyTax).toBe(700)
    expect(read.listing.fieldSources.propertyTax?.source).toBe('ai')
  })

  it('REST : un point saisi avec une nouvelle adresse ne garde pas le BAN de l’ancienne', async () => {
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        ...SENT_BY_CLAUDE,
        location: { addressRaw: '1 rue Fictive', commune: 'Bordeaux' },
      })
      .expect(201)
    const before = (created.body as ListingBody).listing
    expect(before.location.banId).toBe(BAN_ID)
    // Le géocodeur ne connaît pas la nouvelle adresse.
    ctx.geocoding.fetchImpl = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ features: [] }),
      })
    const moved = await request(ctx.server)
      .patch(`/listings/${before.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          ...before.location,
          addressRaw: '99 avenue Inconnue',
          point: { type: 'Point', coordinates: [-0.585, 44.845] },
          precision: 'exact',
        },
        expectedUpdatedAt: before.updatedAt,
      })
      .expect(200)
    const after = (moved.body as ListingBody).listing
    expect(after.location.point?.coordinates).toEqual([-0.585, 44.845])
    expect(after.location.banId).toBeNull()
    expect(after.location.addressNormalized).toBeNull()
    expect(after.fieldSources).not.toHaveProperty('banId')
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
