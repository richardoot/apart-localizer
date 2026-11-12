-- Lot 31 : les brouillons au connecteur MCP (ADR 0044).
--  - `listing_drafts.updated_at` : dernière écriture sur le brouillon, pour
--    le garde-fou `expectedUpdatedAt` d'une correction ; vaut la date de
--    réception pour les brouillons existants.
--  - `listing_drafts.merged_into_draft_id` : le brouillon gardé qui a absorbé
--    celui-ci (deux brouillons du même bien fusionnés) ; null pour tous les
--    brouillons existants.
-- Migration additive : deux colonnes, un index, une clé étrangère ; aucune
-- donnée existante modifiée sauf le remplissage de `updated_at`.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu ; le remplissage de `updated_at` est écrit à la main.
-- AlterTable
ALTER TABLE "app"."listing_drafts" ADD COLUMN     "merged_into_draft_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "listing_drafts_merged_into_draft_id_idx" ON "app"."listing_drafts"("merged_into_draft_id");

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_merged_into_draft_id_fkey" FOREIGN KEY ("merged_into_draft_id") REFERENCES "app"."listing_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Les brouillons existants : dernière écriture = réception, ou décision.
UPDATE "app"."listing_drafts" SET "updated_at" = COALESCE("decided_at", "received_at");
