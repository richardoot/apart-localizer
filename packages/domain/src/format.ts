/**
 * Formats fr-FR utilisés dans les messages des contrôles. Identiques à ceux
 * de l'artefact pour que les textes restent les mêmes.
 */
export function formatEuros(value: number): string {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString('fr-FR')} €`
    : '—'
}

export function formatPercent(fraction: number): string {
  return Number.isFinite(fraction)
    ? `${(fraction * 100).toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} %`
    : '—'
}

/**
 * Lot 22 : un nombre et son nom accordé (« 1 annonce », « 3 annonces »,
 * « 0 annonce »), jamais « annonce(s) ». Le pluriel par défaut ajoute un
 * « s » ; `pluralForm` pour les autres (« aléas », « prix »).
 */
export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`
): string {
  return `${count.toLocaleString('fr-FR')} ${pluralWord(count, singular, pluralForm)}`
}

/** Le seul mot accordé, sans le nombre (« reçues » si plus d'une). */
export function pluralWord(
  count: number,
  singular: string,
  pluralForm = `${singular}s`
): string {
  return Math.abs(count) >= 2 ? pluralForm : singular
}
