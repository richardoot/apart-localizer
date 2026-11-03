-- Lot 3 : offres d'achat (besoin S5). Canal de transmission, date de la
-- réponse du vendeur, auteur, dates de création et de mise à jour.
-- SQL produit par `prisma migrate diff` puis relu ; les suppressions d'index
-- GiST que Prisma propose (colonnes Unsupported qu'il ne connaît pas) sont
-- volontairement écartées.

-- CreateEnum
CREATE TYPE "app"."OfferChannel" AS ENUM ('email', 'phone', 'agency', 'in_person', 'letter', 'other');

-- AlterTable
ALTER TABLE "app"."offers" ADD COLUMN     "channel" "app"."OfferChannel",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "responded_at" TIMESTAMPTZ(6),
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
