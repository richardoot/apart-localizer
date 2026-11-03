import { z } from 'zod'
import {
  DpeClassSchema,
  IsochroneModeSchema,
  ListingStatusSchema,
  PerimeterTypeSchema,
  VerdictSchema,
} from './enums.js'
import { PointRadiusSchema, PointSchema, PolygonSchema } from './geojson.js'
import { withoutDefaults } from './zod-utils.js'

/**
 * Critères de recherche enregistrés et partagés dans l'espace (besoins G3 à
 * G6) : des filtres métier et un périmètre (point et rayon, polygone dessiné,
 * isochrone figée en polygone). Le périmètre et la distance au tram sont
 * évalués en base (PostGIS, module geo) ; les autres filtres par
 * `criteriaFilterMatch` du paquet domain, appliqué à l'identique par la
 * liste, la carte, le MCP et les alertes.
 */

/** Distances maximales à un arrêt de tram acceptées par un critère, en mètres. */
export const TRAM_DISTANCE_MIN = 50
export const TRAM_DISTANCE_MAX = 5000

export const CriteriaFiltersSchema = z.object({
  communes: z
    .array(z.string().max(120))
    .max(40)
    .default([])
    .describe('Communes retenues (insensible à la casse) ; vide = toutes'),
  priceMax: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Prix affiché maximal en euros'),
  priceMin: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Prix affiché minimal en euros'),
  surfaceMin: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Surface minimale en m² (une surface inconnue ne passe pas)'),
  roomsMin: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Nombre de pièces minimal (un nombre de pièces inconnu ne passe pas)'
    ),
  dpeMax: DpeClassSchema.nullable()
    .default(null)
    .describe(
      'Classe DPE la plus basse acceptée (D = A à D) ; un DPE inconnu est retenu, à vérifier'
    ),
  verdicts: z
    .array(VerdictSchema)
    .default([])
    .describe('Verdicts financiers retenus ; vide = tous'),
  statuses: z
    .array(ListingStatusSchema)
    .default([])
    .describe(
      'Statuts retenus ; vide = statuts actifs (à étudier, à visiter, visité, offre faite, offre acceptée)'
    ),
  maxTramDistanceMeters: z
    .number()
    .int()
    .min(TRAM_DISTANCE_MIN)
    .max(TRAM_DISTANCE_MAX)
    .nullable()
    .default(null)
    .describe(
      `Distance maximale à vol d’oiseau à un arrêt de tram TBM, en mètres (${TRAM_DISTANCE_MIN} à ${TRAM_DISTANCE_MAX})`
    ),
})
export type CriteriaFilters = z.infer<typeof CriteriaFiltersSchema>
export type CriteriaFiltersInput = z.input<typeof CriteriaFiltersSchema>

/** Durée maximale d'une isochrone, en minutes. */
export const ISOCHRONE_MAX_MINUTES = 60

/** Ce que le service d'isochrones a reçu, conservé pour recalculer à l'identique. */
export const IsochroneProviderParamsSchema = z.object({
  service: z
    .string()
    .describe('Service appelé (URL de l’API isochrone de la Géoplateforme)'),
  resource: z.string().describe('Graphe utilisé (bdtopo-valhalla)'),
  profile: z.enum(['pedestrian', 'car']).describe('Profil du graphe'),
  costType: z.enum(['time', 'distance']),
  costValue: z
    .number()
    .positive()
    .describe('Valeur du coût : minutes (time) ou mètres (distance)'),
  unit: z.enum(['minute', 'meter']),
})
export type IsochroneProviderParams = z.infer<
  typeof IsochroneProviderParamsSchema
>

export const IsochroneParamsSchema = z.object({
  origin: PointSchema.describe('Point de départ [lng, lat]'),
  originLabel: z
    .string()
    .max(300)
    .nullable()
    .default(null)
    .describe('Adresse du point de départ, si elle a été saisie'),
  mode: IsochroneModeSchema,
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(ISOCHRONE_MAX_MINUTES)
    .describe(`Durée en minutes (1 à ${ISOCHRONE_MAX_MINUTES})`),
  computedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe('Date du calcul, ISO 8601'),
  provider: IsochroneProviderParamsSchema.nullable()
    .default(null)
    .describe('Paramètres envoyés au service, pour un recalcul identique'),
  approximation: z
    .string()
    .max(300)
    .nullable()
    .default(null)
    .describe(
      'Approximation appliquée (vélo : distance sur le réseau piéton), sinon null'
    ),
})
export type IsochroneParams = z.infer<typeof IsochroneParamsSchema>

/** Le périmètre enregistré d'un critère, selon son type. */
export const PerimeterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point_radius'), ...PointRadiusSchema.shape }),
  z.object({ type: z.literal('polygon'), polygon: PolygonSchema }),
  z.object({
    type: z.literal('isochrone'),
    polygon: PolygonSchema.describe(
      "Isochrone figée en polygone à l'enregistrement"
    ),
    params: IsochroneParamsSchema,
  }),
])
export type Perimeter = z.infer<typeof PerimeterSchema>

/**
 * Le périmètre tel qu'on le demande : point et rayon, polygone dessiné, ou
 * paramètres d'isochrone (point ou adresse, mode, durée) que le serveur
 * calcule par la Géoplateforme et fige en polygone.
 */
export const PerimeterInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point_radius'), ...PointRadiusSchema.shape }),
  z.object({
    type: z.literal('polygon'),
    polygon: PolygonSchema.describe(
      'Polygone GeoJSON dessiné (anneau fermé, [lng, lat])'
    ),
  }),
  z
    .object({
      type: z.literal('isochrone'),
      origin: PointSchema.optional().describe(
        'Point de départ [lng, lat] ; sinon `address`'
      ),
      address: z
        .string()
        .min(3)
        .max(300)
        .optional()
        .describe('Adresse de départ, géocodée côté serveur'),
      mode: IsochroneModeSchema,
      durationMinutes: z
        .number()
        .int()
        .min(1)
        .max(ISOCHRONE_MAX_MINUTES)
        .describe(`Durée en minutes (1 à ${ISOCHRONE_MAX_MINUTES})`),
    })
    .refine(value => value.origin !== undefined || value.address, {
      message: 'Donnez le point de départ (origin) ou son adresse (address)',
      path: ['origin'],
    }),
])
export type PerimeterInput = z.infer<typeof PerimeterInputSchema>

export const SearchCriteriaInputSchema = z.object({
  name: z.string().trim().min(1).max(120).describe('Nom du critère'),
  active: z
    .boolean()
    .default(true)
    .describe('Actif ; faux = archivé (ni compté ni alerté)'),
  filters: CriteriaFiltersSchema.default(() => CriteriaFiltersSchema.parse({})),
  perimeter: PerimeterInputSchema.nullable()
    .default(null)
    .describe('Périmètre ; null = pas de contrainte géographique'),
})
export type SearchCriteriaInput = z.infer<typeof SearchCriteriaInputSchema>
export type SearchCriteriaInputRaw = z.input<typeof SearchCriteriaInputSchema>

/** Mise à jour partielle d'un critère, avec son garde-fou optimiste. */
export const SearchCriteriaUpdateSchema = z
  .object(withoutDefaults(SearchCriteriaInputSchema.shape))
  .partial()
  .extend({
    filters: z
      .object(withoutDefaults(CriteriaFiltersSchema.shape))
      .partial()
      .optional()
      .describe('Filtres modifiés, fusionnés avec les filtres enregistrés'),
    expectedUpdatedAt: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Garde-fou : `updatedAt` lu avant la modification ; refus si le critère a changé depuis'
      ),
  })
export type SearchCriteriaUpdate = z.infer<typeof SearchCriteriaUpdateSchema>

export const SearchCriteriaSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdById: z.string().uuid().nullable(),
  name: z.string(),
  active: z.boolean(),
  filters: CriteriaFiltersSchema,
  perimeterType: PerimeterTypeSchema.nullable(),
  perimeter: PerimeterSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>

/** Un critère avec ses compteurs, calculés à la lecture comme la liste filtrée. */
export const SearchCriteriaSummarySchema = SearchCriteriaSchema.extend({
  listingCount: z
    .number()
    .int()
    .min(0)
    .describe("Annonces de l'espace qui satisfont le critère"),
  newCount: z
    .number()
    .int()
    .min(0)
    .describe("Parmi elles, celles que le membre connecté n'a pas ouvertes"),
  approximateCount: z
    .number()
    .int()
    .min(0)
    .describe(
      'Parmi elles, celles dont la localisation est imprécise (quartier ou commune) : incluses sous réserve'
    ),
})
export type SearchCriteriaSummary = z.infer<typeof SearchCriteriaSummarySchema>

/** Aperçu d'un critère avant de l'enregistrer : périmètre résolu et nombre d'annonces. */
export const SearchCriteriaPreviewRequestSchema = z.object({
  filters: CriteriaFiltersSchema.default(() => CriteriaFiltersSchema.parse({})),
  perimeter: PerimeterInputSchema.nullable().default(null),
})
export type SearchCriteriaPreviewRequest = z.infer<
  typeof SearchCriteriaPreviewRequestSchema
>
export type SearchCriteriaPreviewRequestInput = z.input<
  typeof SearchCriteriaPreviewRequestSchema
>

export const SearchCriteriaPreviewSchema = z.object({
  perimeter: PerimeterSchema.nullable().describe(
    'Le périmètre résolu (isochrone calculée, polygone validé)'
  ),
  listingCount: z.number().int().min(0),
  approximateCount: z.number().int().min(0),
  listingIds: z.array(z.string().uuid()),
})
export type SearchCriteriaPreview = z.infer<typeof SearchCriteriaPreviewSchema>

/** Une annonce entrée dans un critère (alerte, badge). */
export const CriteriaMatchSchema = z.object({
  criteriaId: z.string().uuid(),
  name: z.string().describe('Nom du critère'),
  matchedAt: z
    .string()
    .datetime()
    .describe("Date d'entrée de l'annonce dans le critère"),
  approximate: z
    .boolean()
    .describe(
      'Localisation imprécise (quartier ou commune) : incluse sous réserve'
    ),
})
export type CriteriaMatch = z.infer<typeof CriteriaMatchSchema>

/** Ce qu'une écriture d'annonce change aux critères : entrées, sorties, état courant. */
export const CriteriaMatchChangesSchema = z.object({
  entered: z
    .array(CriteriaMatchSchema)
    .describe("Critères dans lesquels l'annonce vient d'entrer"),
  left: z
    .array(z.object({ criteriaId: z.string().uuid(), name: z.string() }))
    .describe("Critères dont l'annonce vient de sortir"),
  current: z
    .array(CriteriaMatchSchema)
    .describe("Tous les critères actifs que l'annonce satisfait"),
})
export type CriteriaMatchChanges = z.infer<typeof CriteriaMatchChangesSchema>
