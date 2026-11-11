-- Lot 27 : fusionner les doublons, plusieurs agences pour un même bien (ADR 0037).
--  - `listings.merged_into_id` et `merged_at` : la fiche qui a absorbé
--    celle-ci (doublon fusionné) ; null pour toutes les annonces existantes.
--    Une fiche fusionnée est écartée et cachée des listes, jamais supprimée.
--  - `listing_sellers` : les autres agences qui vendent le même bien, chacune
--    avec sa référence et sa clé de comparaison ; l'agence principale reste
--    dans `listings.seller_*`. Aucune ligne pour les annonces existantes.
--  - `listing_merges` : une ligne par fusion (fiche gardée, fiche absorbée,
--    canal, résumé, ce qui est passé de l'une à l'autre pour l'annuler).
-- Migration strictement additive : deux colonnes facultatives, deux tables,
-- une énumération ; aucune donnée existante modifiée ni supprimée.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu.
-- CreateEnum
CREATE TYPE "app"."ListingSellerOrigin" AS ENUM ('manual', 'claude', 'link', 'merge');

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "merged_at" TIMESTAMPTZ(6),
ADD COLUMN     "merged_into_id" TEXT;

-- CreateTable
CREATE TABLE "app"."listing_sellers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "seller_type" "app"."SellerType" NOT NULL DEFAULT 'unknown',
    "seller_name" TEXT,
    "seller_reference" TEXT,
    "seller_reference_key" TEXT,
    "origin" "app"."ListingSellerOrigin" NOT NULL,
    "added_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."listing_merges" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kept_id" TEXT NOT NULL,
    "absorbed_id" TEXT NOT NULL,
    "merged_by_id" TEXT,
    "channel" "app"."ActivityChannel" NOT NULL,
    "merged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "moved" JSONB NOT NULL DEFAULT '{}',
    "undone_at" TIMESTAMPTZ(6),
    "undone_by_id" TEXT,

    CONSTRAINT "listing_merges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_sellers_listing_id_created_at_idx" ON "app"."listing_sellers"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_sellers_workspace_id_seller_reference_key_idx" ON "app"."listing_sellers"("workspace_id", "seller_reference_key");

-- CreateIndex
CREATE INDEX "listing_merges_kept_id_merged_at_idx" ON "app"."listing_merges"("kept_id", "merged_at");

-- CreateIndex
CREATE INDEX "listing_merges_absorbed_id_idx" ON "app"."listing_merges"("absorbed_id");

-- CreateIndex
CREATE INDEX "listings_merged_into_id_idx" ON "app"."listings"("merged_into_id");

-- AddForeignKey
ALTER TABLE "app"."listings" ADD CONSTRAINT "listings_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "app"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_sellers" ADD CONSTRAINT "listing_sellers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_sellers" ADD CONSTRAINT "listing_sellers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_sellers" ADD CONSTRAINT "listing_sellers_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_merges" ADD CONSTRAINT "listing_merges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_merges" ADD CONSTRAINT "listing_merges_kept_id_fkey" FOREIGN KEY ("kept_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_merges" ADD CONSTRAINT "listing_merges_absorbed_id_fkey" FOREIGN KEY ("absorbed_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_merges" ADD CONSTRAINT "listing_merges_merged_by_id_fkey" FOREIGN KEY ("merged_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_merges" ADD CONSTRAINT "listing_merges_undone_by_id_fkey" FOREIGN KEY ("undone_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
