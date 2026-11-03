import { createZodDto } from 'nestjs-zod'
import {
  AssumptionsSchema,
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
