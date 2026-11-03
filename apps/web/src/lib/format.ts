/**
 * Formats fr-FR de l'interface. Du formatage, jamais de calcul : les
 * grandeurs viennent de `@apart/domain`, qui fournit déjà `formatEuros` et
 * `formatPercent` pour les messages des contrôles.
 */
export { formatEuros, formatPercent } from '@apart/domain'

/** `1 234 €/mois`, `—` si la valeur n'est pas un nombre fini. */
export function formatEurosPerMonth(value: number): string {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString('fr-FR')} €/mois`
    : '—'
}

/** `4 444 €/m²`. */
export function formatEurosPerM2(value: number): string {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString('fr-FR')} €/m²`
    : '—'
}

/** `45 m²`, décimale gardée si elle existe (`62,5 m²`). */
export function formatSurface(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`
}

/** `3 nov. 2026`. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** `il y a 3 j`, `aujourd'hui`. */
export function formatRelativeDays(
  iso: string,
  now: Date = new Date()
): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days)) return '—'
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

/** `850 m`, `2,4 km`. */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

/** Un nombre saisi (chaîne fr ou en) → nombre, ou null si vide ou illisible. */
export function parseNumberInput(
  raw: string | number | null | undefined
): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const trimmed = raw.replace(/\s/g, '').replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/** Pourcentage saisi (« 3,65 ») → fraction (0,0365), ou null. */
export function percentToFraction(
  raw: string | number | null | undefined
): number | null {
  const value = parseNumberInput(raw)
  return value === null ? null : value / 100
}

/** Fraction → texte en pourcentage pour un champ (« 3.65 »). */
export function fractionToPercentInput(
  fraction: number | null | undefined
): string {
  if (fraction == null || !Number.isFinite(fraction)) return ''
  return String(Math.round(fraction * 100 * 1000) / 1000)
}
