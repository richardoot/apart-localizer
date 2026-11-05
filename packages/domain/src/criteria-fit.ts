import {
  CRITERIA_FIT_KEPT_LABELS,
  CRITERIA_FIT_LEVELS_BY_PREFERENCE,
  CRITERIA_FIT_LEVEL_LABELS,
  DpeClassSchema,
  EMPTY_FIT_COUNTS,
  NO_CRITERIA_FIT,
  VERDICT_LABELS,
  isStrictTolerance,
} from '@apart/contracts'
import type {
  CriteriaFilters,
  CriteriaFitCause,
  CriteriaFitCheck,
  CriteriaFitCounts,
  CriteriaFitEntry,
  CriteriaFitKept,
  CriteriaFitLevel,
  CriteriaTolerance,
  DpeClass,
  ListingCriteriaFit,
  ListingStatus,
  LocationPrecision,
  PerimeterType,
  Verdict,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import { normalizeCommune } from './rent-control.js'

/**
 * Adéquation d'une annonce à un critère de recherche (lot 14, ADR 0024).
 * PostGIS mesure (distance du repère au périmètre, relation du contour du
 * quartier ou de la commune au périmètre, distance au tram depuis le repère
 * ou depuis le contour) ; ici, sans E/S, on décide le niveau, filtre par
 * filtre, avec la marge de tolérance du critère et des raisons chiffrées en
 * français. La liste, l'aperçu d'un critère, les alertes, le MCP, l'export
 * et le rattrapage appellent tous `criteriaFit`.
 *
 * Règles :
 * - adresse exacte ou à la rue : le repère décide ; dans le périmètre =
 *   dans, à moins de la marge = à la marge, au-delà = hors ;
 * - adresse au quartier ou à la commune : le contour décide, jamais le
 *   repère ; contour entièrement dedans = dans, contour qui touche le
 *   périmètre élargi de la marge = à confirmer (jusqu'à ce que l'adresse
 *   soit connue), au-delà = hors ; sans contour, le repère et la marge, au
 *   mieux à confirmer ;
 * - une donnée manquante (repère, surface, pièces, DPE, commune, arrêts de
 *   tram non importés) rend « à confirmer », jamais « hors critères » ;
 * - le niveau du critère est le moins bon de ses filtres ; celui de
 *   l'annonce, le meilleur parmi les critères actifs.
 */

/** Ce que PostGIS mesure pour une annonce et un critère (mètres, sur la sphère). */
export interface CriteriaFitMeasures {
  /** L'annonce a un repère. */
  hasPoint: boolean
  precision: LocationPrecision | null
  /** L'annonce a un contour (quartier retenu ou commune, lot 12). */
  hasArea: boolean
  /** Distance du repère au périmètre (0 dedans) ; null sans repère ou sans périmètre. */
  pointDistanceMeters: number | null
  /** Contour entièrement dans le périmètre ; null sans contour ou sans périmètre. */
  areaCovered: boolean | null
  /** Distance du contour au périmètre (0 s'il le touche) ; null sans contour ou sans périmètre. */
  areaDistanceMeters: number | null
  /** Part de la surface du contour dans le périmètre, de 0 à 1 ; null sans contour ou sans périmètre. */
  areaInsideShare: number | null
  /** Distance du repère à l'arrêt de tram le plus proche ; null sans repère ou sans arrêt importé. */
  tramPointDistanceMeters: number | null
  /** Distance du contour à l'arrêt de tram le plus proche ; null sans contour ou sans arrêt importé. */
  tramAreaDistanceMeters: number | null
}

/** Des mesures vides : ni repère, ni contour, ni arrêt (annonce non localisée). */
export const NO_MEASURES: CriteriaFitMeasures = {
  hasPoint: false,
  precision: null,
  hasArea: false,
  pointDistanceMeters: null,
  areaCovered: null,
  areaDistanceMeters: null,
  areaInsideShare: null,
  tramPointDistanceMeters: null,
  tramAreaDistanceMeters: null,
}

/** Ce que les filtres d'un critère lisent d'une annonce évaluée. */
export interface CriteriaFitCandidate {
  price: number
  surface: number | null
  rooms: number | null
  dpeClass: DpeClass | null
  commune: string | null
  /**
   * Le verdict sous les hypothèses en vigueur ; null quand il ne peut pas se
   * calculer (annonce lue sur un portail sans loyer visé, lot 16) : un
   * filtre de verdict rend alors « à confirmer », jamais « hors critères ».
   */
  verdict: Verdict | null
}

/** Un critère tel que l'adéquation le lit. */
export interface CriteriaFitRule {
  perimeterType: PerimeterType | null
  filters: CriteriaFilters
  tolerance: CriteriaTolerance
}

export interface CriteriaFitResult {
  level: CriteriaFitLevel
  checks: CriteriaFitCheck[]
  /** Les raisons des filtres non respectés, dans l'ordre du détail. */
  reasons: string[]
  /** À confirmer à cause de la localisation : préciser l'adresse tranchera. */
  locationPending: boolean
}

/** Rang d'un niveau, 0 pour le meilleur (« dans les critères »). */
export function fitRank(level: CriteriaFitLevel): number {
  return CRITERIA_FIT_LEVELS_BY_PREFERENCE.indexOf(level)
}

/** Le moins bon de plusieurs niveaux (« dans » sans niveau). */
export function worstLevel(
  levels: readonly CriteriaFitLevel[]
): CriteriaFitLevel {
  return levels.reduce<CriteriaFitLevel>(
    (worst, level) => (fitRank(level) > fitRank(worst) ? level : worst),
    'in'
  )
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/** Une distance lisible : « 180 m », « 2,4 km ». */
export function formatFitDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })} km`
}

/** Un pourcentage d'écart : une décimale sous 10 %, entier au-delà (« 3,6 % », « 19 % »). */
export function formatFitShare(share: number): string {
  const percent = share * 100
  const digits = percent < 10 ? 1 : 0
  return `${percent.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} %`
}

/** Une surface : « 58 m² », « 57,5 m² ». */
function formatSquareMeters(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`
}

function rooms(count: number): string {
  return `${count} pièce${count > 1 ? 's' : ''}`
}

const DPE_CLASS_WORDS = [
  'aucune classe',
  'une classe',
  'deux classes',
  'trois classes',
]

function classes(count: number): string {
  return DPE_CLASS_WORDS[count] ?? `${count} classes`
}

/** « marge 5 % », « sans marge ». */
function marginOf(share: number): string {
  return share > 0 ? `marge ${formatFitShare(share)}` : 'sans marge'
}

/** Les raisons en une ligne, première lettre en capitale : « Prix +3,6 % (…) · à 2,4 km du périmètre ». */
export function fitReasonsText(reasons: readonly string[]): string {
  const text = reasons.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Une marge de part (prix, surface) appliquée à un seuil. */
const EPSILON = 1e-6

// ---------------------------------------------------------------------------
// Les filtres
// ---------------------------------------------------------------------------

type CheckInput = Omit<CriteriaFitCheck, 'reason' | 'location'> & {
  reason?: string | null
  location?: boolean
}

function check(input: CheckInput): CriteriaFitCheck {
  return {
    ...input,
    reason: input.level === 'in' ? null : (input.reason ?? null),
    location: input.location ?? false,
  }
}

/** Le nom de la zone d'une adresse imprécise : quartier, commune ou zone. */
function areaWord(precision: LocationPrecision | null): string {
  return precision === 'district'
    ? 'quartier'
    : precision === 'commune'
      ? 'commune'
      : 'zone'
}

/** Vrai si le repère est à l'adresse (numéro ou rue) : lui seul décide. */
export function isPreciseLocation(measures: CriteriaFitMeasures): boolean {
  return (
    measures.hasPoint &&
    (measures.precision === 'exact' || measures.precision === 'street')
  )
}

function perimeterCheck(
  measures: CriteriaFitMeasures,
  tolerance: CriteriaTolerance
): CriteriaFitCheck {
  const margin = tolerance.perimeterMeters
  const label = 'Périmètre'
  const marginText = `marge ${formatFitDistance(margin)}`
  if (!measures.hasPoint) {
    return check({
      key: 'perimeter',
      level: 'to_confirm',
      label,
      value: 'sans repère',
      detail: 'L’annonce n’est pas localisée : l’adresse décidera.',
      reason: 'pas de repère : adresse à préciser',
      location: true,
    })
  }
  if (isPreciseLocation(measures)) {
    const distance = measures.pointDistanceMeters
    const detail =
      margin > 0
        ? `Marge de ${formatFitDistance(margin)} autour (adresse exacte ou à la rue).`
        : 'Sans marge.'
    if (distance === null) {
      return check({
        key: 'perimeter',
        level: 'to_confirm',
        label,
        value: 'à confirmer',
        detail,
        reason: 'distance au périmètre inconnue',
      })
    }
    if (distance <= 0.5) {
      return check({
        key: 'perimeter',
        level: 'in',
        label,
        value: 'dedans',
        detail,
      })
    }
    const away = formatFitDistance(distance)
    if (distance <= margin) {
      return check({
        key: 'perimeter',
        level: 'margin',
        label,
        value: `${away} hors`,
        detail,
        reason: `${away} hors du périmètre (${marginText})`,
        location: true,
      })
    }
    return check({
      key: 'perimeter',
      level: 'out',
      label,
      value: `à ${away}`,
      detail,
      reason: `à ${away} du périmètre${margin > 0 ? ` (${marginText})` : ''}`,
      location: true,
    })
  }
  // Adresse imprécise : le contour décide, jamais le repère.
  const zone = areaWord(measures.precision)
  if (measures.hasArea && measures.areaCovered !== null) {
    if (measures.areaCovered) {
      return check({
        key: 'perimeter',
        level: 'in',
        label,
        value: `${zone} dedans`,
        detail: `Le contour du ${zone} est entièrement dans le périmètre.`,
        location: true,
      })
    }
    const distance = measures.areaDistanceMeters ?? Number.POSITIVE_INFINITY
    if (distance <= 0.5) {
      const share = measures.areaInsideShare
      const part =
        share !== null && share > 0
          ? `pour ${formatFitShare(share)} dans le périmètre`
          : 'à cheval sur le périmètre'
      return check({
        key: 'perimeter',
        level: 'to_confirm',
        label,
        value: 'à confirmer',
        detail: `Le contour du ${zone} est ${part} ; l’adresse décidera.`,
        reason: `${zone} à cheval sur le périmètre : adresse à préciser`,
        location: true,
      })
    }
    const away = formatFitDistance(distance)
    if (distance <= margin) {
      return check({
        key: 'perimeter',
        level: 'to_confirm',
        label,
        value: 'à confirmer',
        detail: `Le contour du ${zone} est à ${away} du périmètre, dans la marge ; l’adresse décidera.`,
        reason: `${zone} à ${away} du périmètre (${marginText}) : adresse à préciser`,
        location: true,
      })
    }
    return check({
      key: 'perimeter',
      level: 'out',
      label,
      value: `à ${away}`,
      detail: `Le contour du ${zone} est entièrement au-delà de la marge.`,
      reason: `${zone} à ${away} du périmètre${margin > 0 ? ` (${marginText})` : ''}`,
      location: true,
    })
  }
  // Sans contour : le repère approché et la marge, au mieux à confirmer.
  const distance = measures.pointDistanceMeters
  if (distance === null) {
    return check({
      key: 'perimeter',
      level: 'to_confirm',
      label,
      value: 'à confirmer',
      detail: 'Repère approché, sans contour : l’adresse décidera.',
      reason: 'distance au périmètre inconnue : adresse à préciser',
      location: true,
    })
  }
  if (distance <= margin || distance <= 0.5) {
    return check({
      key: 'perimeter',
      level: 'to_confirm',
      label,
      value: 'à confirmer',
      detail:
        'Repère approché (centre du quartier ou de la commune), sans contour : l’adresse décidera.',
      reason:
        distance <= 0.5
          ? 'repère approché dans le périmètre : adresse à préciser'
          : `repère approché à ${formatFitDistance(distance)} du périmètre (${marginText}) : adresse à préciser`,
      location: true,
    })
  }
  return check({
    key: 'perimeter',
    level: 'out',
    label,
    value: `≈ ${formatFitDistance(distance)}`,
    detail: 'Repère approché, sans contour, au-delà de la marge.',
    reason: `repère approché à ${formatFitDistance(distance)} du périmètre${margin > 0 ? ` (${marginText})` : ''}`,
    location: true,
  })
}

function tramCheck(
  measures: CriteriaFitMeasures,
  max: number,
  tolerance: CriteriaTolerance
): CriteriaFitCheck {
  const margin = tolerance.tramMeters
  const label = `Tram à ${formatFitDistance(max)} au plus`
  const limit = `maximum ${formatFitDistance(max)}${margin > 0 ? `, marge ${formatFitDistance(margin)}` : ''}`
  if (!measures.hasPoint) {
    return check({
      key: 'tram',
      level: 'to_confirm',
      label,
      value: 'inconnue',
      detail: 'L’annonce n’est pas localisée.',
      reason: 'pas de repère : distance au tram inconnue',
      location: true,
    })
  }
  const precise = isPreciseLocation(measures)
  const fromArea = !precise && measures.hasArea
  const distance = fromArea
    ? measures.tramAreaDistanceMeters
    : measures.tramPointDistanceMeters
  if (distance === null) {
    return check({
      key: 'tram',
      level: 'to_confirm',
      label,
      value: 'inconnue',
      detail: 'Arrêts de tram TBM non importés.',
      reason: 'distance au tram inconnue (arrêts non importés)',
    })
  }
  const text = formatFitDistance(distance)
  if (precise) {
    const detail =
      margin > 0
        ? `Marge jusqu’à ${formatFitDistance(max + margin)}.`
        : 'Sans marge.'
    if (distance <= max) {
      return check({ key: 'tram', level: 'in', label, value: text, detail })
    }
    if (distance <= max + margin) {
      return check({
        key: 'tram',
        level: 'margin',
        label,
        value: text,
        detail,
        reason: `tram à ${text} (${limit})`,
        location: true,
      })
    }
    return check({
      key: 'tram',
      level: 'out',
      label,
      value: text,
      detail,
      reason: `tram à ${text} (${limit})`,
      location: true,
    })
  }
  const zone = areaWord(measures.precision)
  const detail = fromArea
    ? `Mesuré depuis la partie du ${zone} la plus proche d’un arrêt.`
    : 'Mesuré depuis le repère approché.'
  if (distance <= max + margin) {
    return check({
      key: 'tram',
      level: 'to_confirm',
      label,
      value: `≈ ${text}`,
      detail,
      reason: fromArea
        ? `tram à confirmer (≈ ${text} depuis le ${zone}) : adresse à préciser`
        : `tram à confirmer (≈ ${text} depuis le repère approché) : adresse à préciser`,
      location: true,
    })
  }
  return check({
    key: 'tram',
    level: 'out',
    label,
    value: `≈ ${text}`,
    detail,
    reason: fromArea
      ? `tram à ${text} du ${zone} au plus près (${limit})`
      : `tram à ≈ ${text} (${limit})`,
    location: true,
  })
}

function communeCheck(
  commune: string | null,
  communes: readonly string[]
): CriteriaFitCheck {
  const label = `Commune : ${communes.join(', ')}`
  const detail = 'Sans marge.'
  if (!commune?.trim()) {
    return check({
      key: 'commune',
      level: 'to_confirm',
      label,
      value: 'inconnue',
      detail,
      reason: 'commune inconnue',
      location: true,
    })
  }
  const wanted = communes.map(normalizeCommune)
  if (wanted.includes(normalizeCommune(commune))) {
    return check({ key: 'commune', level: 'in', label, value: commune, detail })
  }
  return check({
    key: 'commune',
    level: 'out',
    label,
    value: commune,
    detail,
    reason: `commune ${commune} (retenues : ${communes.join(', ')})`,
  })
}

function priceMaxCheck(
  price: number,
  max: number,
  share: number
): CriteriaFitCheck {
  const label = `Prix maximal ${formatEuros(max)}`
  const value = formatEuros(price)
  const detail =
    share > 0
      ? `Marge jusqu’à ${formatEuros(max * (1 + share))}.`
      : 'Sans marge.'
  if (price <= max + EPSILON) {
    return check({ key: 'price_max', level: 'in', label, value, detail })
  }
  const over = (price - max) / max
  const reason = `Prix +${formatFitShare(over)} (maximum ${formatEuros(max)}, ${marginOf(share)})`
  return check({
    key: 'price_max',
    level: price <= max * (1 + share) + EPSILON ? 'margin' : 'out',
    label,
    value,
    detail,
    reason,
  })
}

function priceMinCheck(
  price: number,
  min: number,
  share: number
): CriteriaFitCheck {
  const label = `Prix minimal ${formatEuros(min)}`
  const value = formatEuros(price)
  const detail =
    share > 0
      ? `Marge jusqu’à ${formatEuros(min * (1 - share))}.`
      : 'Sans marge.'
  if (price >= min - EPSILON) {
    return check({ key: 'price_min', level: 'in', label, value, detail })
  }
  const under = (min - price) / min
  return check({
    key: 'price_min',
    level: price >= min * (1 - share) - EPSILON ? 'margin' : 'out',
    label,
    value,
    detail,
    reason: `Prix −${formatFitShare(under)} (minimum ${formatEuros(min)}, ${marginOf(share)})`,
  })
}

function surfaceCheck(
  surface: number | null,
  min: number,
  share: number
): CriteriaFitCheck {
  const label = `Surface minimale ${formatSquareMeters(min)}`
  const detail =
    share > 0
      ? `Marge jusqu’à ${formatSquareMeters(Math.round(min * (1 - share) * 10) / 10)}.`
      : 'Sans marge.'
  if (surface === null) {
    return check({
      key: 'surface_min',
      level: 'to_confirm',
      label,
      value: 'inconnue',
      detail,
      reason: `surface inconnue (minimum ${formatSquareMeters(min)})`,
    })
  }
  const value = formatSquareMeters(surface)
  if (surface >= min - EPSILON) {
    return check({ key: 'surface_min', level: 'in', label, value, detail })
  }
  return check({
    key: 'surface_min',
    level: surface >= min * (1 - share) - EPSILON ? 'margin' : 'out',
    label,
    value,
    detail,
    reason: `surface ${value} (minimum ${formatSquareMeters(min)}, ${marginOf(share)})`,
  })
}

function roomsCheck(
  count: number | null,
  min: number,
  margin: number
): CriteriaFitCheck {
  const label = `${rooms(min)} au moins`
  const detail =
    margin > 0
      ? `Marge jusqu’à ${rooms(Math.max(min - margin, 0))}.`
      : 'Sans marge.'
  if (count === null) {
    return check({
      key: 'rooms_min',
      level: 'to_confirm',
      label,
      value: 'inconnu',
      detail,
      reason: `pièces inconnues (minimum ${min})`,
    })
  }
  const value = rooms(count)
  if (count >= min) {
    return check({ key: 'rooms_min', level: 'in', label, value, detail })
  }
  return check({
    key: 'rooms_min',
    level: count >= min - margin ? 'margin' : 'out',
    label,
    value,
    detail,
    reason: `${value} (minimum ${min}${margin > 0 ? `, marge ${rooms(margin)}` : ''})`,
  })
}

function dpeCheck(
  dpe: DpeClass | null,
  max: DpeClass,
  margin: number
): CriteriaFitCheck {
  const all = DpeClassSchema.options
  const label = `DPE ${max} au plus`
  const top = all[
    Math.min(all.indexOf(max) + margin, all.length - 1)
  ] as DpeClass
  const detail = margin > 0 ? `Marge jusqu’à ${top}.` : 'Sans marge.'
  const limit = `maximum ${max}, ${margin > 0 ? `marge ${classes(margin)}` : 'sans marge'}`
  if (dpe === null) {
    return check({
      key: 'dpe_max',
      level: 'to_confirm',
      label,
      value: 'inconnu',
      detail,
      reason: `DPE inconnu (maximum ${max})`,
    })
  }
  const index = all.indexOf(dpe)
  if (index <= all.indexOf(max)) {
    return check({ key: 'dpe_max', level: 'in', label, value: dpe, detail })
  }
  return check({
    key: 'dpe_max',
    level: index <= all.indexOf(top) ? 'margin' : 'out',
    label,
    value: dpe,
    detail,
    reason: `DPE ${dpe} (${limit})`,
  })
}

function verdictCheck(
  verdict: Verdict | null,
  verdicts: readonly Verdict[]
): CriteriaFitCheck {
  const wanted = verdicts.map(v => VERDICT_LABELS[v].toLowerCase()).join(', ')
  const label = `Verdict : ${wanted}`
  if (verdict === null) {
    return check({
      key: 'verdict',
      level: 'to_confirm',
      label,
      value: 'inconnu',
      detail:
        'Le verdict se calcule avec le loyer visé, à saisir dans la fiche.',
      reason: 'verdict inconnu : loyer visé à saisir',
    })
  }
  const value = VERDICT_LABELS[verdict]
  if (verdicts.includes(verdict)) {
    return check({
      key: 'verdict',
      level: 'in',
      label,
      value,
      detail: 'Sans marge.',
    })
  }
  return check({
    key: 'verdict',
    level: 'out',
    label,
    value,
    detail: 'Sans marge ; dépend des hypothèses en vigueur.',
    reason: `verdict ${value.toLowerCase()} (retenus : ${wanted})`,
  })
}

/** Les filtres contrôlés, dans l'ordre du détail. */
export function criteriaFitChecks(
  rule: CriteriaFitRule,
  candidate: CriteriaFitCandidate,
  measures: CriteriaFitMeasures
): CriteriaFitCheck[] {
  const f = rule.filters
  const t = rule.tolerance
  const checks: CriteriaFitCheck[] = []
  if (rule.perimeterType !== null) checks.push(perimeterCheck(measures, t))
  if (f.maxTramDistanceMeters !== null) {
    checks.push(tramCheck(measures, f.maxTramDistanceMeters, t))
  }
  if (f.communes.length)
    checks.push(communeCheck(candidate.commune, f.communes))
  if (f.priceMax !== null) {
    checks.push(priceMaxCheck(candidate.price, f.priceMax, t.priceMaxShare))
  }
  if (f.priceMin !== null) {
    checks.push(priceMinCheck(candidate.price, f.priceMin, t.priceMinShare))
  }
  if (f.surfaceMin !== null) {
    checks.push(
      surfaceCheck(candidate.surface, f.surfaceMin, t.surfaceMinShare)
    )
  }
  if (f.roomsMin !== null) {
    checks.push(roomsCheck(candidate.rooms, f.roomsMin, t.roomsMin))
  }
  if (f.dpeMax !== null) {
    checks.push(dpeCheck(candidate.dpeClass, f.dpeMax, t.dpeClasses))
  }
  if (f.verdicts.length)
    checks.push(verdictCheck(candidate.verdict, f.verdicts))
  return checks
}

/**
 * L'adéquation d'une annonce à un critère : le moins bon de ses filtres
 * (sans filtre ni périmètre, « dans les critères »), les raisons, et si la
 * localisation reste à confirmer. Le statut n'en fait pas partie.
 */
export function criteriaFit(
  rule: CriteriaFitRule,
  candidate: CriteriaFitCandidate,
  measures: CriteriaFitMeasures
): CriteriaFitResult {
  const checks = criteriaFitChecks(rule, candidate, measures)
  return {
    level: worstLevel(checks.map(c => c.level)),
    checks,
    reasons: checks.flatMap(c => (c.reason ? [c.reason] : [])),
    locationPending: checks.some(c => c.level === 'to_confirm' && c.location),
  }
}

// ---------------------------------------------------------------------------
// L'annonce : le meilleur des critères actifs
// ---------------------------------------------------------------------------

/** Le critère qui donne le meilleur niveau ; à égalité, le premier (ordre de création). */
export function bestFit<T extends { level: CriteriaFitLevel }>(
  entries: readonly T[]
): T | null {
  let best: T | null = null
  for (const entry of entries) {
    if (best === null || fitRank(entry.level) < fitRank(best.level))
      best = entry
  }
  return best
}

/** Les statuts d'une offre en cours. */
const OFFER_STATUSES: readonly ListingStatus[] = [
  'offer_made',
  'offer_accepted',
]

/**
 * Pourquoi une annonce hors critères reste dans l'onglet principal : une
 * offre en cours (offre faite ou acceptée), sinon une visite prévue.
 */
export function keptOutOfCriteria(
  status: ListingStatus,
  plannedVisits: number
): CriteriaFitKept | null {
  if (OFFER_STATUSES.includes(status)) return 'offer'
  return plannedVisits > 0 ? 'visit' : null
}

/** « Gardée dans la liste : offre en cours ». */
export function keptLabel(kept: CriteriaFitKept): string {
  return `Gardée dans la liste : ${CRITERIA_FIT_KEPT_LABELS[kept]}`
}

/**
 * L'adéquation d'une annonce à partir de son détail par critère actif :
 * aucun critère actif = « dans les critères » (rien ne disparaît).
 */
export function listingCriteriaFit(input: {
  entries: readonly CriteriaFitEntry[]
  since: string | null
  origin?: ListingCriteriaFit['origin']
  status: ListingStatus
  plannedVisits: number
}): ListingCriteriaFit {
  const best = bestFit(input.entries)
  if (!best) return { ...NO_CRITERIA_FIT }
  return {
    level: best.level,
    activeCriteria: input.entries.length,
    criteriaId: best.criteriaId,
    name: best.name,
    reasons: best.reasons,
    locationPending: best.locationPending,
    since: input.since,
    origin: input.origin ?? null,
    kept:
      best.level === 'out'
        ? keptOutOfCriteria(input.status, input.plannedVisits)
        : null,
    criteria: [...input.entries],
  }
}

/** Vrai si l'annonce est dans l'onglet « Dans les critères » (gardée comprise). */
export function inMainFitTab(
  fit: Pick<ListingCriteriaFit, 'level' | 'kept'>
): boolean {
  return fit.level !== 'out' || fit.kept !== null
}

/**
 * Le filtre `fit` de la liste : absent = l'onglet principal (dans, à
 * confirmer, à la marge, et les hors critères gardées) ; donné = exactement
 * ces niveaux.
 */
export function matchesFitFilter(
  fit: Pick<ListingCriteriaFit, 'level' | 'kept'>,
  levels: readonly CriteriaFitLevel[] | undefined
): boolean {
  return levels === undefined || levels.length === 0
    ? inMainFitTab(fit)
    : levels.includes(fit.level)
}

/** Les annonces par niveau, et les hors critères gardées. */
export function countFits(
  fits: readonly Pick<ListingCriteriaFit, 'level' | 'kept'>[]
): { counts: CriteriaFitCounts; kept: number } {
  const counts = { ...EMPTY_FIT_COUNTS }
  let kept = 0
  for (const fit of fits) {
    counts[fit.level] += 1
    if (fit.level === 'out' && fit.kept !== null) kept += 1
  }
  return { counts, kept }
}

/** L'adéquation vue pour un seul critère (liste filtrée par `criteriaId`). */
export function fitForCriteria(
  fit: ListingCriteriaFit,
  criteriaId: string,
  status: ListingStatus,
  plannedVisits: number
): ListingCriteriaFit {
  const entry = fit.criteria.find(c => c.criteriaId === criteriaId)
  if (!entry) return { ...fit, level: 'in', kept: null }
  return {
    ...fit,
    level: entry.level,
    criteriaId: entry.criteriaId,
    name: entry.name,
    reasons: entry.reasons,
    locationPending: entry.locationPending,
    since: entry.since,
    kept:
      entry.level === 'out' ? keptOutOfCriteria(status, plannedVisits) : null,
  }
}

// ---------------------------------------------------------------------------
// Changements de niveau (journal, alertes)
// ---------------------------------------------------------------------------

export type FitTransition = 'entered' | 'left' | 'changed'

/**
 * Ce que change un recalcul pour un critère : une entrée (de « hors
 * critères » ou jamais comparée à un niveau gardé), une sortie (vers « hors
 * critères »), un autre changement, ou rien (première comparaison hors
 * critères comprise : rien n'a bougé pour le membre).
 */
export function fitTransition(
  before: CriteriaFitLevel | null,
  after: CriteriaFitLevel
): FitTransition | null {
  if (before === after) return null
  if (after === 'out') return before === null ? null : 'left'
  if (before === null || before === 'out') return 'entered'
  return 'changed'
}

/** Le déclencheur d'un recalcul venu d'une écriture de l'annonce (journal, « depuis »). */
export type CriteriaFitTrigger =
  | 'created'
  | 'updated'
  | 'price_up'
  | 'price_down'
  | 'status'
  | 'location'
  | 'dpe'
  | 'enriched'

/** Le texte d'un déclencheur ; inconnu = « Fiche modifiée ». */
function triggerText(trigger: string | null | undefined): string {
  return (
    (TRIGGER_TEXTS as Record<string, string>)[trigger ?? 'updated'] ??
    TRIGGER_TEXTS.updated
  )
}

const TRIGGER_TEXTS: Record<CriteriaFitTrigger, string> = {
  created: 'Dès l’enregistrement',
  updated: 'Fiche modifiée',
  price_up: 'Prix remonté',
  price_down: 'Prix baissé',
  status: 'Statut changé',
  location: 'Repère replacé',
  dpe: 'DPE retenu',
  enriched: 'Données ouvertes mises à jour',
}

/** Ce qui a fait changer le niveau, tel que le journal et l'annonce le gardent. */
export interface CriteriaFitOrigin {
  cause: CriteriaFitCause
  /** Un `CriteriaFitTrigger` ; un texte inconnu vaut « fiche modifiée ». */
  trigger?: string | null
  /** Pour un critère créé ou modifié. */
  criteriaName?: string | null
}

const dayMonth = (iso: string, now: Date): string => {
  const date = new Date(iso)
  const sameYear =
    date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      timeZone: 'Europe/Paris',
    }) ===
    now.toLocaleDateString('fr-FR', {
      year: 'numeric',
      timeZone: 'Europe/Paris',
    })
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'Europe/Paris',
  })
}

/**
 * « Depuis » d'une annonce hors critères : la cause et la date du dernier
 * changement de niveau (« Prix remonté le 2 novembre », « Critère « X »
 * modifié le 28 octobre », « Dès l'enregistrement »).
 */
export function fitSinceText(
  since: string | null,
  origin: CriteriaFitOrigin | null,
  now: Date = new Date()
): string {
  if (!since) return 'Date inconnue'
  const day = dayMonth(since, now)
  if (!origin) return `Depuis le ${day}`
  switch (origin.cause) {
    case 'criteria':
      return origin.criteriaName
        ? `Critère « ${origin.criteriaName} » modifié le ${day}`
        : `Critères modifiés le ${day}`
    case 'assumptions':
      return `Hypothèses modifiées le ${day}`
    case 'refresh':
      return `Recalculée le ${day}`
    default:
      if (origin.trigger === 'created') return TRIGGER_TEXTS.created
      return `${triggerText(origin.trigger)} le ${day}`
  }
}

/** Le déclencheur d'un changement de prix. */
export function priceTrigger(
  before: number,
  after: number
): CriteriaFitTrigger {
  return after > before ? 'price_up' : 'price_down'
}

// ---------------------------------------------------------------------------
// Historique de l'adéquation (fiche), tiré du journal
// ---------------------------------------------------------------------------

/** Une ligne du journal lue par l'historique. */
export interface FitHistoryEvent {
  action: string
  before: unknown
  after: unknown
  /** ISO 8601. */
  createdAt: string
}

export interface FitHistoryItem {
  at: string
  /** « Entrée, à confirmer », « Hors critères », « À la marge → dans les critères ». */
  what: string
  /** Les raisons et la cause. */
  why: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function levelOf(value: unknown): CriteriaFitLevel | null {
  return typeof value === 'string' && value in CRITERIA_FIT_LEVEL_LABELS
    ? (value as CriteriaFitLevel)
    : null
}

interface LoggedFitChange {
  name: string
  before: CriteriaFitLevel | null
  level: CriteriaFitLevel | null
  reasons: string[]
}

/** Les critères d'une ligne `criteria.*` (après, sinon avant). */
export function loggedFitChanges(
  event: Pick<FitHistoryEvent, 'before' | 'after'>
): LoggedFitChange[] {
  const source =
    isRecord(event.after) && Array.isArray(event.after.criteria)
      ? event.after.criteria
      : isRecord(event.before) && Array.isArray(event.before.criteria)
        ? event.before.criteria
        : []
  return source.filter(isRecord).map(c => ({
    name: typeof c.name === 'string' ? c.name : 'critère',
    before: levelOf(c.before),
    level: levelOf(c.level),
    reasons: Array.isArray(c.reasons)
      ? c.reasons.filter((r): r is string => typeof r === 'string')
      : [],
  }))
}

/** La cause enregistrée d'une ligne du journal de l'adéquation. */
export function loggedFitOrigin(after: unknown): CriteriaFitOrigin | null {
  if (!isRecord(after) || typeof after.cause !== 'string') return null
  return {
    cause: after.cause as CriteriaFitCause,
    trigger: typeof after.trigger === 'string' ? after.trigger : null,
    criteriaName:
      typeof after.criteriaName === 'string' ? after.criteriaName : null,
  }
}

function causeText(origin: CriteriaFitOrigin | null): string | null {
  if (!origin) return null
  switch (origin.cause) {
    case 'criteria':
      return origin.criteriaName
        ? `critère « ${origin.criteriaName} » créé ou modifié`
        : 'critère créé ou modifié'
    case 'assumptions':
      return 'hypothèses modifiées (verdict)'
    case 'refresh':
      return 'recalcul (rattrapage)'
    default:
      return origin.trigger && origin.trigger !== 'updated'
        ? triggerText(origin.trigger).toLowerCase()
        : null
  }
}

/**
 * L'historique de l'adéquation d'une annonce, du plus récent au plus
 * ancien : entrées, sorties et changements de niveau datés avec leurs
 * raisons, puis l'enregistrement.
 */
export function criteriaFitHistory(
  events: readonly FitHistoryEvent[]
): FitHistoryItem[] {
  const items: FitHistoryItem[] = []
  for (const event of events) {
    if (event.action === 'listing.created') {
      items.push({ at: event.createdAt, what: 'Enregistrée', why: '' })
      continue
    }
    if (
      event.action !== 'criteria.matched' &&
      event.action !== 'criteria.unmatched' &&
      event.action !== 'criteria.fit_changed'
    ) {
      continue
    }
    const origin = loggedFitOrigin(event.after)
    const cause = causeText(origin)
    for (const change of loggedFitChanges(event)) {
      const level =
        event.action === 'criteria.unmatched' ? 'out' : (change.level ?? 'in')
      const label = CRITERIA_FIT_LEVEL_LABELS[level]
      const what =
        event.action === 'criteria.matched'
          ? `Entrée dans « ${change.name} »${level === 'in' ? '' : `, ${label.toLowerCase()}`}`
          : event.action === 'criteria.unmatched'
            ? `Hors du critère « ${change.name} »`
            : `« ${change.name} » : ${change.before ? `${CRITERIA_FIT_LEVEL_LABELS[change.before].toLowerCase()} → ` : ''}${label.toLowerCase()}`
      const why = [
        change.reasons.length ? fitReasonsText(change.reasons) : null,
        cause ? `(${cause})` : null,
      ]
        .filter(Boolean)
        .join(' ')
      items.push({ at: event.createdAt, what, why })
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

// ---------------------------------------------------------------------------
// Les marges, lues
// ---------------------------------------------------------------------------

/** Les seuils réels d'un critère, marge comprise (« soit 231 000 € »). */
export interface ToleranceThresholds {
  priceMax: number | null
  priceMin: number | null
  surfaceMin: number | null
  roomsMin: number | null
  dpeMax: DpeClass | null
  tramMeters: number | null
}

export function toleranceThresholds(
  filters: CriteriaFilters,
  tolerance: CriteriaTolerance
): ToleranceThresholds {
  const all = DpeClassSchema.options
  return {
    priceMax:
      filters.priceMax === null
        ? null
        : Math.round(filters.priceMax * (1 + tolerance.priceMaxShare)),
    priceMin:
      filters.priceMin === null
        ? null
        : Math.round(filters.priceMin * (1 - tolerance.priceMinShare)),
    surfaceMin:
      filters.surfaceMin === null
        ? null
        : Math.round(
            filters.surfaceMin * (1 - tolerance.surfaceMinShare) * 10
          ) / 10,
    roomsMin:
      filters.roomsMin === null
        ? null
        : Math.max(filters.roomsMin - tolerance.roomsMin, 0),
    dpeMax:
      filters.dpeMax === null
        ? null
        : (all[
            Math.min(
              all.indexOf(filters.dpeMax) + tolerance.dpeClasses,
              all.length - 1
            )
          ] as DpeClass),
    tramMeters:
      filters.maxTramDistanceMeters === null
        ? null
        : filters.maxTramDistanceMeters + tolerance.tramMeters,
  }
}

/**
 * Les marges appliquées par un critère, en une phrase : seulement celles
 * de ses filtres (« Marges appliquées : périmètre 300 m, prix +5 %, DPE une
 * classe. »).
 */
export function toleranceSummary(rule: CriteriaFitRule): string {
  const f = rule.filters
  const t = rule.tolerance
  if (isStrictTolerance(t)) return 'Aucune marge : chaque seuil est strict.'
  const parts = [
    rule.perimeterType !== null && t.perimeterMeters > 0
      ? `périmètre ${formatFitDistance(t.perimeterMeters)}`
      : null,
    f.priceMax !== null && t.priceMaxShare > 0
      ? `prix +${formatFitShare(t.priceMaxShare)}`
      : null,
    f.priceMin !== null && t.priceMinShare > 0
      ? `prix minimal −${formatFitShare(t.priceMinShare)}`
      : null,
    f.surfaceMin !== null && t.surfaceMinShare > 0
      ? `surface −${formatFitShare(t.surfaceMinShare)}`
      : null,
    f.roomsMin !== null && t.roomsMin > 0
      ? `${rooms(t.roomsMin)} de moins`
      : null,
    f.dpeMax !== null && t.dpeClasses > 0
      ? `DPE ${classes(t.dpeClasses)}`
      : null,
    f.maxTramDistanceMeters !== null && t.tramMeters > 0
      ? `tram +${formatFitDistance(t.tramMeters)}`
      : null,
  ].filter(Boolean)
  return parts.length
    ? `Marges appliquées : ${parts.join(', ')}.`
    : 'Aucune marge ne s’applique aux filtres de ce critère.'
}

/** Une ligne lisible de l'adéquation d'une annonce (MCP, infobulle). */
export function describeListingFit(fit: ListingCriteriaFit): string {
  if (fit.activeCriteria === 0) {
    return 'Aucun critère actif : dans les critères par défaut'
  }
  const label = CRITERIA_FIT_LEVEL_LABELS[fit.level]
  const detail = fit.reasons.length ? ` : ${fitReasonsText(fit.reasons)}` : ''
  const kept = fit.kept ? ` (${keptLabel(fit.kept).toLowerCase()})` : ''
  return `${label}${fit.name ? ` — « ${fit.name} »` : ''}${detail}${kept}`
}

/**
 * Ce que veut dire l'adéquation d'une annonce, en une ou deux phrases
 * (bloc « Correspond-elle à ce qu'on cherche ? » de la fiche).
 */
export function fitExplanation(fit: ListingCriteriaFit): string {
  if (fit.activeCriteria === 0) {
    return 'Aucun critère actif : l’annonce est « dans les critères » par défaut. Créez un critère dans la page Critères pour la comparer à ce que vous cherchez.'
  }
  const reasons = fitReasonsText(fit.reasons)
  switch (fit.level) {
    case 'in':
      return fit.name
        ? `Elle respecte tous les filtres du critère « ${fit.name} ».`
        : 'Elle respecte tous les filtres du critère.'
    case 'to_confirm':
      return fit.locationPending
        ? 'Sans adresse exacte, on compare le contour du quartier ou de la commune, pas le repère. Il touche le périmètre ou sa marge : l’annonce reste dans les critères jusqu’à ce que l’adresse tranche.'
        : `Une information manque (${reasons}) : l’annonce reste dans les critères jusqu’à ce qu’elle soit connue.`
    case 'margin':
      return `Elle dépasse un seuil, mais dans la marge de tolérance : ${reasons}.`
    case 'out':
      return `Au-delà de la marge de tous les critères actifs : ${reasons}. Rien n’est perdu : elle reviendra d’elle-même si un critère s’élargit, si le prix baisse ou si l’adresse la place dans le périmètre.${fit.kept ? ` ${keptLabel(fit.kept)}.` : ''}`
  }
}
