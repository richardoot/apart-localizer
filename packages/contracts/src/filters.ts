import { z } from 'zod'
import { DpeClassSchema, ListingStatusSchema, VerdictSchema } from './enums.js'
import { PointRadiusSchema } from './geojson.js'
import { LocationPrecisionFilterSchema } from './placement.js'

export const ListingSortSchema = z
  .enum([
    'score',
    'grossYield',
    'netYield',
    'effort',
    'pricePerM2',
    'price',
    'surface',
    'rentalRank',
    'opinion',
    'createdAt',
    'discount',
  ])
  .describe(
    'Clé de tri : score (meilleur verdict), rendement brut ou net, effort, prix au m², prix, surface, compatibilité location, avis moyen, date d’ajout, décote'
  )
export type ListingSort = z.infer<typeof ListingSortSchema>

export const ListingSortOrderSchema = z.enum(['asc', 'desc'])
export type ListingSortOrder = z.infer<typeof ListingSortOrderSchema>

/** Taille de page par défaut et maximale de la liste d'annonces. */
export const LISTING_PAGE_DEFAULT = 50
export const LISTING_PAGE_MAX = 200

const positiveOrNull = (what: string) =>
  z.number().min(0).optional().describe(what)

/**
 * Filtres de la liste d'annonces : la seule définition, servie telle quelle
 * au MCP (`list_listings`), au web, et lue depuis la chaîne de requête du REST
 * par `ListingListQuerySchema`. Le filtre géographique s'exécute en base
 * (PostGIS) ; le verdict, le tri et la pagination s'appliquent après le
 * calcul des indicateurs, qui dépendent des hypothèses.
 */
export const ListingFiltersSchema = z.object({
  status: z
    .array(ListingStatusSchema)
    .optional()
    .describe('Statuts retenus ; absent = statuts actifs'),
  commune: z
    .array(z.string().max(120))
    .optional()
    .describe('Communes retenues (insensible à la casse)'),
  dpe: z.array(DpeClassSchema).optional().describe('Classes DPE retenues'),
  verdict: z
    .array(VerdictSchema)
    .optional()
    .describe('Verdicts financiers retenus'),
  precision: z
    .array(LocationPrecisionFilterSchema)
    .optional()
    .describe(
      'Précisions du repère retenues (lot 12) : exact, street, district (au quartier), commune, none (sans repère)'
    ),
  priceMin: positiveOrNull('Prix affiché minimal en euros'),
  priceMax: positiveOrNull('Prix affiché maximal en euros'),
  surfaceMin: positiveOrNull('Surface minimale en m²'),
  surfaceMax: positiveOrNull('Surface maximale en m²'),
  roomsMin: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Nombre de pièces minimal'),
  newForMe: z
    .boolean()
    .optional()
    .describe(
      "Seulement les annonces que le membre connecté n'a pas encore ouvertes"
    ),
  criteriaId: z
    .string()
    .uuid()
    .optional()
    .describe('Critère de recherche enregistré à appliquer'),
  near: PointRadiusSchema.optional().describe(
    'Point et rayon : annonces dans le rayon, avec leur distance en mètres'
  ),
  search: z
    .string()
    .max(200)
    .optional()
    .describe('Recherche texte (titre, commune, quartier, adresse, notes)'),
  sort: ListingSortSchema.default('score'),
  order: ListingSortOrderSchema.default('desc'),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Numéro de page, à partir de 1'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LISTING_PAGE_MAX)
    .default(LISTING_PAGE_DEFAULT)
    .describe(`Taille de page (${LISTING_PAGE_MAX} au plus)`),
})
export type ListingFilters = z.infer<typeof ListingFiltersSchema>
/** Forme acceptée avant les valeurs par défaut (ce que le web et le MCP envoient). */
export type ListingFiltersInput = z.input<typeof ListingFiltersSchema>

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(value => {
    if (value === undefined || value === null || value === '') return undefined
    if (Array.isArray(value)) return value
    return String(value)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }, z.array(item).optional())

const bool = z.preprocess(value => {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'boolean') return value
  return value === 'true' || value === '1'
}, z.boolean().optional())

/** Un nombre lu en texte ; vide = absent. Les bornes sont celles des filtres canoniques. */
const optionalNumber = <T extends z.ZodType>(inner: T) =>
  z.preprocess(
    value => (value === undefined || value === '' ? undefined : value),
    inner.optional()
  )
const money = optionalNumber(z.coerce.number().min(0))
const integer = (min: number, max?: number) =>
  optionalNumber(
    max === undefined
      ? z.coerce.number().int().min(min)
      : z.coerce.number().int().min(min).max(max)
  )

/**
 * Les mêmes filtres lus depuis une chaîne de requête HTTP : listes séparées
 * par des virgules, nombres et booléens en texte, point et rayon en trois
 * paramètres (`lng`, `lat`, `radius`).
 */
export const ListingListQuerySchema = z.object({
  status: csv(ListingStatusSchema),
  commune: csv(z.string().max(120)),
  dpe: csv(DpeClassSchema),
  verdict: csv(VerdictSchema),
  precision: csv(LocationPrecisionFilterSchema),
  priceMin: money,
  priceMax: money,
  surfaceMin: money,
  surfaceMax: money,
  roomsMin: integer(0),
  newForMe: bool,
  criteriaId: z.string().uuid().optional(),
  lng: optionalNumber(z.coerce.number().min(-180).max(180)),
  lat: optionalNumber(z.coerce.number().min(-90).max(90)),
  radius: integer(1, 50_000),
  search: z.string().max(200).optional(),
  sort: ListingSortSchema.default('score'),
  order: ListingSortOrderSchema.default('desc'),
  page: integer(1),
  limit: integer(1, LISTING_PAGE_MAX),
})
export type ListingListQuery = z.infer<typeof ListingListQuerySchema>

/** Passe de la forme « chaîne de requête » à la forme canonique des filtres. */
export function listingFiltersFromQuery(
  query: ListingListQuery
): ListingFilters {
  const near =
    query.lng !== undefined &&
    query.lat !== undefined &&
    query.radius !== undefined
      ? {
          longitude: query.lng,
          latitude: query.lat,
          radiusMeters: query.radius,
        }
      : undefined
  return ListingFiltersSchema.parse({
    ...(query.status ? { status: query.status } : {}),
    ...(query.commune ? { commune: query.commune } : {}),
    ...(query.dpe ? { dpe: query.dpe } : {}),
    ...(query.verdict ? { verdict: query.verdict } : {}),
    ...(query.precision ? { precision: query.precision } : {}),
    ...(query.priceMin !== undefined ? { priceMin: query.priceMin } : {}),
    ...(query.priceMax !== undefined ? { priceMax: query.priceMax } : {}),
    ...(query.surfaceMin !== undefined ? { surfaceMin: query.surfaceMin } : {}),
    ...(query.surfaceMax !== undefined ? { surfaceMax: query.surfaceMax } : {}),
    ...(query.roomsMin !== undefined ? { roomsMin: query.roomsMin } : {}),
    ...(query.newForMe !== undefined ? { newForMe: query.newForMe } : {}),
    ...(query.criteriaId ? { criteriaId: query.criteriaId } : {}),
    ...(near ? { near } : {}),
    ...(query.search ? { search: query.search } : {}),
    sort: query.sort,
    order: query.order,
    ...(query.page !== undefined ? { page: query.page } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  })
}

/**
 * L'inverse : des filtres canoniques vers les paramètres d'une chaîne de
 * requête (web → REST, URL de la page). Les valeurs par défaut sont omises
 * pour garder des URL courtes.
 */
export function listingFiltersToQuery(
  filters: ListingFiltersInput
): Record<string, string> {
  const query: Record<string, string> = {}
  const list = (key: string, values: readonly string[] | undefined): void => {
    if (values && values.length > 0) query[key] = values.join(',')
  }
  const num = (key: string, value: number | undefined): void => {
    if (value !== undefined) query[key] = String(value)
  }
  list('status', filters.status)
  list('commune', filters.commune)
  list('dpe', filters.dpe)
  list('verdict', filters.verdict)
  list('precision', filters.precision)
  num('priceMin', filters.priceMin)
  num('priceMax', filters.priceMax)
  num('surfaceMin', filters.surfaceMin)
  num('surfaceMax', filters.surfaceMax)
  num('roomsMin', filters.roomsMin)
  if (filters.newForMe) query.newForMe = 'true'
  if (filters.criteriaId) query.criteriaId = filters.criteriaId
  if (filters.near) {
    query.lng = String(filters.near.longitude)
    query.lat = String(filters.near.latitude)
    query.radius = String(filters.near.radiusMeters)
  }
  if (filters.search) query.search = filters.search
  if (filters.sort && filters.sort !== 'score') query.sort = filters.sort
  if (filters.order && filters.order !== 'desc') query.order = filters.order
  if (filters.page !== undefined && filters.page !== 1) {
    query.page = String(filters.page)
  }
  if (filters.limit !== undefined && filters.limit !== LISTING_PAGE_DEFAULT) {
    query.limit = String(filters.limit)
  }
  return query
}
