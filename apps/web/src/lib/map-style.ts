/**
 * Le fond de carte : une URL de style MapLibre sans clé. Par défaut le style
 * « Liberty » d'OpenFreeMap (tuiles vectorielles OpenStreetMap, libre et
 * sans inscription) ; `VITE_MAP_STYLE_URL` le remplace (IGN Géoplateforme,
 * un style maison...).
 */
export const DEFAULT_MAP_STYLE_URL =
  'https://tiles.openfreemap.org/styles/liberty'

/** Centre et zoom initiaux : Bordeaux Métropole, Talence au milieu. */
export const DEFAULT_MAP_CENTER: [number, number] = [-0.59, 44.82]
export const DEFAULT_MAP_ZOOM = 11.5

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
