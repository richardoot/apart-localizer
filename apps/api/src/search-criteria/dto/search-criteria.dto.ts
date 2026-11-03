import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  SearchCriteriaInputSchema,
  SearchCriteriaPreviewRequestSchema,
  SearchCriteriaPreviewSchema,
  SearchCriteriaSummarySchema,
  SearchCriteriaUpdateSchema,
} from '@apart/contracts'

export class SearchCriteriaInputDto extends createZodDto(
  SearchCriteriaInputSchema
) {}
export class SearchCriteriaUpdateDto extends createZodDto(
  SearchCriteriaUpdateSchema
) {}
export class SearchCriteriaSummaryDto extends createZodDto(
  SearchCriteriaSummarySchema
) {}
export class SearchCriteriaPreviewRequestDto extends createZodDto(
  SearchCriteriaPreviewRequestSchema
) {}
export class SearchCriteriaPreviewDto extends createZodDto(
  SearchCriteriaPreviewSchema
) {}
export class SearchCriteriaListQueryDto extends createZodDto(
  z.object({
    includeArchived: z
      .preprocess(
        value => value === true || value === 'true' || value === '1',
        z.boolean()
      )
      .default(false)
      .describe('Inclure les critères archivés'),
  })
) {}
