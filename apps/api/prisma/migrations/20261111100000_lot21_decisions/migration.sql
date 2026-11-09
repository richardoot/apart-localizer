-- Lot 21 : suivre ses annonces, étape par étape (ADR 0031).
--  - `decision_proposals` : une proposition (garder ou écarter un brouillon,
--    passer une annonce À visiter, écarter une annonce), son auteur, le choix,
--    la raison, l'état (ouverte, à trancher, appliquée, retirée, caduque),
--    le statut de départ de l'annonce, la session de tri facultative ;
--  - `decision_responses` : la réponse de chaque membre (d'accord, ou non
--    avec son choix à la place), une au plus par proposition et par membre ;
--  - `workspaces.decide_together` (« Décider à plusieurs », vrai par défaut) ;
--  - valeurs d'énumération `decision_proposed` et `decision_resolved`
--    (notifications), non utilisées dans cette migration (ALTER TYPE … ADD
--    VALUE en transaction).
-- Migration strictement additive : une colonne à valeur par défaut, trois
-- énumérations et deux tables nouvelles ; aucune donnée existante modifiée ni
-- supprimée, aucune annonce ne change d'étape (l'étape se déduit du statut).
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu. Seuls ajouts à la main, à la fin : la contrainte « une cible et
-- une seule » et les deux index uniques partiels « au plus une proposition
-- ouverte par annonce ou par brouillon ». Prisma ne décrit ni les contraintes
-- CHECK ni les index partiels : ils n'apparaissent pas dans le schéma et ne
-- créent pas de dérive.

-- CreateEnum
CREATE TYPE "app"."DecisionState" AS ENUM ('open', 'to_settle', 'applied', 'withdrawn', 'stale');

-- CreateEnum
CREATE TYPE "app"."DecisionChoice" AS ENUM ('keep', 'to_visit', 'discard');

-- CreateEnum
CREATE TYPE "app"."DecisionResolution" AS ENUM ('agreed', 'settled', 'without_waiting');

-- AlterEnum
ALTER TYPE "app"."NotificationType" ADD VALUE 'decision_proposed';
ALTER TYPE "app"."NotificationType" ADD VALUE 'decision_resolved';

-- AlterTable
ALTER TABLE "app"."workspaces" ADD COLUMN     "decide_together" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "app"."decision_proposals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "draft_id" TEXT,
    "author_id" TEXT,
    "choice" "app"."DecisionChoice" NOT NULL,
    "reason" TEXT,
    "state" "app"."DecisionState" NOT NULL DEFAULT 'open',
    "from_status" "app"."ListingStatus",
    "session_id" TEXT,
    "channel" "app"."ActivityChannel" NOT NULL DEFAULT 'web',
    "notified_at" TIMESTAMPTZ(6),
    "resolution" "app"."DecisionResolution",
    "applied_choice" "app"."DecisionChoice",
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."decision_responses" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "agrees" BOOLEAN NOT NULL,
    "choice" "app"."DecisionChoice",
    "reason" TEXT,
    "session_id" TEXT,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_proposals_workspace_id_state_idx" ON "app"."decision_proposals"("workspace_id", "state");

-- CreateIndex
CREATE INDEX "decision_proposals_listing_id_idx" ON "app"."decision_proposals"("listing_id");

-- CreateIndex
CREATE INDEX "decision_proposals_draft_id_idx" ON "app"."decision_proposals"("draft_id");

-- CreateIndex
CREATE INDEX "decision_proposals_author_id_session_id_idx" ON "app"."decision_proposals"("author_id", "session_id");

-- CreateIndex
CREATE INDEX "decision_responses_member_id_session_id_idx" ON "app"."decision_responses"("member_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_responses_proposal_id_member_id_key" ON "app"."decision_responses"("proposal_id", "member_id");

-- AddForeignKey
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "app"."listing_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_responses" ADD CONSTRAINT "decision_responses_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "app"."decision_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decision_responses" ADD CONSTRAINT "decision_responses_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ajouté à la main : une proposition vise soit une annonce, soit un brouillon.
ALTER TABLE "app"."decision_proposals" ADD CONSTRAINT "decision_proposals_one_target" CHECK (("listing_id" IS NULL) <> ("draft_id" IS NULL));

-- Ajouté à la main : au plus une proposition ouverte (ou à trancher) par cible.
CREATE UNIQUE INDEX "decision_proposals_open_listing_key" ON "app"."decision_proposals"("listing_id") WHERE "state" IN ('open', 'to_settle') AND "listing_id" IS NOT NULL;
CREATE UNIQUE INDEX "decision_proposals_open_draft_key" ON "app"."decision_proposals"("draft_id") WHERE "state" IN ('open', 'to_settle') AND "draft_id" IS NOT NULL;
