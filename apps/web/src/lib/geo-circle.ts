import type { Point, Polygon } from '@apart/contracts'

/**
 * Un cercle approché en polygone GeoJSON (64 côtés), pour dessiner le rayon
 * du filtre sur la carte. Approximation d'affichage sur la sphère : le filtre
 * lui-même est calculé par PostGIS côté serveur, jamais ici.
 */
export function circlePolygon(
  center: Point,
  radiusMeters: number,
  steps = 64
): Polygon {
  const [lng, lat] = center.coordinates
  const earth = 6_371_008.8
  const latRad = (lat * Math.PI) / 180
  const dLat = (radiusMeters / earth) * (180 / Math.PI)
  const dLng = dLat / Math.max(Math.cos(latRad), 1e-9)
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)])
  }
  const first = ring[0]
  if (first) ring[ring.length - 1] = [first[0], first[1]]
  return { type: 'Polygon', coordinates: [ring] }
}
