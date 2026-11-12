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
 * Lot 31 (ADR 0045) : de même, les brouillons absorbés par une fusion de
 * brouillons ; leur lien, leurs faits lus et leur raison d'écart sont déjà
 * sur le brouillon gardé (`merged_links`).
 *
 * Appelée à chaque création d'annonce, à chaque fusion de fiches et à chaque
 * fusion de brouillons de l'espace, sans tâche planifiée : ce qui est absorbé
 * est déjà caché partout, le supprimer un peu plus tard ne change rien de
 * visible. Une fiche fusionnée dans une fiche elle-même absorbée l'a été avant
 * elle : elle part au même moment ou avant. Rend le nombre de fiches et de
 * brouillons supprimés.
 */
export async function purgeExpiredMerges(
  db: Client,
  workspaceId: string,
  now: Date = new Date()
): Promise<number> {
  const before = mergePurgeBefore(now)
  const listings = await db.listing.deleteMany({
    where: {
      workspaceId,
      mergedIntoId: { not: null },
      mergedAt: { lt: before },
    },
  })
  const drafts = await db.listingDraft.deleteMany({
    where: {
      workspaceId,
      mergedIntoDraftId: { not: null },
      mergedAt: { lt: before },
    },
  })
  return listings.count + drafts.count
}
