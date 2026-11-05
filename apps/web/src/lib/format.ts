/**
 * Formats fr-FR de l'interface. Du formatage, jamais de calcul : les
 * grandeurs viennent de `@apart/domain`, qui fournit déjà `formatEuros` et
 * `formatPercent` pour les messages des contrôles.
 */
export { formatEuros, formatPercent } from '@apart/domain'

/**
 * Un taux précis : `4,09 %`, `5,5 %`, `3,65 %` (une à deux décimales), `—`
 * s'il n'est pas un nombre fini. Pour la fiche, où 4,09 % et 4,1 % ne disent
 * pas la même distance au seuil.
 */
export function formatRate(fraction: number): string {
  return Number.isFinite(fraction)
    ? `${(fraction * 100).toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      })} %`
    : '—'
}

/**
 * Un taux sans zéro inutile : `30 %`, `5,5 %`, `3,65 %` (deux décimales au
 * plus), `—` s'il n'est pas un nombre fini. Pour les résumés des hypothèses.
 */
export function formatRateCompact(fraction: number): string {
  return Number.isFinite(fraction)
    ? `${(fraction * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
    : '—'
}

/** Un taux signé : `+1 %`, `−0,5 %`, `0 %`. */
export function formatSignedRate(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  const text = formatRateCompact(Math.abs(fraction))
  if (text === '0 %') return text
  return `${fraction < 0 ? '−' : '+'}${text}`
}

/** Un nombre saisi relu en français : `0,5`, `40 000`, `3,65` ; trois décimales au plus. */
export function formatNumber(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
    : '—'
}

/** `déc. 2026` pour une date `AAAA-MM-JJ`, sans décalage de fuseau ; `—` si illisible. */
export function formatMonthYear(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—'
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** `15 déc. 2026` pour une date `AAAA-MM-JJ`, sans décalage de fuseau ; `—` si illisible. */
export function formatDay(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—'
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Une part de 0 à 1 en longueur CSS (`73.78%`), bornée à l'intervalle. */
export function formatCssPercent(share: number): string {
  const bounded = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0
  return `${Math.round(bounded * 10_000) / 100}%`
}

/** Un effort signé : `−362 €/mois`, `+15 €/mois`, `0 €/mois`. */
export function formatSignedEurosPerMonth(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  if (rounded === 0) return '0 €/mois'
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toLocaleString('fr-FR')} €/mois`
}

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

/**
 * Un nombre écrit pour un champ (« 1050.5 », « 3.65 ») récrit à la française,
 * sans arrondi : virgule décimale et, pour les montants, espaces fines entre
 * les milliers (« 1 050,5 », « 3,65 »). `parseNumberInput` le relit à
 * l'identique ; un texte qui n'est pas un nombre décimal est rendu tel quel.
 */
export function toFrenchInput(raw: string, grouping = false): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return raw
  const [, sign = '', int = '', fraction] = match
  const grouped = grouping
    ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
    : int
  return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`
}

/** Fraction → texte en pourcentage pour un champ (« 3.65 »). */
export function fractionToPercentInput(
  fraction: number | null | undefined
): string {
  if (fraction == null || !Number.isFinite(fraction)) return ''
  return String(Math.round(fraction * 100 * 1000) / 1000)
}
