/**
 * Lot 11, équipements et quartiers, sur un vrai PostGIS : contours de
 * quartiers, pistes d'athlétisme, supermarchés avec drive et salles Fitness
 * Park écrits par le module geo, puis lus par l'enrichissement d'une annonce
 * (instantané `open_data_context.surroundings`), le contexte de la fiche, les
 * couches de carte et l'état des imports. Aucune valeur réelle : contours,
 * noms et positions sont inventés ; aucun appel réseau.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { ListingContext, Surroundings } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { AmenityRow, NeighbourhoodRow } from '../src/geo/geo.service'

const richard = e2eIdentity('richard')

/** Deux quartiers fictifs côte à côte (limite à -0,57) et un IRIS plus loin. */
const square = (west: number, south: number, size = 0.02) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ],
  ],
})
const NEIGHBOURHOODS: NeighbourhoodRow[] = [
  {
    kind: 'quartier',
    code: 'Q-OUEST',
    name: 'Quartier fictif Ouest',
    parent: 'Grand quartier fictif',
    commune: 'Commune fictive',
    inseeCode: '33999',
    source: 'Jeu fictif des quartiers',
    geometry: square(-0.59, 44.83),
  },
  {
    kind: 'quartier',
    code: 'Q-EST',
    name: 'Quartier fictif Est',
    parent: null,
    commune: 'Commune fictive',
    inseeCode: '33999',
    source: 'Jeu fictif des quartiers',
    geometry: square(-0.57, 44.83),
  },
  {
    kind: 'iris',
    code: '339980101',
    name: 'IRIS Lointain',
    parent: null,
    commune: 'Autre commune fictive',
    inseeCode: '33998',
    source: 'Contours IRIS fictifs',
    geometry: square(-0.7, 44.9),
  },
  {
    // Un IRIS de la même commune, qui déborde au sud des quartiers : il ne
    // sert qu'à défaut de quartier officiel (interstice).
    kind: 'iris',
    code: '339990101',
    name: 'IRIS Fictif Sud',
    parent: null,
    commune: 'Commune fictive',
    inseeCode: '33999',
    source: 'Contours IRIS fictifs',
    geometry: square(-0.59, 44.82, 0.03),
  },
]
/** Dans l'IRIS de la commune, hors de ses quartiers officiels. */
const IN_GAP: [number, number] = [-0.58, 44.825]

const INSIDE_WEST: [number, number] = [-0.58, 44.84]
/** Dans le quartier ouest, à 8 m environ de la limite avec le quartier est. */
const NEAR_BORDER: [number, number] = [-0.5701, 44.84]

function amenity(
  over: Partial<AmenityRow> & { externalId: string }
): AmenityRow {
  return {
    name: 'Équipement fictif',
    brand: null,
    brandGroup: null,
    drive: null,
    address: null,
    commune: 'Commune fictive',
    inseeCode: '33999',
    details: {},
    longitude: INSIDE_WEST[0],
    latitude: INSIDE_WEST[1],
    sourceUpdatedAt: null,
    ...over,
  }
}

const TRACKS: AmenityRow[] = [
  amenity({
    externalId: 'E-PROCHE',
    name: 'Stade fictif proche',
    longitude: -0.585,
    latitude: 44.84,
    details: {
      facilityType: 'Anneau fictif',
      covered: false,
      lengthMeters: 400,
      lanes: 6,
      access: ['Clubs', 'Scolaires'],
    },
    sourceUpdatedAt: '2025-01-15',
  }),
  amenity({
    externalId: 'E-LOIN',
    name: 'Stade fictif lointain',
    longitude: -0.62,
    latitude: 44.86,
  }),
]

const DRIVES: AmenityRow[] = [
  amenity({
    externalId: 'node/1',
    name: 'Carrefour fictif à vérifier',
    brand: 'Carrefour Market',
    brandGroup: 'carrefour',
    drive: 'to_verify',
    longitude: -0.581,
    latitude: 44.8405,
    details: { driveEvidence: 'drive_through=yes' },
  }),
  amenity({
    externalId: 'node/2',
    name: 'Carrefour Drive fictif',
    brand: 'Carrefour Drive',
    brandGroup: 'carrefour',
    drive: 'yes',
    longitude: -0.575,
    latitude: 44.845,
    details: { driveEvidence: 'name=Carrefour Drive fictif' },
  }),
  amenity({
    externalId: 'way/3',
    name: 'Drive Intermarché fictif',
    brand: 'Intermarché',
    brandGroup: 'intermarche',
    drive: 'yes',
    longitude: -0.6,
    latitude: 44.85,
  }),
  amenity({
    externalId: 'node/4',
    name: 'Drive fictif autre enseigne',
    brand: 'Enseigne fictive',
    brandGroup: 'other',
    drive: 'yes',
    longitude: -0.5795,
    latitude: 44.8402,
    address: '1 rue Fictive',
  }),
]

const FITNESS: AmenityRow[] = [
  amenity({
    externalId: 'node/9',
    name: 'Fitness Park fictif',
    brand: 'Fitness Park',
    longitude: -0.56,
    latitude: 44.835,
    address: '9 avenue Fictive',
  }),
]

/** Le géocodeur : une adresse au point voulu (numéro ou rue). */
function geocoderAt(
  coordinates: [number, number],
  type: 'housenumber' | 'street' = 'housenumber'
) {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { type: 'Point', coordinates },
              properties: {
                label: '1 Rue Fictive 33999 Commune fictive',
                score: 0.95,
                type,
                city: 'Commune fictive',
                citycode: '33999',
                id: '33999_9999_00001',
              },
            },
          ],
        }),
    })
}

const LISTING = {
  title: 'T2 fictif lot 11',
  price: 180_000,
  surface: 42,
  rooms: 2,
  location: { addressRaw: '1 rue Fictive', commune: 'Commune fictive' },
}

describe('Équipements et quartiers (e2e)', () => {
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
    ctx.geocoding.fetchImpl = geocoderAt(INSIDE_WEST)
  })

  async function importAll(): Promise<void> {
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, NEIGHBOURHOODS)
    await geo.replaceAmenities('athletics_track', 'res', TRACKS)
    await geo.replaceAmenities('supermarket_drive', 'osm', DRIVES)
    await geo.replaceAmenities('fitness_park', 'osm', FITNESS)
  }

  async function create(body: object = LISTING) {
    const res = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send(body)
      .expect(201)
    return res.body
  }

  it('sans import : « non disponible », jamais une valeur inventée', async () => {
    const { listing } = await create()
    const s = listing.openDataContext.surroundings as Surroundings
    expect(s.neighbourhood.status).toBe('unavailable')
    expect(s.athleticsTrack).toMatchObject({
      status: 'unavailable',
      nearest: null,
    })
    expect(s.supermarkets.status).toBe('unavailable')
    expect(s.supermarkets.preferred).toEqual({
      carrefour: null,
      auchan: null,
      intermarche: null,
    })
    expect(s.fitnessPark.status).toBe('unavailable')
    const status = await request(ctx.server)
      .get('/opendata/status')
      .set(ctx.auth(richard))
      .expect(200)
    expect(status.body.amenities).toEqual({
      athletics_track: 0,
      supermarket_drive: 0,
      fitness_park: 0,
    })
    expect(status.body.neighbourhoods).toEqual({
      quartier: 0,
      iris: 0,
      commune: 0,
    })
  })

  it('l’annonce reçoit son quartier et les équipements les plus proches, à vol d’oiseau', async () => {
    await importAll()
    const { listing } = await create()
    const s = listing.openDataContext.surroundings as Surroundings
    expect(s.neighbourhood).toEqual({
      status: 'ok',
      value: {
        name: 'Quartier fictif Ouest',
        kind: 'quartier',
        code: 'Q-OUEST',
        parent: 'Grand quartier fictif',
        commune: 'Commune fictive',
        inseeCode: '33999',
        source: 'Jeu fictif des quartiers',
      },
      reasons: [],
    })
    const point = { type: 'Point' as const, coordinates: INSIDE_WEST }
    // Piste : la plus proche, distance PostGIS arrondie au mètre, nature gardée.
    const track = s.athleticsTrack.nearest
    expect(track?.name).toBe('Stade fictif proche')
    expect(track?.source).toBe('res')
    expect(track?.details).toMatchObject({
      facilityType: 'Anneau fictif',
      covered: false,
      lengthMeters: 400,
      lanes: 6,
      access: ['Clubs', 'Scolaires'],
    })
    expect(track?.distanceMeters).toBe(
      Math.round(
        await geo.distanceMeters(point, {
          type: 'Point',
          coordinates: [-0.585, 44.84],
        })
      )
    )
    // Drives : le Carrefour signalé l'emporte sur le plus proche « à vérifier ».
    expect(s.supermarkets.preferred.carrefour?.name).toBe(
      'Carrefour Drive fictif'
    )
    expect(s.supermarkets.preferred.auchan).toBeNull()
    expect(s.supermarkets.preferred.intermarche?.name).toBe(
      'Drive Intermarché fictif'
    )
    expect(s.supermarkets.nearest?.name).toBe('Drive fictif autre enseigne')
    expect(s.supermarkets.nearest?.address).toBe('1 rue Fictive')
    expect(s.supermarkets.reasons).toEqual([
      'Aucun drive Auchan à moins de 20 km à vol d’oiseau.',
    ])
    expect(s.fitnessPark.nearest?.name).toBe('Fitness Park fictif')
    // Le journal de l'enrichissement le dit.
    const log = await ctx.prisma.activityLog.findFirst({
      where: { listingId: listing.id, action: 'listing.enriched' },
    })
    expect(log?.after).toMatchObject({
      surroundings: {
        neighbourhood: 'Quartier fictif Ouest',
        nearestDrive: 'Drive fictif autre enseigne',
      },
    })

    // Le contexte de la fiche est recalculé à la lecture, avec le même résultat.
    const res = await request(ctx.server)
      .get(`/listings/${listing.id}/context`)
      .set(ctx.auth(richard))
      .expect(200)
    const context = res.body as ListingContext
    expect(context.surroundings.neighbourhood.value?.code).toBe('Q-OUEST')
    expect(context.surroundings.fitnessPark.nearest?.distanceMeters).toBe(
      s.fitnessPark.nearest?.distanceMeters
    )
  })

  it('changer d’adresse recalcule le quartier ; une adresse à la rue en limite est « à vérifier »', async () => {
    await importAll()
    const { listing } = await create()
    ctx.geocoding.fetchImpl = geocoderAt(NEAR_BORDER, 'street')
    const moved = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: { addressRaw: 'rue Limite', commune: 'Commune fictive' },
      })
      .expect(200)
    const s = moved.body.listing.openDataContext.surroundings as Surroundings
    expect(moved.body.listing.location.precision).toBe('street')
    expect(s.neighbourhood.status).toBe('to_verify')
    expect(s.neighbourhood.value?.code).toBe('Q-OUEST')
    expect(s.neighbourhood.reasons.join(' ')).toContain(
      '« Quartier fictif Est »'
    )

    // Hors des quartiers officiels mais dans un IRIS de la commune : l'IRIS.
    ctx.geocoding.fetchImpl = geocoderAt(IN_GAP)
    const gap = await request(ctx.server)
      .patch(`/listings/${listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: { addressRaw: '2 rue Sud', commune: 'Commune fictive' },
      })
      .expect(200)
    const fallback = gap.body.listing.openDataContext
      .surroundings as Surroundings
    expect(fallback.neighbourhood.status).toBe('ok')
    expect(fallback.neighbourhood.value).toMatchObject({
      kind: 'iris',
      name: 'IRIS Fictif Sud',
    })
  })

  it('couches de carte : équipements par genre, contours par emprise ; état des imports', async () => {
    await importAll()
    const drives = await request(ctx.server)
      .get('/opendata/layers/amenities?kind=supermarket_drive')
      .set(ctx.auth(richard))
      .expect(200)
    expect(drives.body.features).toHaveLength(4)
    const carrefour = drives.body.features.find(
      (f: { properties: { name: string } }) =>
        f.properties.name === 'Carrefour Drive fictif'
    )
    expect(carrefour.properties).toMatchObject({
      kind: 'supermarket_drive',
      brand: 'Carrefour Drive',
      brandGroup: 'carrefour',
      drive: 'yes',
      source: 'osm',
    })
    const tracks = await request(ctx.server)
      .get('/opendata/layers/amenities?kind=athletics_track')
      .set(ctx.auth(richard))
      .expect(200)
    const near = tracks.body.features.find(
      (f: { properties: { name: string } }) =>
        f.properties.name === 'Stade fictif proche'
    )
    expect(near.properties).toMatchObject({
      facilityType: 'Anneau fictif',
      covered: false,
      lengthMeters: 400,
      access: 'Clubs, Scolaires',
    })
    await request(ctx.server)
      .get('/opendata/layers/amenities?kind=piscine')
      .set(ctx.auth(richard))
      .expect(400)

    const inView = await request(ctx.server)
      .get('/opendata/layers/neighbourhoods?bbox=-0.6,44.82,-0.54,44.86')
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      inView.body.features.map((f: { id: string }) => f.id).sort()
    ).toEqual(['339990101', 'Q-EST', 'Q-OUEST'])
    const west = inView.body.features.find(
      (f: { id: string }) => f.id === 'Q-OUEST'
    )
    expect(['Polygon', 'MultiPolygon']).toContain(west.geometry.type)
    expect(west.properties.source).toBe('Jeu fictif des quartiers')
    // La couche montre le découpage retenu : l'IRIS d'une commune qui a des
    // quartiers officiels n'y figure que pour sa part hors de ces quartiers.
    const all = await request(ctx.server)
      .get('/opendata/layers/neighbourhoods')
      .set(ctx.auth(richard))
      .expect(200)
    expect(all.body.features.map((f: { id: string }) => f.id).sort()).toEqual([
      '339980101',
      '339990101',
      'Q-EST',
      'Q-OUEST',
    ])
    const partial = all.body.features.find(
      (f: { id: string }) => f.id === '339990101'
    )
    expect(partial.properties.partial).toBe(true)
    expect(
      all.body.features.find((f: { id: string }) => f.id === 'Q-OUEST')
        .properties
    ).toMatchObject({ partial: false, parent: 'Grand quartier fictif' })
    // L'IRIS d'une commune à quartiers entièrement couverte n'est pas dessiné.
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      ...NEIGHBOURHOODS.slice(0, 2),
      {
        ...(NEIGHBOURHOODS[3] as NeighbourhoodRow),
        geometry: square(-0.585, 44.835, 0.01),
      },
    ])
    const covered = await request(ctx.server)
      .get('/opendata/layers/neighbourhoods')
      .set(ctx.auth(richard))
      .expect(200)
    expect(
      covered.body.features.map((f: { id: string }) => f.id).sort()
    ).toEqual(['Q-EST', 'Q-OUEST'])

    const status = await request(ctx.server)
      .get('/opendata/status')
      .set(ctx.auth(richard))
      .expect(200)
    expect(status.body.amenities).toEqual({
      athletics_track: 2,
      supermarket_drive: 4,
      fitness_park: 1,
    })
    expect(status.body.neighbourhoods).toEqual({
      quartier: 2,
      iris: 1,
      commune: 0,
    })
  })

  it('les imports remplacent leur source en entier, sans toucher aux autres', async () => {
    await importAll()
    expect(
      await geo.replaceAmenities('athletics_track', 'res', TRACKS)
    ).toEqual({ written: 2, removed: 2 })
    // Une source de complément (OpenStreetMap) n'efface pas le RES.
    await geo.replaceAmenities('athletics_track', 'osm', [
      amenity({ externalId: 'way/77', name: 'Piste OSM fictive' }),
    ])
    expect(
      await ctx.prisma.amenity.count({ where: { kind: 'athletics_track' } })
    ).toBe(3)
    // Un fichier vide ne vide pas la table.
    expect(await geo.replaceAmenities('fitness_park', 'osm', [])).toEqual({
      written: 0,
      removed: 0,
    })
    expect(
      await ctx.prisma.amenity.count({ where: { kind: 'fitness_park' } })
    ).toBe(1)
    const replaced = await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      NEIGHBOURHOODS[0] as NeighbourhoodRow,
    ])
    expect(replaced).toEqual({ written: 1, removed: 4 })
    expect(await geo.neighbourhoodCounts(NEIGHBOURHOOD_TERRITORY)).toEqual({
      quartier: 1,
      iris: 0,
      commune: 0,
    })
    // Un polygone qui se recoupe est réparé (ST_MakeValid), pas refusé.
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      {
        ...(NEIGHBOURHOODS[0] as NeighbourhoodRow),
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.59, 44.83],
              [-0.57, 44.85],
              [-0.57, 44.83],
              [-0.59, 44.85],
              [-0.59, 44.83],
            ],
          ],
        },
      },
    ])
    expect(
      await geo.neighbourhoodsNear(
        { type: 'Point', coordinates: [-0.585, 44.84] },
        0,
        NEIGHBOURHOOD_TERRITORY
      )
    ).toHaveLength(1)
  })
})
