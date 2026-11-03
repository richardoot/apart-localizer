-- Lot 6 : confort.
--  - visites : état (faite, planifiée), points positifs et négatifs, note,
--    auteur, tâche de préparation ; photos dans `visit_photos` (objets du
--    bucket privé de Supabase Storage). La colonne JSON `visits.photos`,
--    jamais écrite par aucun lot (aucune visite n'existait), est supprimée ;
--  - « ce qui a changé » : dernière visite de l'application et point de
--    départ des nouveautés par membre ;
--  - notifications (dans l'application, push, e-mail), préférences par
--    membre, abonnements Web Push ;
--  - brouillons d'annonces reçus par e-mail, à valider.
-- SQL produit par `prisma migrate diff` puis relu ; les suppressions d'index
-- GiST que Prisma propose (colonnes Unsupported qu'il ne connaît pas) sont
-- volontairement écartées. La nouvelle valeur `visit` de TaskOrigin n'est pas
-- utilisée dans cette migration (ALTER TYPE … ADD VALUE en transaction).

-- CreateEnum
CREATE TYPE "app"."VisitStatus" AS ENUM ('planned', 'done');

-- CreateEnum
CREATE TYPE "app"."VisitPhotoStatus" AS ENUM ('pending', 'ready');

-- CreateEnum
CREATE TYPE "app"."NotificationType" AS ENUM ('listing_created', 'status_changed', 'task_assigned', 'criteria_matched', 'offer_response', 'drafts_received');

-- CreateEnum
CREATE TYPE "app"."DeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "app"."DraftStatus" AS ENUM ('pending', 'accepted', 'dismissed');

-- CreateEnum
CREATE TYPE "app"."DraftOrigin" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "app"."DraftExtractor" AS ENUM ('ai', 'parser');

-- AlterEnum
ALTER TYPE "app"."TaskOrigin" ADD VALUE 'visit';

-- DropIndex
DROP INDEX "app"."visits_listing_id_idx";

-- AlterTable
ALTER TABLE "app"."members" ADD COLUMN     "last_visit_at" TIMESTAMPTZ(6),
ADD COLUMN     "notification_preferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "whats_new_since" TIMESTAMPTZ(6),
ADD COLUMN     "whats_new_source" TEXT;

-- AlterTable
ALTER TABLE "app"."visits" DROP COLUMN "photos",
ADD COLUMN     "cons" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "prep_task_id" TEXT,
ADD COLUMN     "pros" TEXT,
ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "app"."VisitStatus" NOT NULL DEFAULT 'done',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "app"."visit_photos" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "app"."VisitPhotoStatus" NOT NULL DEFAULT 'pending',
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "thumbnail_content_type" TEXT NOT NULL,
    "thumbnail_size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),

    CONSTRAINT "visit_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notifications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" "app"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "listing_id" TEXT,
    "activity_id" TEXT,
    "actor_name" TEXT,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "push_status" "app"."DeliveryStatus" NOT NULL DEFAULT 'skipped',
    "email_status" "app"."DeliveryStatus" NOT NULL DEFAULT 'skipped',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."push_subscriptions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."listing_drafts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "origin" "app"."DraftOrigin" NOT NULL DEFAULT 'email',
    "status" "app"."DraftStatus" NOT NULL DEFAULT 'pending',
    "extracted_by" "app"."DraftExtractor" NOT NULL,
    "listing_input" JSONB NOT NULL,
    "duplicates" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "url" TEXT,
    "email_subject" TEXT,
    "email_from" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_id" TEXT,
    "listing_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_photos_storage_path_key" ON "app"."visit_photos"("storage_path");

-- CreateIndex
CREATE UNIQUE INDEX "visit_photos_thumbnail_path_key" ON "app"."visit_photos"("thumbnail_path");

-- CreateIndex
CREATE INDEX "visit_photos_visit_id_idx" ON "app"."visit_photos"("visit_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "app"."notifications"("recipient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_push_status_created_at_idx" ON "app"."notifications"("push_status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_email_status_created_at_idx" ON "app"."notifications"("email_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "app"."push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_member_id_idx" ON "app"."push_subscriptions"("member_id");

-- CreateIndex
CREATE INDEX "listing_drafts_workspace_id_status_created_at_idx" ON "app"."listing_drafts"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "visits_prep_task_id_key" ON "app"."visits"("prep_task_id");

-- CreateIndex
CREATE INDEX "visits_listing_id_visited_at_idx" ON "app"."visits"("listing_id", "visited_at");

-- AddForeignKey
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_prep_task_id_fkey" FOREIGN KEY ("prep_task_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."visit_photos" ADD CONSTRAINT "visit_photos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "app"."visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."visit_photos" ADD CONSTRAINT "visit_photos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."visit_photos" ADD CONSTRAINT "visit_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "app"."activity_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

