-- Lot 30 : doublons confirmés dans l'application, fiche absorbée supprimée
-- après sept jours (ADR 0043).
--  - `duplicate_pairs` : une paire de fiches qui sont peut-être le même bien.
--    `pending` : Claude a créé la fiche malgré un doublon probable et
--    l'application pose la question au membre ; `distinct` : un membre a dit
--    que ce sont deux biens différents, la paire n'est plus signalée.
--    `listing_a_id` < `listing_b_id` : une seule ligne par paire.
--  - Aucune colonne ajoutée à une table existante : la suppression des fiches
--    absorbées depuis plus de sept jours passe par les clés étrangères
--    existantes (`ON DELETE CASCADE`).
-- Migration strictement additive : une table, une énumération ; aucune
-- donnée existante modifiée ni supprimée.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema … --script`
-- puis relu ; la contrainte CHECK est écrite à la main.
-- CreateEnum
CREATE TYPE "app"."DuplicatePairVerdict" AS ENUM ('pending', 'distinct');

-- CreateTable
CREATE TABLE "app"."duplicate_pairs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_a_id" TEXT NOT NULL,
    "listing_b_id" TEXT NOT NULL,
    "verdict" "app"."DuplicatePairVerdict" NOT NULL,
    "asked_by_id" TEXT,
    "asked_channel" "app"."ActivityChannel" NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duplicate_pairs_listing_b_id_idx" ON "app"."duplicate_pairs"("listing_b_id");

-- CreateIndex
CREATE INDEX "duplicate_pairs_workspace_id_verdict_idx" ON "app"."duplicate_pairs"("workspace_id", "verdict");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_pairs_listing_a_id_listing_b_id_key" ON "app"."duplicate_pairs"("listing_a_id", "listing_b_id");

-- AddForeignKey
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_listing_a_id_fkey" FOREIGN KEY ("listing_a_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_listing_b_id_fkey" FOREIGN KEY ("listing_b_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_asked_by_id_fkey" FOREIGN KEY ("asked_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Une seule ligne par paire, dans l'ordre des identifiants.
ALTER TABLE "app"."duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_ordered_check" CHECK ("listing_a_id" COLLATE "C" < "listing_b_id" COLLATE "C");
