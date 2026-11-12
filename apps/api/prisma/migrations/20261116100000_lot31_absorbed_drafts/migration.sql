-- Lot 31, suite (ADR 0045) : un brouillon absorbé par une fusion de
-- brouillons est caché des listes, puis supprimé sept jours après.
--  - `listing_drafts.merged_at` : date de la fusion (le délai d'annulation).
--  - `listing_drafts.merged_links` : sur le brouillon gardé, les liens des
--    brouillons absorbés (lien, portail, faits lus, vendeur, ancienne raison
--    d'écart), pour qu'ils survivent à la suppression des absorbés : ajoutés
--    à l'annonce créée, reconnus par l'exploration et les alertes.
-- Rempli pour les fusions déjà faites : `merged_at` = date de la décision ;
-- les liens des absorbés recopiés sur le gardé, avec la raison d'écart que
-- le journal avait gardée (la fusion l'avait remplacée).
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu ; le remplissage est écrit à la main.
-- AlterTable
ALTER TABLE "app"."listing_drafts" ADD COLUMN     "merged_at" TIMESTAMPTZ(6),
ADD COLUMN     "merged_links" JSONB NOT NULL DEFAULT '[]';


-- Les fusions déjà faites.
UPDATE "app"."listing_drafts"
SET "merged_at" = COALESCE("decided_at", "updated_at")
WHERE "merged_into_draft_id" IS NOT NULL;

UPDATE "app"."listing_drafts" AS k
SET "merged_links" = sub.links
FROM (
  SELECT a."merged_into_draft_id" AS kept_id,
         jsonb_agg(
           jsonb_build_object(
             'draftId', a."id",
             'url', a."url",
             'portal', a."portal",
             'origin', a."origin",
             'title', a."listing_input"->>'title',
             'price', COALESCE((a."listing_input"->>'price')::numeric, 0),
             'sellerType', COALESCE(a."listing_input"->>'sellerType', 'unknown'),
             'sellerName', a."listing_input"->>'sellerName',
             'sellerReference', a."listing_input"->>'sellerReference',
             'observed', '{}'::jsonb,
             'reason', (
               SELECT l."after"->>'reason'
               FROM "app"."activity_logs" l
               WHERE l."action" = 'draft.dismissed'
                 AND l."after"->>'draftId' = a."id"
               ORDER BY l."created_at" DESC
               LIMIT 1
             ),
             'mergedAt', to_char(a."merged_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           )
           ORDER BY a."merged_at"
         ) AS links
  FROM "app"."listing_drafts" a
  WHERE a."merged_into_draft_id" IS NOT NULL AND a."url" IS NOT NULL
  GROUP BY a."merged_into_draft_id"
) AS sub
WHERE k."id" = sub.kept_id;
