import { createZodDto } from 'nestjs-zod'
import {
  EvaluatedListingSchema,
  EvaluateRequestSchema,
  EvaluateResultSchema,
  ListingInputSchema,
  ListingListQuerySchema,
  ListingListSchema,
  ListingPatchSchema,
  ListingStatusChangeSchema,
  PriceEventInputSchema,
  PriceEventSchema,
} from '@apart/contracts'

export class CreateListingDto extends createZodDto(ListingInputSchema) {}
export class ListingPatchDto extends createZodDto(ListingPatchSchema) {}
export class ListingStatusChangeDto extends createZodDto(
  ListingStatusChangeSchema
) {}
export class ListingListQueryDto extends createZodDto(ListingListQuerySchema) {}
export class PriceEventInputDto extends createZodDto(PriceEventInputSchema) {}
export class PriceEventDto extends createZodDto(PriceEventSchema) {}
export class EvaluateRequestDto extends createZodDto(EvaluateRequestSchema) {}
export class EvaluateResultDto extends createZodDto(EvaluateResultSchema) {}

/** Une annonce et ses calculs, telle que chaque lecture la renvoie. */
export class EvaluatedListingDto extends createZodDto(EvaluatedListingSchema) {}
export class ListingListDto extends createZodDto(ListingListSchema) {}
