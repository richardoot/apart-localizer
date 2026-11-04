import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
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
  dvf: z.array(z.object({ year: z.number().int(), count: z.number().int() })),
})
export type OpenDataStatusReport = z.infer<typeof OpenDataStatusReportSchema>
export class OpenDataStatusDto extends createZodDto(
  OpenDataStatusReportSchema
) {}
