-- Lot 12 : placement des annonces (ADR 0022).
--  - `listings.location_placement` : comment le repère a été placé (méthode,
--    quartier retenu, texte reconnu, réserves), JSON validé par
--    ListingPlacementSchema ;
--  - `listings.location_area` : la zone où le bien se trouve d'après
--    l'annonce (contour du quartier retenu, ou de la commune) quand le repère
--    est approché, écrite par le module geo ; elle sert aux réserves (zone
--    d'encadrement, critères à périmètre) et au contour affiché sur la carte ;
--  - `places` : lieux-dits OpenStreetMap (place=neighbourhood, quarter,
--    suburb), un point par objet, repli du placement au quartier.
-- Migration purement additive : deux colonnes facultatives (NULL pour les
-- annonces existantes, rattrapées par `pnpm relocate:listings`) et une table
-- nouvelle ; aucune colonne existante modifiée, aucune donnée réécrite. SQL
-- produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- (schéma à schéma, sans base) puis relu ; l'index GiST du point des
-- lieux-dits, que Prisma ne connaît pas (colonne Unsupported), est ajouté à
-- la main. `location_area` n'a pas d'index : elle n'est lue que pour les
-- annonces d'un espace, déjà filtrées.

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "location_area" geography(MultiPolygon, 4326),
ADD COLUMN     "location_placement" JSONB;

-- CreateTable
CREATE TABLE "app"."places" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "place_type" TEXT NOT NULL,
    "commune" TEXT,
    "insee_code" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geography(Point, 4326),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "places_insee_code_idx" ON "app"."places"("insee_code");

-- CreateIndex
CREATE UNIQUE INDEX "places_source_external_id_key" ON "app"."places"("source", "external_id");

-- Index GiST du point des lieux-dits.
CREATE INDEX "places_geom_idx" ON "app"."places" USING GIST ("geom");
