import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import type {
  LocationPrecision,
  Point,
  PointRadius,
  Polygon,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'

/**
 * Le seul endroit où vit du SQL géographique.
 *
 * Les colonnes `geography` sont invisibles pour le client Prisma (Unsupported) ;
 * elles s'écrivent et se lisent ici, par `$queryRaw` et `$executeRaw` dont les
 * résultats passent par un schéma Zod. Les services métier appellent ce
 * module après avoir créé ou mis à jour une adresse, et pour filtrer.
 *
 * Toutes les distances sont en mètres sur la sphère (geography), toutes les
 * coordonnées en WGS 84, [longitude, latitude].
 */
@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Écrit (ou efface, avec `null`) le point d'une annonce et ses colonnes miroir. */
  async setListingPoint(
    listingId: string,
    point: Point | null,
    precision: LocationPrecision | null
  ): Promise<void> {
    if (point === null) {
      await this.prisma.$executeRaw`
        UPDATE "app"."listings"
        SET "geom" = NULL, "latitude" = NULL, "longitude" = NULL,
            "location_geojson" = NULL, "location_precision" = NULL
        WHERE "id" = ${listingId}`
      return
    }
    const [longitude, latitude] = point.coordinates
    await this.prisma.$executeRaw`
      UPDATE "app"."listings"
      SET "geom" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          "latitude" = ${latitude},
          "longitude" = ${longitude},
          "location_geojson" = ${JSON.stringify(point)}::jsonb,
          "location_precision" = ${precision}::"app"."LocationPrecision"
      WHERE "id" = ${listingId}`
  }

  /** Annonces de l'espace dans un rayon, de la plus proche à la plus lointaine. */
  async listingsWithinRadius(
    workspaceId: string,
    near: PointRadius
  ): Promise<ListingDistance[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT "id",
             ST_Distance("geom", ST_SetSRID(ST_MakePoint(${near.longitude}, ${near.latitude}), 4326)::geography) AS "distance_meters"
      FROM "app"."listings"
      WHERE "workspace_id" = ${workspaceId}
        AND "geom" IS NOT NULL
        AND ST_DWithin("geom", ST_SetSRID(ST_MakePoint(${near.longitude}, ${near.latitude}), 4326)::geography, ${near.radiusMeters})
      ORDER BY "distance_meters" ASC`
    return ListingDistanceRows.parse(rows)
  }

  /** Annonces de l'espace dont le point tombe dans un polygone GeoJSON. */
  async listingsWithinPolygon(
    workspaceId: string,
    polygon: Polygon
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT "id"
      FROM "app"."listings"
      WHERE "workspace_id" = ${workspaceId}
        AND "geom" IS NOT NULL
        AND ST_Intersects("geom", ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326)::geography)`
    return IdRows.parse(rows).map(r => r.id)
  }

  /** Annonces de l'espace dans le périmètre enregistré d'un critère (polygone ou isochrone). */
  async listingsWithinCriteriaPerimeter(
    workspaceId: string,
    criteriaId: string
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT l."id"
      FROM "app"."listings" l
      JOIN "app"."search_criteria" c ON c."id" = ${criteriaId}
      WHERE l."workspace_id" = ${workspaceId}
        AND l."geom" IS NOT NULL
        AND c."perimeter" IS NOT NULL
        AND ST_Intersects(l."geom", c."perimeter")`
    return IdRows.parse(rows).map(r => r.id)
  }

  /** Écrit (ou efface) le polygone d'un critère de recherche. */
  async setCriteriaPerimeter(
    criteriaId: string,
    polygon: Polygon | null
  ): Promise<void> {
    if (polygon === null) {
      await this.prisma.$executeRaw`
        UPDATE "app"."search_criteria"
        SET "perimeter" = NULL, "perimeter_geojson" = NULL
        WHERE "id" = ${criteriaId}`
      return
    }
    await this.prisma.$executeRaw`
      UPDATE "app"."search_criteria"
      SET "perimeter" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326)::geography,
          "perimeter_geojson" = ${JSON.stringify(polygon)}::jsonb
      WHERE "id" = ${criteriaId}`
  }

  /** L'arrêt de transport le plus proche d'un point, dans une distance maximale. */
  async nearestTransitStop(
    point: Point,
    maxMeters = 2000
  ): Promise<NearestStop | null> {
    const [longitude, latitude] = point.coordinates
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "network", "line", "name",
             ST_Distance("geom", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) AS "distance_meters"
      FROM "app"."transit_stops"
      WHERE "geom" IS NOT NULL
        AND ST_DWithin("geom", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${maxMeters})
      ORDER BY "geom" <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      LIMIT 1`
    const parsed = NearestStopRows.parse(rows)
    return parsed[0] ?? null
  }

  /** Insère un arrêt avec son point (import TBM, tests). */
  async insertTransitStop(stop: {
    network: string
    line: string | null
    name: string
    externalId?: string | null
    point: Point
  }): Promise<string> {
    const [longitude, latitude] = stop.point.coordinates
    const rows = await this.prisma.$queryRaw`
      INSERT INTO "app"."transit_stops" ("id", "network", "line", "name", "external_id", "latitude", "longitude", "geom")
      VALUES (gen_random_uuid()::text, ${stop.network}, ${stop.line}, ${stop.name}, ${stop.externalId ?? null},
              ${latitude}, ${longitude},
              ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
      RETURNING "id"`
    const id = IdRows.parse(rows)[0]?.id
    if (!id) throw new Error('transit stop insert returned no id')
    return id
  }

  /** Distance en mètres entre deux points, calculée par PostGIS (pour les tests et le MCP). */
  async distanceMeters(a: Point, b: Point): Promise<number> {
    const rows = await this.prisma.$queryRaw`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${a.coordinates[0]}, ${a.coordinates[1]}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${b.coordinates[0]}, ${b.coordinates[1]}), 4326)::geography
      ) AS "distance_meters"`
    return DistanceRows.parse(rows)[0]?.distance_meters ?? Number.NaN
  }

  /** Le `Prisma.sql` d'un filtre `id IN (...)`, pour composer avec une requête métier. */
  static idsIn(ids: string[]): Prisma.Sql {
    return Prisma.join(ids)
  }
}

const ListingDistanceRows = z.array(
  z.object({ id: z.string(), distance_meters: z.number() })
)
export type ListingDistance = z.infer<typeof ListingDistanceRows>[number]

const IdRows = z.array(z.object({ id: z.string() }))

const NearestStopRows = z.array(
  z.object({
    id: z.string(),
    network: z.string(),
    line: z.string().nullable(),
    name: z.string(),
    distance_meters: z.number(),
  })
)
export type NearestStop = z.infer<typeof NearestStopRows>[number]

const DistanceRows = z.array(z.object({ distance_meters: z.number() }))
