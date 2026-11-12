import { createZodDto } from 'nestjs-zod'
import {
  DuplicateDistinctInputSchema,
  ListingMergeInputSchema,
  ListingMergePreviewQuerySchema,
  ListingMergePreviewSchema,
  ListingMergeResultSchema,
  ListingSellerInputSchema,
  ListingSellerWriteResultSchema,
  SimilarListingsQuerySchema,
  SimilarListingsResultSchema,
} from '@apart/contracts'

/** Lot 27 : fusion des doublons, agences multiples, annonces ressemblantes. */
export class SimilarListingsQueryDto extends createZodDto(
  SimilarListingsQuerySchema
) {}
export class SimilarListingsResultDto extends createZodDto(
  SimilarListingsResultSchema
) {}
export class ListingMergePreviewQueryDto extends createZodDto(
  ListingMergePreviewQuerySchema
) {}
export class ListingMergePreviewDto extends createZodDto(
  ListingMergePreviewSchema
) {}
export class ListingMergeInputDto extends createZodDto(
  ListingMergeInputSchema
) {}
export class ListingMergeResultDto extends createZodDto(
  ListingMergeResultSchema
) {}
export class ListingSellerInputDto extends createZodDto(
  ListingSellerInputSchema
) {}
export class ListingSellerWriteResultDto extends createZodDto(
  ListingSellerWriteResultSchema
) {}

/** Lot 30 : « ce sont deux biens différents ». */
export class DuplicateDistinctInputDto extends createZodDto(
  DuplicateDistinctInputSchema
) {}
