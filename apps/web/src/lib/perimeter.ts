import type {
  Perimeter,
  PerimeterInput,
  Polygon,
  Position,
  SearchCriteriaSummary,
} from '@apart/contracts'
import { circlePolygon } from './geo-circle'

/**
 * Périmètres des critères côté carte : conversion vers GeoJSON pour
 * l'affichage, et des formes dessinées (terra-draw) vers l'entrée de l'API.
 * Affichage seulement : l'appartenance d'une annonce à un périmètre est
 * calculée par PostGIS, jamais ici.
 */

export interface PerimeterFeature {
  type: 'Feature'
  geometry: Polygon
  properties: Record<string, string | number | boolean>
}

/** Le polygone affiché d'un périmètre (un cercle approché pour point et rayon). */
export function perimeterPolygon(perimeter: Perimeter): Polygon {
  if (perimeter.type === 'point_radius') {
    return circlePolygon(
      { type: 'Point', coordinates: [perimeter.longitude, perimeter.latitude] },
      perimeter.radiusMeters
    )
  }
  return perimeter.polygon
}

/**
 * L'emprise [[ouest, sud], [est, nord]] d'un périmètre affiché, pour y
 * cadrer la carte (`fitBounds`). Cadrage d'affichage seulement.
 */
export function perimeterBounds(
  perimeter: Perimeter
): [[number, number], [number, number]] | null {
  const positions = perimeterPolygon(perimeter).coordinates.flat()
  if (!positions.length) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of positions) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}

/** Les périmètres des critères en couche, le critère choisi repéré. */
export function criteriaFeatures(
  criteria: readonly SearchCriteriaSummary[],
  selectedId: string | null | undefined
): { type: 'FeatureCollection'; features: PerimeterFeature[] } {
  return {
    type: 'FeatureCollection',
    features: criteria
      .filter(c => c.perimeter !== null)
      .map(c => ({
        type: 'Feature' as const,
        geometry: perimeterPolygon(c.perimeter as Perimeter),
        properties: {
          id: c.id,
          name: c.name,
          kind: c.perimeter?.type ?? 'polygon',
          selected: c.id === selectedId,
        },
      })),
  }
}

/** Une forme dessinée avec terra-draw (mode et propriétés) vers un périmètre d'API. */
export function drawnToPerimeter(feature: {
  geometry: { type: string; coordinates: unknown }
  properties?: Record<string, unknown>
}): PerimeterInput | null {
  if (feature.geometry.type !== 'Polygon') return null
  const rings = feature.geometry.coordinates as Position[][]
  const ring = rings[0]
  if (!ring || ring.length < 4) return null
  const radiusKm = feature.properties?.radiusKilometers
  if (feature.properties?.mode === 'circle' && typeof radiusKm === 'number') {
    // Un cercle part en point et rayon : PostGIS mesure alors la distance exacte.
    const vertices = ring.slice(0, -1)
    const longitude = vertices.reduce((s, p) => s + p[0], 0) / vertices.length
    const latitude = vertices.reduce((s, p) => s + p[1], 0) / vertices.length
    return {
      type: 'point_radius',
      longitude: round6(longitude),
      latitude: round6(latitude),
      radiusMeters: Math.max(1, Math.round(radiusKm * 1000)),
    }
  }
  const closed = rings.map(r => {
    const rounded = r.map(p => [round6(p[0]), round6(p[1])] as Position)
    const first = rounded[0] as Position
    const last = rounded[rounded.length - 1] as Position
    return first[0] === last[0] && first[1] === last[1]
      ? rounded
      : [...rounded, first]
  })
  return { type: 'polygon', polygon: { type: 'Polygon', coordinates: closed } }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Une ligne lisible pour un périmètre. */
export function describePerimeter(perimeter: Perimeter | null): string {
  if (!perimeter) return 'Sans périmètre'
  if (perimeter.type === 'point_radius') {
    return `Point et rayon de ${perimeter.radiusMeters.toLocaleString('fr-FR')} m`
  }
  if (perimeter.type === 'isochrone') {
    const mode = {
      walking: 'à pied',
      cycling: 'à vélo',
      driving: 'en voiture',
    }[perimeter.params.mode]
    return `Isochrone ${perimeter.params.durationMinutes} min ${mode}${perimeter.params.originLabel ? ` depuis ${perimeter.params.originLabel}` : ''}`
  }
  return 'Polygone dessiné'
}
