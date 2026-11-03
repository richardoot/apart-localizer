-- Migration initiale d'apart-localizer.
--
-- PostGIS d'abord : les colonnes `geography` des tables ci-dessous en
-- dépendent. `IF NOT EXISTS` laisse en place une extension déjà activée par
-- Supabase (schéma `extensions`, présent dans le search_path des rôles).
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."MemberRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "app"."ListingSource" AS ENUM ('seloger', 'leboncoin', 'pap', 'bienici', 'agence', 'autre');

-- CreateEnum
CREATE TYPE "app"."ListingStatus" AS ENUM ('to_study', 'to_visit', 'visited', 'offer_made', 'offer_accepted', 'offer_refused', 'discarded', 'sold_or_withdrawn');

-- CreateEnum
CREATE TYPE "app"."DpeClass" AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G');

-- CreateEnum
CREATE TYPE "app"."FieldSource" AS ENUM ('listing', 'user', 'ai', 'open_data', 'estimated');

-- CreateEnum
CREATE TYPE "app"."LocationPrecision" AS ENUM ('exact', 'street', 'district', 'commune');

-- CreateEnum
CREATE TYPE "app"."FeesPayer" AS ENUM ('buyer', 'seller');

-- CreateEnum
CREATE TYPE "app"."LeaseType" AS ENUM ('unfurnished', 'furnished', 'shared');

-- CreateEnum
CREATE TYPE "app"."RentControl" AS ENUM ('auto', 'yes', 'no');

-- CreateEnum
CREATE TYPE "app"."RenovationLevel" AS ENUM ('refresh', 'renovation', 'heavy', 'energy');

-- CreateEnum
CREATE TYPE "app"."RentalDemand" AS ENUM ('strong', 'medium', 'weak');

-- CreateEnum
CREATE TYPE "app"."TriState" AS ENUM ('yes', 'no', 'unknown');

-- CreateEnum
CREATE TYPE "app"."TaskOrigin" AS ENUM ('default', 'manual', 'missing_field');

-- CreateEnum
CREATE TYPE "app"."OfferResponse" AS ENUM ('pending', 'accepted', 'refused', 'counter_offer');

-- CreateEnum
CREATE TYPE "app"."ActivityChannel" AS ENUM ('web', 'mcp', 'import', 'system');

-- CreateEnum
CREATE TYPE "app"."PerimeterType" AS ENUM ('point_radius', 'polygon', 'isochrone');

-- CreateTable
CREATE TABLE "app"."workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "auth_user_id" TEXT,
    "role" "app"."MemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."assumptions_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "label" TEXT,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "values" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assumptions_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."listings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source" "app"."ListingSource" NOT NULL DEFAULT 'autre',
    "source_label" TEXT,
    "url" TEXT,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "source_updated_at" TIMESTAMPTZ(6),
    "description" TEXT,
    "notes" TEXT,
    "source_text" TEXT,
    "address_raw" TEXT,
    "address_normalized" TEXT,
    "ban_id" TEXT,
    "commune" TEXT,
    "insee_code" TEXT,
    "district" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geography(Point, 4326),
    "location_precision" "app"."LocationPrecision",
    "location_geojson" JSONB,
    "price" DECIMAL(12,2) NOT NULL,
    "fees_amount" DECIMAL(12,2),
    "fees_percent" DOUBLE PRECISION,
    "fees_payer" "app"."FeesPayer",
    "surface" DECIMAL(8,2),
    "surface_total" DECIMAL(8,2),
    "rooms" INTEGER,
    "bedrooms" INTEGER,
    "floor" INTEGER,
    "floors_total" INTEGER,
    "floor_label" TEXT,
    "elevator" BOOLEAN,
    "construction_year" INTEGER,
    "construction_period" TEXT,
    "dpe_class" "app"."DpeClass",
    "dpe_consumption" DOUBLE PRECISION,
    "ges_class" "app"."DpeClass",
    "dpe_date" DATE,
    "heating_type" TEXT,
    "heating_collective" BOOLEAN,
    "outdoor" TEXT,
    "parking" TEXT,
    "cellar" BOOLEAN,
    "orientation" TEXT,
    "condition" TEXT,
    "annual_charges" DECIMAL(12,2),
    "non_recoverable_charges_monthly" DECIMAL(10,2),
    "lots_count" INTEGER,
    "proceedings" TEXT,
    "voted_works" TEXT,
    "syndic" TEXT,
    "property_tax" DECIMAL(12,2),
    "furniture_value" DECIMAL(12,2),
    "field_sources" JSONB NOT NULL DEFAULT '{}',
    "status" "app"."ListingStatus" NOT NULL DEFAULT 'to_study',
    "discard_reason" TEXT,
    "discarded_at" TIMESTAMPTZ(6),
    "assumptions_override" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."listing_views" (
    "listing_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("listing_id","member_id")
);

-- CreateTable
CREATE TABLE "app"."renovations" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "level" "app"."RenovationLevel",
    "duration_months" INTEGER,
    "notes" TEXT,

    CONSTRAINT "renovations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."renovation_items" (
    "id" TEXT NOT NULL,
    "renovation_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "renovation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."rental_plans" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "year" INTEGER,
    "lease_type" "app"."LeaseType" NOT NULL DEFAULT 'unfurnished',
    "rent_control" "app"."RentControl" NOT NULL DEFAULT 'auto',
    "reference_rent_per_m2" DECIMAL(8,2),
    "target_rent" DECIMAL(10,2),
    "market_rent" DECIMAL(10,2),
    "comparables" JSONB NOT NULL DEFAULT '[]',
    "demand" "app"."RentalDemand",
    "co_ownership_allows_rental" "app"."TriState" NOT NULL DEFAULT 'unknown',
    "decency_compliant" "app"."TriState" NOT NULL DEFAULT 'unknown',
    "rental_permit_required" "app"."TriState" NOT NULL DEFAULT 'unknown',
    "notes" TEXT,

    CONSTRAINT "rental_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."opinions" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opinions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tasks" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(6),
    "assignee_id" TEXT,
    "origin" "app"."TaskOrigin" NOT NULL DEFAULT 'manual',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."price_events" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "old_price" DECIMAL(12,2),
    "new_price" DECIMAL(12,2) NOT NULL,
    "source" "app"."FieldSource" NOT NULL DEFAULT 'user',

    CONSTRAINT "price_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."offers" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "made_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "response" "app"."OfferResponse" NOT NULL DEFAULT 'pending',
    "counter_amount" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."visits" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "visited_at" TIMESTAMPTZ(6) NOT NULL,
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "report" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."activity_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "actor_member_id" TEXT,
    "channel" "app"."ActivityChannel" NOT NULL DEFAULT 'web',
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."search_criteria" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "perimeter_type" "app"."PerimeterType",
    "center_latitude" DOUBLE PRECISION,
    "center_longitude" DOUBLE PRECISION,
    "radius_meters" INTEGER,
    "perimeter" geography(Polygon, 4326),
    "perimeter_geojson" JSONB,
    "isochrone_params" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transit_stops" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "line" TEXT,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geography(Point, 4326),

    CONSTRAINT "transit_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."dvf_sales" (
    "id" TEXT NOT NULL,
    "mutation_date" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "surface" DECIMAL(8,2),
    "property_type" TEXT NOT NULL,
    "rooms" INTEGER,
    "address" TEXT,
    "insee_code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geography(Point, 4326),
    "price_per_m2" DECIMAL(10,2),

    CONSTRAINT "dvf_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."reference_data" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valid_from" DATE,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_auth_user_id_key" ON "app"."members"("auth_user_id");

-- CreateIndex
CREATE INDEX "members_workspace_id_idx" ON "app"."members"("workspace_id");

-- CreateIndex
CREATE INDEX "members_email_idx" ON "app"."members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "members_workspace_id_handle_key" ON "app"."members"("workspace_id", "handle");

-- CreateIndex
CREATE INDEX "assumptions_versions_workspace_id_effective_from_idx" ON "app"."assumptions_versions"("workspace_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "listings_workspace_id_status_idx" ON "app"."listings"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "listings_workspace_id_commune_idx" ON "app"."listings"("workspace_id", "commune");

-- CreateIndex
CREATE INDEX "listings_workspace_id_url_idx" ON "app"."listings"("workspace_id", "url");

-- CreateIndex
CREATE INDEX "listing_views_member_id_idx" ON "app"."listing_views"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "renovations_listing_id_key" ON "app"."renovations"("listing_id");

-- CreateIndex
CREATE INDEX "renovation_items_renovation_id_idx" ON "app"."renovation_items"("renovation_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_plans_listing_id_key" ON "app"."rental_plans"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "opinions_listing_id_member_id_key" ON "app"."opinions"("listing_id", "member_id");

-- CreateIndex
CREATE INDEX "tasks_listing_id_idx" ON "app"."tasks"("listing_id");

-- CreateIndex
CREATE INDEX "price_events_listing_id_occurred_at_idx" ON "app"."price_events"("listing_id", "occurred_at");

-- CreateIndex
CREATE INDEX "offers_listing_id_idx" ON "app"."offers"("listing_id");

-- CreateIndex
CREATE INDEX "visits_listing_id_idx" ON "app"."visits"("listing_id");

-- CreateIndex
CREATE INDEX "activity_logs_workspace_id_created_at_idx" ON "app"."activity_logs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_listing_id_created_at_idx" ON "app"."activity_logs"("listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "search_criteria_workspace_id_idx" ON "app"."search_criteria"("workspace_id");

-- CreateIndex
CREATE INDEX "transit_stops_network_line_idx" ON "app"."transit_stops"("network", "line");

-- CreateIndex
CREATE INDEX "dvf_sales_insee_code_mutation_date_idx" ON "app"."dvf_sales"("insee_code", "mutation_date");

-- CreateIndex
CREATE UNIQUE INDEX "reference_data_kind_key_key" ON "app"."reference_data"("kind", "key");

-- AddForeignKey
ALTER TABLE "app"."members" ADD CONSTRAINT "members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."assumptions_versions" ADD CONSTRAINT "assumptions_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listings" ADD CONSTRAINT "listings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listings" ADD CONSTRAINT "listings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_views" ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_views" ADD CONSTRAINT "listing_views_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."renovations" ADD CONSTRAINT "renovations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."renovation_items" ADD CONSTRAINT "renovation_items_renovation_id_fkey" FOREIGN KEY ("renovation_id") REFERENCES "app"."renovations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rental_plans" ADD CONSTRAINT "rental_plans_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."opinions" ADD CONSTRAINT "opinions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."opinions" ADD CONSTRAINT "opinions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_events" ADD CONSTRAINT "price_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."activity_logs" ADD CONSTRAINT "activity_logs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."activity_logs" ADD CONSTRAINT "activity_logs_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."search_criteria" ADD CONSTRAINT "search_criteria_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."search_criteria" ADD CONSTRAINT "search_criteria_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Index GiST sur les colonnes géographiques (rayon, périmètre, plus proche
-- arrêt, comparables DVF). Prisma ignore les colonnes Unsupported : ces index
-- vivent ici et dans le module geo, nulle part ailleurs.
CREATE INDEX "listings_geom_idx" ON "app"."listings" USING GIST ("geom");
CREATE INDEX "search_criteria_perimeter_idx" ON "app"."search_criteria" USING GIST ("perimeter");
CREATE INDEX "transit_stops_geom_idx" ON "app"."transit_stops" USING GIST ("geom");
CREATE INDEX "dvf_sales_geom_idx" ON "app"."dvf_sales" USING GIST ("geom");
