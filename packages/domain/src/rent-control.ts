import type { RentControl } from '@apart/contracts'

/**
 * Communes soumises à l'encadrement des loyers, en minuscules sans accents.
 * Table de référence par défaut ; la version en base (ReferenceData) la
 * remplacera par code INSEE. Bordeaux seule est encadrée dans la métropole.
 */
export const DEFAULT_RENT_CONTROLLED_COMMUNES: readonly string[] = ['bordeaux']

/** Normalise un nom de commune : sans accents, sans espaces superflus, en minuscules. */
export function normalizeCommune(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Le bien est-il soumis à l'encadrement ? « yes » et « no » forcent la
 * réponse ; « auto » la déduit de la commune.
 */
export function isRentControlled(
  commune: string | null | undefined,
  rentControl: RentControl = 'auto',
  controlledCommunes: readonly string[] = DEFAULT_RENT_CONTROLLED_COMMUNES
): boolean {
  if (rentControl === 'yes') return true
  if (rentControl === 'no') return false
  return controlledCommunes.includes(normalizeCommune(commune))
}
