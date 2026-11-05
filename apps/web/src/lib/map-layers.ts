import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import {
  AMENITY_KIND_LABELS,
  AMENITY_SOURCE_ATTRIBUTIONS,
  DRIVE_STATUS_LABELS,
  NEIGHBOURHOOD_KIND_LABELS,
  PREFERRED_SUPERMARKET_BRANDS,
  SUPERMARKET_BRAND_LABELS,
  TRANSIT_MODE_LABELS,
} from '@apart/contracts'
import type {
  AmenityKind,
  AmenitySource,
  DriveStatus,
  LayerFeatureCollection,
  NeighbourhoodKind,
  SupermarketBrandGroup,
  TransitMode,
} from '@apart/contracts'
import { OVERLAY_METADATA_KEY } from './base-maps'
import {
  formatDate,
  formatEuros,
  formatEurosPerM2,
  formatSurface,
} from './format'

/** Une collection vide, pour éteindre une couche sans la retirer. */
export const EMPTY_COLLECTION = {
  type: 'FeatureCollection' as const,
  features: [] as unknown[],
}

/** Couleurs des zones d'encadrement (1 à 4). */
export const RENT_ZONE_COLORS: Record<number, string> = {
  1: '#b45309',
  2: '#d97706',
  3: '#0e6b63',
  4: '#2563eb',
}

export interface LayerStyle {
  id: string
  type: 'fill' | 'line' | 'circle'
  paint: Record<string, unknown>
  layout?: Record<string, unknown>
  /** Expression de filtre MapLibre : plusieurs couches d'une même source. */
  filter?: unknown
}

/**
 * Le liseré clair sous un contour : il le détache d'un fond sombre (photo
 * aérienne) sans gêner sur un plan clair.
 */
export const HALO_COLOR = '#ffffff'

/** Un périmètre : remplissage léger, liseré clair, contour de la couleur voulue. */
export function perimeterLayers(
  prefix: string,
  color: string,
  options: { dashed?: boolean; selectable?: boolean } = {}
): LayerStyle[] {
  const selected = (on: number, off: number): unknown =>
    options.selectable ? ['case', ['get', 'selected'], on, off] : on
  return [
    {
      id: `${prefix}-fill`,
      type: 'fill',
      paint: { 'fill-color': color, 'fill-opacity': selected(0.14, 0.05) },
    },
    {
      id: `${prefix}-halo`,
      type: 'line',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': HALO_COLOR,
        'line-opacity': 0.85,
        'line-width': selected(5, 3.5),
      },
    },
    {
      id: `${prefix}-line`,
      type: 'line',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': selected(3, 1.5),
        ...(options.dashed ? { 'line-dasharray': [2, 1] } : {}),
      },
    },
  ]
}

/**
 * Pose ou met à jour une source GeoJSON et ses couches : une source par
 * couche de contexte, des données vides quand la couche est éteinte. Les
 * couches sont marquées comme couches de l'application (`metadata`) : un
 * changement de fond les recopie avec leurs données (lib/base-maps.ts).
 */
export function upsertGeoJsonLayer(
  map: MapLibreMap,
  sourceId: string,
  data: unknown,
  layers: readonly LayerStyle[],
  /** Attribution de la source (licence), affichée par la carte. */
  attribution?: string
): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  const geojson = (data ?? EMPTY_COLLECTION) as Parameters<
    GeoJSONSource['setData']
  >[0]
  if (source) {
    source.setData(geojson)
    return
  }
  map.addSource(sourceId, {
    type: 'geojson',
    data: geojson,
    ...(attribution ? { attribution } : {}),
  })
  for (const layer of layers) {
    map.addLayer({
      id: layer.id,
      type: layer.type,
      source: sourceId,
      paint: layer.paint,
      ...(layer.layout ? { layout: layer.layout } : {}),
      ...(layer.filter ? { filter: layer.filter } : {}),
      metadata: { [OVERLAY_METADATA_KEY]: true },
    } as Parameters<MapLibreMap['addLayer']>[0])
  }
}

export const CRITERIA_LAYERS: readonly LayerStyle[] = perimeterLayers(
  'criteria',
  '#0e6b63',
  { dashed: true, selectable: true }
)

/** La couleur d'un secteur selon sa zone (1 à 4). */
const RENT_ZONE_COLOR_BY_ZONE = [
  'match',
  ['get', 'zone'],
  1,
  RENT_ZONE_COLORS[1],
  2,
  RENT_ZONE_COLORS[2],
  3,
  RENT_ZONE_COLORS[3],
  RENT_ZONE_COLORS[4],
]

/**
 * Les secteurs de l'encadrement : remplissage léger et contour de la couleur
 * de la zone, assez épais pour se lire sur la photo aérienne.
 */
export const RENT_ZONE_LAYERS: readonly LayerStyle[] = [
  {
    id: 'rent-zones-fill',
    type: 'fill',
    paint: { 'fill-color': RENT_ZONE_COLOR_BY_ZONE, 'fill-opacity': 0.18 },
  },
  {
    id: 'rent-zones-line',
    type: 'line',
    paint: {
      'line-color': RENT_ZONE_COLOR_BY_ZONE,
      'line-width': 1.25,
      'line-opacity': 0.9,
    },
  },
]

export const pointLayer = (
  id: string,
  color: string,
  radius: number
): LayerStyle[] => [
  {
    id,
    type: 'circle',
    paint: {
      'circle-color': color,
      'circle-radius': radius,
      'circle-stroke-color': HALO_COLOR,
      'circle-stroke-width': 1.5,
    },
  },
]

// ---------------------------------------------------------------------------
// Lot 11 : équipements et quartiers
// ---------------------------------------------------------------------------

/** Couleurs des équipements ; la forme distingue en plus les enseignes préférées. */
export const AMENITY_COLORS = {
  athletics: '#c2410c',
  drives: '#15803d',
  fitness: '#be185d',
} as const

/** Contours des quartiers : trait fin et sombre, liseré clair (photo aérienne). */
export const NEIGHBOURHOOD_COLOR = '#334155'
export const NEIGHBOURHOOD_HOVER_COLOR = '#0e6b63'

/** Les contours : remplissage presque invisible (survol et clic), liseré, trait fin. */
export const NEIGHBOURHOOD_LAYERS: readonly LayerStyle[] = [
  {
    id: 'neighbourhoods-fill',
    type: 'fill',
    paint: { 'fill-color': NEIGHBOURHOOD_COLOR, 'fill-opacity': 0.02 },
  },
  {
    id: 'neighbourhoods-halo',
    type: 'line',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': HALO_COLOR,
      'line-opacity': 0.7,
      'line-width': 2.5,
    },
  },
  {
    id: 'neighbourhoods-line',
    type: 'line',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': NEIGHBOURHOOD_COLOR,
      'line-width': 1,
      'line-opacity': 0.9,
    },
  },
]

/** Le quartier survolé, mis en avant. */
export const NEIGHBOURHOOD_HOVER_LAYERS: readonly LayerStyle[] =
  perimeterLayers('neighbourhood-hover', NEIGHBOURHOOD_HOVER_COLOR)

/** Le quartier de l'annonce, sur la carte du quartier de la fiche. */
export const NEIGHBOURHOOD_CURRENT_LAYERS: readonly LayerStyle[] =
  perimeterLayers('neighbourhood-current', NEIGHBOURHOOD_HOVER_COLOR, {
    dashed: true,
  })

/**
 * Lot 12 : le contour du quartier d'une annonce placée au quartier, montré
 * au survol ou à la sélection de son repère (carte des annonces) et sur la
 * carte du quartier de la fiche. Posé par `upsertGeoJsonLayer` : il suit les
 * changements de fond (ADR 0020).
 */
export const LISTING_AREA_SOURCE = 'listing-area'
export const LISTING_AREA_COLOR = '#9a5b00'
export const LISTING_AREA_LAYERS: readonly LayerStyle[] = perimeterLayers(
  'listing-area',
  LISTING_AREA_COLOR,
  { dashed: true }
)

/** Le contour d'une annonce parmi ceux de `GET /listings/areas`, en collection d'un élément (ou vide). */
export function listingAreaCollection(
  areas: LayerFeatureCollection | null | undefined,
  listingId: string | null
): LayerFeatureCollection {
  const feature =
    listingId && areas
      ? areas.features.find(f => f.properties.listingId === listingId)
      : undefined
  return { type: 'FeatureCollection', features: feature ? [feature] : [] }
}

/** Au-delà de cette distance, un équipement proche n'entre pas dans le cadrage initial. */
export const FRAME_MAX_METERS = 3000

/**
 * L'emprise [[ouest, sud], [est, nord]] qui montre l'annonce et ses
 * équipements les plus proches (piste, drive, Fitness Park, tram) à moins de
 * `FRAME_MAX_METERS` ; null s'il n'y a que l'annonce.
 */
export function surroundingsFrame(context: {
  point: { coordinates: [number, number] } | null
  transit: {
    nearestTram: {
      point: { coordinates: [number, number] }
      distanceMeters: number
    } | null
  }
  surroundings: {
    athleticsTrack: {
      nearest: {
        point: { coordinates: [number, number] }
        distanceMeters: number
      } | null
    }
    supermarkets: {
      nearest: {
        point: { coordinates: [number, number] }
        distanceMeters: number
      } | null
    }
    fitnessPark: {
      nearest: {
        point: { coordinates: [number, number] }
        distanceMeters: number
      } | null
    }
  }
}): [[number, number], [number, number]] | null {
  if (!context.point) return null
  const near = [
    context.transit.nearestTram,
    context.surroundings.athleticsTrack.nearest,
    context.surroundings.supermarkets.nearest,
    context.surroundings.fitnessPark.nearest,
  ]
    .filter(a => a !== null && a.distanceMeters <= FRAME_MAX_METERS)
    .map(a => a?.point.coordinates as [number, number])
  if (near.length === 0) return null
  const all = [context.point.coordinates, ...near]
  const lngs = all.map(p => p[0])
  const lats = all.map(p => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

const PREFERRED_FILTER = [
  'in',
  ['get', 'brandGroup'],
  ['literal', [...PREFERRED_SUPERMARKET_BRANDS]],
]
/** Un drive « à vérifier » est plus pâle ; la fenêtre le dit en toutes lettres. */
const DRIVE_OPACITY = ['case', ['==', ['get', 'drive'], 'to_verify'], 0.6, 1]

/**
 * Les drives : enseignes préférées en gros disques pleins, autres enseignes
 * en petits cercles creux (la forme, pas seulement la couleur, les distingue).
 */
export const DRIVE_LAYERS: readonly LayerStyle[] = [
  {
    id: 'drives-other-points',
    type: 'circle',
    filter: ['!', PREFERRED_FILTER],
    paint: {
      'circle-color': HALO_COLOR,
      'circle-radius': 4,
      'circle-stroke-color': AMENITY_COLORS.drives,
      'circle-stroke-width': 2,
      'circle-opacity': DRIVE_OPACITY,
      'circle-stroke-opacity': DRIVE_OPACITY,
    },
  },
  {
    id: 'drives-preferred-points',
    type: 'circle',
    filter: PREFERRED_FILTER,
    paint: {
      'circle-color': AMENITY_COLORS.drives,
      'circle-radius': 7,
      'circle-stroke-color': HALO_COLOR,
      'circle-stroke-width': 2,
      'circle-opacity': DRIVE_OPACITY,
      'circle-stroke-opacity': DRIVE_OPACITY,
    },
  },
]

export const ATHLETICS_LAYERS: readonly LayerStyle[] = pointLayer(
  'athletics-points',
  AMENITY_COLORS.athletics,
  5
)

export const FITNESS_LAYERS: readonly LayerStyle[] = pointLayer(
  'fitness-points',
  AMENITY_COLORS.fitness,
  5.5
)

/** Les attributions des couches du lot 11 (licences : docs/open-data.md). */
export const SURROUNDINGS_ATTRIBUTIONS = {
  athletics: 'Ministère des Sports, © OpenStreetMap',
  osm: '© OpenStreetMap',
  neighbourhoods: 'Quartiers : Bordeaux Métropole, IGN-INSEE',
} as const

/** Les couches ponctuelles qui ouvrent une fiche au clic (arrêts, ventes, équipements). */
export const POPUP_LAYER_IDS = [
  'tram-stops-points',
  'bus-stops-points',
  'dvf-sales-points',
  'athletics-points',
  'drives-preferred-points',
  'drives-other-points',
  'fitness-points',
] as const

/** La couche des contours, pour le survol et le clic. */
export const NEIGHBOURHOOD_HIT_LAYER = 'neighbourhoods-fill'

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

/** La source du quartier survolé, au-dessus des contours et sous les points. */
export const NEIGHBOURHOOD_HOVER_SOURCE = 'neighbourhood-hover'

interface LayerEvent {
  point?: { x: number; y: number }
  features?: Array<{ properties?: Record<string, unknown> | null }>
}

/**
 * Le survol des contours : le quartier sous le pointeur est mis en avant
 * (son contour complet, lu dans les données de la couche et non dans la
 * tuile) et son nom remonte à la carte, qui l'affiche près du pointeur.
 */
export function bindNeighbourhoodHover(
  map: MapLibreMap,
  options: {
    features: () => {
      features: Array<{ properties: Record<string, unknown> }>
    } | null
    onHover: (
      label: string | null,
      point: { x: number; y: number } | null
    ) => void
  }
): void {
  const highlight = (feature: unknown): void => {
    upsertGeoJsonLayer(
      map,
      NEIGHBOURHOOD_HOVER_SOURCE,
      { type: 'FeatureCollection', features: feature ? [feature] : [] },
      NEIGHBOURHOOD_HOVER_LAYERS
    )
  }
  map.on('mousemove', NEIGHBOURHOOD_HIT_LAYER, (event: LayerEvent) => {
    const code = event.features?.[0]?.properties?.code
    const feature =
      options.features()?.features.find(f => f.properties.code === code) ?? null
    highlight(feature)
    options.onHover(
      feature ? neighbourhoodLabel(feature.properties) : null,
      event.point ?? null
    )
  })
  map.on('mouseleave', NEIGHBOURHOOD_HIT_LAYER, () => {
    highlight(null)
    options.onHover(null, null)
  })
}

/** Le nom d'un quartier en une ligne (survol). */
export function neighbourhoodLabel(
  properties: Record<string, unknown> | null | undefined
): string {
  const p = properties ?? {}
  const name = str(p.name) ?? 'Quartier'
  const commune = str(p.commune)
  return commune && commune !== name ? `${name} (${commune})` : name
}

/** La fenêtre d'un contour : nom, commune, nature, source. */
export function neighbourhoodPopupHtml(
  properties: Record<string, unknown> | null | undefined
): string {
  const p = properties ?? {}
  const kind =
    typeof p.kind === 'string' && p.kind in NEIGHBOURHOOD_KIND_LABELS
      ? NEIGHBOURHOOD_KIND_LABELS[p.kind as NeighbourhoodKind]
      : null
  const source = str(p.source)
  const parent = str(p.parent)
  return (
    `<strong>${escapeHtml(str(p.name) ?? 'Quartier')}</strong>` +
    (parent ? `<br>${escapeHtml(`Quartier ${parent}`)}` : '') +
    `<br>${escapeHtml([str(p.commune), kind, p.partial === true ? 'part hors des quartiers officiels' : null].filter(Boolean).join(' · '))}` +
    (source
      ? `<br><span style="opacity:.7">Source : ${escapeHtml(source)}</span>`
      : '')
  )
}

/**
 * La fenêtre d'un équipement : nom, genre, enseigne et drive, nature de la
 * piste, adresse, source. Données affichées telles qu'importées.
 */
export function amenityPopupHtml(
  properties: Record<string, unknown> | null | undefined
): string {
  const p = properties ?? {}
  const kind =
    typeof p.kind === 'string' && p.kind in AMENITY_KIND_LABELS
      ? (p.kind as AmenityKind)
      : null
  const group =
    typeof p.brandGroup === 'string' && p.brandGroup in SUPERMARKET_BRAND_LABELS
      ? (p.brandGroup as SupermarketBrandGroup)
      : null
  const drive =
    typeof p.drive === 'string' && p.drive in DRIVE_STATUS_LABELS
      ? DRIVE_STATUS_LABELS[p.drive as DriveStatus]
      : null
  const preferred =
    group !== null &&
    (PREFERRED_SUPERMARKET_BRANDS as readonly string[]).includes(group)
  const headline = [
    kind ? AMENITY_KIND_LABELS[kind] : null,
    str(p.brand),
    drive,
    preferred ? 'enseigne préférée' : null,
  ].filter(Boolean)
  const length =
    typeof p.lengthMeters === 'number' && Number.isFinite(p.lengthMeters)
      ? `${p.lengthMeters} m`
      : null
  const nature = [
    str(p.facilityType),
    p.covered === true ? 'couverte' : p.covered === false ? 'découverte' : null,
    length,
    str(p.access),
  ].filter(Boolean)
  const where = [str(p.address), str(p.commune)].filter(Boolean)
  const source =
    typeof p.source === 'string' && p.source in AMENITY_SOURCE_ATTRIBUTIONS
      ? AMENITY_SOURCE_ATTRIBUTIONS[p.source as AmenitySource]
      : null
  return (
    `<strong>${escapeHtml(str(p.name) ?? 'Équipement')}</strong>` +
    (headline.length ? `<br>${escapeHtml(headline.join(' · '))}` : '') +
    (nature.length ? `<br>${escapeHtml(nature.join(' · '))}` : '') +
    (where.length
      ? `<br><span style="opacity:.7">${escapeHtml(where.join(', '))}</span>`
      : '') +
    (source
      ? `<br><span style="opacity:.7">Source : ${escapeHtml(source)}</span>`
      : '')
  )
}

/**
 * Le contenu de la fenêtre d'un arrêt ou d'une vente DVF de la carte : nom et
 * lignes, ou date, prix, surface et prix au m² de la vente. Données affichées
 * telles qu'importées ; aucune n'est calculée ici.
 */
export function layerFeaturePopupHtml(feature: {
  layer?: { id: string }
  properties?: Record<string, unknown> | null
}): string {
  const esc = (value: unknown): string =>
    String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  const p = feature.properties ?? {}
  if (typeof p.kind === 'string' && p.kind in AMENITY_KIND_LABELS) {
    return amenityPopupHtml(p)
  }
  if (feature.layer?.id === NEIGHBOURHOOD_HIT_LAYER) {
    return neighbourhoodPopupHtml(p)
  }
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  if (feature.layer?.id === 'dvf-sales-points') {
    const price = num(p.price)
    const surface = num(p.surface)
    const perM2 = num(p.pricePerM2)
    const details = [
      price !== null ? formatEuros(price) : null,
      surface !== null ? formatSurface(surface) : null,
      perM2 !== null ? formatEurosPerM2(perM2) : null,
      num(p.rooms) !== null ? `${num(p.rooms)} p.` : null,
    ].filter(Boolean)
    return (
      `<strong>Vente DVF du ${esc(formatDate(typeof p.date === 'string' ? p.date : null))}</strong>` +
      (details.length ? `<br>${esc(details.join(' · '))}` : '') +
      (typeof p.address === 'string' && p.address
        ? `<br><span style="opacity:.7">${esc(p.address)}</span>`
        : '')
    )
  }
  const mode =
    typeof p.mode === 'string' && p.mode in TRANSIT_MODE_LABELS
      ? TRANSIT_MODE_LABELS[p.mode as TransitMode]
      : 'Arrêt'
  const lines = typeof p.lines === 'string' && p.lines ? p.lines : null
  return (
    `<strong>${esc(typeof p.name === 'string' ? p.name : 'Arrêt')}</strong>` +
    `<br>${esc(mode)}${lines ? ` · ${esc(lines)}` : ''}`
  )
}
