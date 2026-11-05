import { createZodDto } from 'nestjs-zod'
import {
  ListingCheckInputSchema,
  ListingCheckPreviewRequestSchema,
  ListingCheckPreviewSchema,
  ListingCheckSchema,
  ListingCheckWriteResultSchema,
} from '@apart/contracts'

/** Lot 15 : vérifications d'annonces sur le portail. */
export class ListingCheckDto extends createZodDto(ListingCheckSchema) {}
export class ListingCheckInputDto extends createZodDto(
  ListingCheckInputSchema
) {}
export class ListingCheckPreviewRequestDto extends createZodDto(
  ListingCheckPreviewRequestSchema
) {}
export class ListingCheckPreviewDto extends createZodDto(
  ListingCheckPreviewSchema
) {}
export class ListingCheckWriteResultDto extends createZodDto(
  ListingCheckWriteResultSchema
) {}
