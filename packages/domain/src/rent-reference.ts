import type {
  LeaseType,
  LocationPrecision,
  RentControlLookup,
  RentControlZone,
  RentEpoch,
  RentReferenceRow,
  RentReferenceTable,
} from '@apart/contracts'
import { formatEuros } from './format.js'

/**
 * Plafond automatique de l'encadrement des loyers (besoin L2) : choix de
 * l'arrêté en vigueur, de la zone, du nombre de pièces, de l'époque de
 * construction et du caractère meublé, puis lecture du loyer de référence
 * majoré. Fonctions pures : la zone vient de PostGIS (module geo), la table
 * de `ReferenceData` ; rien n'est inventé, tout doute rend « à vérifier ».
 */

/** L'époque de construction de l'arrêté pour une année. */
export function epochOfYear(year: number): RentEpoch {
  if (year < 1946) return 'before_1946'
  if (year <= 1970) return '1946_1970'
  if (year <= 1990) return '1971_1990'
  return 'after_1990'
}

/**
 * L'époque à partir d'un texte libre (« avant 1946 », « 1971-1990 », « années
 * 60 », « années 1930 », « 1985 »). Une décennie compte pour ses dix ans :
 * « années 70 » chevauche 1970 et 1971, donc deux tranches. Une année de
 * travaux (« rénové en 2015 ») n'est pas une date de construction. Null si
 * le texte est muet, chevauche deux époques ou se contredit.
 */
export function epochOfPeriod(
  text: string | null | undefined
): RentEpoch | null {
  const value = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Les années de travaux ne datent pas la construction.
    .replace(
      /(renov|rehabilit|refait|restaur|travaux|ravale)[a-z]*\D{0,15}(1[89]\d\d|20\d\d)/g,
      ' '
    )
  if (!value.trim()) return null
  const ranges: [number, number][] = []
  const withoutDecades = value.replace(/annees\s+(\d{2}|\d{4})\b/g, (_m, d) => {
    const n = Number(d)
    const start = d.length === 4 ? n : n === 0 ? 2000 : 1900 + n
    if (start % 10 === 0) ranges.push([start, start + 9])
    return ' '
  })
  for (const m of withoutDecades.matchAll(/(1[89]\d\d|20\d\d)/g)) {
    const year = Number(m[1])
    ranges.push([year, year])
  }
  if (ranges.length === 0) return null
  const from = Math.min(...ranges.map(r => r[0]))
  const to = Math.max(...ranges.map(r => r[1]))
  const first = (ranges[0] as [number, number])[0]
  if (/avant|anterieur/.test(value)) {
    return ranges.length === 1 && first <= 1946 ? 'before_1946' : null
  }
  if (/apres|posterieur|depuis/.test(value)) {
    return ranges.length === 1 && first >= 1990 ? 'after_1990' : null
  }
  return sameEpoch(from, to)
}

function sameEpoch(from: number, to: number): RentEpoch | null {
  const a = epochOfYear(from)
  return a === epochOfYear(to) ? a : null
}

/** La tranche de pièces de l'arrêté : 1, 2, 3, ou 4 pour « 4 et plus ». */
export function rentRoomsBucket(
  rooms: number | null | undefined
): 1 | 2 | 3 | 4 | null {
  if (rooms === null || rooms === undefined || !Number.isFinite(rooms)) {
    return null
  }
  if (rooms <= 1) return 1
  if (rooms >= 4) return 4
  return rooms as 2 | 3
}

/** La date du jour au format AAAA-MM-JJ, en temps universel. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * L'arrêté en vigueur à une date ; sinon le plus récent déjà entré en
 * vigueur, marqué `expired` (l'expérimentation a pu prendre fin ou un nouvel
 * arrêté n'a pas été importé).
 */
export function rentTableAt(
  tables: readonly RentReferenceTable[],
  at: Date
): { table: RentReferenceTable; expired: boolean } | null {
  const day = isoDay(at)
  const started = tables
    .filter(t => t.validFrom <= day)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
  const current = started.find(
    t => t.validUntil === null || day <= t.validUntil
  )
  if (current) return { table: current, expired: false }
  const latest = started[0]
  return latest ? { table: latest, expired: true } : null
}

export interface RentReferenceQuery {
  /** La commune est soumise à l'encadrement (Bordeaux). */
  applicable: boolean
  /** Zones trouvées autour du point (contenantes ou à quelques mètres), de la plus proche à la plus lointaine. */
  zones: readonly RentControlZone[]
  /** Distance sous laquelle une limite de zone rend la zone ambiguë, pour le message. */
  boundaryToleranceMeters?: number
  /**
   * Le point est dans la zone la plus proche (et non à quelques mètres d'un
   * secteur sans y être) ; vrai par défaut.
   */
  zoneContainsPoint?: boolean
  precision: LocationPrecision | null
  /**
   * Lot 12 : pour un repère approché, la zone où le bien se trouve d'après
   * l'annonce (quartier retenu, ou commune) et les zones d'encadrement
   * qu'elle recoupe.
   */
  area?: {
    /** « secteur « Stéhélin, Monséjour » », « commune de Bordeaux ». */
    label: string
    zones: readonly number[]
    /** La zone sort en partie du zonage (secteur d'activité, hors commune). */
    outsideZoning: boolean
  } | null
  rooms: number | null
  constructionYear: number | null
  constructionPeriod: string | null
  /** Type de bail ; null = pas de phase 2 saisie (location vide supposée). */
  leaseType: LeaseType | null
  surface: number | null
  /** L'année de mise en location prévue, pour signaler un plafond à revoir. */
  rentalYear?: number | null
  tables: readonly RentReferenceTable[]
  at: Date
}

const NOT_APPLICABLE =
  "Commune non soumise à l'encadrement des loyers (seule la commune de Bordeaux l'est dans la métropole)."

/**
 * Le plafond d'encadrement d'un logement. `ok` seulement si tout est connu
 * sans ambiguïté et l'arrêté en vigueur ; sinon `to_verify` avec les raisons
 * (et, quand c'est possible, la valeur indicative de l'arrêté le plus récent).
 */
export function lookupRentReference(
  query: RentReferenceQuery
): RentControlLookup {
  const base: RentControlLookup = {
    status: 'not_applicable',
    applicable: query.applicable,
    zone: null,
    rooms: rentRoomsBucket(query.rooms),
    epoch:
      query.constructionYear !== null
        ? epochOfYear(query.constructionYear)
        : epochOfPeriod(query.constructionPeriod),
    furnished:
      query.leaseType === 'shared' ? null : query.leaseType === 'furnished',
    row: null,
    referenceRentPerM2: null,
    monthlyCap: null,
    decree: null,
    reasons: [],
    notes: [],
  }
  if (!query.applicable) return { ...base, reasons: [NOT_APPLICABLE] }

  const reasons: string[] = []
  const notes: string[] = []
  const found = rentTableAt(query.tables, query.at)
  if (!found) {
    return {
      ...base,
      status: 'unavailable',
      reasons: [
        "Aucun arrêté de loyers de référence importé : lancez l'import de l'encadrement (pnpm import:rent-control).",
      ],
    }
  }
  const { table, expired } = found
  const decree = {
    decreeDate: table.decreeDate,
    validFrom: table.validFrom,
    validUntil: table.validUntil,
    sourceUrl: table.source.url,
  }
  if (expired) {
    reasons.push(
      `L'arrêté du ${frDate(table.decreeDate)} ne s'applique plus depuis le ${frDate(nextDay(table.validUntil as string))} (fin de l'expérimentation sauf prolongation) : vérifiez si l'encadrement a été prolongé et importez l'arrêté en vigueur.`
    )
  }

  if (query.precision === 'street') {
    // Le point BAN d'une rue est son milieu : une rue peut traverser
    // plusieurs zones, le numéro seul fixe la zone.
    reasons.push(
      `Adresse localisée à la rue, sans numéro${query.zones[0] ? ` : zone ${query.zones[0].zone} probable` : ''} ; précisez le numéro pour confirmer la zone.`
    )
  } else if (query.precision !== 'exact') {
    reasons.push(approximateZoneReason(query))
  }
  const distinct = [...new Set(query.zones.map(z => z.zone))]
  const zone = query.zones[0] ?? null
  if (!zone) {
    reasons.push(
      "Point hors des secteurs du zonage de l'observatoire des loyers : zone à vérifier."
    )
  } else if (query.zoneContainsPoint === false) {
    reasons.push(
      `Point hors des secteurs du zonage, à quelques mètres de la zone ${zone.zone} : zone à vérifier.`
    )
  } else if (distinct.length > 1) {
    reasons.push(
      `Adresse à moins de ${query.boundaryToleranceMeters ?? 15} m d'une limite entre les zones ${distinct.sort().join(' et ')} : zone à vérifier.`
    )
  }
  if (base.rooms === null) reasons.push('Nombre de pièces inconnu.')
  if (base.epoch === null) {
    reasons.push(
      "Époque de construction inconnue ou à cheval sur deux tranches de l'arrêté (avant 1946, 1946-1970, 1971-1990, après 1990)."
    )
  }
  if (query.leaseType === 'shared') {
    reasons.push('Colocation : précisez si le bail sera meublé ou vide.')
  } else if (query.leaseType === null) {
    notes.push('Location vide supposée (phase 2 non saisie).')
  }

  let row: RentReferenceRow | null = null
  if (
    zone &&
    base.rooms !== null &&
    base.epoch !== null &&
    base.furnished !== null
  ) {
    row =
      table.rows.find(
        r =>
          r.zone === zone.zone &&
          r.rooms === base.rooms &&
          r.epoch === base.epoch &&
          r.furnished === base.furnished
      ) ?? null
    if (!row) {
      reasons.push(
        `Aucune ligne de l'arrêté pour la zone ${zone.zone}, ${base.rooms} pièce(s), cette époque : à vérifier.`
      )
    }
  }
  const surface =
    query.surface !== null && query.surface > 0 ? query.surface : null
  const referenceRentPerM2 = row?.upperRent ?? null
  const monthlyCap =
    referenceRentPerM2 !== null && surface !== null
      ? referenceRentPerM2 * surface
      : null
  if (row && surface === null)
    notes.push('Surface inconnue : plafond mensuel non calculé.')
  if (row) {
    notes.push(
      `Arrêté du ${frDate(table.decreeDate)}, applicable du ${frDate(table.validFrom)}${table.validUntil ? ` au ${frDate(table.validUntil)}` : ''} : loyer de référence ${row.referenceRent} €/m², majoré ${row.upperRent} €/m², minoré ${row.lowerRent} €/m²${monthlyCap !== null ? `, plafond ${formatEuros(monthlyCap)}/mois hors charges` : ''}.`
    )
  }
  if (row && table.validUntil && query.rentalYear) {
    if (`${query.rentalYear}-01-01` > table.validUntil) {
      notes.push(
        `Mise en location prévue en ${query.rentalYear}, après la fin d'application de cet arrêté : le plafond sera à revoir.`
      )
    } else if (`${query.rentalYear}-12-31` > table.validUntil) {
      notes.push(
        `Mise en location prévue en ${query.rentalYear} : cet arrêté cesse de s'appliquer le ${frDate(table.validUntil)}, le plafond sera à revoir pour un bail signé après.`
      )
    }
  }

  return {
    ...base,
    status: reasons.length === 0 ? 'ok' : 'to_verify',
    zone,
    row,
    referenceRentPerM2,
    monthlyCap,
    decree,
    reasons,
    notes,
  }
}

/**
 * Lot 12 : la zone d'un repère approché. Sa zone (quartier retenu, commune)
 * tient dans une seule zone d'encadrement : zone probable, à confirmer avec
 * l'adresse ; elle en chevauche plusieurs : zone à vérifier. Jamais « ok » :
 * le quartier vient du texte de l'annonce.
 */
function approximateZoneReason(query: RentReferenceQuery): string {
  const area = query.area
  const at = query.zones[0] ? ` ; zone ${query.zones[0].zone} au repère` : ''
  if (!area || area.zones.length === 0) {
    return "Adresse imprécise (quartier ou commune) : la zone d'encadrement ne peut pas être déterminée."
  }
  if (area.zones.length === 1 && !area.outsideZoning) {
    return `Repère approché, ${area.label} entièrement en zone ${area.zones[0]} : zone probable, à confirmer avec l’adresse.`
  }
  const zones = [...area.zones].sort((a, b) => a - b)
  const list =
    zones.length > 1
      ? `les zones ${zones.slice(0, -1).join(', ')} et ${zones[zones.length - 1]}`
      : `la zone ${zones[0]} et des secteurs hors zonage`
  return `Repère approché, ${area.label} chevauche ${list} : zone à vérifier${at}.`
}

function frDate(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return isoDay(date)
}

/** Clé de provenance du loyer de référence majoré de la phase 2. */
export const REFERENCE_RENT_KEY = 'rentalPlan.referenceRentPerM2'

/** Ce que `referenceRentInForce` lit d'une annonce. */
export interface ReferenceRentSource {
  rentalPlan?: { referenceRentPerM2?: number | null } | null
  fieldSources?: Record<string, { source: string } | undefined> | null
  openDataContext?: {
    rentControl?: { validUntil?: string | null } | null
  } | null
}

/**
 * Le loyer de référence majoré qui s'applique à une date : celui de la
 * phase 2, sauf s'il a été posé d'office par l'encadrement (provenance
 * `open_data`) d'après un arrêté qui ne s'applique plus ; il ne vaut alors
 * plus rien (« à vérifier ») jusqu'à l'import du suivant. Une valeur saisie
 * par le membre est toujours gardée. Sans date, la valeur telle quelle.
 */
export function referenceRentInForce(
  listing: ReferenceRentSource,
  at?: Date
): number | null {
  const value = listing.rentalPlan?.referenceRentPerM2 ?? null
  if (value === null || at === undefined) return value
  if (listing.fieldSources?.[REFERENCE_RENT_KEY]?.source !== 'open_data') {
    return value
  }
  const until = listing.openDataContext?.rentControl?.validUntil ?? null
  return until !== null && isoDay(at) > until ? null : value
}
