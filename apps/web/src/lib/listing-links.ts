/**
 * Lot 18 : la lecture, côté interface, d'un refus de l'API sur un lien.
 * L'API refuse (409) une URL déjà sur une autre fiche, ou une création qui a
 * la même agence et la même référence qu'une annonce suivie ; son message
 * nomme l'autre annonce (« « T3 … » [id …] »). L'interface en tire de quoi
 * proposer « Ouvrir » ou « C'est la même : ajouter ce lien », et un texte
 * sans l'identifiant ni les noms d'outils du connecteur. Aucune règle ici :
 * la décision est celle du serveur (`domain`).
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** L'autre annonce nommée par un refus, si le message en nomme une. */
export interface ConflictListing {
  id: string
  title: string
  /** Vrai : l'URL est déjà sur cette fiche (jamais « créer quand même »). */
  sameLink: boolean
}

export function conflictListingOf(
  message: string | null | undefined
): ConflictListing | null {
  if (!message) return null
  const match = new RegExp(`« (.+?) » \\[id (${UUID})\\]`, 'i').exec(message)
  if (!match?.[1] || !match[2]) return null
  return {
    id: match[2],
    title: match[1],
    sameLink: /lien est déjà/i.test(message),
  }
}

/** Le message d'un refus, sans identifiant ni noms d'outils du connecteur. */
export function conflictText(message: string): string {
  return (
    message
      .replace(new RegExp(` \\[id ${UUID}\\]`, 'gi'), '')
      .replace(/ \(add_listing_link[^)]*\)/g, '')
      .replace(/ \(ignoreDuplicates\)/g, '')
      // Lot 27 : « (merge_listings, ou « Fusionner avec une autre fiche ») ».
      .replace(/merge_listings, ou /g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}
