-- Lot 17 : questions aux agences (ADR 0027).
--  - `listing_contacts` : le contact de l'annonceur d'une annonce (agence,
--    interlocuteur, e-mail, téléphone, lien de la messagerie du portail,
--    canal préféré), une ligne au plus par annonce, effaçable ;
--  - `agency_requests` : une ligne par demande à l'annonceur (message, tâches
--    posées, validation dans l'application ou la conversation, envoi par
--    Claude ou un membre — jamais par le serveur —, référence du fil,
--    réponses avec valeurs appliquées ou proposées, relance) ;
--  - `tasks.field` (champ de la fiche que la tâche demande),
--    `tasks.requested_at`, `tasks.request_id`, `tasks.answered_at` ;
--  - `workspaces.agency_signature` (signature des messages, null = prénoms) ;
--  - provenance `agency` (valeur donnée par l'annonceur) et notification
--    `agency_answer`.
-- Migration purement additive : colonnes facultatives (NULL), énumérations et
-- tables nouvelles, deux valeurs d'énumération ajoutées (non utilisées dans
-- cette migration : ALTER TYPE … ADD VALUE en transaction). SQL produit par
-- `prisma migrate diff --from-schema … --to-schema … --script` (schéma à
-- schéma, sans base) puis relu. Seul ajout à la main : le rattrapage de
-- `tasks.field` à la fin, par libellé exact (checklist par défaut et champs
-- manquants du lot 2 : `TASK_FIELD_BY_LABEL` dans contracts) ; une tâche au
-- libellé différent garde `field` à NULL.

-- CreateEnum
CREATE TYPE "app"."AgencyChannel" AS ENUM ('email', 'portal_message', 'phone', 'other');

-- CreateEnum
CREATE TYPE "app"."AgencyRequestStatus" AS ENUM ('draft', 'approved', 'sent', 'answered', 'no_answer', 'cancelled');

-- CreateEnum
CREATE TYPE "app"."AgencyApprovalVia" AS ENUM ('app', 'chat');

-- AlterEnum
ALTER TYPE "app"."FieldSource" ADD VALUE 'agency';

-- AlterEnum
ALTER TYPE "app"."NotificationType" ADD VALUE 'agency_answer';

-- AlterTable
ALTER TABLE "app"."workspaces" ADD COLUMN     "agency_signature" TEXT;

-- AlterTable
ALTER TABLE "app"."tasks" ADD COLUMN     "answered_at" TIMESTAMPTZ(6),
ADD COLUMN     "field" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "requested_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "app"."listing_contacts" (
    "listing_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "agency_name" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "portal_message_url" TEXT,
    "preferred_channel" "app"."AgencyChannel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "listing_contacts_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "app"."agency_requests" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "status" "app"."AgencyRequestStatus" NOT NULL DEFAULT 'draft',
    "channel" "app"."AgencyChannel" NOT NULL,
    "recipient_name" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "task_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT,
    "created_via" "app"."ActivityChannel" NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "approved_via" "app"."AgencyApprovalVia",
    "approved_by_id" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "sent_by_id" TEXT,
    "thread_ref" TEXT,
    "answered_at" TIMESTAMPTZ(6),
    "answers" JSONB NOT NULL DEFAULT '[]',
    "closed_at" TIMESTAMPTZ(6),
    "follow_up_of_id" TEXT,

    CONSTRAINT "agency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_contacts_workspace_id_idx" ON "app"."listing_contacts"("workspace_id");

-- CreateIndex
CREATE INDEX "agency_requests_listing_id_created_at_idx" ON "app"."agency_requests"("listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agency_requests_workspace_id_status_idx" ON "app"."agency_requests"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "app"."agency_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_contacts" ADD CONSTRAINT "listing_contacts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_contacts" ADD CONSTRAINT "listing_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_contacts" ADD CONSTRAINT "listing_contacts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."agency_requests" ADD CONSTRAINT "agency_requests_follow_up_of_id_fkey" FOREIGN KEY ("follow_up_of_id") REFERENCES "app"."agency_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rattrapage : le champ des tâches connues, par libellé exact.
UPDATE "app"."tasks" SET "field" = 'annualCharges' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander le montant des charges de copropriété annuelles (budget prévisionnel)';
UPDATE "app"."tasks" SET "field" = 'propertyTax' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander le montant de la taxe foncière';
UPDATE "app"."tasks" SET "field" = 'proceedings' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander les 3 derniers PV d''AG et vérifier les procédures en cours';
UPDATE "app"."tasks" SET "field" = 'addressRaw' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander l''adresse exacte du bien';
UPDATE "app"."tasks" SET "field" = 'surface' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander la surface loi Carrez';
UPDATE "app"."tasks" SET "field" = 'dpeClass' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander le DPE (classe, consommation, date du diagnostic)';
UPDATE "app"."tasks" SET "field" = 'floor' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander l''étage et la présence d''un ascenseur';
UPDATE "app"."tasks" SET "field" = 'constructionYear' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = 'Demander l''année ou l''époque de construction';
