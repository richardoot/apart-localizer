import { createZodDto } from 'nestjs-zod'
import {
  DuplicateCandidateSchema,
  DuplicateProbeSchema,
  EvaluatedListingSchema,
  EvaluateRequestSchema,
  EvaluateResultSchema,
  ExtractionRequestSchema,
  ExtractionResultSchema,
  ListingCreateResultSchema,
  ListingCreateSchema,
  ListingListQuerySchema,
  ListingListSchema,
  ListingPatchSchema,
  ListingStatusChangeSchema,
  PriceEventInputSchema,
  PriceEventSchema,
} from '@apart/contracts'

export class CreateListingDto extends createZodDto(ListingCreateSchema) {}
export class ListingCreateResultDto extends createZodDto(
  ListingCreateResultSchema
) {}
export class ExtractionRequestDto extends createZodDto(
  ExtractionRequestSchema
) {}
export class ExtractionResultDto extends createZodDto(ExtractionResultSchema) {}
export class DuplicateProbeDto extends createZodDto(DuplicateProbeSchema) {}
export class DuplicateCandidateDto extends createZodDto(
  DuplicateCandidateSchema
) {}
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
