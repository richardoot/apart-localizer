/**
 * Le plan OpenStreetMap, fond par défaut : une URL de style MapLibre sans
 * clé, le style « Liberty » d'OpenFreeMap (tuiles vectorielles
 * OpenStreetMap, libre et sans inscription) ; `VITE_MAP_STYLE_URL` le
 * remplace (un style maison...). Les autres fonds sont dans base-maps.ts.
 */
export const DEFAULT_MAP_STYLE_URL =
  'https://tiles.openfreemap.org/styles/liberty'

/** Centre et zoom initiaux : Bordeaux Métropole, Talence au milieu. */
export const DEFAULT_MAP_CENTER: [number, number] = [-0.59, 44.82]
export const DEFAULT_MAP_ZOOM = 11.5

/**
 * Pour dessiner un périmètre : le centre de Bordeaux (place de la Comédie)
 * au niveau où le plan IGN nomme les rues et où les bâtiments sont tracés.
 * En dessous de `DRAW_MIN_ZOOM`, entrer en dessin recadre la carte.
 */
export const DRAW_MAP_CENTER: [number, number] = [-0.5752, 44.8427]
export const DRAW_MAP_ZOOM = 15
export const DRAW_MIN_ZOOM = 13.5
/** Zoom d'une adresse trouvée, et d'une commune (centroïde). */
export const ADDRESS_ZOOM = 16.5
export const COMMUNE_ZOOM = 13.5

/** Rayon par défaut et bornes du curseur de rayon, en mètres. */
export const DEFAULT_RADIUS_METERS = 800
export const RADIUS_STEPS: readonly number[] = [
  200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000,
]

export function mapStyleUrl(env: {
  VITE_MAP_STYLE_URL?: string | undefined
}): string {
  const url = env.VITE_MAP_STYLE_URL?.trim()
  return url ? url : DEFAULT_MAP_STYLE_URL
}
