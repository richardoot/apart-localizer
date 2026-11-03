import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { TRANSIT_MODE_LABELS } from '@apart/contracts'
import type { TransitMode } from '@apart/contracts'
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
}

/**
 * Pose ou met à jour une source GeoJSON et ses couches : une source par
 * couche de contexte, des données vides quand la couche est éteinte.
 */
export function upsertGeoJsonLayer(
  map: MapLibreMap,
  sourceId: string,
  data: unknown,
  layers: readonly LayerStyle[]
): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  const geojson = (data ?? EMPTY_COLLECTION) as Parameters<
    GeoJSONSource['setData']
  >[0]
  if (source) {
    source.setData(geojson)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data: geojson })
  for (const layer of layers) {
    map.addLayer({
      id: layer.id,
      type: layer.type,
      source: sourceId,
      paint: layer.paint,
    } as Parameters<MapLibreMap['addLayer']>[0])
  }
}

export const CRITERIA_LAYERS: readonly LayerStyle[] = [
  {
    id: 'criteria-fill',
    type: 'fill',
    paint: {
      'fill-color': '#0e6b63',
      'fill-opacity': ['case', ['get', 'selected'], 0.14, 0.05],
    },
  },
  {
    id: 'criteria-line',
    type: 'line',
    paint: {
      'line-color': '#0e6b63',
      'line-width': ['case', ['get', 'selected'], 3, 1.5],
      'line-dasharray': [2, 1],
    },
  },
]

export const RENT_ZONE_LAYERS: readonly LayerStyle[] = [
  {
    id: 'rent-zones-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'match',
        ['get', 'zone'],
        1,
        RENT_ZONE_COLORS[1],
        2,
        RENT_ZONE_COLORS[2],
        3,
        RENT_ZONE_COLORS[3],
        RENT_ZONE_COLORS[4],
      ],
      'fill-opacity': 0.18,
    },
  },
  {
    id: 'rent-zones-line',
    type: 'line',
    paint: { 'line-color': '#78350f', 'line-width': 0.5 },
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
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  },
]

/** Les couches ponctuelles qui ouvrent une fiche au clic (arrêts, ventes). */
export const POPUP_LAYER_IDS = [
  'tram-stops-points',
  'bus-stops-points',
  'dvf-sales-points',
] as const

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
