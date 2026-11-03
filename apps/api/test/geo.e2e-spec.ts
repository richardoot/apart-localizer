/**
 * Le module geo contre un vrai PostGIS : écriture d'un point, rayon,
 * polygone, périmètre d'un critère, arrêt le plus proche. Les coordonnées
 * sont celles de Bordeaux Métropole (Talence Forum, campus, CHU).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Point, Polygon } from '@apart/contracts'
import { createE2eApp } from './e2e-app'
import type { E2eContext } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'

const TALENCE_FORUM: Point = { type: 'Point', coordinates: [-0.5906, 44.8083] }
const CAMPUS_PEIXOTTO: Point = {
  type: 'Point',
  coordinates: [-0.5955, 44.8077],
}
const CHU_PELLEGRIN: Point = { type: 'Point', coordinates: [-0.6039, 44.8277] }
const LE_BOUSCAT: Point = { type: 'Point', coordinates: [-0.6, 44.865] }

/** Un rectangle autour de Talence (Forum et campus dedans, CHU et Le Bouscat dehors). */
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

describe('GeoService (PostGIS)', () => {
  let ctx: E2eContext
  let geo: GeoService
  let workspaceId: string
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    ctx = await createE2eApp([])
    geo = ctx.app.get(GeoService)
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    const workspace = await ctx.prisma.workspace.create({
      data: { name: 'Géo' },
    })
    workspaceId = workspace.id
    for (const [key, point] of Object.entries({
      forum: TALENCE_FORUM,
      campus: CAMPUS_PEIXOTTO,
      chu: CHU_PELLEGRIN,
      bouscat: LE_BOUSCAT,
    })) {
      const listing = await ctx.prisma.listing.create({
        data: { workspaceId, title: key, price: 100_000 },
      })
      ids[key] = listing.id
      await geo.setListingPoint(listing.id, point, 'exact')
    }
    // Une annonce sans point n'apparaît dans aucun filtre géographique.
    const blind = await ctx.prisma.listing.create({
      data: { workspaceId, title: 'sans adresse', price: 1 },
    })
    ids.blind = blind.id
  })

  it('écrit le point et ses colonnes miroir', async () => {
    const row = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: ids.forum as string },
    })
    expect(row.latitude).toBeCloseTo(44.8083, 6)
    expect(row.longitude).toBeCloseTo(-0.5906, 6)
    expect(row.locationPrecision).toBe('exact')
    expect(row.locationGeoJson).toEqual(TALENCE_FORUM)
    const [geom] = await ctx.db.query<{ wkt: string }>(
      `SELECT ST_AsText("geom"::geometry) AS wkt FROM "app"."listings" WHERE "id" = $1`,
      [ids.forum]
    )
    expect(geom?.wkt).toBe('POINT(-0.5906 44.8083)')
  })

  it('efface le point avec null', async () => {
    await geo.setListingPoint(ids.forum as string, null, null)
    const row = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: ids.forum as string },
    })
    expect(row.latitude).toBeNull()
    expect(row.locationGeoJson).toBeNull()
    const near = await geo.listingsWithinRadius(workspaceId, {
      ...centre(TALENCE_FORUM),
      radiusMeters: 100,
    })
    expect(near).toEqual([])
  })

  it('rayon : les annonces à moins de 600 m du Forum, triées par distance', async () => {
    const near = await geo.listingsWithinRadius(workspaceId, {
      ...centre(TALENCE_FORUM),
      radiusMeters: 600,
    })
    expect(near.map(r => r.id)).toEqual([ids.forum, ids.campus])
    expect(near[0]?.distance_meters).toBeCloseTo(0, 3)
    // Forum → Peixotto : environ 390 m à vol d'oiseau.
    expect(near[1]?.distance_meters).toBeGreaterThan(300)
    expect(near[1]?.distance_meters).toBeLessThan(500)
  })

  it('rayon : 3 km englobent le CHU, pas Le Bouscat', async () => {
    const near = await geo.listingsWithinRadius(workspaceId, {
      ...centre(TALENCE_FORUM),
      radiusMeters: 3000,
    })
    expect(new Set(near.map(r => r.id))).toEqual(
      new Set([ids.forum, ids.campus, ids.chu])
    )
  })

  it('rayon : un autre espace de travail ne voit rien', async () => {
    const other = await ctx.prisma.workspace.create({ data: { name: 'Autre' } })
    const near = await geo.listingsWithinRadius(other.id, {
      ...centre(TALENCE_FORUM),
      radiusMeters: 50_000,
    })
    expect(near).toEqual([])
  })

  it('polygone : Talence dedans, le reste dehors', async () => {
    const inside = await geo.listingsWithinPolygon(workspaceId, TALENCE_BOX)
    expect(new Set(inside)).toEqual(new Set([ids.forum, ids.campus]))
  })

  it("périmètre d'un critère enregistré", async () => {
    const criteria = await ctx.prisma.searchCriteria.create({
      data: { workspaceId, name: 'Talence', perimeterType: 'polygon' },
    })
    expect(
      await geo.listingsWithinCriteriaPerimeter(workspaceId, criteria.id)
    ).toEqual([])
    await geo.setCriteriaPerimeter(criteria.id, TALENCE_BOX)
    const inside = await geo.listingsWithinCriteriaPerimeter(
      workspaceId,
      criteria.id
    )
    expect(new Set(inside)).toEqual(new Set([ids.forum, ids.campus]))
    const saved = await ctx.prisma.searchCriteria.findUniqueOrThrow({
      where: { id: criteria.id },
    })
    expect(saved.perimeterGeoJson).toEqual(TALENCE_BOX)
    await geo.setCriteriaPerimeter(criteria.id, null)
    expect(
      await geo.listingsWithinCriteriaPerimeter(workspaceId, criteria.id)
    ).toEqual([])
  })

  it('arrêt le plus proche : Peixotto depuis le campus, rien à plus de 2 km', async () => {
    await geo.insertTransitStop({
      network: 'TBM',
      line: 'B',
      name: 'Peixotto',
      point: { type: 'Point', coordinates: [-0.5949, 44.8085] },
    })
    await geo.insertTransitStop({
      network: 'TBM',
      line: 'B',
      name: 'Forum',
      point: { type: 'Point', coordinates: [-0.5905, 44.8094] },
    })
    const nearest = await geo.nearestTransitStop(CAMPUS_PEIXOTTO)
    expect(nearest?.name).toBe('Peixotto')
    expect(nearest?.line).toBe('B')
    expect(nearest?.distance_meters).toBeLessThan(150)
    expect(await geo.nearestTransitStop(LE_BOUSCAT)).toBeNull()
    expect(await geo.nearestTransitStop(LE_BOUSCAT, 20_000)).not.toBeNull()
  })

  it('distance PostGIS entre deux points connus', async () => {
    // Forum → CHU Pellegrin : environ 2,4 km.
    const d = await geo.distanceMeters(TALENCE_FORUM, CHU_PELLEGRIN)
    expect(d).toBeGreaterThan(2200)
    expect(d).toBeLessThan(2600)
  })
})

function centre(point: Point): { longitude: number; latitude: number } {
  return { longitude: point.coordinates[0], latitude: point.coordinates[1] }
}
