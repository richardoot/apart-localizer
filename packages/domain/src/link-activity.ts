import { LISTING_PORTAL_LABELS, ListingPortalSchema } from '@apart/contracts'
import type { ActivityChange } from '@apart/contracts'

/**
 * Le journal des liens d'une annonce (lot 18, ADR 0028) : ajout (par un
 * membre, par Claude, rattaché d'office par une exploration ou une alerte
 * e-mail), modification, retrait par un membre, détachement d'un lien
 * rattaché d'office (« Ce n'est pas la même »). Les faits de la fiche que
 * l'écriture a changés (le prix, quand le plus bas en ligne change) sont
 * dans `facts`, avant et après. Pur.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: unknown, key: string): string | null {
  return isRecord(record) && typeof record[key] === 'string'
    ? (record[key] as string)
    : null
}

/** « SeLoger », « Site d’agence » ; « de l’annonce » si le portail est illisible. */
export function linkPortalName(record: unknown): string {
  const parsed = ListingPortalSchema.safeParse(
    isRecord(record) ? record.portal : undefined
  )
  return parsed.success ? LISTING_PORTAL_LABELS[parsed.data] : 'de l’annonce'
}

/**
 * « sur SeLoger », « sur le site de l’agence », « sur le portail » (autre
 * site, ou portail illisible) : où une page a été lue.
 */
export function portalWhere(portal: unknown): string {
  const parsed = ListingPortalSchema.safeParse(portal)
  if (!parsed.success || parsed.data === 'autre') return 'sur le portail'
  if (parsed.data === 'agence') return 'sur le site de l’agence'
  return `sur ${LISTING_PORTAL_LABELS[parsed.data]}`
}

/** Les actions du journal propres aux liens. */
export const LINK_ACTIONS = [
  'listing_link.added',
  'listing_link.updated',
  'listing_link.removed',
  'listing_link.detached',
] as const

/**
 * La phrase et le détail d'une ligne `listing_link.*`, ou null pour une
 * autre action. `changes` décrit l'avant et l'après d'un sous-objet.
 */
export function describeLinkActivity(
  action: string,
  before: unknown,
  after: unknown,
  changes: (before: unknown, after: unknown) => ActivityChange[]
): { summary: string; changes: ActivityChange[] } | null {
  const facts = (record: unknown) => (isRecord(record) ? record.facts : null)
  switch (action) {
    case 'listing_link.added': {
      const portal = linkPortalName(after)
      const origin = text(after, 'origin')
      const auto = isRecord(after) && after.auto === true
      const summary = text(after, 'summary')
      const head = auto
        ? origin === 'email'
          ? `a rattaché d'office le lien ${portal} d'une alerte e-mail (même agence, même référence)`
          : `a rattaché d'office le lien ${portal} (même agence, même référence)`
        : origin === 'share'
          ? `a ajouté le lien ${portal} (partagé depuis le téléphone)`
          : origin === 'exploration' || origin === 'email'
            ? `a reconnu la même annonce et ajouté le lien ${portal}`
            : `a ajouté le lien ${portal}`
      // Le résumé de la vérification commence par « Lien SeLoger ajouté » :
      // la phrase le dit déjà.
      const rest = (summary ?? '').replace(/^Lien .+? ajouté\s*/u, '').trim()
      const tail = !rest
        ? ''
        : rest.startsWith(':')
          ? ` ${rest}`
          : rest.startsWith('(')
            ? ` ${rest}`
            : ` : ${rest.replace(/^·\s*/u, '')}`
      return {
        summary: `${head}${tail}`,
        changes: changes(facts(before), facts(after)),
      }
    }
    case 'listing_link.updated':
      return {
        summary: `a modifié le lien ${linkPortalName(after)}`,
        changes: changes(
          isRecord(before) ? before.link : null,
          isRecord(after) ? after.link : null
        ),
      }
    case 'listing_link.removed':
      return {
        summary: `a retiré le lien ${linkPortalName(before)}`,
        changes: changes(facts(before), facts(after)),
      }
    case 'listing_link.detached':
      return {
        summary: `a détaché le lien ${linkPortalName(before)} rattaché d'office (« Ce n'est pas la même ») : l'annonce revient « À valider »`,
        changes: changes(facts(before), facts(after)),
      }
    default:
      return null
  }
}
