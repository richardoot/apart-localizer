-- Lot 15 : suivi des mises à jour des annonces (ADR 0025).
--  - `listings.last_checked_at` : dernière vérification sur le portail, quel
--    qu'en soit le résultat ; `listings.last_seen_online_at` : dernière fois
--    que l'annonce a été vue en ligne ;
--  - `listings.republished_from_id` : l'annonce plus ancienne dont celle-ci
--    est la republication (même bien), unique (une annonce n'est reprise que
--    par une), `ON DELETE SET NULL` ;
--  - `listing_checks` : une ligne par vérification (date, auteur, canal,
--    résultat, écarts appliqués, proposés ou notés, résumé, extrait-preuve
--    court, URL consultée, annonce liée, statut proposé jamais appliqué) ;
--  - notification `listing_checked`.
-- Migration purement additive : colonnes facultatives (NULL pour les annonces
-- existantes, « jamais vérifiées »), une énumération et une table nouvelles,
-- une valeur d'énumération ajoutée ; aucune colonne existante modifiée, aucune
-- donnée réécrite. SQL produit par `prisma migrate diff --from-schema …
-- --to-schema … --script` (schéma à schéma, sans base) puis relu. La nouvelle
-- valeur `listing_checked` n'est pas utilisée dans cette migration (ALTER
-- TYPE … ADD VALUE en transaction).

-- CreateEnum
CREATE TYPE "app"."ListingCheckOutcome" AS ENUM ('unchanged', 'changed', 'offline', 'republished', 'inaccessible');

-- AlterEnum
ALTER TYPE "app"."NotificationType" ADD VALUE 'listing_checked';

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "last_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_seen_online_at" TIMESTAMPTZ(6),
ADD COLUMN     "republished_from_id" TEXT;

-- CreateTable
CREATE TABLE "app"."listing_checks" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_id" TEXT,
    "channel" "app"."ActivityChannel" NOT NULL,
    "outcome" "app"."ListingCheckOutcome" NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "evidence" TEXT,
    "checked_url" TEXT,
    "linked_listing_id" TEXT,
    "suggested_status" "app"."ListingStatus",

    CONSTRAINT "listing_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_checks_listing_id_checked_at_idx" ON "app"."listing_checks"("listing_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "listing_checks_workspace_id_checked_at_idx" ON "app"."listing_checks"("workspace_id", "checked_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "listings_republished_from_id_key" ON "app"."listings"("republished_from_id");

-- AddForeignKey
ALTER TABLE "app"."listings" ADD CONSTRAINT "listings_republished_from_id_fkey" FOREIGN KEY ("republished_from_id") REFERENCES "app"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_checks" ADD CONSTRAINT "listing_checks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_checks" ADD CONSTRAINT "listing_checks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_checks" ADD CONSTRAINT "listing_checks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_checks" ADD CONSTRAINT "listing_checks_linked_listing_id_fkey" FOREIGN KEY ("linked_listing_id") REFERENCES "app"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
