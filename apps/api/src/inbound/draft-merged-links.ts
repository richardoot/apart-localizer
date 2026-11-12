import { DraftMergedLinkSchema } from '@apart/contracts'
import type { DraftMergedLink } from '@apart/contracts'
import { z } from 'zod'

/**
 * Lot 31 (ADR 0045) : les liens des brouillons absorbés, lus sur le
 * brouillon gardé (`listing_drafts.merged_links`) ; illisibles : aucun. Sans
 * dépendance de service : l'exploration et les alertes s'en servent aussi.
 */
export function mergedLinksOf(row: {
  mergedLinks: unknown
}): DraftMergedLink[] {
  return z.array(DraftMergedLinkSchema).catch([]).parse(row.mergedLinks)
}
