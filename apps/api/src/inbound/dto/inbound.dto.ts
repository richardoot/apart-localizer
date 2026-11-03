import { createZodDto } from 'nestjs-zod'
import {
  InboundEmailResultSchema,
  InboundEmailSchema,
  ListingDraftDecisionSchema,
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
