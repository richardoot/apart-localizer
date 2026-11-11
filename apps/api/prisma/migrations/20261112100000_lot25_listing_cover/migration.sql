-- Lot 25 : la fiche répond d'abord (ADR 0035).
--  - `listings.cover_photo_id` : la photo de couverture choisie par un membre,
--    une photo de visite de l'annonce ; null (toutes les annonces existantes)
--    = la première photo prête de la première visite, calculée à la lecture.
--    Une photo supprimée remet la couverture à null (ON DELETE SET NULL).
-- Migration strictement additive : une colonne facultative et sa clé
-- étrangère ; aucune donnée existante modifiée ni supprimée.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu.

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "cover_photo_id" TEXT;

-- AddForeignKey
ALTER TABLE "app"."listings" ADD CONSTRAINT "listings_cover_photo_id_fkey" FOREIGN KEY ("cover_photo_id") REFERENCES "app"."visit_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
