import { createZodDto } from 'nestjs-zod'
import {
  InboundEmailResultSchema,
  InboundEmailSchema,
  ListingDraftAcceptResultSchema,
  ListingDraftBatchAcceptResultSchema,
  ListingDraftBatchAcceptSchema,
  ListingDraftDecisionSchema,
  ListingDraftMergeSchema,
  ListingDraftQuerySchema,
  ListingDraftSchema,
} from '@apart/contracts'

export class InboundEmailDto extends createZodDto(InboundEmailSchema) {}
export class InboundEmailResultDto extends createZodDto(
  InboundEmailResultSchema
) {}
export class ListingDraftDto extends createZodDto(ListingDraftSchema) {}
export class ListingDraftQueryDto extends createZodDto(
  ListingDraftQuerySchema
) {}
export class ListingDraftDecisionDto extends createZodDto(
  ListingDraftDecisionSchema
) {}
export class ListingDraftMergeDto extends createZodDto(
  ListingDraftMergeSchema
) {}
export class ListingDraftBatchAcceptDto extends createZodDto(
  ListingDraftBatchAcceptSchema
) {}
export class ListingDraftAcceptResultDto extends createZodDto(
  ListingDraftAcceptResultSchema
) {}
export class ListingDraftBatchAcceptResultDto extends createZodDto(
  ListingDraftBatchAcceptResultSchema
) {}
