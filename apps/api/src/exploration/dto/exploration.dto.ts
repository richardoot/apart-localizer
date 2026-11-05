import { createZodDto } from 'nestjs-zod'
import {
  ExplorationDetailSchema,
  ExplorationListQuerySchema,
  ExplorationRecordResultSchema,
  ExplorationRecordSchema,
  ExplorationSummarySchema,
  SearchBriefQuerySchema,
  SearchBriefSchema,
  TriageRequestSchema,
  TriageResultSchema,
} from '@apart/contracts'

export class ExplorationSummaryDto extends createZodDto(
  ExplorationSummarySchema
) {}
export class ExplorationDetailDto extends createZodDto(
  ExplorationDetailSchema
) {}
export class ExplorationListQueryDto extends createZodDto(
  ExplorationListQuerySchema
) {}
export class SearchBriefDto extends createZodDto(SearchBriefSchema) {}
export class SearchBriefQueryDto extends createZodDto(SearchBriefQuerySchema) {}
export class TriageRequestDto extends createZodDto(TriageRequestSchema) {}
export class TriageResultDto extends createZodDto(TriageResultSchema) {}
export class ExplorationRecordDto extends createZodDto(
  ExplorationRecordSchema
) {}
export class ExplorationRecordResultDto extends createZodDto(
  ExplorationRecordResultSchema
) {}
