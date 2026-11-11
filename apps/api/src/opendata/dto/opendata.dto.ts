import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  AmenityLayerQuerySchema,
  BboxQuerySchema,
  GeocodeLookupSchema,
  GeocodeQuerySchema,
  LayerFeatureCollectionSchema,
  TransitModeSchema,
} from '@apart/contracts'

export class LayerDto extends createZodDto(LayerFeatureCollectionSchema) {}
export class BboxQueryDto extends createZodDto(BboxQuerySchema) {}
export class GeocodeQueryDto extends createZodDto(GeocodeQuerySchema) {}
export class GeocodeLookupDto extends createZodDto(GeocodeLookupSchema) {}
export class AmenityLayerQueryDto extends createZodDto(
  AmenityLayerQuerySchema
) {}
export class TransitLayerQueryDto extends createZodDto(
  z.object({ mode: TransitModeSchema.optional() })
) {}

export const OpenDataStatusReportSchema = z.object({
  rentControl: z.object({
    zones: z.number().int().describe('Secteurs du zonage importés'),
    decrees: z
      .array(
        z.object({
          decreeDate: z.string(),
          validFrom: z.string(),
          validUntil: z.string().nullable(),
          rows: z.number().int(),
        })
      )
      .describe('Arrêtés de loyers de référence importés'),
  }),
  transitStops: z.record(z.string(), z.number().int()),
  dvf: z.array(
    z.object({
      year: z.number().int(),
      count: z.number().int(),
      lastDate: z
        .string()
        .date()
        .optional()
        .describe('Date de la dernière vente de l’année en base'),
    })
  ),
  amenities: z
    .object({
      athletics_track: z.number().int(),
      supermarket_drive: z.number().int(),
      fitness_park: z.number().int(),
    })
    .describe('Lot 11 : équipements importés par genre'),
  neighbourhoods: z
    .object({
      quartier: z.number().int(),
      iris: z.number().int(),
      commune: z.number().int(),
    })
    .describe('Lot 11 : contours de quartiers importés par nature'),
  places: z
    .number()
    .int()
    .default(0)
    .describe('Lot 12 : lieux-dits OpenStreetMap importés'),
})
export type OpenDataStatusReport = z.infer<typeof OpenDataStatusReportSchema>
export class OpenDataStatusDto extends createZodDto(
  OpenDataStatusReportSchema
) {}
