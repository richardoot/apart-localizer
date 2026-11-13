import type {
  FieldProvenanceMap,
  LocationPrecision,
  OpenDataStatus,
  RentObservatoryLookup,
  RentObservatoryPosition,
  RentObservatoryStats,
  RentObservatoryTable,
} from '@apart/contracts'
import { RENT_OBSERVATORY_ATTRIBUTION } from '@apart/contracts'
import { formatEuros, formatPercent, plural, pluralWord } from './format.js'

/**
 * Lot 28 : le loyer observé par l'observatoire local des loyers pour une
 * annonce. La zone vient de la commune quand elle est entière dans une zone,
 * sinon de l'IRIS du repère ; la médiane et les quartiles sont ceux des
 * appartements du même nombre de pièces. Un indicateur : il n'est jamais un
 * plafond (ADR 0038) ; seule exception, il estime le loyer visé d'une annonce
 * qui n'en a pas (`estimateTargetRent`, ADR 0046), marqué « estimé ». Pure :
 * la table vient de la base, l'IRIS du module geo.
 */

export interface RentObservatoryInput {
  /** Les années d'enquête importées ; la plus récente est retenue. */
  tables: readonly RentObservatoryTable[]
  hasPoint: boolean
  precision: LocationPrecision | null
  inseeCode: string | null
  /** Codes des IRIS qui contiennent le repère (module geo). */
  irisCodes: readonly string[]
  /**
   * Faux quand aucun contour d'IRIS n'est importé (lot 11) : la zone d'une
   * commune partagée ne peut alors pas être lue. Vrai par défaut.
   */
  contoursImported?: boolean
  rooms: number | null
  surface: number | null
  targetRent: number | null
  /** Location meublée ou en colocation prévue (hypothèses de l'espace). */
  furnished?: boolean
}

/** L'année d'enquête la plus récente, null sans table. */
export function latestRentObservatoryTable(
  tables: readonly RentObservatoryTable[]
): RentObservatoryTable | null {
  return tables.reduce<RentObservatoryTable | null>(
    (best, table) => (best === null || table.year > best.year ? table : best),
    null
  )
}

/** La tranche de pièces de l'observatoire : 1, 2, 3 ou 4 (« 4 et plus »). */
export function rentObservatoryRooms(rooms: number | null): number | null {
  if (rooms === null || !Number.isFinite(rooms) || rooms < 1) return null
  return Math.min(4, Math.floor(rooms))
}

/** Les zones d'une commune partagée, d'après ses IRIS, triées. */
export function rentObservatoryZonesOfCommune(
  table: RentObservatoryTable,
  inseeCode: string
): number[] {
  const zones = new Set<number>()
  for (const [iris, zone] of Object.entries(table.irisZones)) {
    if (iris.startsWith(inseeCode)) zones.add(zone)
  }
  return [...zones].sort((a, b) => a - b)
}

/** La place d'un loyer au m² par rapport aux quartiles. */
export function rentObservatoryPosition(
  rentPerM2: number,
  stats: Pick<RentObservatoryStats, 'q1PerM2' | 'q3PerM2'>
): RentObservatoryPosition {
  if (rentPerM2 > stats.q3PerM2) return 'above_q3'
  if (rentPerM2 < stats.q1PerM2) return 'below_q1'
  return 'within'
}

function perM2(value: number): string {
  return `${value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} €/m²`
}

function roomsLabel(rooms: number | null): string {
  if (rooms === null) return 'toutes tailles'
  return rooms === 4 ? '4 pièces et plus' : plural(rooms, 'pièce')
}

function empty(
  status: OpenDataStatus,
  reasons: string[],
  table: RentObservatoryTable | null
): RentObservatoryLookup {
  return {
    status,
    zone: null,
    approximate: false,
    rooms: null,
    medianPerM2: null,
    q1PerM2: null,
    q3PerM2: null,
    observations: null,
    monthlyMedian: null,
    monthlyQ1: null,
    monthlyQ3: null,
    targetRent: null,
    gapToMedian: null,
    position: null,
    year: table?.year ?? null,
    observedAt: table?.observedAt ?? null,
    sourceUrl: table?.source.url ?? null,
    attribution: RENT_OBSERVATORY_ATTRIBUTION,
    reasons,
    notes: [],
  }
}

export function lookupRentObservatory(
  input: RentObservatoryInput
): RentObservatoryLookup {
  const table = latestRentObservatoryTable(input.tables)
  if (!table) {
    return empty(
      'unavailable',
      [
        'Aucun résultat de l’observatoire des loyers importé (pnpm import:rent-observatory).',
      ],
      null
    )
  }

  // 1. La zone : la commune entière, sinon l'IRIS du repère.
  const reasons: string[] = []
  let zoneNumber: number | null = null
  let approximate = false
  let status: OpenDataStatus = 'ok'
  const wholeCommune =
    input.inseeCode !== null
      ? (table.communeZones[input.inseeCode] ?? null)
      : null
  if (wholeCommune !== null) {
    zoneNumber = wholeCommune
  } else {
    const communeZones =
      input.inseeCode !== null
        ? rentObservatoryZonesOfCommune(table, input.inseeCode)
        : []
    const shared =
      communeZones.length > 0
        ? `la commune est partagée entre les zones ${communeZones.join(', ')} de l’observatoire`
        : null
    const zones = [
      ...new Set(
        input.irisCodes
          .map(code => table.irisZones[code])
          .filter((zone): zone is number => zone !== undefined)
      ),
    ].sort((a, b) => a - b)
    if (!input.hasPoint) {
      return shared
        ? empty(
            'to_verify',
            [`Annonce sans repère : ${shared}. Précise l’adresse.`],
            table
          )
        : empty(
            input.inseeCode === null ? 'to_verify' : 'not_applicable',
            [
              input.inseeCode === null
                ? 'Annonce sans repère ni commune : zone de l’observatoire inconnue.'
                : 'Commune hors du périmètre de l’observatoire des loyers de Bordeaux.',
            ],
            table
          )
    }
    if (zones.length === 0 && input.contoursImported === false) {
      return empty(
        'unavailable',
        [
          'Contours des quartiers non importés : zone de l’observatoire non disponible.',
        ],
        table
      )
    }
    if (zones.length === 0) {
      return shared
        ? empty(
            'to_verify',
            [`Secteur du repère introuvable : ${shared}.`],
            table
          )
        : empty(
            'not_applicable',
            [
              'Repère hors du périmètre de l’observatoire des loyers de Bordeaux.',
            ],
            table
          )
    }
    if (zones.length > 1) {
      return empty(
        'to_verify',
        [
          `Repère en limite des zones ${zones.join(' et ')} de l’observatoire : précise l’adresse.`,
        ],
        table
      )
    }
    zoneNumber = zones[0] as number
    if (input.precision === 'street') {
      approximate = true
      reasons.push(
        'Adresse à la rue : la zone est celle du milieu de la rue, à confirmer avec le numéro.'
      )
    } else if (
      input.precision === 'district' ||
      input.precision === 'commune'
    ) {
      approximate = true
      status = 'to_verify'
      reasons.push(
        `Repère approché (${input.precision === 'district' ? 'quartier' : 'centre de la commune'}) : ${shared ?? 'la zone est celle du repère'}. La zone est à confirmer avec l’adresse.`
      )
    }
  }

  const zone = table.zones.find(z => z.zone === zoneNumber)
  if (!zone) {
    return empty(
      'to_verify',
      [`Zone ${zoneNumber} sans loyer publié par l’observatoire.`],
      table
    )
  }

  // 2. La ligne : appartements du même nombre de pièces, sinon toutes tailles.
  const notes: string[] = []
  const wanted = rentObservatoryRooms(input.rooms)
  const all = zone.stats.find(s => s.rooms === null) ?? null
  const byRooms =
    wanted !== null ? (zone.stats.find(s => s.rooms === wanted) ?? null) : null
  const stats = byRooms ?? all
  if (!stats) {
    return {
      ...empty(
        'to_verify',
        [
          `Aucun loyer publié pour ${roomsLabel(wanted)} en ${zone.label.toLowerCase()}.`,
        ],
        table
      ),
      zone: { zone: zone.zone, label: zone.label },
      approximate,
    }
  }
  if (byRooms === null) {
    notes.push(
      wanted === null
        ? 'Nombre de pièces inconnu : médiane des appartements de toutes tailles.'
        : `Aucun loyer publié pour ${roomsLabel(wanted)} dans cette zone : médiane des appartements de toutes tailles.`
    )
  }

  // 3. Les montants mensuels et la place du loyer visé.
  const surface =
    input.surface !== null && input.surface > 0 ? input.surface : null
  const target =
    input.targetRent !== null && input.targetRent > 0 ? input.targetRent : null
  const monthlyMedian = surface !== null ? stats.medianPerM2 * surface : null
  const gapToMedian =
    monthlyMedian !== null && target !== null
      ? target / monthlyMedian - 1
      : null
  const position =
    surface !== null && target !== null
      ? rentObservatoryPosition(target / surface, stats)
      : null
  if (surface === null) {
    notes.push('Surface inconnue : pas de loyer mensuel observé.')
  }
  if (gapToMedian !== null && position !== null) {
    const gap =
      gapToMedian >= 0
        ? `${formatPercent(gapToMedian)} au-dessus`
        : `${formatPercent(-gapToMedian)} en dessous`
    notes.push(
      position === 'above_q3'
        ? `Loyer visé ${gap} de la médiane observée, au-dessus du 3e quartile (${perM2(stats.q3PerM2)}) : trois logements sur quatre de la zone se louent moins cher au m².`
        : position === 'below_q1'
          ? `Loyer visé ${gap} de la médiane observée, sous le 1er quartile (${perM2(stats.q1PerM2)}).`
          : `Loyer visé ${gap} de la médiane observée, entre les quartiles.`
    )
  }
  if (zone.recentTenants) {
    notes.push(
      `Locataires arrivés depuis moins d’un an (appartements de toutes tailles) : médiane ${perM2(zone.recentTenants.medianPerM2)}.`
    )
  }
  notes.push(
    `Loyers hors charges au ${formatDay(table.observedAt)}, tous locataires en place (${plural(stats.observations, 'logement')} ${pluralWord(stats.observations, 'enquêté')}) : un indicateur, pas un plafond.`
  )
  if (input.furnished) {
    notes.push(
      'L’observatoire ne distingue pas ici la location vide de la location meublée.'
    )
  }

  return {
    status,
    zone: { zone: zone.zone, label: zone.label },
    approximate,
    rooms: stats.rooms,
    medianPerM2: stats.medianPerM2,
    q1PerM2: stats.q1PerM2,
    q3PerM2: stats.q3PerM2,
    observations: stats.observations,
    monthlyMedian,
    monthlyQ1: surface !== null ? stats.q1PerM2 * surface : null,
    monthlyQ3: surface !== null ? stats.q3PerM2 * surface : null,
    targetRent: target,
    gapToMedian,
    position,
    year: table.year,
    observedAt: table.observedAt,
    sourceUrl: table.source.url,
    attribution: RENT_OBSERVATORY_ATTRIBUTION,
    reasons,
    notes,
  }
}

/** « 1er janvier 2025 » pour une date ISO. */
function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ]
  return `${day === 1 ? '1er' : day} ${months[month - 1]} ${year}`
}

/**
 * Le loyer observé en une ligne (connecteur, résumés) : la médiane, la
 * fourchette des quartiles et la source, ou la raison de son absence.
 */
export function rentObservatoryLine(lookup: RentObservatoryLookup): string {
  if (lookup.medianPerM2 === null || lookup.zone === null) {
    return `Loyer observé (observatoire des loyers) : ${lookup.reasons.join(' ') || 'non disponible.'}`
  }
  const monthly =
    lookup.monthlyMedian !== null &&
    lookup.monthlyQ1 !== null &&
    lookup.monthlyQ3 !== null
      ? `, soit ${lookup.approximate ? '≈ ' : ''}${formatEuros(lookup.monthlyMedian)} par mois hors charges (de ${formatEuros(lookup.monthlyQ1)} à ${formatEuros(lookup.monthlyQ3)} entre les quartiles)`
      : ''
  const quartiles =
    lookup.q1PerM2 !== null && lookup.q3PerM2 !== null
      ? ` (quartiles ${perM2(lookup.q1PerM2)} et ${perM2(lookup.q3PerM2)})`
      : ''
  return [
    `Loyer observé${lookup.status === 'to_verify' ? ' (à vérifier)' : ''}, ${lookup.zone.label.toLowerCase()} de l’observatoire des loyers ${lookup.year ?? ''}, appartements ${roomsLabel(lookup.rooms)} : médiane ${perM2(lookup.medianPerM2)}${quartiles}${monthly}.`,
    ...lookup.reasons,
    ...lookup.notes,
  ].join(' ')
}

// ---------------------------------------------------------------------------
// ADR 0046 : le loyer visé estimé
// ---------------------------------------------------------------------------

/** Clé de provenance du loyer visé (comme `REFERENCE_RENT_KEY` pour le plafond). */
export const TARGET_RENT_KEY = 'rentalPlan.targetRent'

/** Un loyer visé estimé s'arrondit aux 5 euros. */
export const ESTIMATED_TARGET_RENT_STEP = 5

export interface TargetRentEstimate {
  /** Loyer visé hors charges, euros par mois, arrondi aux 5 euros. */
  targetRent: number
  /** D'où vient le chiffre, pour la provenance (`evidence`). */
  evidence: string
}

/** Le loyer estimé et sa source, à partir d'une médiane au m². */
function estimateOf(
  medianPerM2: number,
  surface: number,
  source: string
): TargetRentEstimate | null {
  const targetRent =
    Math.round((medianPerM2 * surface) / ESTIMATED_TARGET_RENT_STEP) *
    ESTIMATED_TARGET_RENT_STEP
  if (!(targetRent > 0)) return null
  const area = surface.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  return {
    targetRent,
    evidence: `${source} ${perM2(medianPerM2)} × ${area} m² = ${formatEuros(targetRent)} par mois hors charges ; loyers de tous les locataires en place, à confirmer`,
  }
}

/** « zones 1, 2 et 3 ». */
function zonesText(zones: readonly number[]): string {
  return zones.length > 1
    ? `zones ${zones.slice(0, -1).join(', ')} et ${zones.at(-1)}`
    : `zone ${zones[0]}`
}

/**
 * ADR 0046 : le loyer visé qu'on estime pour une annonce qui n'en a pas,
 * d'après la ligne des appartements du même nombre de pièces × la surface :
 *
 * - adresse au numéro ou à la rue, ou commune entière dans une zone : la
 *   médiane de la zone ;
 * - repère au centre du quartier : la médiane de la zone de ce centre, « à
 *   confirmer avec l'adresse » ;
 * - commune connue seulement (repère au centre de la commune, en limite de
 *   deux zones, ou sans repère) dans une commune partagée entre plusieurs
 *   zones : la moyenne des médianes de ses zones, pondérée par les logements
 *   enquêtés, « à confirmer avec l'adresse ».
 *
 * Rien sans surface, sans nombre de pièces, sans ligne pour ce nombre de
 * pièces (la médiane de toutes tailles ne vaut pas pour un T1 ou un T4), ni
 * hors du périmètre. Aucune majoration (meublé, mise en location récente)
 * n'est inventée.
 */
export function estimateTargetRent(
  input: RentObservatoryInput
): TargetRentEstimate | null {
  const surface = input.surface
  const rooms = rentObservatoryRooms(input.rooms)
  if (surface === null || !(surface > 0) || rooms === null) return null
  const lookup = lookupRentObservatory({ ...input, targetRent: null })
  const head = `Observatoire des loyers ${lookup.year ?? ''}`
  const line = `appartements ${roomsLabel(rooms)}`
  if (
    lookup.zone !== null &&
    lookup.rooms === rooms &&
    lookup.medianPerM2 !== null
  ) {
    const zone = lookup.zone.label.toLowerCase()
    if (lookup.status === 'ok') {
      return estimateOf(
        lookup.medianPerM2,
        surface,
        `${head}, ${zone}${lookup.approximate ? ' (lue à la rue)' : ''}, ${line} : médiane`
      )
    }
    if (input.hasPoint && input.precision === 'district') {
      return estimateOf(
        lookup.medianPerM2,
        surface,
        `${head}, ${zone} (celle du centre du quartier, à confirmer avec l’adresse), ${line} : médiane`
      )
    }
  }
  // La commune seule : ses zones, pondérées par les logements enquêtés.
  const table = latestRentObservatoryTable(input.tables)
  if (!table || input.inseeCode === null) return null
  const zones = rentObservatoryZonesOfCommune(table, input.inseeCode)
  if (zones.length === 0) return null
  const rows = zones.map(
    number =>
      table.zones
        .find(zone => zone.zone === number)
        ?.stats.find(stats => stats.rooms === rooms) ?? null
  )
  if (rows.some(row => row === null)) return null
  const known = rows as RentObservatoryStats[]
  const observations = known.reduce((sum, row) => sum + row.observations, 0)
  if (!(observations > 0)) return null
  const mean =
    known.reduce((sum, row) => sum + row.medianPerM2 * row.observations, 0) /
    observations
  return estimateOf(
    Math.round(mean * 10) / 10,
    surface,
    `${head}, ${zonesText(zones)} de la commune (adresse inconnue : moyenne de leurs médianes pondérée par les logements enquêtés, à confirmer avec l’adresse), ${line} :`
  )
}

/** Vrai si le loyer visé de la fiche est l'estimation de l'application (ADR 0046). */
export function targetRentIsEstimated(
  fieldSources: FieldProvenanceMap | null | undefined
): boolean {
  return fieldSources?.[TARGET_RENT_KEY]?.source === 'estimated'
}

/** Ce que le recalcul fait du loyer visé d'une fiche. */
export type TargetRentAction =
  | { kind: 'keep' }
  | { kind: 'set'; targetRent: number; evidence: string }
  | { kind: 'clear' }

/**
 * ADR 0046 : la règle du recalcul. Un loyer visé saisi (par un membre, par
 * Claude, lu dans l'annonce) n'est jamais touché ; un loyer vide ou estimé
 * reçoit l'estimation du moment ; une estimation qui ne vaut plus (adresse
 * moins précise, surface effacée) est retirée plutôt que gardée périmée.
 */
export function targetRentAction(input: {
  current: number | null
  fieldSources: FieldProvenanceMap | null | undefined
  estimate: TargetRentEstimate | null
}): TargetRentAction {
  const estimated = targetRentIsEstimated(input.fieldSources)
  if (input.current !== null && !estimated) return { kind: 'keep' }
  if (input.estimate) {
    return {
      kind: 'set',
      targetRent: input.estimate.targetRent,
      evidence: input.estimate.evidence,
    }
  }
  return input.current !== null ? { kind: 'clear' } : { kind: 'keep' }
}
