-- Lot 32 (ADR 0047) : les photos de l'annonce sur le portail.
--  - `listings.portal_photos` : tableau JSON des liens https des images,
--    relevés par Claude dans le navigateur de l'utilisateur ou saisis par un
--    membre ; affichées par le navigateur depuis le portail, jamais
--    téléchargées par le serveur. Additive : les fiches existantes n'en ont
--    pas (tableau vide).
-- Les brouillons les portent dans `listing_drafts.listing_input` (JSON
-- validé par ListingInputSchema) : pas de colonne.
-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "portal_photos" JSONB NOT NULL DEFAULT '[]';
