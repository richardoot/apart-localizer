import { z } from 'zod'
import { DpeClassSchema, ListingStatusSchema, VerdictSchema } from './enums.js'
import { PointRadiusSchema } from './geojson.js'

export const ListingSortSchema = z.enum([
  'score',
  'grossYield',
  'effort',
  'pricePerM2',
  'price',
  'createdAt',
  'discount',
])
export type ListingSort = z.infer<typeof ListingSortSchema>

/** Filtres de la liste d'annonces (API, MCP `list_listings`, interface). */
export const ListingFiltersSchema = z.object({
  status: z
    .array(ListingStatusSchema)
    .optional()
    .describe('Statuts retenus ; absent = statuts actifs'),
  commune: z.array(z.string().max(120)).optional(),
  dpe: z.array(DpeClassSchema).optional(),
  verdict: z.array(VerdictSchema).optional(),
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
    'Point et rayon : annonces dans le rayon'
  ),
  search: z
    .string()
    .max(200)
    .optional()
    .describe('Recherche texte (titre, commune, quartier, notes)'),
  sort: ListingSortSchema.default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
})
export type ListingFilters = z.infer<typeof ListingFiltersSchema>

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

/**
 * Les mêmes filtres lus depuis une chaîne de requête HTTP : listes séparées
 * par des virgules, nombres et booléens en texte.
 */
export const ListingListQuerySchema = z.object({
  status: csv(ListingStatusSchema),
  commune: csv(z.string().max(120)),
  dpe: csv(DpeClassSchema),
  verdict: csv(VerdictSchema),
  newForMe: bool,
  criteriaId: z.string().uuid().optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  radius: z.coerce.number().int().min(1).max(50_000).optional(),
  search: z.string().max(200).optional(),
  sort: ListingSortSchema.default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
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
    ...(query.newForMe !== undefined ? { newForMe: query.newForMe } : {}),
    ...(query.criteriaId ? { criteriaId: query.criteriaId } : {}),
    ...(near ? { near } : {}),
    ...(query.search ? { search: query.search } : {}),
    sort: query.sort,
    order: query.order,
  })
}
