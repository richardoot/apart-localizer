import { z } from 'zod'
import { OpenDataStatusSchema } from './enums.js'
import { PointSchema } from './geojson.js'

/**
 * Équipements et quartiers (lot 11, besoins D8 à D11) : pistes
 * d'athlétisme, supermarchés avec drive, salles Fitness Park et contours des
 * quartiers de Bordeaux Métropole, importés par les scripts (sources
 * ouvertes, docs/open-data.md). Les distances sont en mètres, à vol
 * d'oiseau, calculées par PostGIS (module geo). Une source non importée rend
 * « non disponible », jamais une valeur inventée.
 */

/** Le territoire des contours de quartiers importés. */
export const NEIGHBOURHOOD_TERRITORY = 'bordeaux_metropole'

/** Distance maximale de recherche d'un équipement, en mètres (à vol d'oiseau). */
export const AMENITY_SEARCH_METERS = 20_000

/**
 * Tolérance de limite de quartier, en mètres : une adresse à la rue (point
 * BAN au milieu de la voie) à moins de cette distance d'un autre quartier
 * rend le quartier « à vérifier ».
 */
export const NEIGHBOURHOOD_BORDER_METERS = 30

// ---------------------------------------------------------------------------
// Équipements
// ---------------------------------------------------------------------------

export const AmenityKindSchema = z
  .enum(['athletics_track', 'supermarket_drive', 'fitness_park'])
  .describe(
    'Genre d’équipement : piste d’athlétisme, supermarché avec drive, salle Fitness Park'
  )
export type AmenityKind = z.infer<typeof AmenityKindSchema>

export const AMENITY_KIND_LABELS: Record<AmenityKind, string> = {
  athletics_track: 'Piste d’athlétisme',
  supermarket_drive: 'Supermarché avec drive',
  fitness_park: 'Salle Fitness Park',
}

export const AmenitySourceSchema = z
  .enum(['res', 'osm'])
  .describe(
    'Source : recensement des équipements sportifs du ministère des Sports (res) ou OpenStreetMap (osm)'
  )
export type AmenitySource = z.infer<typeof AmenitySourceSchema>

export const AMENITY_SOURCE_LABELS: Record<AmenitySource, string> = {
  res: 'Recensement des équipements sportifs (ministère des Sports)',
  osm: 'OpenStreetMap',
}

/** Attribution à afficher avec une donnée de la source (licence). */
export const AMENITY_SOURCE_ATTRIBUTIONS: Record<AmenitySource, string> = {
  res: 'Ministère des Sports, Data ES (Licence Ouverte)',
  osm: '© contributeurs OpenStreetMap (ODbL)',
}

export const SupermarketBrandGroupSchema = z
  .enum(['carrefour', 'auchan', 'intermarche', 'other'])
  .describe(
    'Groupe d’enseigne : Carrefour, Auchan, Intermarché (toutes déclinaisons) ou autre'
  )
export type SupermarketBrandGroup = z.infer<typeof SupermarketBrandGroupSchema>

/** Les enseignes préférées, dans l'ordre d'affichage. */
export const PREFERRED_SUPERMARKET_BRANDS = [
  'carrefour',
  'auchan',
  'intermarche',
] as const satisfies readonly SupermarketBrandGroup[]
export type PreferredSupermarketBrand =
  (typeof PREFERRED_SUPERMARKET_BRANDS)[number]

export const SUPERMARKET_BRAND_LABELS: Record<SupermarketBrandGroup, string> = {
  carrefour: 'Carrefour',
  auchan: 'Auchan',
  intermarche: 'Intermarché',
  other: 'Autre enseigne',
}

export const DriveStatusSchema = z
  .enum(['yes', 'to_verify'])
  .describe(
    'Drive : signalé explicitement par la source (yes) ou donnée ambiguë (to_verify) ; un magasin sans signal n’est pas retenu'
  )
export type DriveStatus = z.infer<typeof DriveStatusSchema>

export const DRIVE_STATUS_LABELS: Record<DriveStatus, string> = {
  yes: 'Drive',
  to_verify: 'Drive à vérifier',
}

/** Les attributs propres au genre d'équipement, tels que la source les donne. */
export const AmenityDetailsSchema = z.object({
  facilityType: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'Type d’équipement selon la source (« Piste d’athlétisme isolée », « leisure=track »)'
    ),
  covered: z
    .boolean()
    .nullable()
    .default(null)
    .describe('Couvert (true), découvert (false) ou inconnu (null)'),
  lengthMeters: z
    .number()
    .positive()
    .nullable()
    .default(null)
    .describe('Longueur de la piste en mètres, si la source la donne'),
  lanes: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(null)
    .describe('Nombre de couloirs, si la source le donne'),
  surfaceType: z
    .string()
    .nullable()
    .default(null)
    .describe('Revêtement, si la source le donne'),
  access: z
    .array(z.string())
    .default([])
    .describe(
      'Accès et publics déclarés par la source (accès libre, scolaires, clubs…)'
    ),
  driveEvidence: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'Ce qui, dans la source, signale le drive (nom, étiquette OpenStreetMap)'
    ),
  sourceUrl: z
    .string()
    .url()
    .nullable()
    .default(null)
    .describe('Fiche de l’objet à la source (OpenStreetMap, Data ES)'),
})
export type AmenityDetails = z.infer<typeof AmenityDetailsSchema>

/** Un équipement proche d'un point : ce que la source dit, et sa distance. */
export const NearbyAmenitySchema = z.object({
  kind: AmenityKindSchema,
  name: z.string().describe('Nom de l’équipement ou du magasin'),
  brand: z
    .string()
    .nullable()
    .describe('Enseigne telle que la source la nomme (« Carrefour Market »)'),
  brandGroup: SupermarketBrandGroupSchema.nullable(),
  drive: DriveStatusSchema.nullable(),
  address: z.string().nullable().describe('Adresse, si la source la donne'),
  commune: z.string().nullable(),
  distanceMeters: z
    .number()
    .min(0)
    .describe("Distance à vol d'oiseau en mètres (PostGIS)"),
  point: PointSchema,
  source: AmenitySourceSchema,
  externalId: z.string().describe('Identifiant dans la source'),
  details: AmenityDetailsSchema,
})
export type NearbyAmenity = z.infer<typeof NearbyAmenitySchema>

// ---------------------------------------------------------------------------
// Quartiers
// ---------------------------------------------------------------------------

export const NeighbourhoodKindSchema = z
  .enum(['quartier', 'iris', 'commune'])
  .describe(
    'Nature du contour : quartier officiel de la commune, IRIS de l’INSEE à défaut, ou commune entière'
  )
export type NeighbourhoodKind = z.infer<typeof NeighbourhoodKindSchema>

export const NEIGHBOURHOOD_KIND_LABELS: Record<NeighbourhoodKind, string> = {
  quartier: 'Quartier',
  iris: 'IRIS',
  commune: 'Commune entière',
}

export const NeighbourhoodSchema = z.object({
  name: z.string().describe('Nom du quartier (« IRIS … » pour un IRIS)'),
  kind: NeighbourhoodKindSchema,
  code: z.string().describe('Identifiant dans la source (code IRIS…)'),
  parent: z
    .string()
    .nullable()
    .describe(
      'Quartier plus large qui le contient, si la source le donne (quartier administratif d’un secteur de vie de Bordeaux)'
    ),
  commune: z.string(),
  inseeCode: z.string().length(5),
  source: z.string().describe('Provenance du contour (jeu, producteur)'),
})
export type Neighbourhood = z.infer<typeof NeighbourhoodSchema>

// ---------------------------------------------------------------------------
// Ce qu'une annonce reçoit : quartier et équipements les plus proches
// ---------------------------------------------------------------------------

const reasons = z
  .array(z.string())
  .describe('Pourquoi la valeur est absente, à vérifier ou sans objet')

export const NeighbourhoodLookupSchema = z.object({
  status: OpenDataStatusSchema,
  value: NeighbourhoodSchema.nullable().describe(
    'Le quartier qui contient le point'
  ),
  reasons,
})
export type NeighbourhoodLookup = z.infer<typeof NeighbourhoodLookupSchema>

/** Lot 12 : distances mesurées depuis un repère approché (centre du quartier ou de la commune). */
const approximate = z
  .boolean()
  .default(false)
  .describe(
    'Vrai si la distance part d’un repère approché (centre du quartier, lieu-dit ou centre de la commune) : à lire « ≈ »'
  )

export const AmenityLookupSchema = z.object({
  status: OpenDataStatusSchema,
  nearest: NearbyAmenitySchema.nullable().describe(
    'Le plus proche à vol d’oiseau, dans le rayon de recherche'
  ),
  approximate,
  reasons,
})
export type AmenityLookup = z.infer<typeof AmenityLookupSchema>

export const SupermarketsLookupSchema = z.object({
  status: OpenDataStatusSchema,
  preferred: z
    .object({
      carrefour: NearbyAmenitySchema.nullable(),
      auchan: NearbyAmenitySchema.nullable(),
      intermarche: NearbyAmenitySchema.nullable(),
    })
    .describe(
      'Le drive le plus proche de chaque enseigne préférée (drive confirmé d’abord, « à vérifier » faute de mieux)'
    ),
  nearest: NearbyAmenitySchema.nullable().describe(
    'Le drive le plus proche toutes enseignes confondues (même règle)'
  ),
  approximate,
  reasons,
})
export type SupermarketsLookup = z.infer<typeof SupermarketsLookupSchema>

export const SurroundingsSchema = z.object({
  neighbourhood: NeighbourhoodLookupSchema,
  athleticsTrack: AmenityLookupSchema,
  supermarkets: SupermarketsLookupSchema,
  fitnessPark: AmenityLookupSchema,
  searchRadiusMeters: z
    .number()
    .int()
    .positive()
    .describe("Rayon de recherche des équipements, à vol d'oiseau, en mètres"),
  computedAt: z.string().datetime(),
})
export type Surroundings = z.infer<typeof SurroundingsSchema>

/** Le nombre d'objets importés par source de données (santé des imports). */
export const SurroundingsSourcesSchema = z.object({
  neighbourhoods: z.number().int().min(0),
  athleticsTracks: z.number().int().min(0),
  supermarketDrives: z.number().int().min(0),
  fitnessParks: z.number().int().min(0),
})
export type SurroundingsSources = z.infer<typeof SurroundingsSourcesSchema>

/** `GET /opendata/layers/amenities?kind=` : un genre d'équipement. */
export const AmenityLayerQuerySchema = z.object({
  kind: AmenityKindSchema,
})
export type AmenityLayerQuery = z.infer<typeof AmenityLayerQuerySchema>
