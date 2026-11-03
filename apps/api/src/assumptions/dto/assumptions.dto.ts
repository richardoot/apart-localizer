import { createZodDto } from 'nestjs-zod'
import {
  AssumptionsImpactSchema,
  AssumptionsPreviewRequestSchema,
  AssumptionsSchema,
  AssumptionsUpdateResultSchema,
  AssumptionsUpdateSchema,
  AssumptionsVersionSchema,
} from '@apart/contracts'

export class AssumptionsDto extends createZodDto(AssumptionsSchema) {}
export class AssumptionsUpdateDto extends createZodDto(
  AssumptionsUpdateSchema
) {}
export class AssumptionsVersionDto extends createZodDto(
  AssumptionsVersionSchema
) {}
export class AssumptionsUpdateResultDto extends createZodDto(
  AssumptionsUpdateResultSchema
) {}
export class AssumptionsPreviewRequestDto extends createZodDto(
  AssumptionsPreviewRequestSchema
) {}
export class AssumptionsImpactDto extends createZodDto(
  AssumptionsImpactSchema
) {}
