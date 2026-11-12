import { mergePurgeBefore } from '@apart/domain'
import type { Prisma, PrismaClient } from '../generated/prisma'

type Client = PrismaClient | Prisma.TransactionClient

/**
 * Lot 30 (ADR 0043) : supprime les fiches absorbées par une fusion vieille de
 * plus de `MERGED_LISTING_RETENTION_DAYS` jours et jamais annulée. Ce qui
 * était passé à la fiche gardée (liens, visites et photos, offres, avis,
 * tâches, agences) y reste ; ce qui était resté sur la fiche absorbée (son
 * historique des prix, son journal, ses avis et tâches non repris) part avec
 * elle, par les clés étrangères (`ON DELETE CASCADE`), comme la ligne de la
 * fusion : le journal de la fiche gardée garde la phrase de la fusion.
 *
 * Appelée à chaque création d'annonce et à chaque fusion de l'espace, sans
 * tâche planifiée : une fiche absorbée est cachée partout, la supprimer un peu
 * plus tard ne change rien de visible. Une fiche fusionnée dans une fiche
 * elle-même absorbée l'a été avant elle : elle part au même moment ou avant.
 * Rend le nombre de fiches supprimées.
 */
export async function purgeExpiredMerges(
  db: Client,
  workspaceId: string,
  now: Date = new Date()
): Promise<number> {
  const deleted = await db.listing.deleteMany({
    where: {
      workspaceId,
      mergedIntoId: { not: null },
      mergedAt: { lt: mergePurgeBefore(now) },
    },
  })
  return deleted.count
}
