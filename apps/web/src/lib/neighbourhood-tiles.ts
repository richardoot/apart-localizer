import {
  LOCATION_PRECISION_LABELS,
  NEIGHBOURHOOD_KIND_LABELS,
  TRANSIT_MODE_LABELS,
} from '@apart/contracts'
import type {
  AmenityLookup,
  ComplianceReport,
  ListingContext,
  NearbyAmenity,
} from '@apart/contracts'
import { placementAreaName, precisionBadge } from '@apart/domain'
import { formatDistance } from './format'

/**
 * Lot 19 (ADR 0029) : les six tuiles de l'onglet Quartier, « Comment on y
 * vit ? » : la valeur principale lisible d'un coup d'œil (tram, courses,
 * sport, quartier, risques à l'adresse, repère) et une ligne dessous. Tout
 * vient du contexte calculé par le serveur (données ouvertes importées) et
 * du rapport Géorisques ; une donnée absente rend « à vérifier »,
 * « inconnu » ou « non disponible », jamais une valeur inventée (aucun
 * temps de trajet ni aucune fréquence : on ne les a pas). Pur, testé.
 */
export type NeighbourhoodTileId =
  'transit' | 'shopping' | 'sport' | 'neighbourhood' | 'risks' | 'placement'

/** La teinte de la valeur : neutre, rassurante, à surveiller. */
export type NeighbourhoodTileTone = 'default' | 'good' | 'warn'

export interface NeighbourhoodTile {
  id: NeighbourhoodTileId
  /** Le nom de la tuile (« Tram », « Risques à l'adresse »). */
  kicker: string
  value: string
  sub: string
  tone: NeighbourhoodTileTone
}

export const NEIGHBOURHOOD_TILE_IDS: readonly NeighbourhoodTileId[] = [
  'transit',
  'shopping',
  'sport',
  'neighbourhood',
  'risks',
  'placement',
]

const TO_VERIFY = 'à vérifier'

/** « ≈ 450 m » depuis un repère approché, « 450 m » sinon. */
function distance(meters: number, approximate: boolean): string {
  return `${approximate ? '≈ ' : ''}${formatDistance(meters)}`
}

/** Une recherche d'équipement sans résultat : non disponible, ou à vérifier. */
function missingValue(lookup: Pick<AmenityLookup, 'status'>): string {
  return lookup.status === 'unavailable' ? 'non disponible' : TO_VERIFY
}

/** Sans équipement trouvé : aucun proche (recherche faite), non disponible, ou à vérifier. */
function noneText(lookup: Pick<AmenityLookup, 'status'>, none: string): string {
  if (lookup.status === 'ok') return none
  return missingValue(lookup)
}

/** « Drive fictif (Carrefour) » : le nom, et l'enseigne si le nom ne la dit pas. */
function amenityName(amenity: NearbyAmenity): string {
  return amenity.brand && !amenity.name.includes(amenity.brand)
    ? `${amenity.name} (${amenity.brand})`
    : amenity.name
}

function transitTile(context: ListingContext | null): NeighbourhoodTile {
  const base = { id: 'transit' as const, kicker: 'Tram' }
  if (!context?.point) {
    return {
      ...base,
      value: TO_VERIFY,
      sub: 'adresse non localisée',
      tone: 'warn',
    }
  }
  const { nearestTram: tram, nearestStop: stop, approximate } = context.transit
  const otherStop =
    stop && stop.name !== tram?.name
      ? `${TRANSIT_MODE_LABELS[stop.mode].toLowerCase()} ${stop.lines.join(', ')} à ${distance(stop.distanceMeters, approximate)}`.replace(
          /\s+/g,
          ' '
        )
      : null
  if (tram) {
    const lines = tram.lines.length ? ` ${tram.lines.join(', ')}` : ''
    return {
      ...base,
      value: `Tram${lines} à ${distance(tram.distanceMeters, approximate)}`,
      sub: [`arrêt ${tram.name}`, otherStop].filter(Boolean).join(' · '),
      tone: 'default',
    }
  }
  return {
    ...base,
    value: 'Pas de tram à moins de 2 km',
    sub: otherStop ?? context.transit.reasons[0] ?? 'aucun arrêt proche connu',
    tone: 'warn',
  }
}

function shoppingTile(context: ListingContext | null): NeighbourhoodTile {
  const base = { id: 'shopping' as const, kicker: 'Courses' }
  const drives = context?.surroundings.supermarkets
  if (!drives) {
    return { ...base, value: TO_VERIFY, sub: 'drives inconnus', tone: 'warn' }
  }
  if (drives.status !== 'ok') {
    return {
      ...base,
      value: missingValue(drives),
      sub: drives.reasons[0] ?? 'supermarchés avec drive inconnus',
      tone: 'warn',
    }
  }
  const nearest = drives.nearest
  if (!nearest) {
    return {
      ...base,
      value: 'Aucun drive dans le rayon',
      sub: `à moins de ${formatDistance(context.surroundings.searchRadiusMeters)} à vol d’oiseau`,
      tone: 'warn',
    }
  }
  const where = distance(nearest.distanceMeters, drives.approximate)
  return {
    ...base,
    value:
      nearest.drive === 'to_verify'
        ? `Drive à vérifier à ${where}`
        : `Drive à ${where}`,
    sub: amenityName(nearest),
    tone: nearest.drive === 'to_verify' ? 'warn' : 'default',
  }
}

function sportTile(context: ListingContext | null): NeighbourhoodTile {
  const base = { id: 'sport' as const, kicker: 'Sport' }
  const s = context?.surroundings
  if (!s) {
    return {
      ...base,
      value: TO_VERIFY,
      sub: 'équipements inconnus',
      tone: 'warn',
    }
  }
  const fitness = s.fitnessPark.nearest
  const track = s.athleticsTrack.nearest
  const trackText = track
    ? `piste d’athlétisme à ${distance(track.distanceMeters, s.athleticsTrack.approximate)}`
    : `piste d’athlétisme : ${noneText(s.athleticsTrack, 'aucune proche')}`
  if (fitness) {
    return {
      ...base,
      value: `Fitness Park à ${distance(fitness.distanceMeters, s.fitnessPark.approximate)}`,
      sub: trackText,
      tone: 'default',
    }
  }
  const fitnessText = `Fitness Park : ${noneText(s.fitnessPark, 'aucun proche')}`
  if (track) {
    return {
      ...base,
      value: `Piste à ${distance(track.distanceMeters, s.athleticsTrack.approximate)}`,
      sub: fitnessText,
      tone: 'default',
    }
  }
  const unavailable =
    s.fitnessPark.status === 'unavailable' &&
    s.athleticsTrack.status === 'unavailable'
  return {
    ...base,
    value: unavailable ? 'non disponible' : TO_VERIFY,
    sub: `${fitnessText} · ${trackText}`,
    tone: 'warn',
  }
}

function neighbourhoodTile(context: ListingContext | null): NeighbourhoodTile {
  const base = { id: 'neighbourhood' as const, kicker: 'Quartier' }
  const n = context?.surroundings.neighbourhood
  if (!n?.value) {
    return {
      ...base,
      value: n?.status === 'unavailable' ? 'non disponible' : 'inconnu',
      sub: n?.reasons[0] ?? 'quartier non reconnu',
      tone: 'warn',
    }
  }
  const v = n.value
  const place = [
    v.parent ? `quartier ${v.parent}` : null,
    v.commune !== v.name ? v.commune : null,
  ].filter(Boolean)
  const toVerify = n.status === 'to_verify'
  return {
    ...base,
    value: v.name,
    sub: [
      place.length ? place.join(', ') : NEIGHBOURHOOD_KIND_LABELS[v.kind],
      toVerify ? TO_VERIFY : null,
    ]
      .filter(Boolean)
      .join(' · '),
    tone: toVerify ? 'warn' : 'default',
  }
}

function risksTile(report: ComplianceReport | null): NeighbourhoodTile {
  const base = { id: 'risks' as const, kicker: 'Risques à l’adresse' }
  if (!report) {
    return {
      ...base,
      value: TO_VERIFY,
      sub: 'rapport Géorisques non lu',
      tone: 'warn',
    }
  }
  const risks = report.items.filter(i => i.category === 'risks')
  const notRead = risks.find(i => i.key === 'georisques')
  if (notRead || risks.length === 0) {
    return {
      ...base,
      value: TO_VERIFY,
      sub: notRead?.message ?? 'aucun relevé Géorisques',
      tone: 'warn',
    }
  }
  const attention = risks.filter(i => i.level === 'warn' || i.level === 'bad')
  if (attention.length) {
    return {
      ...base,
      value: `${attention.length} point${attention.length > 1 ? 's' : ''} d’attention`,
      sub: attention.map(i => i.title).join(', '),
      tone: 'warn',
    }
  }
  const unknown = risks.filter(i => i.level === 'unknown')
  if (unknown.length) {
    return {
      ...base,
      value: TO_VERIFY,
      sub: `${unknown.length} aléa${unknown.length > 1 ? 's' : ''} à vérifier : ${unknown.map(i => i.title).join(', ')}`,
      tone: 'warn',
    }
  }
  return {
    ...base,
    value: 'Faibles',
    sub: 'aucun aléa notable à l’adresse',
    tone: 'good',
  }
}

const PLACEMENT_SUBS = {
  exact: 'distances depuis l’adresse',
  street: 'distances à quelques centaines de mètres près',
  district: 'adresse exacte inconnue : distances approchées',
  commune: 'adresse et quartier inconnus : distances indicatives',
  none: 'aucune distance calculée',
} as const

function placementTile(
  context: ListingContext | null,
  location: { commune?: string | null; district?: string | null } | null
): NeighbourhoodTile {
  const base = { id: 'placement' as const, kicker: 'Repère' }
  if (!context) {
    return { ...base, value: TO_VERIFY, sub: 'repère inconnu', tone: 'warn' }
  }
  const placed = {
    precision: context.precision,
    point: context.point,
    placement: context.placement,
    commune: location?.commune ?? null,
    district: location?.district ?? null,
  }
  const tone = precisionBadge(placed).tone
  const area = tone === 'district' ? placementAreaName(placed) : null
  return {
    ...base,
    value: tone === 'exact' ? 'À l’adresse' : LOCATION_PRECISION_LABELS[tone],
    sub: area ? `${area} · distances approchées` : PLACEMENT_SUBS[tone],
    tone: tone === 'exact' ? 'good' : 'warn',
  }
}

/** Les six tuiles, dans l'ordre de l'onglet. */
export function neighbourhoodTiles(
  context: ListingContext | null,
  compliance: ComplianceReport | null,
  location: { commune?: string | null; district?: string | null } | null = null
): NeighbourhoodTile[] {
  return [
    transitTile(context),
    shoppingTile(context),
    sportTile(context),
    neighbourhoodTile(context),
    risksTile(compliance),
    placementTile(context, location),
  ]
}
