-- Lot 5 : phase 1 et phase 2 avancées.
--  - scénarios « et si » enregistrés (surcharges JSON, pour une annonce ou
--    pour l'espace) ;
--  - annonces de location comparables saisies à la main (loyer de marché).
-- SQL produit par `prisma migrate diff` puis relu ; les suppressions d'index
-- GiST que Prisma propose (colonnes Unsupported qu'il ne connaît pas) sont
-- volontairement écartées. Aucune table ni colonne existante n'est modifiée.

-- CreateTable
CREATE TABLE "app"."scenarios" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "name" TEXT NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."rent_comparables" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "rent" DECIMAL(10,2) NOT NULL,
    "surface" DECIMAL(8,2) NOT NULL,
    "furnished" BOOLEAN NOT NULL DEFAULT false,
    "rooms" INTEGER,
    "observed_at" DATE,
    "source" "app"."ListingSource" NOT NULL DEFAULT 'autre',
    "source_label" TEXT,
    "url" TEXT,
    "address" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rent_comparables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scenarios_workspace_id_idx" ON "app"."scenarios"("workspace_id");

-- CreateIndex
CREATE INDEX "scenarios_listing_id_idx" ON "app"."scenarios"("listing_id");

-- CreateIndex
CREATE INDEX "rent_comparables_listing_id_idx" ON "app"."rent_comparables"("listing_id");

-- AddForeignKey
ALTER TABLE "app"."scenarios" ADD CONSTRAINT "scenarios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."scenarios" ADD CONSTRAINT "scenarios_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."scenarios" ADD CONSTRAINT "scenarios_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rent_comparables" ADD CONSTRAINT "rent_comparables_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rent_comparables" ADD CONSTRAINT "rent_comparables_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Données : les comparables saisis dans l'ancienne liste JSON de la phase 2
-- (`rental_plans.comparables`, plus lue depuis ce lot) sont recopiés quand
-- ils ont un loyer et une surface ; la colonne JSON est gardée telle quelle.
INSERT INTO "app"."rent_comparables" ("id", "listing_id", "rent", "surface", "furnished", "url", "note", "updated_at")
SELECT
    gen_random_uuid()::text,
    rp."listing_id",
    (c->>'rent')::numeric,
    (c->>'surface')::numeric,
    rp."lease_type" <> 'unfurnished',
    c->>'url',
    c->>'note',
    CURRENT_TIMESTAMP
FROM "app"."rental_plans" rp
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(rp."comparables") = 'array' THEN rp."comparables" ELSE '[]'::jsonb END
) AS c
WHERE jsonb_typeof(c->'rent') = 'number'
  AND jsonb_typeof(c->'surface') = 'number'
  AND (c->>'rent')::numeric > 0
  AND (c->>'surface')::numeric > 0;
