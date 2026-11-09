-- Lot 20 : nos avis, critère par critère (ADR 0030).
--  - `opinion_criteria` : les critères des avis de l'espace (clé stable unique
--    par espace, libellé, aide, ordre, masqué, défaut ou ajouté). Aucune ligne
--    écrite ici : un espace sans ligne a les huit critères par défaut
--    (`DEFAULT_OPINION_CRITERIA` dans contracts, lus par `domain`) ; ses lignes
--    s'écrivent au premier réglage d'un propriétaire, défauts compris ;
--  - `opinion_scores` : la note d'un critère dans un avis (1 à 5, contrainte
--    ci-dessous ; null = « — » avec un mot seulement), le mot facultatif, une
--    ligne au plus par avis et par critère ;
--  - `opinion_reveals` : les « Voir quand même » (avis à l'aveugle), une ligne
--    par annonce et par membre, avec les avis visibles à ce moment ;
--  - `opinions.rated_at` (première note) et `opinions.seen_member_ids` (avis
--    vus avant de noter : « après avoir vu celui de … ») ;
--  - `workspaces.opinions_blind` (avis à l'aveugle, vrai par défaut) ;
--  - `tasks.details` (contexte d'une tâche proposée depuis « Nos avis ») ;
--  - valeurs d'énumération `opinion` (origine d'une tâche) et `opinion_added`
--    (notification), non utilisées dans cette migration (ALTER TYPE … ADD
--    VALUE en transaction).
-- Migration purement additive : colonnes facultatives ou à valeur par défaut,
-- une énumération et trois tables nouvelles ; aucune donnée existante
-- modifiée ni supprimée (les avis existants gardent leur note sur 5 et leur
-- texte, sans note par critère). SQL produit par `prisma migrate diff
-- --from-schema … --to-schema … --script` (schéma à schéma) puis relu. Seul
-- ajout à la main : la contrainte de bornes de `opinion_scores.score`, à la
-- fin.

-- CreateEnum
CREATE TYPE "app"."OpinionCriterionOrigin" AS ENUM ('default', 'custom');

-- AlterEnum
ALTER TYPE "app"."TaskOrigin" ADD VALUE 'opinion';

-- AlterEnum
ALTER TYPE "app"."NotificationType" ADD VALUE 'opinion_added';

-- AlterTable
ALTER TABLE "app"."workspaces" ADD COLUMN     "opinions_blind" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "app"."opinions" ADD COLUMN     "rated_at" TIMESTAMPTZ(6),
ADD COLUMN     "seen_member_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "app"."tasks" ADD COLUMN     "details" TEXT;

-- CreateTable
CREATE TABLE "app"."opinion_criteria" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "origin" "app"."OpinionCriterionOrigin" NOT NULL DEFAULT 'custom',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opinion_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."opinion_scores" (
    "id" TEXT NOT NULL,
    "opinion_id" TEXT NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "score" INTEGER,
    "word" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opinion_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."opinion_reveals" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "revealed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "member_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "opinion_reveals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opinion_criteria_workspace_id_key_key" ON "app"."opinion_criteria"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "opinion_scores_criterion_key_idx" ON "app"."opinion_scores"("criterion_key");

-- CreateIndex
CREATE UNIQUE INDEX "opinion_scores_opinion_id_criterion_key_key" ON "app"."opinion_scores"("opinion_id", "criterion_key");

-- CreateIndex
CREATE UNIQUE INDEX "opinion_reveals_listing_id_member_id_key" ON "app"."opinion_reveals"("listing_id", "member_id");

-- AddForeignKey
ALTER TABLE "app"."opinion_criteria" ADD CONSTRAINT "opinion_criteria_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."opinion_scores" ADD CONSTRAINT "opinion_scores_opinion_id_fkey" FOREIGN KEY ("opinion_id") REFERENCES "app"."opinions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."opinion_reveals" ADD CONSTRAINT "opinion_reveals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."opinion_reveals" ADD CONSTRAINT "opinion_reveals_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ajouté à la main : une note de critère vaut de 1 à 5, jamais 0 (« — » =
-- null ou pas de ligne). Prisma ne décrit pas les contraintes CHECK : elle
-- n'apparaît pas dans le schéma et ne crée pas de dérive.
ALTER TABLE "app"."opinion_scores" ADD CONSTRAINT "opinion_scores_score_range" CHECK ("score" IS NULL OR ("score" >= 1 AND "score" <= 5));
