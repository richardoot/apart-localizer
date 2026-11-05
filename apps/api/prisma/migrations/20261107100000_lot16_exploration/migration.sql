-- Lot 16 : exploration par les critères (ADR 0026).
--  - `explorations` : une exploration des portails par Claude, dans le
--    navigateur de l'utilisateur (espace, membre pour qui Claude a exploré,
--    canal, début et fin, critères explorés, bilan par portail, compteurs,
--    résumé) ; `run_key` unique par espace rend l'enregistrement idempotent ;
--  - `exploration_candidates` : une ligne du compte rendu par annonce lue
--    (lien et lien normalisé, portail, titre, prix, surface, pièces, commune,
--    quartier, résultat du tri, raisons, niveau d'adéquation, annonce et
--    brouillon liés, extrait court masqué) ; une annonce hors critères
--    n'existe qu'ici ;
--  - `listing_drafts` : origine `exploration`, état `merged` (reconnu comme
--    une annonce suivie), lecteur `claude`, exploration, portail, extrait,
--    raison de l'écart,
--    « c'en est une autre » (`distinct_at`), vérification enregistrée sur
--    l'annonce suivie (`merged_check_id`), placement du repère lu ;
--  - `search_criteria.portals` : les portails cochés (null = tous).
-- Migration purement additive : deux énumérations et deux tables nouvelles,
-- trois valeurs d'énumération ajoutées, des colonnes facultatives ; aucune
-- colonne existante modifiée, aucune donnée réécrite. SQL écrit à la forme
-- de `prisma migrate diff` (schéma à schéma) et relu ; les nouvelles valeurs
-- d'énumération ne sont pas utilisées dans cette migration (ALTER TYPE …
-- ADD VALUE en transaction).

-- AlterEnum
ALTER TYPE "app"."DraftOrigin" ADD VALUE 'exploration';

-- AlterEnum
ALTER TYPE "app"."DraftStatus" ADD VALUE 'merged';

-- AlterEnum
ALTER TYPE "app"."DraftExtractor" ADD VALUE 'claude';

-- CreateEnum
CREATE TYPE "app"."ExplorationPortal" AS ENUM ('leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo', 'other');

-- CreateEnum
CREATE TYPE "app"."ExplorationOutcome" AS ENUM ('new', 'duplicate_probable', 'known', 'dismissed', 'out');

-- AlterTable
ALTER TABLE "app"."listing_drafts" ADD COLUMN     "dismiss_reason" TEXT,
ADD COLUMN     "distinct_at" TIMESTAMPTZ(6),
ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "exploration_id" TEXT,
ADD COLUMN     "location_placement" JSONB,
ADD COLUMN     "merged_check_id" TEXT,
ADD COLUMN     "portal" "app"."ExplorationPortal";

-- AlterTable
ALTER TABLE "app"."search_criteria" ADD COLUMN     "portals" JSONB;

-- CreateTable
CREATE TABLE "app"."explorations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "author_id" TEXT,
    "channel" "app"."ActivityChannel" NOT NULL DEFAULT 'mcp',
    "run_key" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6) NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "portals" JSONB NOT NULL DEFAULT '[]',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL,
    "out_digest" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."exploration_candidates" (
    "id" TEXT NOT NULL,
    "exploration_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "normalized_url" TEXT,
    "portal" "app"."ExplorationPortal" NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "surface" DECIMAL(8,2),
    "rooms" INTEGER,
    "commune" TEXT,
    "district" TEXT,
    "outcome" "app"."ExplorationOutcome" NOT NULL,
    "why" TEXT NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "level" "app"."CriteriaFitLevel",
    "listing_id" TEXT,
    "draft_id" TEXT,
    "excerpt" TEXT,

    CONSTRAINT "exploration_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_drafts_workspace_id_url_idx" ON "app"."listing_drafts"("workspace_id", "url");

-- CreateIndex
CREATE INDEX "explorations_workspace_id_finished_at_idx" ON "app"."explorations"("workspace_id", "finished_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "explorations_workspace_id_run_key_key" ON "app"."explorations"("workspace_id", "run_key");

-- CreateIndex
CREATE INDEX "exploration_candidates_exploration_id_position_idx" ON "app"."exploration_candidates"("exploration_id", "position");

-- CreateIndex
CREATE INDEX "exploration_candidates_normalized_url_idx" ON "app"."exploration_candidates"("normalized_url");

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_exploration_id_fkey" FOREIGN KEY ("exploration_id") REFERENCES "app"."explorations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_merged_check_id_fkey" FOREIGN KEY ("merged_check_id") REFERENCES "app"."listing_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."explorations" ADD CONSTRAINT "explorations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."explorations" ADD CONSTRAINT "explorations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exploration_candidates" ADD CONSTRAINT "exploration_candidates_exploration_id_fkey" FOREIGN KEY ("exploration_id") REFERENCES "app"."explorations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exploration_candidates" ADD CONSTRAINT "exploration_candidates_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exploration_candidates" ADD CONSTRAINT "exploration_candidates_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "app"."listing_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
