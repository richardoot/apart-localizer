-- Lot 8 : invitations par e-mail, rôles, retrait (ADR 0018).
--  - `members.status` : actif, invité, invitation annulée, refusée, retiré.
--    Les lignes existantes prennent `active` (valeur par défaut constante :
--    PostgreSQL l'ajoute sans réécrire la table) ; leurs rôles ne changent
--    pas (Richard `owner`, Chloé `member`) ;
--  - invitation : envoi, auteur, échéance, annulation ou refus ;
--  - arrivée (`joined_at`) et retrait (`removed_at`, auteur) : la ligne d'un
--    membre retiré reste, son historique garde son nom ;
--  - notification `member_joined` pour les propriétaires.
-- Migration purement additive : aucune colonne supprimée, aucune donnée
-- réécrite, toutes les nouvelles colonnes acceptent NULL sauf `status`.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema …` (schéma
-- à schéma, sans base) puis relu ; aucune suppression d'index GiST n'est
-- proposée dans ce mode, rien n'est donc écarté. La nouvelle valeur
-- `member_joined` n'est pas utilisée dans cette migration (ALTER TYPE … ADD
-- VALUE en transaction).

-- CreateEnum
CREATE TYPE "app"."MemberStatus" AS ENUM ('active', 'invited', 'canceled', 'declined', 'removed');

-- AlterEnum
ALTER TYPE "app"."NotificationType" ADD VALUE 'member_joined';

-- AlterTable
ALTER TABLE "app"."members" ADD COLUMN     "invitation_closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "invitation_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "invited_at" TIMESTAMPTZ(6),
ADD COLUMN     "invited_by_id" TEXT,
ADD COLUMN     "joined_at" TIMESTAMPTZ(6),
ADD COLUMN     "removed_at" TIMESTAMPTZ(6),
ADD COLUMN     "removed_by_id" TEXT,
ADD COLUMN     "status" "app"."MemberStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "members_workspace_id_status_idx" ON "app"."members"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "app"."members" ADD CONSTRAINT "members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."members" ADD CONSTRAINT "members_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
