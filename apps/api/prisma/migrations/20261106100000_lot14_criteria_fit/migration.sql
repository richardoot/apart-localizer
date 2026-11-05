-- Lot 14 : adéquation des annonces aux critères (ADR 0024).
--  - `search_criteria.tolerance` : la marge de tolérance du critère (JSON
--    validé par CriteriaToleranceSchema ; un champ absent prend la valeur par
--    défaut, DEFAULT_CRITERIA_TOLERANCE) ;
--  - `criteria_matches` devient l'adéquation par (critère actif, annonce) :
--    niveau (dans les critères, à confirmer, à la marge, hors critères),
--    raisons chiffrées, détail filtre par filtre, date du dernier changement
--    de niveau ; une ligne « hors critères » n'est pas une entrée (alerte,
--    badge) ;
--  - `listings.criteria_fit_level` : le meilleur niveau parmi les critères
--    actifs, pour filtrer vite, avec la date et la cause de son dernier
--    changement (« depuis » de l'onglet « Hors critères »).
-- Migration purement additive : une énumération, des colonnes facultatives
-- ou avec valeur par défaut, deux index ; aucune colonne existante modifiée,
-- aucune donnée réécrite. Les lignes de `criteria_matches` existantes
-- (entrées d'avant le lot 14) prennent le niveau « in » ; les annonces
-- restent sans niveau (null = jamais comparée, lue « dans les critères »)
-- jusqu'au rattrapage `pnpm refresh:criteria-fit`. SQL écrit à la forme de
-- `prisma migrate diff` (schéma à schéma) et relu.

-- CreateEnum
CREATE TYPE "app"."CriteriaFitLevel" AS ENUM ('in', 'to_confirm', 'margin', 'out');

-- AlterTable
ALTER TABLE "app"."criteria_matches" ADD COLUMN     "checks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "level" "app"."CriteriaFitLevel" NOT NULL DEFAULT 'in',
ADD COLUMN     "level_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reasons" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "criteria_fit_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "criteria_fit_level" "app"."CriteriaFitLevel",
ADD COLUMN     "criteria_fit_origin" JSONB;

-- AlterTable
ALTER TABLE "app"."search_criteria" ADD COLUMN     "tolerance" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "criteria_matches_criteria_id_level_idx" ON "app"."criteria_matches"("criteria_id", "level");

-- CreateIndex
CREATE INDEX "listings_workspace_id_criteria_fit_level_idx" ON "app"."listings"("workspace_id", "criteria_fit_level");
