import { z } from 'zod'
import { LocationPrecisionSchema } from './enums.js'

/**
 * Placement du repère d'une annonce (lot 12, ADR 0022) : d'où vient le point
 * et à quel point il est sûr. Hiérarchie : l'adresse géocodée au numéro
 * (`exact`) ou à la rue (`street`) ; sinon le quartier reconnu dans le champ
 * `district` parmi les contours importés de la commune (secteur de vie,
 * quartier officiel, IRIS, quartier qui regroupe des secteurs), repère au
 * centre du quartier (`ST_PointOnSurface`, précision `district`) ; sinon un
 * lieu-dit OpenStreetMap de la commune ; sinon le centre de la commune
 * (`commune`). Un point saisi à la main ou par le MCP prime toujours. Les
 * règles et les textes sont dans `domain` (placement.ts), le SQL dans le
 * module geo.
 */

export const PlacementMethodSchema = z
  .enum(['address', 'neighbourhood_match', 'osm_place', 'commune', 'manual'])
  .describe(
    'Origine du repère : adresse géocodée (numéro, rue ou lieu-dit du géocodeur), quartier reconnu dans le champ district parmi les contours importés, lieu-dit OpenStreetMap, centre de la commune, ou point saisi (carte, MCP)'
  )
export type PlacementMethod = z.infer<typeof PlacementMethodSchema>

export const PLACEMENT_METHOD_LABELS: Record<PlacementMethod, string> = {
  address: 'Adresse géocodée',
  neighbourhood_match: 'Quartier reconnu',
  osm_place: 'Lieu-dit OpenStreetMap',
  commune: 'Centre de la commune',
  manual: 'Point saisi',
}

export const PlacementAreaLevelSchema = z
  .enum(['sector', 'quartier', 'iris', 'parent', 'commune', 'place'])
  .describe(
    'Nature de la zone retenue : secteur de vie (sous-quartier), quartier officiel, IRIS (ou groupe d’IRIS de même nom), quartier qui regroupe des secteurs, commune entière, ou lieu-dit (point, sans contour)'
  )
export type PlacementAreaLevel = z.infer<typeof PlacementAreaLevelSchema>

export const PLACEMENT_AREA_LEVEL_LABELS: Record<PlacementAreaLevel, string> = {
  sector: 'secteur',
  quartier: 'quartier',
  iris: 'IRIS',
  parent: 'quartier',
  commune: 'commune',
  place: 'lieu-dit',
}

/** La zone dans laquelle le bien se trouve d'après l'annonce (contour ou lieu-dit). */
export const PlacementAreaSchema = z.object({
  level: PlacementAreaLevelSchema,
  name: z
    .string()
    .describe(
      'Nom de la zone (« Stéhélin, Monséjour », « Caudéran », « IRIS Saint-Augustin », « Les Aubiers »)'
    ),
  codes: z
    .array(z.string())
    .describe(
      'Contours importés (table neighbourhoods) dont l’union forme la zone ; vide pour un lieu-dit'
    ),
  commune: z.string().nullable(),
  inseeCode: z.string().length(5).nullable(),
  source: z
    .string()
    .describe(
      'Provenance du contour ou du lieu-dit (jeu, producteur, licence)'
    ),
  areaSquareMeters: z
    .number()
    .min(0)
    .nullable()
    .describe('Surface de la zone en m² (null pour un lieu-dit)'),
})
export type PlacementArea = z.infer<typeof PlacementAreaSchema>

/** Comment le repère de l'annonce a été placé, et pourquoi il est sûr ou non. */
export const ListingPlacementSchema = z.object({
  method: PlacementMethodSchema,
  precision: LocationPrecisionSchema.describe('Précision du repère placé'),
  matchedText: z
    .string()
    .nullable()
    .describe(
      'Le morceau du champ « quartier » de l’annonce qui a été reconnu, tel que saisi'
    ),
  area: PlacementAreaSchema.nullable().describe(
    'La zone retenue : le repère est en son centre (point intérieur au contour) ou sur le lieu-dit'
  ),
  toVerify: z
    .boolean()
    .describe(
      'Vrai si le quartier retenu est douteux (« près de », quartiers cités incompatibles, nom ambigu)'
    ),
  reasons: z
    .array(z.string())
    .describe(
      'Pourquoi ce repère : quartier reconnu, autres noms cités, noms non reconnus'
    ),
  computedAt: z.string().datetime(),
})
export type ListingPlacement = z.infer<typeof ListingPlacementSchema>

/** Ce qu'une précision approchée change aux calculs, pour l'affichage. */
export const LocationApproximationSchema = z.object({
  approximate: z
    .boolean()
    .describe(
      'Vrai si le repère est au centre d’un quartier, d’un lieu-dit ou de la commune : distances approchées'
    ),
  origin: z
    .string()
    .nullable()
    .describe(
      'D’où partent les distances : « centre du quartier Caudéran », « centre de la commune (Bordeaux) »'
    ),
  note: z
    .string()
    .nullable()
    .describe('La réserve à afficher avec les distances'),
})
export type LocationApproximation = z.infer<typeof LocationApproximationSchema>

/** Filtre de la liste par précision du repère ; `none` = annonce sans repère. */
export const LocationPrecisionFilterSchema = z
  .enum(['exact', 'street', 'district', 'commune', 'none'])
  .describe(
    'Précision du repère : adresse exacte, rue, quartier, commune seulement, ou sans repère (none)'
  )
export type LocationPrecisionFilter = z.infer<
  typeof LocationPrecisionFilterSchema
>

/** Les libellés de la précision du repère (pastille, filtre de la liste). */
export const LOCATION_PRECISION_LABELS: Record<
  LocationPrecisionFilter,
  string
> = {
  exact: 'Adresse exacte',
  street: 'À la rue',
  district: 'Au quartier',
  commune: 'Commune seulement',
  none: 'Non localisée',
}

/** `GET /listings/areas` : les contours des annonces placées au quartier, pour la carte. */
export const LISTING_AREA_SIMPLIFY_DEGREES = 0.00005

/** Les lieux-dits OpenStreetMap retenus (valeurs de `place`). */
export const OSM_PLACE_TYPES = ['neighbourhood', 'quarter', 'suburb'] as const
export type OsmPlaceType = (typeof OSM_PLACE_TYPES)[number]

export const OSM_PLACES_SOURCE_LABEL =
  'OpenStreetMap, lieux-dits (place=neighbourhood, quarter, suburb), © contributeurs OpenStreetMap (ODbL)'
