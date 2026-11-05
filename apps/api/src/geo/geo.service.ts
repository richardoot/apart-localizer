import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import {
  AmenityDetailsSchema,
  AmenityKindSchema,
  AmenitySourceSchema,
  DriveStatusSchema,
  LISTING_AREA_SIMPLIFY_DEGREES,
  NeighbourhoodKindSchema,
  SupermarketBrandGroupSchema,
} from '@apart/contracts'
import type {
  AmenityDetails,
  AmenityKind,
  AmenitySource,
  CriteriaFilters,
  DriveStatus,
  LayerFeatureCollection,
  LocationPrecision,
  NeighbourhoodKind,
  PerimeterType,
  Point,
  PointRadius,
  Polygon,
  SupermarketBrandGroup,
  TransitMode,
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

  /**
   * Écrit (ou efface, avec `null`) le point d'une annonce et ses colonnes
   * miroir, et la zone où le bien se trouve quand le repère est approché
   * (lot 12) : l'union de contours importés, ou la commune entière (ses IRIS
   * ou son contour de commune). Sans `area`, la zone est effacée : un point
   * à l'adresse n'en a pas.
   */
  async setListingPoint(
    listingId: string,
    point: Point | null,
    precision: LocationPrecision | null,
    area: ListingAreaRef | null = null,
    tx?: Pick<Prisma.TransactionClient, '$executeRaw'>
  ): Promise<void> {
    const client = tx ?? this.prisma
    if (point === null) {
      await client.$executeRaw`
        UPDATE "app"."listings"
        SET "geom" = NULL, "latitude" = NULL, "longitude" = NULL,
            "location_geojson" = NULL, "location_precision" = NULL,
            "location_area" = NULL
        WHERE "id" = ${listingId}`
      return
    }
    const [longitude, latitude] = point.coordinates
    await client.$executeRaw`
      UPDATE "app"."listings"
      SET "geom" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          "latitude" = ${latitude},
          "longitude" = ${longitude},
          "location_geojson" = ${JSON.stringify(point)}::jsonb,
          "location_precision" = ${precision}::"app"."LocationPrecision",
          "location_area" = ${areaSql(area)}
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
      JOIN "app"."search_criteria" c
        ON c."id" = ${criteriaId} AND c."workspace_id" = ${workspaceId}
      WHERE l."workspace_id" = ${workspaceId}
        AND l."geom" IS NOT NULL
        AND c."perimeter" IS NOT NULL
        AND ST_Intersects(l."geom", c."perimeter")`
    return IdRows.parse(rows).map(r => r.id)
  }

  /** Écrit (ou efface) le polygone d'un critère de recherche. */
  async setCriteriaPerimeter(
    criteriaId: string,
    polygon: Polygon | null,
    /** La transaction de l'écriture du critère, pour que ligne et géométrie restent cohérentes. */
    tx?: Pick<Prisma.TransactionClient, '$executeRaw'>
  ): Promise<void> {
    const client = tx ?? this.prisma
    if (polygon === null) {
      await client.$executeRaw`
        UPDATE "app"."search_criteria"
        SET "perimeter" = NULL, "perimeter_geojson" = NULL
        WHERE "id" = ${criteriaId}`
      return
    }
    await client.$executeRaw`
      UPDATE "app"."search_criteria"
      SET "perimeter" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326)::geography,
          "perimeter_geojson" = ${JSON.stringify(polygon)}::jsonb
      WHERE "id" = ${criteriaId}`
  }

  /**
   * L'arrêt de transport le plus proche d'un point, dans une distance
   * maximale ; d'un mode donné (tram) si `mode` est précisé.
   */
  async nearestTransitStop(
    point: Point,
    maxMeters = 2000,
    mode?: TransitMode
  ): Promise<NearestStop | null> {
    const [longitude, latitude] = point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const modeFilter = mode
      ? Prisma.sql`AND "mode" = ${mode}::"app"."TransitMode"`
      : Prisma.empty
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "network", "line", "name", "mode"::text AS "mode", "longitude", "latitude",
             ST_Distance("geom", ${target}) AS "distance_meters"
      FROM "app"."transit_stops"
      WHERE "geom" IS NOT NULL
        ${modeFilter}
        AND ST_DWithin("geom", ${target}, ${maxMeters})
      ORDER BY "geom" <-> ${target}
      LIMIT 1`
    const parsed = NearestStopRows.parse(rows)
    return parsed[0] ?? null
  }

  /** Insère un arrêt avec son point (tests). L'import passe par `upsertTransitStops`. */
  async insertTransitStop(stop: {
    network: string
    line: string | null
    name: string
    externalId?: string | null
    mode?: TransitMode
    point: Point
  }): Promise<string> {
    const [longitude, latitude] = stop.point.coordinates
    const rows = await this.prisma.$queryRaw`
      INSERT INTO "app"."transit_stops" ("id", "network", "mode", "line", "name", "external_id", "latitude", "longitude", "geom")
      VALUES (gen_random_uuid()::text, ${stop.network}, ${stop.mode ?? 'bus'}::"app"."TransitMode", ${stop.line}, ${stop.name}, ${stop.externalId ?? null},
              ${latitude}, ${longitude},
              ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
      RETURNING "id"`
    const id = IdRows.parse(rows)[0]?.id
    if (!id) throw new Error('transit stop insert returned no id')
    return id
  }

  /**
   * Import des arrêts : insertion ou mise à jour par (réseau, identifiant),
   * par lots ; les arrêts du réseau absents de l'import sont supprimés quand
   * `pruneMissing` est vrai (arrêts désactivés depuis le dernier import).
   */
  async upsertTransitStops(
    network: string,
    stops: readonly TransitStopRow[],
    options: { pruneMissing?: boolean; batchSize?: number } = {}
  ): Promise<{ upserted: number; pruned: number }> {
    const size = options.batchSize ?? 500
    let upserted = 0
    for (let i = 0; i < stops.length; i += size) {
      const batch = stops.slice(i, i + size)
      const values = batch.map(
        stop => Prisma.sql`(gen_random_uuid()::text, ${network}, ${stop.mode}::"app"."TransitMode",
          ${stop.lines.length ? stop.lines.join(', ') : null}, ${stop.name}, ${stop.externalId},
          ${stop.latitude}::double precision, ${stop.longitude}::double precision,
          ST_SetSRID(ST_MakePoint(${stop.longitude}::double precision, ${stop.latitude}::double precision), 4326)::geography, now())`
      )
      upserted += await this.prisma.$executeRaw`
        INSERT INTO "app"."transit_stops" ("id", "network", "mode", "line", "name", "external_id", "latitude", "longitude", "geom", "imported_at")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("network", "external_id") DO UPDATE SET
          "mode" = EXCLUDED."mode", "line" = EXCLUDED."line", "name" = EXCLUDED."name",
          "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
          "geom" = EXCLUDED."geom", "imported_at" = EXCLUDED."imported_at"`
    }
    let pruned = 0
    if (options.pruneMissing && stops.length > 0) {
      pruned = await this.prisma.$executeRaw`
        DELETE FROM "app"."transit_stops"
        WHERE "network" = ${network}
          AND ("external_id" IS NULL OR "external_id" NOT IN (${Prisma.join(stops.map(s => s.externalId))}))`
    }
    return { upserted, pruned }
  }

  /** Les arrêts d'un mode en GeoJSON, pour la couche de carte. */
  async transitStopsGeoJson(
    mode?: TransitMode
  ): Promise<LayerFeatureCollection> {
    const modeFilter = mode
      ? Prisma.sql`WHERE "mode" = ${mode}::"app"."TransitMode"`
      : Prisma.empty
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "name", "line", "mode"::text AS "mode", "longitude", "latitude"
      FROM "app"."transit_stops" ${modeFilter}
      ORDER BY "name"`
    return {
      type: 'FeatureCollection',
      features: TransitStopLayerRows.parse(rows).map(row => ({
        type: 'Feature',
        id: row.id,
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
        properties: { name: row.name, lines: row.line, mode: row.mode },
      })),
    }
  }

  /** Nombre d'arrêts par mode (santé des imports). */
  async transitStopCounts(): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw`
      SELECT "mode"::text AS "mode", COUNT(*)::int AS "count"
      FROM "app"."transit_stops" GROUP BY "mode"`
    return Object.fromEntries(
      CountByKeyRows.parse(rows).map(row => [row.mode, row.count])
    )
  }

  // -------------------------------------------------------------------------
  // Critères de recherche : périmètre et distance au tram
  // -------------------------------------------------------------------------

  /**
   * Les annonces de l'espace qui satisfont la partie géographique d'un
   * critère enregistré (périmètre, distance au tram), éventuellement parmi
   * `restrictTo`. `approximate` : localisation au quartier ou à la commune.
   */
  async listingsInCriteria(
    workspaceId: string,
    criteriaId: string,
    restrictTo?: readonly string[]
  ): Promise<CriteriaGeoMatch[]> {
    if (restrictTo && restrictTo.length === 0) return []
    const restrict = restrictTo
      ? Prisma.sql`AND l."id" IN (${Prisma.join([...restrictTo])})`
      : Prisma.empty
    const rows = await this.prisma.$queryRaw`
      SELECT l."id", ${APPROXIMATE} AS "approximate"
      FROM "app"."listings" l
      JOIN "app"."search_criteria" c ON c."id" = ${criteriaId} AND c."workspace_id" = ${workspaceId}
      WHERE l."workspace_id" = ${workspaceId}
        ${restrict}
        AND ${CRITERIA_GEO_PREDICATE}`
    return CriteriaGeoRows.parse(rows)
  }

  /**
   * La même chose pour un critère pas encore enregistré (aperçu) : le
   * périmètre et les filtres passent par une ligne virtuelle `c`, évaluée par
   * le même prédicat que les critères enregistrés.
   */
  async listingsInCriteriaDraft(
    workspaceId: string,
    draft: CriteriaGeoDraft
  ): Promise<CriteriaGeoMatch[]> {
    const polygon = draft.polygon ? JSON.stringify(draft.polygon) : null
    const rows = await this.prisma.$queryRaw`
      WITH c AS (
        SELECT ${draft.perimeterType}::"app"."PerimeterType" AS "perimeter_type",
               ${draft.center?.longitude ?? null}::double precision AS "center_longitude",
               ${draft.center?.latitude ?? null}::double precision AS "center_latitude",
               ${draft.center?.radiusMeters ?? null}::integer AS "radius_meters",
               CASE WHEN ${polygon}::text IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_GeomFromGeoJSON(${polygon}::text), 4326)::geography END AS "perimeter",
               ${JSON.stringify(draft.filters)}::jsonb AS "filters"
      )
      SELECT l."id", ${APPROXIMATE} AS "approximate"
      FROM "app"."listings" l, c
      WHERE l."workspace_id" = ${workspaceId}
        AND ${CRITERIA_GEO_PREDICATE}`
    return CriteriaGeoRows.parse(rows)
  }

  /** Les critères actifs de l'espace dont la partie géographique contient l'annonce (alertes). */
  async criteriaContainingListing(
    workspaceId: string,
    listingId: string
  ): Promise<CriteriaContaining[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT c."id" AS "criteria_id", ${APPROXIMATE} AS "approximate"
      FROM "app"."search_criteria" c
      JOIN "app"."listings" l ON l."id" = ${listingId} AND l."workspace_id" = ${workspaceId}
      WHERE c."workspace_id" = ${workspaceId}
        AND c."active" = true
        AND ${CRITERIA_GEO_PREDICATE}`
    return CriteriaContainingRows.parse(rows)
  }

  /** Validité d'un polygone dessiné (anneau qui se recoupe...) et sa surface en m². */
  async checkPolygon(
    polygon: Polygon
  ): Promise<{ valid: boolean; reason: string; areaSquareMeters: number }> {
    const rows = await this.prisma.$queryRaw`
      SELECT ST_IsValid(g) AS "valid", ST_IsValidReason(g) AS "reason",
             ST_Area(g::geography) AS "area"
      FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326) AS g) s`
    const row = PolygonCheckRows.parse(rows)[0]
    if (!row) throw new Error('polygon check returned no row')
    return { valid: row.valid, reason: row.reason, areaSquareMeters: row.area }
  }

  // -------------------------------------------------------------------------
  // DVF
  // -------------------------------------------------------------------------

  /**
   * Import DVF, par lots : insertion ou mise à jour par identifiant de
   * mutation. Avec `replaceYears`, les ventes de ces années sont d'abord
   * retirées, dans la même transaction : l'identifiant de mutation d'Etalab
   * n'est pas stable d'une publication à l'autre, une année se remplace donc
   * en entier (ni doublon, ni vente d'une ancienne publication).
   */
  async upsertDvfSales(
    sales: readonly DvfSaleRow[],
    options: { batchSize?: number; replaceYears?: readonly number[] } = {}
  ): Promise<number> {
    const years = options.replaceYears ?? []
    if (years.length === 0)
      return this.insertDvfSales(this.prisma, sales, options)
    return this.prisma.$transaction(
      async tx => {
        await tx.$executeRaw`
          DELETE FROM "app"."dvf_sales"
          WHERE EXTRACT(YEAR FROM "mutation_date")::int IN (${Prisma.join([...years])})`
        return this.insertDvfSales(tx, sales, options)
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
  }

  private async insertDvfSales(
    client: Pick<Prisma.TransactionClient, '$executeRaw'>,
    sales: readonly DvfSaleRow[],
    options: { batchSize?: number }
  ): Promise<number> {
    const size = options.batchSize ?? 500
    let count = 0
    for (let i = 0; i < sales.length; i += size) {
      const batch = sales.slice(i, i + size)
      const values = batch.map(
        sale => Prisma.sql`(gen_random_uuid()::text, ${sale.externalId}, ${sale.mutationDate}::date, ${sale.mutationNature},
          ${sale.price}::numeric, ${sale.surface}::numeric, ${sale.propertyType}, ${sale.rooms}::integer,
          ${sale.address}, ${sale.postalCode}, ${sale.commune}, ${sale.inseeCode},
          ${sale.latitude}::double precision, ${sale.longitude}::double precision,
          ST_SetSRID(ST_MakePoint(${sale.longitude}::double precision, ${sale.latitude}::double precision), 4326)::geography,
          ${sale.pricePerM2}::numeric, ${sale.source}, now())`
      )
      count += await client.$executeRaw`
        INSERT INTO "app"."dvf_sales" ("id", "external_id", "mutation_date", "mutation_nature", "price", "surface",
          "property_type", "rooms", "address", "postal_code", "commune", "insee_code", "latitude", "longitude",
          "geom", "price_per_m2", "source", "imported_at")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("external_id") DO UPDATE SET
          "mutation_date" = EXCLUDED."mutation_date", "mutation_nature" = EXCLUDED."mutation_nature",
          "price" = EXCLUDED."price", "surface" = EXCLUDED."surface", "property_type" = EXCLUDED."property_type",
          "rooms" = EXCLUDED."rooms", "address" = EXCLUDED."address", "postal_code" = EXCLUDED."postal_code",
          "commune" = EXCLUDED."commune", "insee_code" = EXCLUDED."insee_code",
          "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude", "geom" = EXCLUDED."geom",
          "price_per_m2" = EXCLUDED."price_per_m2", "source" = EXCLUDED."source", "imported_at" = EXCLUDED."imported_at"`
    }
    return count
  }

  /**
   * Ventes d'appartements comparables autour d'un point : rayon, période,
   * fourchette de surface, ventes classiques seulement (ni VEFA ni
   * adjudication), de la plus récente à la plus ancienne.
   */
  async dvfSalesWithinRadius(query: DvfRadiusQuery): Promise<DvfSaleHit[]> {
    const [longitude, latitude] = query.point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const surface =
      query.surfaceRange !== null
        ? Prisma.sql`AND "surface" BETWEEN ${query.surfaceRange[0]} AND ${query.surfaceRange[1]}`
        : Prisma.empty
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "mutation_date"::text AS "mutation_date", "price"::float8 AS "price",
             "surface"::float8 AS "surface", "price_per_m2"::float8 AS "price_per_m2",
             "rooms", "address", "commune", "longitude", "latitude",
             ST_Distance("geom", ${target}) AS "distance_meters"
      FROM "app"."dvf_sales"
      WHERE "geom" IS NOT NULL
        AND "property_type" = 'Appartement'
        AND "mutation_nature" = 'Vente'
        AND "mutation_date" BETWEEN ${query.from}::date AND ${query.to}::date
        AND "price_per_m2" IS NOT NULL
        ${surface}
        AND ST_DWithin("geom", ${target}, ${query.radiusMeters})
      ORDER BY "mutation_date" DESC, "distance_meters" ASC
      LIMIT ${query.limit ?? 500}`
    return DvfSaleHitRows.parse(rows)
  }

  /** Ventes d'appartements d'une emprise, pour la couche de carte. */
  async dvfSalesInBbox(
    bbox: readonly [number, number, number, number],
    from: string,
    limit = 2000
  ): Promise<LayerFeatureCollection> {
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "mutation_date"::text AS "mutation_date", "price"::float8 AS "price",
             "surface"::float8 AS "surface", "price_per_m2"::float8 AS "price_per_m2",
             "rooms", "address", "commune", "longitude", "latitude", 0::float8 AS "distance_meters"
      FROM "app"."dvf_sales"
      WHERE "geom" IS NOT NULL
        AND "property_type" = 'Appartement'
        AND "mutation_nature" = 'Vente'
        AND "mutation_date" >= ${from}::date
        AND ST_Intersects("geom", ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)::geography)
      ORDER BY "mutation_date" DESC
      LIMIT ${limit}`
    return {
      type: 'FeatureCollection',
      features: DvfSaleHitRows.parse(rows)
        .filter(row => row.longitude !== null && row.latitude !== null)
        .map(row => ({
          type: 'Feature',
          id: row.id,
          geometry: {
            type: 'Point',
            coordinates: [row.longitude as number, row.latitude as number],
          },
          properties: {
            date: row.mutation_date,
            price: row.price,
            surface: row.surface,
            pricePerM2: row.price_per_m2,
            rooms: row.rooms,
            address: row.address,
          },
        })),
    }
  }

  /** Les années DVF présentes en base et le nombre de ventes de chacune. */
  async dvfYears(): Promise<{ year: number; count: number }[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM "mutation_date")::int AS "year", COUNT(*)::int AS "count"
      FROM "app"."dvf_sales" GROUP BY 1 ORDER BY 1`
    return YearCountRows.parse(rows)
  }

  // -------------------------------------------------------------------------
  // Encadrement des loyers : zonage
  // -------------------------------------------------------------------------

  /**
   * Remplace le zonage d'un territoire : un secteur par IRIS, géométrie
   * MultiPolygon GeoJSON [lng, lat]. Les secteurs absents de l'import sont
   * supprimés.
   */
  async replaceRentControlZones(
    territory: string,
    zones: readonly RentZoneRow[],
    /** La transaction de l'import, pour écrire zonage et arrêté ensemble. */
    tx?: Pick<Prisma.TransactionClient, '$executeRaw'>
  ): Promise<{ upserted: number; pruned: number }> {
    const client = tx ?? this.prisma
    let upserted = 0
    for (const zone of zones) {
      upserted += await client.$executeRaw`
        INSERT INTO "app"."rent_control_zones" ("id", "territory", "zone", "label", "iris_code", "insee_code", "geom", "source", "imported_at")
        VALUES (gen_random_uuid()::text, ${territory}, ${zone.zone}, ${zone.label}, ${zone.irisCode}, ${zone.inseeCode},
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(zone.geometry)}), 4326))::geography,
                ${zone.source}, now())
        ON CONFLICT ("territory", "iris_code") DO UPDATE SET
          "zone" = EXCLUDED."zone", "label" = EXCLUDED."label", "insee_code" = EXCLUDED."insee_code",
          "geom" = EXCLUDED."geom", "source" = EXCLUDED."source", "imported_at" = EXCLUDED."imported_at"`
    }
    const pruned =
      zones.length > 0
        ? await client.$executeRaw`
            DELETE FROM "app"."rent_control_zones"
            WHERE "territory" = ${territory}
              AND "iris_code" NOT IN (${Prisma.join(zones.map(z => z.irisCode))})`
        : 0
    return { upserted, pruned }
  }

  /**
   * Les secteurs qui contiennent le point ou passent à moins de
   * `toleranceMeters`, du plus proche au plus lointain : plusieurs zones
   * différentes signalent une adresse en limite de zone.
   */
  async rentControlZonesNear(
    point: Point,
    toleranceMeters = 15
  ): Promise<RentZoneHit[]> {
    const [longitude, latitude] = point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const rows = await this.prisma.$queryRaw`
      SELECT "zone", "label", "iris_code", "insee_code", "territory",
             ST_Distance("geom", ${target}) AS "distance_meters"
      FROM "app"."rent_control_zones"
      WHERE "geom" IS NOT NULL AND ST_DWithin("geom", ${target}, ${toleranceMeters})
      ORDER BY "distance_meters" ASC, "zone" ASC`
    return RentZoneHitRows.parse(rows)
  }

  /** Le zonage en GeoJSON (couche de carte), simplifié à 5 m environ. */
  async rentControlZonesGeoJson(
    territory: string
  ): Promise<LayerFeatureCollection> {
    const rows = await this.prisma.$queryRaw`
      SELECT "iris_code", "zone", "label",
             ST_AsGeoJSON(ST_SimplifyPreserveTopology("geom"::geometry, 0.00005), 6) AS "geometry"
      FROM "app"."rent_control_zones"
      WHERE "territory" = ${territory} AND "geom" IS NOT NULL
      ORDER BY "iris_code"`
    return {
      type: 'FeatureCollection',
      features: RentZoneLayerRows.parse(rows).map(row => ({
        type: 'Feature',
        id: row.iris_code,
        geometry: JSON.parse(
          row.geometry
        ) as LayerFeatureCollection['features'][number]['geometry'],
        properties: {
          zone: row.zone,
          label: row.label,
          irisCode: row.iris_code,
        },
      })),
    }
  }

  /** Nombre de secteurs importés pour un territoire. */
  async rentControlZoneCount(territory: string): Promise<number> {
    const rows = await this.prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count" FROM "app"."rent_control_zones" WHERE "territory" = ${territory}`
    return CountRows.parse(rows)[0]?.count ?? 0
  }

  // -------------------------------------------------------------------------
  // Équipements de proximité (lot 11) : pistes, drives, Fitness Park
  // -------------------------------------------------------------------------

  /**
   * Remplace les équipements d'un genre venus d'une source, dans une
   * transaction : les lignes absentes du fichier disparaissent, les autres
   * sont réécrites (import idempotent). Un import vide ne supprime rien, sauf
   * `allowEmpty` (un complément qui n'ajoute plus rien, source bien lue).
   */
  async replaceAmenities(
    kind: AmenityKind,
    source: AmenitySource,
    rows: readonly AmenityRow[],
    options: { batchSize?: number; allowEmpty?: boolean } = {}
  ): Promise<{ written: number; removed: number }> {
    if (rows.length === 0 && !options.allowEmpty) {
      return { written: 0, removed: 0 }
    }
    const size = options.batchSize ?? 500
    return this.prisma.$transaction(
      async tx => {
        const removed = await tx.$executeRaw`
          DELETE FROM "app"."amenities" WHERE "kind" = ${kind}::"app"."AmenityKind" AND "source" = ${source}`
        let written = 0
        for (let i = 0; i < rows.length; i += size) {
          const values = rows.slice(i, i + size).map(
            row => Prisma.sql`(gen_random_uuid()::text, ${kind}::"app"."AmenityKind", ${source}, ${row.externalId},
              ${row.name}, ${row.brand}, ${row.brandGroup}, ${row.drive}::"app"."DriveStatus",
              ${row.address}, ${row.commune}, ${row.inseeCode},
              ${JSON.stringify(AmenityDetailsSchema.parse(row.details ?? {}))}::jsonb,
              ${row.latitude}::double precision, ${row.longitude}::double precision,
              ST_SetSRID(ST_MakePoint(${row.longitude}::double precision, ${row.latitude}::double precision), 4326)::geography,
              ${row.sourceUpdatedAt}::date, now())`
          )
          written += await tx.$executeRaw`
            INSERT INTO "app"."amenities" ("id", "kind", "source", "external_id", "name", "brand", "brand_group",
              "drive", "address", "commune", "insee_code", "details", "latitude", "longitude", "geom",
              "source_updated_at", "imported_at")
            VALUES ${Prisma.join(values)}`
        }
        return { written, removed }
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
  }

  /**
   * Les équipements d'un genre autour d'un point, du plus proche au plus
   * lointain, dans une distance maximale (à vol d'oiseau, sur la sphère).
   */
  async amenitiesNear(
    point: Point,
    kind: AmenityKind,
    maxMeters: number,
    limit = 1
  ): Promise<AmenityHit[]> {
    const [longitude, latitude] = point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "kind", "source", "external_id", "name", "brand", "brand_group",
             "drive"::text AS "drive", "address", "commune", "details", "longitude", "latitude",
             ST_Distance("geom", ${target}) AS "distance_meters"
      FROM "app"."amenities"
      WHERE "kind" = ${kind}::"app"."AmenityKind"
        AND "geom" IS NOT NULL
        AND ST_DWithin("geom", ${target}, ${maxMeters})
      ORDER BY "geom" <-> ${target}, "name"
      LIMIT ${limit}`
    return AmenityHitRows.parse(rows)
  }

  /**
   * Le plus proche équipement d'un genre pour chaque couple (groupe
   * d'enseigne, drive), dans une distance maximale : de quoi choisir le drive
   * le plus proche de chaque enseigne sans tout lire.
   */
  async nearestAmenityPerBrand(
    point: Point,
    kind: AmenityKind,
    maxMeters: number
  ): Promise<AmenityHit[]> {
    const [longitude, latitude] = point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const rows = await this.prisma.$queryRaw`
      SELECT * FROM (
        SELECT DISTINCT ON ("brand_group", "drive")
               "kind"::text AS "kind", "source", "external_id", "name", "brand", "brand_group",
               "drive"::text AS "drive", "address", "commune", "details", "longitude", "latitude",
               ST_Distance("geom", ${target}) AS "distance_meters"
        FROM "app"."amenities"
        WHERE "kind" = ${kind}::"app"."AmenityKind"
          AND "geom" IS NOT NULL
          AND ST_DWithin("geom", ${target}, ${maxMeters})
        ORDER BY "brand_group", "drive", ST_Distance("geom", ${target}), "name"
      ) nearest
      ORDER BY "distance_meters", "name"`
    return AmenityHitRows.parse(rows)
  }

  /** Les équipements d'un genre en GeoJSON, pour la couche de carte. */
  async amenitiesGeoJson(kind: AmenityKind): Promise<LayerFeatureCollection> {
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "kind", "source", "external_id", "name", "brand", "brand_group",
             "drive"::text AS "drive", "address", "commune", "details", "longitude", "latitude",
             0::float8 AS "distance_meters"
      FROM "app"."amenities"
      WHERE "kind" = ${kind}::"app"."AmenityKind"
      ORDER BY "name", "external_id"`
    return {
      type: 'FeatureCollection',
      features: AmenityHitRows.parse(rows).map(row => ({
        type: 'Feature',
        id: `${row.source}:${row.external_id}`,
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
        properties: {
          kind: row.kind,
          name: row.name,
          brand: row.brand,
          brandGroup: row.brand_group,
          drive: row.drive,
          address: row.address,
          commune: row.commune,
          source: row.source,
          facilityType: row.details.facilityType,
          covered: row.details.covered,
          lengthMeters: row.details.lengthMeters,
          access: row.details.access.length
            ? row.details.access.join(', ')
            : null,
        },
      })),
    }
  }

  /** Nombre d'équipements importés par genre (santé des imports, « non disponible »). */
  async amenityCounts(): Promise<Record<AmenityKind, number>> {
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "mode", COUNT(*)::int AS "count"
      FROM "app"."amenities" GROUP BY "kind"`
    const counts = Object.fromEntries(
      CountByKeyRows.parse(rows).map(row => [row.mode, row.count])
    )
    return {
      athletics_track: counts.athletics_track ?? 0,
      supermarket_drive: counts.supermarket_drive ?? 0,
      fitness_park: counts.fitness_park ?? 0,
    }
  }

  // -------------------------------------------------------------------------
  // Quartiers (lot 11)
  // -------------------------------------------------------------------------

  /**
   * Remplace les contours d'un territoire, dans une transaction : tout le
   * territoire est réécrit (quartiers officiels, IRIS, communes entières),
   * les contours absents de l'import disparaissent. Un import vide ne
   * supprime rien.
   */
  async replaceNeighbourhoods(
    territory: string,
    rows: readonly NeighbourhoodRow[]
  ): Promise<{ written: number; removed: number }> {
    if (rows.length === 0) return { written: 0, removed: 0 }
    return this.prisma.$transaction(
      async tx => {
        const removed = await tx.$executeRaw`
          DELETE FROM "app"."neighbourhoods" WHERE "territory" = ${territory}`
        let written = 0
        for (const row of rows) {
          written += await tx.$executeRaw`
            INSERT INTO "app"."neighbourhoods" ("id", "territory", "kind", "code", "name", "parent", "commune", "insee_code", "source", "geom", "imported_at")
            VALUES (gen_random_uuid()::text, ${territory}, ${row.kind}::"app"."NeighbourhoodKind", ${row.code}, ${row.name}, ${row.parent},
                    ${row.commune}, ${row.inseeCode}, ${row.source},
                    ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geometry)}), 4326)), 3))::geography,
                    now())`
        }
        await this.computeNeighbourhoodMapGeometries(tx, territory)
        return { written, removed }
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
  }

  /**
   * Ce que la carte dessine (`map_geom`) : le contour entier d'un quartier
   * officiel, d'un IRIS ou d'une commune entière ; pour l'IRIS d'une commune
   * qui a des quartiers officiels, la seule part hors de ces quartiers, en
   * morceaux qui gardent au moins `MAP_GAP_MIN_CORE_SQUARE_METERS` une fois
   * rognés de `MAP_GAP_CORE_METERS` sur leur pourtour (les liserés dus aux
   * écarts de tracé entre sources ne sont pas dessinés, ils servent encore au
   * quartier d'un point).
   */
  private async computeNeighbourhoodMapGeometries(
    tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
    territory: string
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "app"."neighbourhoods" n SET "map_geom" = n."geom"
      WHERE n."territory" = ${territory}
        AND (n."kind" <> 'iris' OR n."insee_code" NOT IN (
          SELECT "insee_code" FROM "app"."neighbourhoods"
          WHERE "territory" = ${territory} AND "kind" = 'quartier'))`
    await tx.$executeRaw`
      UPDATE "app"."neighbourhoods" n SET "map_geom" = gaps."geom"
      FROM (
        SELECT parts."id", ST_Multi(ST_Union(parts."part"))::geography AS "geom"
        FROM (
          SELECT i."id",
                 (ST_Dump(ST_CollectionExtract(ST_Difference(i."geom"::geometry, q."geom"), 3))).geom AS "part"
          FROM "app"."neighbourhoods" i
          JOIN (
            SELECT "insee_code", ST_Union("geom"::geometry) AS "geom"
            FROM "app"."neighbourhoods"
            WHERE "territory" = ${territory} AND "kind" = 'quartier'
            GROUP BY "insee_code"
          ) q ON q."insee_code" = i."insee_code"
          WHERE i."territory" = ${territory} AND i."kind" = 'iris'
        ) parts
        WHERE ST_Area(ST_Buffer(parts."part"::geography, -${MAP_GAP_CORE_METERS}::double precision)) >= ${MAP_GAP_MIN_CORE_SQUARE_METERS}
        GROUP BY parts."id"
      ) gaps
      WHERE n."id" = gaps."id"`
  }

  /**
   * Les contours qui contiennent le point (distance 0) ou passent à moins de
   * `toleranceMeters`, du plus proche au plus lointain.
   */
  async neighbourhoodsNear(
    point: Point,
    toleranceMeters: number,
    territory: string
  ): Promise<NeighbourhoodHitRow[]> {
    const [longitude, latitude] = point.coordinates
    const target = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "kind", "code", "name", "parent", "commune", "insee_code", "source",
             CASE WHEN ST_Intersects("geom", ${target}) THEN 0::float8
                  ELSE ST_Distance("geom", ${target}) END AS "distance_meters"
      FROM "app"."neighbourhoods"
      WHERE "territory" = ${territory}
        AND "geom" IS NOT NULL
        AND ST_DWithin("geom", ${target}, ${toleranceMeters})
      ORDER BY "distance_meters" ASC, "name" ASC`
    return NeighbourhoodHitRows.parse(rows)
  }

  /**
   * Les contours d'un territoire en GeoJSON (couche de carte), simplifiés à
   * 5 m environ, dans une emprise si elle est donnée : le découpage retenu,
   * quartiers officiels là où la commune en a, IRIS (ou commune entière)
   * ailleurs ; les IRIS d'une commune à quartiers, gardés pour combler un
   * interstice, ne sont pas dessinés.
   */
  async neighbourhoodsGeoJson(
    territory: string,
    bbox?: readonly [number, number, number, number]
  ): Promise<LayerFeatureCollection> {
    const inBbox = bbox
      ? Prisma.sql`AND ST_Intersects("map_geom", ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)::geography)`
      : Prisma.empty
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "kind", "code", "name", "parent", "commune", "insee_code", "source",
             NOT ST_Equals("map_geom"::geometry, "geom"::geometry) AS "partial",
             ST_AsGeoJSON(ST_SimplifyPreserveTopology("map_geom"::geometry, 0.00005), 6) AS "geometry"
      FROM "app"."neighbourhoods"
      WHERE "territory" = ${territory} AND "map_geom" IS NOT NULL
        ${inBbox}
      ORDER BY "insee_code", "code"`
    return {
      type: 'FeatureCollection',
      features: NeighbourhoodLayerRows.parse(rows).map(row => ({
        type: 'Feature',
        id: row.code,
        geometry: JSON.parse(
          row.geometry
        ) as LayerFeatureCollection['features'][number]['geometry'],
        properties: {
          name: row.name,
          kind: row.kind,
          code: row.code,
          parent: row.parent,
          commune: row.commune,
          inseeCode: row.insee_code,
          source: row.source,
          partial: row.partial,
        },
      })),
    }
  }

  /** Nombre de contours importés pour un territoire, et par nature. */
  async neighbourhoodCounts(
    territory: string
  ): Promise<Record<NeighbourhoodKind, number>> {
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "mode", COUNT(*)::int AS "count"
      FROM "app"."neighbourhoods" WHERE "territory" = ${territory} GROUP BY "kind"`
    const counts = Object.fromEntries(
      CountByKeyRows.parse(rows).map(row => [row.mode, row.count])
    )
    return {
      quartier: counts.quartier ?? 0,
      iris: counts.iris ?? 0,
      commune: counts.commune ?? 0,
    }
  }

  // -------------------------------------------------------------------------
  // Placement des annonces (lot 12)
  // -------------------------------------------------------------------------

  /** Les contours d'une commune, sans géométrie : les candidats du placement au quartier. */
  async neighbourhoodsOfCommune(
    territory: string,
    inseeCode: string
  ): Promise<NeighbourhoodRefRow[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT "kind"::text AS "kind", "code", "name", "parent", "commune", "insee_code", "source"
      FROM "app"."neighbourhoods"
      WHERE "territory" = ${territory} AND "insee_code" = ${inseeCode} AND "geom" IS NOT NULL
      ORDER BY "kind", "code"`
    return NeighbourhoodRefRows.parse(rows)
  }

  /**
   * Surface et point intérieur (`ST_PointOnSurface`, toujours dans le
   * contour, contrairement au centroïde) de zones formées chacune de l'union
   * de contours, et le recouvrement de chaque paire : surface commune /
   * surface de la plus petite.
   */
  async placementAreaFacts(
    territory: string,
    areas: readonly { key: string; codes: readonly string[] }[]
  ): Promise<{ facts: PlacementAreaFact[]; overlaps: PlacementOverlap[] }> {
    const pairs = areas.flatMap(a =>
      a.codes.map(code => ({ key: a.key, code }))
    )
    if (pairs.length === 0) return { facts: [], overlaps: [] }
    const input = JSON.stringify(pairs)
    const zones = Prisma.sql`
      zones AS (
        SELECT i."key", ST_Multi(ST_CollectionExtract(ST_Union(n."geom"::geometry), 3)) AS "g"
        FROM jsonb_to_recordset(${input}::jsonb) AS i("key" text, "code" text)
        JOIN "app"."neighbourhoods" n
          ON n."territory" = ${territory} AND n."code" = i."code" AND n."geom" IS NOT NULL
        GROUP BY i."key"
      )`
    const [facts, overlaps] = await Promise.all([
      this.prisma.$queryRaw`
        WITH ${zones}
        SELECT "key", ST_Area("g"::geography) AS "area_square_meters",
               ST_X(ST_PointOnSurface("g")) AS "longitude", ST_Y(ST_PointOnSurface("g")) AS "latitude"
        FROM zones
        ORDER BY "key"`,
      this.prisma.$queryRaw`
        WITH ${zones}
        SELECT a."key" AS "a", b."key" AS "b",
               COALESCE(ST_Area(ST_Intersection(a."g", b."g")::geography)
                 / NULLIF(LEAST(ST_Area(a."g"::geography), ST_Area(b."g"::geography)), 0), 0) AS "ratio"
        FROM zones a JOIN zones b ON a."key" < b."key"
        ORDER BY 1, 2`,
    ])
    return {
      facts: PlacementAreaFactRows.parse(facts),
      overlaps: PlacementOverlapRows.parse(overlaps),
    }
  }

  /**
   * Le point intérieur d'une commune (union de ses IRIS ou son contour de
   * commune entière), pour une annonce sans repère dont seule la commune est
   * connue, sans géocodeur (rattrapage hors ligne).
   */
  async communeInteriorPoint(
    territory: string,
    inseeCode: string
  ): Promise<Point | null> {
    const rows = await this.prisma.$queryRaw`
      SELECT ST_X(p) AS "longitude", ST_Y(p) AS "latitude"
      FROM (
        SELECT ST_PointOnSurface(ST_Union("geom"::geometry)) AS p
        FROM "app"."neighbourhoods"
        WHERE "territory" = ${territory} AND "insee_code" = ${inseeCode}
          AND "kind" IN ('iris', 'commune') AND "geom" IS NOT NULL
      ) s
      WHERE p IS NOT NULL`
    const row = CoordinateRows.parse(rows)[0]
    return row
      ? { type: 'Point', coordinates: [row.longitude, row.latitude] }
      : null
  }

  /**
   * Remplace les lieux-dits d'une source, dans une transaction ; chacun est
   * rattaché à la commune dont un contour importé (IRIS, quartier ou commune
   * entière) contient son point. Un import vide ne supprime rien.
   */
  async replacePlaces(
    source: string,
    territory: string,
    rows: readonly PlaceRow[],
    options: { batchSize?: number } = {}
  ): Promise<{ written: number; removed: number; withoutCommune: number }> {
    if (rows.length === 0) return { written: 0, removed: 0, withoutCommune: 0 }
    const size = options.batchSize ?? 500
    return this.prisma.$transaction(
      async tx => {
        const removed = await tx.$executeRaw`
          DELETE FROM "app"."places" WHERE "source" = ${source}`
        let written = 0
        for (let i = 0; i < rows.length; i += size) {
          const values = rows.slice(i, i + size).map(
            row => Prisma.sql`(gen_random_uuid()::text, ${source}, ${row.externalId}, ${row.name}, ${row.placeType},
              ${row.latitude}::double precision, ${row.longitude}::double precision,
              ST_SetSRID(ST_MakePoint(${row.longitude}::double precision, ${row.latitude}::double precision), 4326)::geography, now())`
          )
          written += await tx.$executeRaw`
            INSERT INTO "app"."places" ("id", "source", "external_id", "name", "place_type", "latitude", "longitude", "geom", "imported_at")
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("source", "external_id") DO NOTHING`
        }
        await tx.$executeRaw`
          UPDATE "app"."places" p
          SET "insee_code" = n."insee_code", "commune" = n."commune"
          FROM (
            SELECT DISTINCT ON (pl."id") pl."id", nb."insee_code", nb."commune"
            FROM "app"."places" pl
            JOIN "app"."neighbourhoods" nb
              ON nb."territory" = ${territory} AND nb."geom" IS NOT NULL AND ST_Intersects(nb."geom", pl."geom")
            WHERE pl."source" = ${source}
            ORDER BY pl."id", nb."kind"
          ) n
          WHERE p."id" = n."id"`
        const orphan = CountRows.parse(
          await tx.$queryRaw`
            SELECT COUNT(*)::int AS "count" FROM "app"."places"
            WHERE "source" = ${source} AND "insee_code" IS NULL`
        )[0]
        return { written, removed, withoutCommune: orphan?.count ?? 0 }
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
  }

  /** Les lieux-dits d'une commune. */
  async placesOfCommune(inseeCode: string): Promise<PlaceHitRow[]> {
    const rows = await this.prisma.$queryRaw`
      SELECT "source", "external_id", "name", "place_type", "commune", "insee_code", "longitude", "latitude"
      FROM "app"."places"
      WHERE "insee_code" = ${inseeCode}
      ORDER BY "name", "external_id"`
    return PlaceHitRows.parse(rows)
  }

  /** Nombre de lieux-dits importés (santé des imports). */
  async placeCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count" FROM "app"."places"`
    return CountRows.parse(rows)[0]?.count ?? 0
  }

  /**
   * Les contours des annonces de l'espace placées au quartier (carte :
   * contour montré au survol ou à la sélection), simplifiés à 5 m environ.
   */
  async listingAreasGeoJson(
    workspaceId: string
  ): Promise<LayerFeatureCollection> {
    const rows = await this.prisma.$queryRaw`
      SELECT "id", "location_placement"->'area'->>'name' AS "name",
             "location_placement"->'area'->>'level' AS "level",
             ST_AsGeoJSON(ST_SimplifyPreserveTopology("location_area"::geometry, ${LISTING_AREA_SIMPLIFY_DEGREES}::double precision), 6) AS "geometry"
      FROM "app"."listings"
      WHERE "workspace_id" = ${workspaceId}
        AND "location_precision" = 'district'
        AND "location_area" IS NOT NULL
      ORDER BY "id"`
    return {
      type: 'FeatureCollection',
      features: ListingAreaRows.parse(rows).map(row => ({
        type: 'Feature',
        id: row.id,
        geometry: JSON.parse(
          row.geometry
        ) as LayerFeatureCollection['features'][number]['geometry'],
        properties: { listingId: row.id, name: row.name, level: row.level },
      })),
    }
  }

  /**
   * Les zones d'encadrement que recoupe une zone d'annonce (union de
   * contours, ou commune entière), avec au moins `minSquareMeters` en
   * commun (pas les liserés dus aux écarts de tracé), et la surface de la
   * zone hors du zonage. Null si la zone est vide (contours non importés).
   */
  async rentControlZonesInArea(
    area: ListingAreaRef,
    zoningTerritory: string,
    minSquareMeters = 1000
  ): Promise<{ zones: number[]; outsideSquareMeters: number } | null> {
    const rows = await this.prisma.$queryRaw`
      WITH a AS (SELECT ${areaSql(area)} AS "g")
      SELECT
        COALESCE((
          SELECT array_agg(DISTINCT z."zone" ORDER BY z."zone")
          FROM "app"."rent_control_zones" z
          WHERE z."territory" = ${zoningTerritory} AND z."geom" IS NOT NULL
            AND ST_Intersects(z."geom", a."g")
            AND ST_Area(ST_Intersection(z."geom"::geometry, a."g"::geometry)::geography) >= ${minSquareMeters}
        ), ARRAY[]::int[]) AS "zones",
        COALESCE(ST_Area(ST_Difference(a."g"::geometry, (
          SELECT ST_Union(z."geom"::geometry) FROM "app"."rent_control_zones" z
          WHERE z."territory" = ${zoningTerritory} AND ST_Intersects(z."geom", a."g")
        ))::geography), ST_Area(a."g")) AS "outside_square_meters"
      FROM a
      WHERE a."g" IS NOT NULL`
    const row = RentZonesInAreaRows.parse(rows)[0]
    return row
      ? { zones: row.zones, outsideSquareMeters: row.outside_square_meters }
      : null
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
    mode: z.enum(['tram', 'bus', 'boat']),
    longitude: z.number(),
    latitude: z.number(),
    distance_meters: z.number(),
  })
)
export type NearestStop = z.infer<typeof NearestStopRows>[number]

const DistanceRows = z.array(z.object({ distance_meters: z.number() }))

const CountRows = z.array(z.object({ count: z.number() }))
const CountByKeyRows = z.array(
  z.object({ mode: z.string(), count: z.number() })
)
const YearCountRows = z.array(z.object({ year: z.number(), count: z.number() }))

const TransitStopLayerRows = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    line: z.string().nullable(),
    mode: z.string(),
    longitude: z.number(),
    latitude: z.number(),
  })
)

/** Un arrêt à importer. */
export interface TransitStopRow {
  externalId: string
  mode: TransitMode
  name: string
  lines: string[]
  longitude: number
  latitude: number
}

/** Une vente DVF à importer (une mutation, un appartement). */
export interface DvfSaleRow {
  externalId: string
  mutationDate: string
  mutationNature: string
  price: number
  surface: number
  propertyType: string
  rooms: number | null
  address: string | null
  postalCode: string | null
  commune: string | null
  inseeCode: string | null
  latitude: number
  longitude: number
  pricePerM2: number
  source: string
}

export interface DvfRadiusQuery {
  point: Point
  radiusMeters: number
  from: string
  to: string
  surfaceRange: [number, number] | null
  limit?: number
}

const DvfSaleHitRows = z.array(
  z.object({
    id: z.string(),
    mutation_date: z.string(),
    price: z.number(),
    surface: z.number().nullable(),
    price_per_m2: z.number().nullable(),
    rooms: z.number().nullable(),
    address: z.string().nullable(),
    commune: z.string().nullable(),
    longitude: z.number().nullable(),
    latitude: z.number().nullable(),
    distance_meters: z.number(),
  })
)
export type DvfSaleHit = z.infer<typeof DvfSaleHitRows>[number]

/** Un secteur du zonage à importer. */
export interface RentZoneRow {
  zone: number
  label: string
  irisCode: string
  inseeCode: string
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown }
  source: string | null
}

const RentZoneHitRows = z.array(
  z.object({
    zone: z.number(),
    label: z.string(),
    iris_code: z.string(),
    insee_code: z.string(),
    territory: z.string(),
    distance_meters: z.number(),
  })
)
export type RentZoneHit = z.infer<typeof RentZoneHitRows>[number]

const RentZoneLayerRows = z.array(
  z.object({
    iris_code: z.string(),
    zone: z.number(),
    label: z.string(),
    geometry: z.string(),
  })
)

/** Un équipement à importer (un objet de la source). */
export interface AmenityRow {
  externalId: string
  name: string
  brand: string | null
  brandGroup: SupermarketBrandGroup | null
  drive: DriveStatus | null
  address: string | null
  commune: string | null
  inseeCode: string | null
  details: Partial<AmenityDetails>
  longitude: number
  latitude: number
  /** Date de mise à jour dans la source (AAAA-MM-JJ), si connue. */
  sourceUpdatedAt: string | null
}

const AmenityHitRows = z.array(
  z.object({
    kind: AmenityKindSchema,
    source: AmenitySourceSchema,
    external_id: z.string(),
    name: z.string(),
    brand: z.string().nullable(),
    brand_group: SupermarketBrandGroupSchema.nullable(),
    drive: DriveStatusSchema.nullable(),
    address: z.string().nullable(),
    commune: z.string().nullable(),
    details: AmenityDetailsSchema,
    longitude: z.number(),
    latitude: z.number(),
    distance_meters: z.number(),
  })
)
export type AmenityHit = z.infer<typeof AmenityHitRows>[number]

/** Un contour de quartier à importer. */
export interface NeighbourhoodRow {
  kind: NeighbourhoodKind
  code: string
  name: string
  parent: string | null
  commune: string
  inseeCode: string
  source: string
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown }
}

const NeighbourhoodHitRows = z.array(
  z.object({
    kind: NeighbourhoodKindSchema,
    code: z.string(),
    name: z.string(),
    parent: z.string().nullable(),
    commune: z.string(),
    insee_code: z.string(),
    source: z.string(),
    distance_meters: z.number(),
  })
)
export type NeighbourhoodHitRow = z.infer<typeof NeighbourhoodHitRows>[number]

const NeighbourhoodLayerRows = z.array(
  z.object({
    kind: z.string(),
    code: z.string(),
    name: z.string(),
    parent: z.string().nullable(),
    commune: z.string(),
    insee_code: z.string(),
    source: z.string(),
    partial: z.boolean(),
    geometry: z.string(),
  })
)

/**
 * Un morceau d'IRIS hors des quartiers officiels n'est dessiné que s'il garde
 * au moins 1 ha une fois rogné de 25 m : un liseré de moins de 50 m de large
 * (écart de tracé entre deux sources) ne l'est pas.
 */
export const MAP_GAP_CORE_METERS = 25
export const MAP_GAP_MIN_CORE_SQUARE_METERS = 10_000

const PolygonCheckRows = z.array(
  z.object({ valid: z.boolean(), reason: z.string(), area: z.number() })
)

const CriteriaGeoRows = z.array(
  z.object({ id: z.string(), approximate: z.boolean() })
)
export type CriteriaGeoMatch = z.infer<typeof CriteriaGeoRows>[number]

const CriteriaContainingRows = z.array(
  z.object({ criteria_id: z.string(), approximate: z.boolean() })
)
export type CriteriaContaining = z.infer<typeof CriteriaContainingRows>[number]

/** Un critère pas encore enregistré : type de périmètre, géométrie, filtres. */
export interface CriteriaGeoDraft {
  perimeterType: PerimeterType | null
  center: PointRadius | null
  polygon: Polygon | null
  filters: Pick<CriteriaFilters, 'maxTramDistanceMeters'>
}

/**
 * La partie géographique d'un critère, écrite une fois pour les trois
 * usages (liste filtrée, aperçu, alertes) : `c` est le critère (ligne de
 * `search_criteria` ou ligne virtuelle), `l` l'annonce. Sans périmètre, tout
 * passe ; avec, une annonce sans point ne passe pas. La distance au tram se
 * mesure à vol d'oiseau jusqu'à l'arrêt de tram le plus proche.
 */
const CRITERIA_GEO_PREDICATE = Prisma.sql`(
  (
    c."perimeter_type" IS NULL
    OR (c."perimeter_type" = 'point_radius' AND l."geom" IS NOT NULL
        AND ST_DWithin(l."geom", ST_SetSRID(ST_MakePoint(c."center_longitude", c."center_latitude"), 4326)::geography, c."radius_meters"))
    OR (c."perimeter_type" IN ('polygon', 'isochrone') AND l."geom" IS NOT NULL AND c."perimeter" IS NOT NULL
        AND ST_Intersects(l."geom", c."perimeter"))
  )
  AND (
    (c."filters"->>'maxTramDistanceMeters') IS NULL
    OR (l."geom" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "app"."transit_stops" t
      WHERE t."mode" = 'tram' AND t."geom" IS NOT NULL
        AND ST_DWithin(t."geom", l."geom", (c."filters"->>'maxTramDistanceMeters')::double precision)))
  )
)`

/**
 * Une annonce au repère approché (quartier ou commune) n'est incluse que
 * sous réserve, sauf si toute sa zone (contour du quartier retenu, ou de la
 * commune) est dans le périmètre (lot 12) : la distance au tram, elle, part
 * toujours d'un repère approché.
 */
const APPROXIMATE = Prisma.sql`(
  COALESCE(l."location_precision"::text IN ('district', 'commune'), false)
  AND (
    (c."filters"->>'maxTramDistanceMeters') IS NOT NULL
    OR (c."perimeter_type" IS NOT NULL AND NOT COALESCE(
      CASE
        WHEN l."location_area" IS NULL THEN false
        WHEN c."perimeter_type" = 'point_radius' THEN ST_CoveredBy(
          l."location_area"::geometry,
          ST_Buffer(ST_SetSRID(ST_MakePoint(c."center_longitude", c."center_latitude"), 4326)::geography, c."radius_meters")::geometry)
        WHEN c."perimeter" IS NOT NULL THEN ST_CoveredBy(l."location_area"::geometry, c."perimeter"::geometry)
        ELSE false
      END, false))
  )
)`

/** La zone d'une annonce à écrire : l'union de contours importés, ou une commune entière. */
export type ListingAreaRef =
  | { kind: 'codes'; territory: string; codes: readonly string[] }
  | { kind: 'commune'; territory: string; inseeCode: string }

/** Le SQL de la zone : une union de contours de `neighbourhoods`, ou NULL. */
function areaSql(area: ListingAreaRef | null): Prisma.Sql {
  if (!area) return Prisma.sql`NULL`
  const filter =
    area.kind === 'codes'
      ? area.codes.length
        ? Prisma.sql`n."code" IN (${Prisma.join([...area.codes])})`
        : Prisma.sql`false`
      : Prisma.sql`n."insee_code" = ${area.inseeCode} AND n."kind" IN ('iris', 'commune')`
  return Prisma.sql`(
    SELECT ST_Multi(ST_CollectionExtract(ST_Union(n."geom"::geometry), 3))::geography
    FROM "app"."neighbourhoods" n
    WHERE n."territory" = ${area.territory} AND n."geom" IS NOT NULL AND ${filter})`
}

const NeighbourhoodRefRows = z.array(
  z.object({
    kind: NeighbourhoodKindSchema,
    code: z.string(),
    name: z.string(),
    parent: z.string().nullable(),
    commune: z.string(),
    insee_code: z.string(),
    source: z.string(),
  })
)
export type NeighbourhoodRefRow = z.infer<typeof NeighbourhoodRefRows>[number]

const PlacementAreaFactRows = z.array(
  z.object({
    key: z.string(),
    area_square_meters: z.number(),
    longitude: z.number(),
    latitude: z.number(),
  })
)
export type PlacementAreaFact = z.infer<typeof PlacementAreaFactRows>[number]

const PlacementOverlapRows = z.array(
  z.object({ a: z.string(), b: z.string(), ratio: z.number() })
)
export type PlacementOverlap = z.infer<typeof PlacementOverlapRows>[number]

const CoordinateRows = z.array(
  z.object({ longitude: z.number(), latitude: z.number() })
)

/** Un lieu-dit à importer. */
export interface PlaceRow {
  externalId: string
  name: string
  placeType: string
  longitude: number
  latitude: number
}

const PlaceHitRows = z.array(
  z.object({
    source: z.string(),
    external_id: z.string(),
    name: z.string(),
    place_type: z.string(),
    commune: z.string().nullable(),
    insee_code: z.string().nullable(),
    longitude: z.number(),
    latitude: z.number(),
  })
)
export type PlaceHitRow = z.infer<typeof PlaceHitRows>[number]

const ListingAreaRows = z.array(
  z.object({
    id: z.string(),
    name: z.string().nullable(),
    level: z.string().nullable(),
    geometry: z.string(),
  })
)

const RentZonesInAreaRows = z.array(
  z.object({
    zones: z.array(z.number()),
    outside_square_meters: z.number(),
  })
)
