import type { ActivityChange } from '@apart/contracts'

/**
 * Le journal du lot 27 (ADR 0037) : deux fiches fusionnées (une ligne sur la
 * fiche gardée, une sur la fiche absorbée), une fusion annulée, une autre
 * agence ajoutée ou retirée. Les faits de la fiche gardée que la fusion a
 * changés (le prix, quand le plus bas en ligne change) sont dans `facts`,
 * avant et après. Pur.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: unknown, key: string): string | null {
  return isRecord(record) && typeof record[key] === 'string'
    ? (record[key] as string)
    : null
}

const quoted = (value: string | null): string =>
  value ? `« ${value} »` : 'une autre fiche'

/** Les actions du journal propres aux fusions et aux agences. */
export const MERGE_ACTIONS = [
  'listing.merged',
  'listing.absorbed',
  'listing.unmerged',
  'listing.unabsorbed',
  'listing.seller_added',
  'listing.seller_removed',
] as const

/**
 * La phrase et le détail d'une ligne de fusion ou d'agence, ou null pour une
 * autre action. `changes` décrit l'avant et l'après d'un sous-objet.
 */
export function describeMergeActivity(
  action: string,
  before: unknown,
  after: unknown,
  changes: (before: unknown, after: unknown) => ActivityChange[]
): { summary: string; changes: ActivityChange[] } | null {
  const facts = (record: unknown) => (isRecord(record) ? record.facts : null)
  switch (action) {
    case 'listing.merged': {
      // Le résumé commence par « Fusionnée avec « B » » : la phrase le dit déjà.
      const summary = text(after, 'summary') ?? ''
      const rest = summary.replace(/^Fusionnée avec « .+? »\s*/u, '').trim()
      const tail = !rest ? '' : rest.startsWith(':') ? ` ${rest}` : ` ${rest}`
      return {
        summary: `a fusionné dans cette fiche son doublon ${quoted(text(after, 'absorbedTitle'))}${tail}`,
        changes: changes(facts(before), facts(after)),
      }
    }
    case 'listing.absorbed':
      return {
        summary: `a fusionné cette fiche dans ${quoted(text(after, 'keptTitle'))} (doublon) : elle n’est plus suivie`,
        changes: [],
      }
    case 'listing.unmerged':
      return {
        summary: `a annulé la fusion avec ${quoted(text(after, 'absorbedTitle'))} : ce qui en venait y est retourné`,
        changes: changes(facts(before), facts(after)),
      }
    case 'listing.unabsorbed':
      return {
        summary: `a annulé la fusion dans ${quoted(text(after, 'keptTitle'))} : la fiche est de nouveau suivie`,
        changes: [],
      }
    case 'listing.seller_added':
      return {
        summary: `a ajouté une autre agence qui vend le même bien : ${text(after, 'seller') ?? 'agence'}`,
        changes: [],
      }
    case 'listing.seller_removed':
      return {
        summary: `a retiré une agence de la fiche : ${text(before, 'seller') ?? 'agence'}`,
        changes: [],
      }
    default:
      return null
  }
}
