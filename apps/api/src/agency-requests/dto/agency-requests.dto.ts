import { createZodDto } from 'nestjs-zod'
import {
  AgencyAnswerInputSchema,
  AgencyAnswerResultSchema,
  AgencyApplyProposedSchema,
  AgencyApplyResultSchema,
  AgencyRequestApproveSchema,
  AgencyRequestDraftInputSchema,
  AgencyRequestSentSchema,
  AgencyRequestUpdateSchema,
  AgencyRequestWriteResultSchema,
  AgencyRequestsWriteResultSchema,
  AgencySettingsSchema,
  AgencySettingsUpdateSchema,
  ListingContactInputSchema,
  ListingContactResultSchema,
  ListingContactSchema,
  ListingExchangesSchema,
  PendingAgencyRequestsSchema,
} from '@apart/contracts'

/** Lot 17 : questions aux agences. */
export class ListingContactDto extends createZodDto(ListingContactSchema) {}
export class ListingContactInputDto extends createZodDto(
  ListingContactInputSchema
) {}
export class ListingContactResultDto extends createZodDto(
  ListingContactResultSchema
) {}
export class ListingExchangesDto extends createZodDto(ListingExchangesSchema) {}
export class PendingAgencyRequestsDto extends createZodDto(
  PendingAgencyRequestsSchema
) {}
export class AgencyRequestDraftInputDto extends createZodDto(
  AgencyRequestDraftInputSchema
) {}
export class AgencyRequestUpdateDto extends createZodDto(
  AgencyRequestUpdateSchema
) {}
export class AgencyRequestApproveDto extends createZodDto(
  AgencyRequestApproveSchema
) {}
export class AgencyRequestSentDto extends createZodDto(
  AgencyRequestSentSchema
) {}
export class AgencyAnswerInputDto extends createZodDto(
  AgencyAnswerInputSchema
) {}
export class AgencyApplyProposedDto extends createZodDto(
  AgencyApplyProposedSchema
) {}
export class AgencyRequestWriteResultDto extends createZodDto(
  AgencyRequestWriteResultSchema
) {}
export class AgencyRequestsWriteResultDto extends createZodDto(
  AgencyRequestsWriteResultSchema
) {}
export class AgencyAnswerResultDto extends createZodDto(
  AgencyAnswerResultSchema
) {}
export class AgencyApplyResultDto extends createZodDto(
  AgencyApplyResultSchema
) {}
export class AgencySettingsDto extends createZodDto(AgencySettingsSchema) {}
export class AgencySettingsUpdateDto extends createZodDto(
  AgencySettingsUpdateSchema
) {}
