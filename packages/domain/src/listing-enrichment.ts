/**
 * Ce qu'une écriture sur une annonce doit recalculer dans ses données
 * ouvertes (instantané, plafond d'encadrement, DPE vérifié). Une seule règle
 * pour toutes les écritures : la fiche, le connecteur, une réponse d'agence,
 * une vérification sur le portail, un lien rattaché, une fusion. Le repère
 * (adresse, commune, quartier) se décide à part, au géocodage. Pur.
 */

/**
 * Les champs dont un changement relance l'instantané : le plafond
 * d'encadrement (pièces, surface, époque de construction, phase 2), le marché
 * (surface) et la recherche du DPE (surface, étage).
 */
export const ENRICHMENT_FIELDS = [
  'surface',
  'rooms',
  'constructionYear',
  'constructionPeriod',
  'rentalPlan',
  'floor',
  'dpeClass',
] as const

/**
 * Les champs dont un changement relance aussi la recherche du DPE à l'ADEME :
 * la surface et l'étage départagent les candidats, la classe déclarée décide
 * si le meilleur candidat est cohérent.
 */
export const DPE_SEARCH_FIELDS = ['surface', 'floor', 'dpeClass'] as const

export interface EnrichmentNeeds {
  /** Recalculer l'instantané des données ouvertes et le plafond. */
  enrich: boolean
  /** Relancer aussi la recherche du DPE. */
  dpe: boolean
}

/**
 * Les recalculs qu'appellent les champs changés (`changed` : les clés dont la
 * valeur a changé) et, à part, un repère ou une adresse changés, qui
 * relancent tout.
 */
export function enrichmentNeeds(
  changed: Iterable<string>,
  options: { locationChanged?: boolean } = {}
): EnrichmentNeeds {
  const keys = new Set(changed)
  if (options.locationChanged) return { enrich: true, dpe: true }
  const dpe = DPE_SEARCH_FIELDS.some(key => keys.has(key))
  const enrich = dpe || ENRICHMENT_FIELDS.some(key => keys.has(key))
  return { enrich, dpe }
}

/**
 * Les clés d'une mise à jour dont la valeur change vraiment par rapport à la
 * fiche (comparaison par valeur ; une clé absente de la fiche compte comme
 * vide).
 */
export function changedKeys(
  before: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>
): string[] {
  return Object.keys(patch).filter(
    key => !sameValue(before[key] ?? null, patch[key] ?? null)
  )
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

/** Les clés triées, les `undefined` retirés : deux objets égaux s'écrivent pareil. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)])
  )
}
