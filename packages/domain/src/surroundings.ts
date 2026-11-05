import {
  AMENITY_SEARCH_METERS,
  NEIGHBOURHOOD_BORDER_METERS,
  PREFERRED_SUPERMARKET_BRANDS,
  SUPERMARKET_BRAND_LABELS,
} from '@apart/contracts'
import type {
  AmenityLookup,
  DriveStatus,
  LocationPrecision,
  NearbyAmenity,
  Neighbourhood,
  NeighbourhoodKind,
  NeighbourhoodLookup,
  Point,
  PreferredSupermarketBrand,
  SupermarketBrandGroup,
  SupermarketsLookup,
  Surroundings,
  SurroundingsSources,
} from '@apart/contracts'

/**
 * Équipements et quartiers (lot 11) : les règles pures. Enseigne d'un
 * supermarché et enseignes préférées, drive signalé ou à vérifier (jamais
 * supposé), reconnaissance d'un club Fitness Park, choix du quartier qui
 * contient un point, choix des plus proches. Les distances arrivent
 * calculées par PostGIS (module geo), à vol d'oiseau ; rien n'est mesuré ici.
 */

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const BRAND_PATTERNS: readonly [PreferredSupermarketBrand, RegExp][] = [
  ['carrefour', /\bcarrefour\b/],
  ['auchan', /\bauchan\b/],
  ['intermarche', /\bintermarche\b/],
]

/**
 * Le groupe d'enseigne d'après les libellés de la source, dans l'ordre donné
 * (enseigne, puis nom…) : Carrefour, Auchan, Intermarché quelle que soit la
 * déclinaison (Market, City, Contact, Express, Hyper, Super, Drive…), sinon
 * « autre ». Le premier libellé qui nomme une enseigne préférée l'emporte.
 */
export function supermarketBrandGroup(
  ...labels: readonly (string | null | undefined)[]
): SupermarketBrandGroup {
  for (const label of labels) {
    if (!label) continue
    const folded = foldText(label)
    for (const [group, pattern] of BRAND_PATTERNS) {
      if (pattern.test(folded)) return group
    }
  }
  return 'other'
}

export function isPreferredBrand(
  group: SupermarketBrandGroup | null | undefined
): group is PreferredSupermarketBrand {
  return (PREFERRED_SUPERMARKET_BRANDS as readonly string[]).includes(
    group ?? ''
  )
}

/** Rang d'affichage d'une enseigne : les préférées dans leur ordre, puis les autres. */
export function brandRank(group: SupermarketBrandGroup | null): number {
  const index = (PREFERRED_SUPERMARKET_BRANDS as readonly string[]).indexOf(
    group ?? ''
  )
  return index === -1 ? PREFERRED_SUPERMARKET_BRANDS.length : index
}

/** Ce que la source dit du drive d'un magasin, et pourquoi. */
export interface DriveSignal {
  status: DriveStatus | null
  evidence: string | null
}

const DRIVE_WORD = /drive/
const lower = (value: string | undefined): string =>
  (value ?? '').trim().toLowerCase()

/**
 * Le drive d'après les étiquettes OpenStreetMap d'un magasin (wiki
 * `FR:Key:drive_through`, `FR:Tag:shop=outpost`, Name Suggestion Index) :
 * - drive signalé : `drive_through=only` (point de retrait sans magasin :
 *   « Auchan Drive », « E.Leclerc Drive », « Intermarché Drive »), ou le nom,
 *   l'enseigne, le nom officiel ou court disent « drive » (« Carrefour
 *   Drive », « Chronodrive ») ;
 * - à vérifier : `drive_through=yes` (le wiki l'emploie pour un drive mais
 *   aussi pour tout service au volant), `click_and_collect=yes|only`, une
 *   antenne `branch=Drive` sans « drive » dans le nom, un point de retrait
 *   `shop=outpost` sans autre signal ;
 * - rien de tout cela : pas de drive (null). Jamais de drive supposé d'après
 *   l'enseigne ou la taille du magasin.
 */
export function driveSignalOfTags(
  tags: Readonly<Record<string, string | undefined>>
): DriveSignal {
  if (lower(tags.drive_through) === 'only') {
    return { status: 'yes', evidence: `drive_through=${tags.drive_through}` }
  }
  for (const key of ['name', 'brand', 'official_name', 'short_name']) {
    const value = tags[key]
    if (value && DRIVE_WORD.test(foldText(value))) {
      return { status: 'yes', evidence: `${key}=${value}` }
    }
  }
  if (lower(tags.drive_through) === 'yes') {
    return {
      status: 'to_verify',
      evidence: `drive_through=${tags.drive_through}`,
    }
  }
  if (['yes', 'only'].includes(lower(tags.click_and_collect))) {
    return {
      status: 'to_verify',
      evidence: `click_and_collect=${tags.click_and_collect}`,
    }
  }
  if (tags.branch && DRIVE_WORD.test(foldText(tags.branch))) {
    return { status: 'to_verify', evidence: `branch=${tags.branch}` }
  }
  if (tags.shop === 'outpost') {
    return { status: 'to_verify', evidence: 'shop=outpost' }
  }
  return { status: null, evidence: null }
}

/**
 * L'identifiant Wikidata de la marque Fitness Park (Q102351191, « chaîne de
 * clubs de fitness », vérifié sur wikidata.org le 5 novembre 2026).
 */
export const FITNESS_PARK_WIKIDATA = 'Q102351191'

/**
 * Vrai si les étiquettes désignent un club Fitness Park : l'identifiant
 * Wikidata de la marque, ou l'enseigne, le nom ou l'exploitant le disent ;
 * un identifiant Wikidata d'une autre marque l'emporte (club écarté).
 */
export function isFitnessPark(
  tags: Readonly<Record<string, string | undefined>>
): boolean {
  const wikidata = tags['brand:wikidata']
  if (wikidata) return wikidata === FITNESS_PARK_WIKIDATA
  return ['brand', 'name', 'operator'].some(key => {
    const value = tags[key]
    return value ? /\bfitness ?park\b/.test(foldText(value)) : false
  })
}

// ---------------------------------------------------------------------------
// Quartier d'un point
// ---------------------------------------------------------------------------

/** Un contour proche d'un point : 0 m s'il le contient. */
export interface NeighbourhoodHit extends Neighbourhood {
  distanceMeters: number
}

const KIND_PRIORITY: Record<NeighbourhoodKind, number> = {
  quartier: 0,
  iris: 1,
  commune: 2,
}

/**
 * Le quartier d'une annonce : le contour qui contient son point, quartier
 * officiel d'abord, puis IRIS (les IRIS sont importés partout et ne servent
 * qu'à défaut de quartier officiel, par exemple dans un interstice), puis
 * commune entière. « À vérifier » quand la localisation est approchée (centre
 * de la commune, quartier du géocodeur), quand deux contours de même nature
 * contiennent le point, ou quand une adresse à la rue passe à moins de
 * `NEIGHBOURHOOD_BORDER_METERS` d'un autre contour de même nature (le point
 * BAN d'une rue est son milieu).
 */
export function neighbourhoodLookup(input: {
  point: Point | null
  precision: LocationPrecision | null
  imported: number
  hits: readonly NeighbourhoodHit[]
}): NeighbourhoodLookup {
  if (!input.point) {
    return {
      status: 'not_applicable',
      value: null,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
  }
  if (input.imported === 0) {
    return {
      status: 'unavailable',
      value: null,
      reasons: ['Contours des quartiers non importés : non disponible.'],
    }
  }
  const containing = input.hits
    .filter(hit => hit.distanceMeters === 0)
    .sort(
      (a, b) =>
        KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
        a.name.localeCompare(b.name, 'fr')
    )
  const found = containing[0]
  if (!found) {
    return {
      status: 'not_applicable',
      value: null,
      reasons: [
        'Point hors des quartiers importés (hors de Bordeaux Métropole ?).',
      ],
    }
  }
  const { distanceMeters: _distance, ...value } = found
  const reasons: string[] = []
  if (input.precision === 'commune' || input.precision === 'district') {
    reasons.push(
      input.precision === 'commune'
        ? 'Annonce placée au centre de la commune : quartier indicatif.'
        : 'Annonce localisée au quartier par le géocodeur : contour indicatif.'
    )
  }
  const sameKind = containing.filter(hit => hit.kind === found.kind)
  const others = input.hits.filter(
    hit =>
      hit.kind === found.kind &&
      hit.code !== found.code &&
      hit.distanceMeters <= NEIGHBOURHOOD_BORDER_METERS
  )
  if (sameKind.length > 1) {
    reasons.push(
      `Point dans plusieurs contours (${sameKind.map(h => h.name).join(', ')}) : à vérifier.`
    )
  } else if (input.precision === 'street' && others[0]) {
    reasons.push(
      `Adresse à la rue, à moins de ${NEIGHBOURHOOD_BORDER_METERS} m de « ${others[0].name} » : quartier à vérifier.`
    )
  }
  return { status: reasons.length ? 'to_verify' : 'ok', value, reasons }
}

// ---------------------------------------------------------------------------
// Équipements les plus proches
// ---------------------------------------------------------------------------

const withinKm = (meters: number): string =>
  `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`

/**
 * Le plus proche équipement d'un genre (piste d'athlétisme, Fitness Park) :
 * sans objet sans point, non disponible si la source n'est pas importée,
 * « aucun dans le rayon » sinon.
 */
export function amenityLookup(input: {
  point: Point | null
  imported: number
  nearest: NearbyAmenity | null
  radiusMeters?: number
  /** « piste d’athlétisme », « salle Fitness Park » : pour les raisons. */
  noun: string
  /** Le libellé de la source, pour « non importées ». */
  sourceLabel: string
}): AmenityLookup {
  const radius = input.radiusMeters ?? AMENITY_SEARCH_METERS
  if (!input.point) {
    return {
      status: 'not_applicable',
      nearest: null,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
  }
  if (input.imported === 0) {
    return {
      status: 'unavailable',
      nearest: null,
      reasons: [`${input.sourceLabel} : source non importée, non disponible.`],
    }
  }
  if (!input.nearest) {
    return {
      status: 'ok',
      nearest: null,
      reasons: [
        `Aucune ${input.noun} à moins de ${withinKm(radius)} à vol d’oiseau.`,
      ],
    }
  }
  return { status: 'ok', nearest: input.nearest, reasons: [] }
}

const byDistance = (a: NearbyAmenity, b: NearbyAmenity): number =>
  a.distanceMeters - b.distanceMeters ||
  brandRank(a.brandGroup) - brandRank(b.brandGroup) ||
  a.name.localeCompare(b.name, 'fr')

/**
 * Le drive le plus proche parmi des candidats : un drive signalé d'abord,
 * un drive « à vérifier » seulement s'il n'y en a aucun de signalé.
 */
export function nearestDrive(
  candidates: readonly NearbyAmenity[]
): NearbyAmenity | null {
  const sorted = [...candidates].sort(byDistance)
  return (
    sorted.find(c => c.drive === 'yes') ??
    sorted.find(c => c.drive === 'to_verify') ??
    null
  )
}

/**
 * Les supermarchés avec drive : le plus proche de chaque enseigne préférée
 * (Carrefour, Auchan, Intermarché), puis le plus proche toutes enseignes
 * confondues ; drive signalé d'abord, « à vérifier » faute de mieux.
 */
export function supermarketsLookup(input: {
  point: Point | null
  imported: number
  candidates: readonly NearbyAmenity[]
  radiusMeters?: number
}): SupermarketsLookup {
  const radius = input.radiusMeters ?? AMENITY_SEARCH_METERS
  const none = { carrefour: null, auchan: null, intermarche: null }
  if (!input.point) {
    return {
      status: 'not_applicable',
      preferred: none,
      nearest: null,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
  }
  if (input.imported === 0) {
    return {
      status: 'unavailable',
      preferred: none,
      nearest: null,
      reasons: [
        'Supermarchés avec drive : source non importée, non disponible.',
      ],
    }
  }
  const inRadius = input.candidates.filter(c => c.distanceMeters <= radius)
  const preferred = {
    carrefour: nearestDrive(inRadius.filter(c => c.brandGroup === 'carrefour')),
    auchan: nearestDrive(inRadius.filter(c => c.brandGroup === 'auchan')),
    intermarche: nearestDrive(
      inRadius.filter(c => c.brandGroup === 'intermarche')
    ),
  }
  const reasons = PREFERRED_SUPERMARKET_BRANDS.filter(
    brand => preferred[brand] === null
  ).map(
    brand =>
      `Aucun drive ${SUPERMARKET_BRAND_LABELS[brand]} à moins de ${withinKm(radius)} à vol d’oiseau.`
  )
  const nearest = nearestDrive(inRadius)
  if (!nearest) {
    reasons.push(
      `Aucun supermarché avec drive à moins de ${withinKm(radius)} à vol d’oiseau.`
    )
  }
  return { status: 'ok', preferred, nearest, reasons }
}

/** Ce que le journal garde d'un calcul : quartier, distances, drive le plus proche. */
export function surroundingsDigest(s: Surroundings): {
  neighbourhood: string | null
  athleticsTrackMeters: number | null
  nearestDrive: string | null
  fitnessParkMeters: number | null
} {
  return {
    neighbourhood: s.neighbourhood.value?.name ?? null,
    athleticsTrackMeters: s.athleticsTrack.nearest?.distanceMeters ?? null,
    nearestDrive: s.supermarkets.nearest?.name ?? null,
    fitnessParkMeters: s.fitnessPark.nearest?.distanceMeters ?? null,
  }
}

/** Tout ce qu'une annonce reçoit du lot 11, à partir des lectures du module geo. */
export function surroundingsOf(input: {
  point: Point | null
  precision: LocationPrecision | null
  sources: SurroundingsSources
  neighbourhoodHits: readonly NeighbourhoodHit[]
  nearestTrack: NearbyAmenity | null
  nearestFitnessPark: NearbyAmenity | null
  supermarketCandidates: readonly NearbyAmenity[]
  computedAt: string
  radiusMeters?: number
}): Surroundings {
  const radiusMeters = input.radiusMeters ?? AMENITY_SEARCH_METERS
  return {
    neighbourhood: neighbourhoodLookup({
      point: input.point,
      precision: input.precision,
      imported: input.sources.neighbourhoods,
      hits: input.neighbourhoodHits,
    }),
    athleticsTrack: amenityLookup({
      point: input.point,
      imported: input.sources.athleticsTracks,
      nearest: input.nearestTrack,
      radiusMeters,
      noun: 'piste d’athlétisme',
      sourceLabel: 'Pistes d’athlétisme',
    }),
    supermarkets: supermarketsLookup({
      point: input.point,
      imported: input.sources.supermarketDrives,
      candidates: input.supermarketCandidates,
      radiusMeters,
    }),
    fitnessPark: amenityLookup({
      point: input.point,
      imported: input.sources.fitnessParks,
      nearest: input.nearestFitnessPark,
      radiusMeters,
      noun: 'salle Fitness Park',
      sourceLabel: 'Salles Fitness Park',
    }),
    searchRadiusMeters: radiusMeters,
    computedAt: input.computedAt,
  }
}
