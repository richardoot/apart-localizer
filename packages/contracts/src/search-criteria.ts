import { z } from 'zod'
import { DpeClassSchema, PerimeterTypeSchema, VerdictSchema } from './enums.js'
import { PointRadiusSchema, PointSchema, PolygonSchema } from './geojson.js'

export const CriteriaFiltersSchema = z.object({
  communes: z.array(z.string().max(120)).default([]),
  priceMax: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Prix maximal en euros'),
  priceMin: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Prix minimal en euros'),
  surfaceMin: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Surface minimale en m²'),
  roomsMin: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe('Nombre de pièces minimal'),
  dpeMax: DpeClassSchema.nullable()
    .default(null)
    .describe('Classe DPE la plus basse acceptée'),
  verdicts: z.array(VerdictSchema).default([]),
})
export type CriteriaFilters = z.infer<typeof CriteriaFiltersSchema>

export const IsochroneParamsSchema = z.object({
  origin: PointSchema,
  mode: z.enum(['walking', 'transit', 'cycling', 'driving']),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(120)
    .describe('Durée en minutes'),
  computedAt: z.string().datetime().nullable().default(null),
})
export type IsochroneParams = z.infer<typeof IsochroneParamsSchema>

/** Le périmètre d'un critère, selon son type. */
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

export const SearchCriteriaInputSchema = z.object({
  name: z.string().min(1).max(120),
  active: z.boolean().default(true),
  filters: CriteriaFiltersSchema.default(() => CriteriaFiltersSchema.parse({})),
  perimeter: PerimeterSchema.nullable().default(null),
})
export type SearchCriteriaInput = z.infer<typeof SearchCriteriaInputSchema>

export const SearchCriteriaSchema = SearchCriteriaInputSchema.extend({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdById: z.string().uuid().nullable(),
  perimeterType: PerimeterTypeSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>
