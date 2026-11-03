import { createZodDto } from 'nestjs-zod'
import {
  CompareRequestSchema,
  CompareResultSchema,
  DpeVerifyRequestSchema,
  ListingContextSchema,
  MarketContextReportSchema,
  MarketContextRequestSchema,
  MarketContextSchema,
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
  NegotiationBriefSchema,
  PriceEventInputSchema,
  PriceEventSchema,
  SensitivityGridSchema,
  SensitivityRequestSchema,
  TargetPriceReportSchema,
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

/** Lot 3 : prix cible, sensibilité, négociation, comparaison. */
export class TargetPriceReportDto extends createZodDto(
  TargetPriceReportSchema
) {}
export class SensitivityRequestDto extends createZodDto(
  SensitivityRequestSchema
) {}
export class SensitivityGridDto extends createZodDto(SensitivityGridSchema) {}
export class NegotiationBriefDto extends createZodDto(NegotiationBriefSchema) {}
export class CompareRequestDto extends createZodDto(CompareRequestSchema) {}
export class CompareResultDto extends createZodDto(CompareResultSchema) {}

/** Lot 4 : contexte open data, marché, DPE vérifié. */
export class ListingContextDto extends createZodDto(ListingContextSchema) {}
export class MarketContextDto extends createZodDto(MarketContextSchema) {}
export class MarketContextRequestDto extends createZodDto(
  MarketContextRequestSchema
) {}
export class MarketContextReportDto extends createZodDto(
  MarketContextReportSchema
) {}
export class DpeVerifyRequestDto extends createZodDto(DpeVerifyRequestSchema) {}
