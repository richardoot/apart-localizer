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
