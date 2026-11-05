-- Lot 11 : équipements et quartiers (ADR 0021).
--  - `amenities` : équipements de proximité importés (pistes d'athlétisme du
--    recensement des équipements sportifs, supermarchés avec drive et salles
--    Fitness Park d'OpenStreetMap), un point par objet, clé d'import
--    (genre, source, identifiant), attributs propres au genre en JSON ;
--  - `neighbourhoods` : contours des quartiers de Bordeaux Métropole
--    (quartiers officiels, IRIS à défaut, commune entière), MultiPolygon,
--    provenance par contour, clé d'import (territoire, code), et la part du
--    contour que la carte dessine (`map_geom`).
-- Migration purement additive : deux tables et trois types nouveaux, aucune
-- table existante modifiée, aucune donnée réécrite. SQL produit par
-- `prisma migrate diff --from-schema … --to-schema … --script` (schéma à
-- schéma, sans base) puis relu ; aucune suppression d'index GiST n'est
-- proposée dans ce mode. Les index GiST des trois nouvelles géométries, que
-- Prisma ne connaît pas (colonnes Unsupported), sont ajoutés à la main.

-- CreateEnum
CREATE TYPE "app"."AmenityKind" AS ENUM ('athletics_track', 'supermarket_drive', 'fitness_park');

-- CreateEnum
CREATE TYPE "app"."DriveStatus" AS ENUM ('yes', 'to_verify');

-- CreateEnum
CREATE TYPE "app"."NeighbourhoodKind" AS ENUM ('quartier', 'iris', 'commune');

-- CreateTable
CREATE TABLE "app"."amenities" (
    "id" TEXT NOT NULL,
    "kind" "app"."AmenityKind" NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "brand_group" TEXT,
    "drive" "app"."DriveStatus",
    "address" TEXT,
    "commune" TEXT,
    "insee_code" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geography(Point, 4326),
    "source_updated_at" DATE,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."neighbourhoods" (
    "id" TEXT NOT NULL,
    "territory" TEXT NOT NULL,
    "kind" "app"."NeighbourhoodKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT,
    "commune" TEXT NOT NULL,
    "insee_code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "geom" geography(MultiPolygon, 4326),
    "map_geom" geography(MultiPolygon, 4326),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighbourhoods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amenities_kind_brand_group_idx" ON "app"."amenities"("kind", "brand_group");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_kind_source_external_id_key" ON "app"."amenities"("kind", "source", "external_id");

-- CreateIndex
CREATE INDEX "neighbourhoods_territory_insee_code_idx" ON "app"."neighbourhoods"("territory", "insee_code");

-- CreateIndex
CREATE UNIQUE INDEX "neighbourhoods_territory_code_key" ON "app"."neighbourhoods"("territory", "code");

-- Index GiST des nouvelles colonnes géographiques (plus proche équipement,
-- quartier qui contient un point, couches de carte par emprise).
CREATE INDEX "amenities_geom_idx" ON "app"."amenities" USING GIST ("geom");
CREATE INDEX "neighbourhoods_geom_idx" ON "app"."neighbourhoods" USING GIST ("geom");
CREATE INDEX "neighbourhoods_map_geom_idx" ON "app"."neighbourhoods" USING GIST ("map_geom");
