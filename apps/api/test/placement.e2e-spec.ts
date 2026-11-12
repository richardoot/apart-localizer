/**
 * Lot 12, placement des annonces, sur un vrai PostGIS : quartier reconnu
 * dans le champ « quartier » (repère au point intérieur du contour, zone
 * écrite par le module geo), lieu-dit en repli, centre de la commune sinon ;
 * un repère à l'adresse prime et n'est jamais redescendu ; réserves des
 * calculs (desserte, encadrement, critères) ; contours pour la carte ;
 * filtre par précision. Contours, noms et positions inventés ; aucun appel
 * réseau (le géocodeur est scripté).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { ListingContext, RentReferenceTable } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { NeighbourhoodRow } from '../src/geo/geo.service'
import { ReferenceCacheService } from '../src/opendata/reference-cache.service'
import { RENT_REFERENCE_KIND } from '../src/opendata/rent-control.service'

const richard = e2eIdentity('richard')

const square = (
  west: number,
  south: number,
  w: number,
  h = w
): { type: 'Polygon'; coordinates: [number, number][][] } => ({
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

/** Deux secteurs fictifs d'un même grand quartier, et l'IRIS qui couvre la commune. */
const NEIGHBOURHOODS: NeighbourhoodRow[] = [
  {
    kind: 'quartier',
    code: 'S-NORD',
    name: 'Secteur fictif Nord',
    parent: 'Grand quartier fictif',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'Secteurs fictifs',
    geometry: square(-0.6, 44.85, 0.01),
  },
  {
    kind: 'quartier',
    code: 'S-SUD',
    name: 'Secteur fictif Sud',
    parent: 'Grand quartier fictif',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'Secteurs fictifs',
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
    geometry: square(-0.6, 44.84, 0.02),
  },
]

/** Zone 1 au nord (tout le secteur Nord, moitié du Sud), zone 2 au sud. */
const ZONES = [
  {
    zone: 1,
    irisCode: '330639991',
    geometry: square(-0.6, 44.845, 0.01, 0.015),
  },
  {
    zone: 2,
    irisCode: '330639992',
    geometry: square(-0.6, 44.84, 0.01, 0.005),
  },
]

function table(): RentReferenceTable {
  const today = new Date()
  const from = new Date(today.getTime() - 90 * 86_400_000)
  return {
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: from.toISOString().slice(0, 10),
    validFrom: from.toISOString().slice(0, 10),
    validUntil: null,
    source: {
      url: null,
      file: 'arrete-fictif.xlsx',
      sha256: 'test',
      importedAt: today.toISOString(),
      crossCheck: null,
    },
    rows: [1, 2].map(zone => ({
      zone,
      rooms: 2,
      epoch: 'before_1946' as const,
      furnished: false,
      referenceRent: 10 + zone,
      upperRent: 12 + zone,
      lowerRent: 7,
    })),
  }
}

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

/** Le géocodeur : la commune au centre (-0,59 ; 44,85), une adresse au numéro si demandé. */
function geocoder(address: [number, number] | null = null) {
  return (url: string) => {
    if (url.includes('type=municipality')) {
      return json({
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
    }
    return json({
      features: address
        ? [
            {
              geometry: { type: 'Point', coordinates: address },
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
}

describe('Placement des annonces (e2e)', () => {
  let ctx: E2eContext
  let geo: GeoService

  beforeAll(async () => {
    ctx = await createE2eApp([richard])
    geo = ctx.app.get(GeoService)
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
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
          ],
        },
      },
    })
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, NEIGHBOURHOODS)
    await geo.replaceRentControlZones(
      'bordeaux',
      ZONES.map(z => ({
        zone: z.zone,
        label: `Zone fictive ${z.zone}`,
        irisCode: z.irisCode,
        inseeCode: '33063',
        geometry: z.geometry,
        source: 'test',
      }))
    )
    await ctx.app
      .get(ReferenceCacheService)
      .set(RENT_REFERENCE_KIND, 'bordeaux:test', table())
    ctx.geocoding.fetchImpl = geocoder()
  })

  async function create(location: object) {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        title: 'T2 fictif lot 12',
        price: 200_000,
        surface: 40,
        rooms: 2,
        constructionYear: 1900,
        location,
      })
      .expect(201)
    return res.body.listing
  }

  async function context(id: string): Promise<ListingContext> {
    const res = await request(ctx.server)
      .get(`/listings/${id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    return res.body
  }

  async function areaOf(id: string): Promise<number | null> {
    const rows = await ctx.db.query<{ area: number | null }>(
      'SELECT ST_Area("location_area") AS "area" FROM "app"."listings" WHERE "id" = $1',
      [id]
    )
    return rows[0]?.area ?? null
  }

  it('sans numéro : le secteur reconnu place le repère en son centre, avec sa zone et ses réserves', async () => {
    const listing = await create({
      commune: 'Bordeaux',
      district: 'Grand quartier fictif, Secteur fictif Nord (tram Z)',
    })
    expect(listing.location.precision).toBe('district')
    expect(listing.location.placement).toMatchObject({
      method: 'neighbourhood_match',
      precision: 'district',
      matchedText: 'Secteur fictif Nord',
      area: {
        level: 'sector',
        name: 'Secteur fictif Nord',
        codes: ['S-NORD'],
        inseeCode: '33063',
      },
      toVerify: false,
    })
    const [lng, lat] = listing.location.point.coordinates
    expect(lng).toBeGreaterThan(-0.6)
    expect(lng).toBeLessThan(-0.59)
    expect(lat).toBeGreaterThan(44.85)
    expect(lat).toBeLessThan(44.86)
    expect(listing.fieldSources.point.source).toBe('open_data')
    expect(await areaOf(listing.id)).toBeGreaterThan(800_000)

    const ctxt = await context(listing.id)
    expect(ctxt.approximation).toMatchObject({
      approximate: true,
      origin: 'centre du secteur « Secteur fictif Nord »',
    })
    expect(ctxt.placement?.area?.name).toBe('Secteur fictif Nord')
    expect(ctxt.transit.approximate).toBe(true)
    expect(ctxt.surroundings.neighbourhood.value?.name).toBe(
      'Secteur fictif Nord'
    )
    expect(ctxt.surroundings.neighbourhood.status).toBe('to_verify')
    expect(ctxt.rentControl.status).toBe('to_verify')
    expect(ctxt.rentControl.reasons[0]).toBe(
      'Repère approché, le secteur « Secteur fictif Nord » entièrement en zone 1 : zone probable, à confirmer avec l’adresse.'
    )

    const areas = await request(ctx.server)
      .get('/listings/areas')
      .set(ctx.auth(richard))
      .expect(200)
    expect(areas.body.features).toHaveLength(1)
    expect(areas.body.features[0].properties).toEqual({
      listingId: listing.id,
      name: 'Secteur fictif Nord',
      level: 'sector',
    })

    const filtered = await request(ctx.server)
      .get('/listings?precision=district')
      .set(ctx.auth(richard))
      .expect(200)
    expect(filtered.body.total).toBe(1)
    const exact = await request(ctx.server)
      .get('/listings?precision=exact,none')
      .set(ctx.auth(richard))
      .expect(200)
    expect(exact.body.total).toBe(0)
  })

  it('une fiche extraite (point géocodé, provenance open_data) est replacée ; un point saisi reste « point saisi »', async () => {
    const extracted = await create({
      commune: 'Bordeaux',
      district: 'Secteur fictif Sud',
      point: { type: 'Point', coordinates: [-0.595, 44.845] },
      precision: 'district',
    })
    // Sans provenance, un point fourni est une saisie.
    expect(extracted.location.placement.method).toBe('manual')
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        title: 'T2 fictif extrait',
        price: 190_000,
        location: {
          commune: 'Bordeaux',
          district: 'Secteur fictif Sud',
          point: { type: 'Point', coordinates: [-0.595, 44.845] },
          precision: 'district',
        },
        fieldSources: {
          point: {
            source: 'open_data',
            recordedAt: '2026-11-05T10:00:00.000Z',
          },
        },
      })
      .expect(201)
    expect(res.body.listing.location.placement).toMatchObject({
      method: 'neighbourhood_match',
      area: { name: 'Secteur fictif Sud' },
    })
    expect(await areaOf(res.body.listing.id)).toBeGreaterThan(800_000)
  })

  it('un secteur à cheval sur deux zones : zone à vérifier', async () => {
    const listing = await create({
      commune: 'Bordeaux',
      district: 'Secteur fictif Sud',
    })
    const ctxt = await context(listing.id)
    expect(ctxt.rentControl.reasons[0]).toContain(
      'chevauche les zones 1 et 2 : zone à vérifier'
    )
  })

  it('rien de reconnu : centre de la commune, zone = commune entière ; un lieu-dit en repli', async () => {
    const commune = await create({ commune: 'Bordeaux', district: 'Inventé' })
    expect(commune.location.precision).toBe('commune')
    expect(commune.location.point.coordinates).toEqual([-0.59, 44.85])
    expect(commune.location.placement.reasons).toEqual([
      'Aucun quartier reconnu dans « Inventé » : repère au centre de la commune.',
      '« Inventé » : aucun quartier ni lieu-dit de ce nom à Bordeaux.',
    ])
    expect(await areaOf(commune.id)).toBeGreaterThan(3_000_000)
    const ctxt = await context(commune.id)
    expect(ctxt.approximation.origin).toBe('centre de la commune (Bordeaux)')
    expect(ctxt.rentControl.reasons[0]).toContain(
      'la commune de Bordeaux chevauche les zones 1 et 2'
    )

    const placed = await geo.replacePlaces('osm', NEIGHBOURHOOD_TERRITORY, [
      {
        externalId: 'node/1',
        name: 'Lieu-dit Fictif',
        placeType: 'neighbourhood',
        longitude: -0.585,
        latitude: 44.845,
      },
      {
        externalId: 'node/2',
        name: 'Ailleurs Fictif',
        placeType: 'suburb',
        longitude: 1,
        latitude: 45,
      },
    ])
    expect(placed).toEqual({ written: 2, removed: 0, withoutCommune: 1 })
    expect(await geo.placeCount()).toBe(2)
    const status = await request(ctx.server)
      .get('/opendata/status')
      .set(ctx.auth(richard))
      .expect(200)
    expect(status.body.places).toBe(2)
    const place = await create({
      commune: 'Bordeaux',
      district: 'Lieu-dit Fictif est',
    })
    expect(place.location.precision).toBe('district')
    expect(place.location.placement.method).toBe('osm_place')
    expect(place.location.point.coordinates).toEqual([-0.585, 44.845])
    expect(await areaOf(place.id)).toBeNull()
  })

  it('le quartier changé replace le repère, même si le formulaire renvoie l’ancien point ; l’adresse prime', async () => {
    const listing = await create({
      commune: 'Bordeaux',
      district: 'Secteur fictif Nord',
    })
    const moved = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          commune: 'Bordeaux',
          district: 'Secteur fictif Sud',
          point: listing.location.point,
          precision: 'district',
        },
        expectedUpdatedAt: listing.updatedAt,
      })
      .expect(200)
    expect(moved.body.listing.location.placement.area.name).toBe(
      'Secteur fictif Sud'
    )
    expect(moved.body.listing.location.point.coordinates[1]).toBeLessThan(44.85)
    const journal = await ctx.prisma.activityLog.findFirst({
      where: { listingId: listing.id, action: 'listing.updated' },
    })
    expect(journal).not.toBeNull()

    ctx.geocoding.fetchImpl = geocoder([-0.592, 44.842])
    const exact = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          district: 'Secteur fictif Sud',
          point: moved.body.listing.location.point,
          precision: 'district',
        },
      })
      .expect(200)
    expect(exact.body.listing.location.precision).toBe('exact')
    expect(exact.body.listing.location.placement.method).toBe('address')
    expect(await areaOf(listing.id)).toBeNull()

    // Le quartier seul ne touche plus un repère à l'adresse.
    const kept = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          district: 'Secteur fictif Nord',
          point: exact.body.listing.location.point,
          precision: 'exact',
        },
      })
      .expect(200)
    expect(kept.body.listing.location.precision).toBe('exact')
    expect(kept.body.listing.location.point.coordinates).toEqual([
      -0.592, 44.842,
    ])

    // Un point saisi prime : placement « point saisi ».
    const manual = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          district: 'Secteur fictif Nord',
          point: { type: 'Point', coordinates: [-0.595, 44.855] },
          precision: 'exact',
        },
      })
      .expect(200)
    expect(manual.body.listing.location.placement.method).toBe('manual')
  })

  it('un point saisi approché cède à l’adresse exacte saisie ensuite : repère, BAN, encadrement et instantané recalculés', async () => {
    // Le repère posé à la main (ou par Claude) au nord, approché.
    const listing = await create({
      commune: 'Bordeaux',
      district: 'Secteur fictif Nord',
      point: { type: 'Point', coordinates: [-0.595, 44.855] },
      precision: 'district',
    })
    expect(listing.location.placement.method).toBe('manual')
    expect((await context(listing.id)).rentControl.zone?.zone).toBe(1)

    // L'adresse exacte, au sud, saisie dans la fiche : le formulaire renvoie
    // l'ancien point avec elle.
    ctx.geocoding.fetchImpl = geocoder([-0.592, 44.842])
    const exact = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          district: 'Secteur fictif Nord',
          point: listing.location.point,
          precision: 'district',
        },
      })
      .expect(200)
    expect(exact.body.listing.location).toMatchObject({
      point: { coordinates: [-0.592, 44.842] },
      precision: 'exact',
      banId: '33063_9999_00001',
      addressNormalized: '1 Rue Fictive 33000 Bordeaux',
      placement: { method: 'address' },
    })
    expect(exact.body.listing.fieldSources.point.source).toBe('open_data')
    const ctxt = await context(listing.id)
    expect(ctxt.rentControl.status).toBe('ok')
    expect(ctxt.rentControl.zone?.zone).toBe(2)
    // L'instantané enregistré suit le nouveau repère.
    const row = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { openDataContext: true },
    })
    expect(
      (row.openDataContext as { rentControl: { zone: number } }).rentControl
        .zone
    ).toBe(2)

    // Un point saisi à l'adresse, tout près : il la précise, il reste quand
    // l'adresse est corrigée ; l'identifiant BAN suit la nouvelle adresse.
    const pinned = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          point: { type: 'Point', coordinates: [-0.5921, 44.8421] },
          precision: 'exact',
        },
      })
      .expect(200)
    expect(pinned.body.listing.location.placement.method).toBe('manual')
    const corrected = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1, rue Fictive',
          commune: 'Bordeaux',
          point: pinned.body.listing.location.point,
          precision: 'exact',
        },
      })
      .expect(200)
    expect(corrected.body.listing.location).toMatchObject({
      point: { coordinates: [-0.5921, 44.8421] },
      placement: { method: 'manual' },
      banId: '33063_9999_00001',
    })

    // Une adresse trouvée loin du point saisi : l'adresse l'emporte.
    ctx.geocoding.fetchImpl = geocoder([-0.595, 44.855])
    const far = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '3 rue Fictive',
          commune: 'Bordeaux',
          point: corrected.body.listing.location.point,
          precision: 'exact',
        },
      })
      .expect(200)
    expect(far.body.listing.location).toMatchObject({
      point: { coordinates: [-0.595, 44.855] },
      placement: { method: 'address' },
    })
    expect((await context(listing.id)).rentControl.zone?.zone).toBe(1)
  })

  it('lot 14 : au quartier, le contour est mesuré contre le périmètre, jamais seul le repère', async () => {
    const listing = await create({
      commune: 'Bordeaux',
      district: 'Secteur fictif Nord',
    })
    const workspace = await ctx.prisma.workspace.findFirstOrThrow()
    const draft = async (polygon: ReturnType<typeof square>) => {
      const rows = await geo.criteriaFitMeasuresDraft(workspace.id, {
        perimeterType: 'polygon',
        center: null,
        polygon,
      })
      expect(rows).toHaveLength(1)
      return rows[0]
    }
    // Le secteur (0,01° de côté) est entier dans le grand carré.
    expect(await draft(square(-0.61, 44.845, 0.03))).toMatchObject({
      listing_id: listing.id,
      has_point: true,
      precision: 'district',
      has_area: true,
      point_distance: 0,
      area_covered: true,
      area_distance: 0,
    })
    // Un périmètre qui ne prend que la moitié est du secteur : le repère (au
    // centre) est dehors, le contour le chevauche à moitié.
    const half = await draft(square(-0.595 + 0.0005, 44.84, 0.02, 0.03))
    expect(half?.area_covered).toBe(false)
    expect(half?.area_distance).toBe(0)
    expect(half?.point_distance).toBeGreaterThan(0)
    expect(half?.area_share).toBeGreaterThan(0.4)
    expect(half?.area_share).toBeLessThan(0.5)
    // Un périmètre à l'écart : la distance du contour au périmètre.
    const far = await draft(square(-0.58, 44.85, 0.01))
    expect(far?.area_covered).toBe(false)
    expect(far?.area_distance).toBeGreaterThan(700)
    expect(far?.area_distance).toBeLessThan(900)
    // Point et rayon : distance au centre moins le rayon, disque pour le contour.
    const [radius] = await geo.criteriaFitMeasuresDraft(workspace.id, {
      perimeterType: 'point_radius',
      center: {
        longitude: listing.location.point.coordinates[0],
        latitude: listing.location.point.coordinates[1],
        radiusMeters: 5000,
      },
      polygon: null,
    })
    expect(radius).toMatchObject({ point_distance: 0, area_covered: true })
    // Aucun arrêt de tram importé : distances inconnues (à confirmer, jamais hors).
    expect(radius?.tram_point_distance).toBeNull()
    expect(radius?.tram_area_distance).toBeNull()
    // Sans périmètre : rien à mesurer.
    const [none] = await geo.criteriaFitMeasuresDraft(workspace.id, {
      perimeterType: null,
      center: null,
      polygon: null,
    })
    expect(none).toMatchObject({
      point_distance: null,
      area_covered: null,
      area_distance: null,
      area_share: null,
    })
  })
})
