import type { TransformStyleFunction } from 'maplibre-gl'
import { mapStyleUrl } from './map-style'

/**
 * Les fonds de carte (lot 10, ADR 0020) : trois styles MapLibre sans clé,
 * partagés par les trois cartes. Le plan OpenStreetMap reste le défaut
 * (`VITE_MAP_STYLE_URL` le remplace) ; le plan IGN et la photo aérienne IGN
 * viennent de la Géoplateforme (Licence Ouverte Etalab 2.0, docs/open-data.md).
 *
 * Changer de fond passe par `map.setStyle(url, { transformStyle })` :
 * `baseMapTransform` adapte le style du fond (attribution, photo sous les
 * noms de rues) puis y recopie, au-dessus, les couches de l'application
 * (couches de contexte, périmètres, dessin terra-draw) avec leurs données.
 * Rien n'est rechargé ni redessiné à la main.
 */

export type StyleSpecification = Parameters<TransformStyleFunction>[1]
export type LayerSpecification = StyleSpecification['layers'][number]
export type SourceSpecification = StyleSpecification['sources'][string]

export const BASE_MAP_IDS = ['osm', 'ign-plan', 'ign-photo'] as const
export type BaseMapId = (typeof BASE_MAP_IDS)[number]
export const DEFAULT_BASE_MAP: BaseMapId = 'osm'

export function isBaseMapId(value: unknown): value is BaseMapId {
  return (
    typeof value === 'string' &&
    (BASE_MAP_IDS as readonly string[]).includes(value)
  )
}

/** Style vectoriel « PLAN.IGN » de la Géoplateforme : rues nommées, bâtiments. */
export const IGN_PLAN_STYLE_URL =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json'
/** Le même plan réduit aux voies et aux noms : posé sur la photo aérienne. */
export const IGN_TOPONYMS_STYLE_URL =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/toponymes.json'
/**
 * Orthophotographies IGN en WMTS, grille Pseudo-Mercator (`PM_0_19`, niveaux
 * 0 à 19, JPEG), lues par MapLibre comme des tuiles XYZ.
 */
export const IGN_ORTHO_TILE_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM_0_19' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'
export const IGN_ORTHO_MAX_ZOOM = 19

const IGN_LINK =
  '<a href="https://cartes.gouv.fr/" target="_blank" rel="noopener">'
export const IGN_PLAN_ATTRIBUTION = `${IGN_LINK}© IGN – Plan IGN</a>`
export const IGN_ORTHO_ATTRIBUTION = `${IGN_LINK}© IGN – Photographies aériennes</a>`

/** Source et couche de la photo aérienne, sous les noms de rues. */
export const ORTHO_SOURCE_ID = 'ign-orthophotos'

export interface BaseMapDefinition {
  id: BaseMapId
  /** Libellé du bouton. */
  label: string
  /** Libellé court, sur un écran étroit. */
  shortLabel: string
  /** Ce que montre le fond (infobulle). */
  description: string
  /** Attribution posée sur les sources vectorielles qui n'en portent pas. */
  attribution: string | null
  /** Photo aérienne glissée sous les couches du style (fond hybride). */
  photo: boolean
}

export const BASE_MAPS: readonly BaseMapDefinition[] = [
  {
    id: 'osm',
    label: 'Plan OSM',
    shortLabel: 'Plan OSM',
    description:
      'Plan OpenStreetMap (OpenFreeMap) : rues et bâtiments en zoomant',
    attribution: null,
    photo: false,
  },
  {
    id: 'ign-plan',
    label: 'Plan IGN',
    shortLabel: 'Plan IGN',
    description: 'Plan IGN : noms de rues, bâtiments, parcs et voies ferrées',
    attribution: IGN_PLAN_ATTRIBUTION,
    photo: false,
  },
  {
    id: 'ign-photo',
    label: 'Photo aérienne',
    shortLabel: 'Photo',
    description:
      'Photographies aériennes de l’IGN, avec les voies et les noms de rues',
    attribution: IGN_PLAN_ATTRIBUTION,
    photo: true,
  },
]

export function baseMapDefinition(id: BaseMapId): BaseMapDefinition {
  return (
    BASE_MAPS.find(base => base.id === id) ??
    (BASE_MAPS[0] as BaseMapDefinition)
  )
}

/** L'URL du style d'un fond ; celle du plan OSM suit `VITE_MAP_STYLE_URL`. */
export function baseMapStyleUrl(
  id: BaseMapId,
  env: { VITE_MAP_STYLE_URL?: string | undefined }
): string {
  if (id === 'ign-plan') return IGN_PLAN_STYLE_URL
  if (id === 'ign-photo') return IGN_TOPONYMS_STYLE_URL
  return mapStyleUrl(env)
}

/**
 * Marque des couches de l'application dans leur `metadata` : elles survivent
 * à un changement de fond. Les couches de terra-draw portent le préfixe
 * `TERRA_DRAW_PREFIX` (option `prefixId` de l'adaptateur).
 */
export const OVERLAY_METADATA_KEY = 'apart:overlay'
export const TERRA_DRAW_PREFIX = 'apart-draw'

export function isOverlayLayer(layer: LayerSpecification): boolean {
  const metadata = (layer as { metadata?: unknown }).metadata
  const marked =
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as Record<string, unknown>)[OVERLAY_METADATA_KEY] === true
  return marked || layer.id.startsWith(`${TERRA_DRAW_PREFIX}-`)
}

/** Les couches de l'application d'un style, dans leur ordre, et leurs sources. */
export function overlaysOf(style: StyleSpecification | undefined): {
  sources: Record<string, SourceSpecification>
  layers: LayerSpecification[]
} {
  const layers = (style?.layers ?? []).filter(isOverlayLayer)
  const sources: Record<string, SourceSpecification> = {}
  for (const layer of layers) {
    const sourceId = (layer as { source?: unknown }).source
    const source =
      typeof sourceId === 'string' ? style?.sources[sourceId] : undefined
    if (typeof sourceId === 'string' && source) sources[sourceId] = source
  }
  return { sources, layers }
}

/** Le style d'un fond tel qu'affiché : attribution IGN, photo sous les voies. */
export function adaptBaseStyle(
  base: BaseMapDefinition,
  next: StyleSpecification
): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {}
  for (const [id, source] of Object.entries(next.sources)) {
    const attributed = source as { type: string; attribution?: string }
    sources[id] =
      base.attribution &&
      attributed.type === 'vector' &&
      !attributed.attribution
        ? ({ ...source, attribution: base.attribution } as SourceSpecification)
        : source
  }
  if (!base.photo) return { ...next, sources }
  sources[ORTHO_SOURCE_ID] = {
    type: 'raster',
    tiles: [IGN_ORTHO_TILE_URL],
    tileSize: 256,
    minzoom: 0,
    maxzoom: IGN_ORTHO_MAX_ZOOM,
    attribution: IGN_ORTHO_ATTRIBUTION,
  }
  const photo: LayerSpecification = {
    id: ORTHO_SOURCE_ID,
    type: 'raster',
    source: ORTHO_SOURCE_ID,
  }
  return {
    ...next,
    sources,
    layers: [photo, ...next.layers.filter(l => l.id !== ORTHO_SOURCE_ID)],
  }
}

/**
 * Le `transformStyle` d'un fond : son style adapté, puis par-dessus les
 * couches de l'application recopiées du style précédent (données
 * comprises). Sans état : MapLibre peut l'appeler deux fois pour un même
 * changement (diff impossible, reconstruction complète).
 */
export function baseMapTransform(
  base: BaseMapDefinition
): TransformStyleFunction {
  return (previous, next) => {
    const adapted = adaptBaseStyle(base, next)
    const overlays = overlaysOf(previous)
    const overlayIds = new Set(overlays.layers.map(layer => layer.id))
    return {
      ...adapted,
      sources: { ...adapted.sources, ...overlays.sources },
      layers: [
        ...adapted.layers.filter(layer => !overlayIds.has(layer.id)),
        ...overlays.layers,
      ],
    }
  }
}
