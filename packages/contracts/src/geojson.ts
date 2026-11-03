import { z } from 'zod'

/**
 * GeoJSON strict (RFC 7946), limité à ce que l'application échange : un point
 * et un polygone en WGS 84. Les coordonnées sont [longitude, latitude].
 */

export const PositionSchema = z
  .tuple([
    z.number().min(-180).max(180).describe('Longitude en degrés (WGS 84)'),
    z.number().min(-90).max(90).describe('Latitude en degrés (WGS 84)'),
  ])
  .describe('Position [longitude, latitude] en degrés décimaux WGS 84')
export type Position = z.infer<typeof PositionSchema>

export const PointSchema = z
  .strictObject({
    type: z.literal('Point'),
    coordinates: PositionSchema,
  })
  .describe('Point GeoJSON : { type: "Point", coordinates: [lng, lat] }')
export type Point = z.infer<typeof PointSchema>

const samePosition = (a: Position, b: Position): boolean =>
  a[0] === b[0] && a[1] === b[1]

/** Anneau linéaire : au moins quatre positions, la dernière égale à la première. */
export const LinearRingSchema = z
  .array(PositionSchema)
  .min(
    4,
    'Un anneau compte au moins quatre positions (la dernière ferme le premier)'
  )
  .refine(
    ring => {
      const first = ring[0]
      const last = ring[ring.length - 1]
      return (
        first !== undefined && last !== undefined && samePosition(first, last)
      )
    },
    {
      message:
        'Un anneau doit être fermé : dernière position égale à la première',
    }
  )
export type LinearRing = z.infer<typeof LinearRingSchema>

export const PolygonSchema = z
  .strictObject({
    type: z.literal('Polygon'),
    coordinates: z
      .array(LinearRingSchema)
      .min(1, 'Un polygone a au moins un anneau extérieur'),
  })
  .describe(
    'Polygone GeoJSON : premier anneau = contour extérieur, suivants = trous'
  )
export type Polygon = z.infer<typeof PolygonSchema>

export const GeometrySchema = z.discriminatedUnion('type', [
  PointSchema,
  PolygonSchema,
])
export type Geometry = z.infer<typeof GeometrySchema>

/** Un point et un rayon, le filtre géographique principal sur mobile. */
export const PointRadiusSchema = z.object({
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe('Longitude du centre, degrés'),
  latitude: z.number().min(-90).max(90).describe('Latitude du centre, degrés'),
  radiusMeters: z
    .number()
    .int()
    .min(1)
    .max(50_000)
    .describe('Rayon en mètres autour du centre (1 à 50 000)'),
})
export type PointRadius = z.infer<typeof PointRadiusSchema>
