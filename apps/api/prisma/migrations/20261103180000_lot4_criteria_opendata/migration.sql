-- Lot 4 : critères géographiques et données ouvertes.
--  - alertes : table criteria_matches (une annonce entrée dans un critère) ;
--  - arrêts TBM : mode (tram, bus, bateau), clé d'import (réseau, identifiant) ;
--  - DVF : identifiant de mutation (upsert idempotent), nature, commune ;
--  - encadrement des loyers : secteurs du zonage (MultiPolygon, index GiST) ;
--  - annonces : numéro de DPE, instantané des enrichissements open data.
-- SQL produit par `prisma migrate diff` puis relu ; les suppressions d'index
-- GiST que Prisma propose (colonnes Unsupported qu'il ne connaît pas) sont
-- volontairement écartées, et l'index GiST de la nouvelle géométrie ajouté.

-- CreateEnum
CREATE TYPE "app"."TransitMode" AS ENUM ('tram', 'bus', 'boat');

-- AlterTable
ALTER TABLE "app"."dvf_sales" ADD COLUMN     "commune" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mutation_nature" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "dpe_number" TEXT,
ADD COLUMN     "open_data_context" JSONB;

-- AlterTable
ALTER TABLE "app"."transit_stops" ADD COLUMN     "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mode" "app"."TransitMode" NOT NULL DEFAULT 'bus';

-- CreateTable
CREATE TABLE "app"."criteria_matches" (
    "criteria_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "matched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approximate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "criteria_matches_pkey" PRIMARY KEY ("criteria_id","listing_id")
);

-- CreateTable
CREATE TABLE "app"."rent_control_zones" (
    "id" TEXT NOT NULL,
    "territory" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "iris_code" TEXT NOT NULL,
    "insee_code" TEXT NOT NULL,
    "geom" geography(MultiPolygon, 4326),
    "source" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_control_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "criteria_matches_listing_id_idx" ON "app"."criteria_matches"("listing_id");

-- CreateIndex
CREATE INDEX "rent_control_zones_territory_zone_idx" ON "app"."rent_control_zones"("territory", "zone");

-- CreateIndex
CREATE UNIQUE INDEX "rent_control_zones_territory_iris_code_key" ON "app"."rent_control_zones"("territory", "iris_code");

-- CreateIndex
CREATE UNIQUE INDEX "dvf_sales_external_id_key" ON "app"."dvf_sales"("external_id");

-- CreateIndex
CREATE INDEX "dvf_sales_mutation_date_idx" ON "app"."dvf_sales"("mutation_date");

-- CreateIndex
CREATE INDEX "transit_stops_mode_idx" ON "app"."transit_stops"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "transit_stops_network_external_id_key" ON "app"."transit_stops"("network", "external_id");

-- AddForeignKey
ALTER TABLE "app"."criteria_matches" ADD CONSTRAINT "criteria_matches_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "app"."search_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."criteria_matches" ADD CONSTRAINT "criteria_matches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index GiST de la nouvelle colonne géographique (zone d'une adresse).
CREATE INDEX "rent_control_zones_geom_idx" ON "app"."rent_control_zones" USING GIST ("geom");
