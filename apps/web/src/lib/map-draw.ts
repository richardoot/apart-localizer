/**
 * Lot 26 (ADR 0036) : les textes et petites règles des cartes, purs.
 * Au toucher (iPhone), « Touche » ; à la souris, « Clique ». Le filtre de
 * rayon de la carte des annonces ne se pose plus par n'importe quel clic :
 * un bouton ouvre le placement, le clic suivant pose le point.
 */

/** Le mode de dessin de la carte d'un critère (`null` : rien à dessiner). */
export type CriteriaDrawMode = 'polygon' | 'circle' | 'pick' | null

/** La requête média d'un pointeur grossier (doigt) : iPhone, tablette. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** Le verbe du geste, à l'impératif, avec sa majuscule si demandé. */
function verb(coarse: boolean, capital = true): string {
  const word = coarse ? 'touche' : 'clique'
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

/** L'aide sous la carte d'un critère, selon le mode et le pointeur. */
export function criteriaDrawHint(
  mode: CriteriaDrawMode,
  coarse: boolean
): string {
  switch (mode) {
    case 'polygon':
      return `${verb(coarse)} pour poser les sommets, puis ${verb(coarse, false)} le premier ou le dernier pour fermer le polygone ; fais glisser un sommet pour le modifier.`
    case 'circle':
      return `${verb(coarse)} au centre, puis à la distance voulue.`
    case 'pick':
      return `${verb(coarse)} la carte pour placer le point, ou cherche une adresse et choisis « Placer le point ici ».`
    default:
      return coarse
        ? 'Le périmètre du critère. Deux doigts pour déplacer la carte.'
        : 'Le périmètre du critère.'
  }
}

/** L'aide du placement du point de la carte des annonces. */
export function placingHint(coarse: boolean): string {
  return `${verb(coarse)} la carte à l’endroit voulu.`
}

/** Une coordonnée arrondie au millionième de degré (une dizaine de centimètres). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Combien de couches de contexte sont allumées (« Couches (2) »). */
export function activeLayerCount(toggles: object): number {
  return Object.values(toggles).filter(value => value === true).length
}

/** Le libellé du bouton des couches : « Couches et légende » ou « Couches et légende (2) ». */
export function layersButtonLabel(count: number): string {
  return count > 0 ? `Couches et légende (${count})` : 'Couches et légende'
}
