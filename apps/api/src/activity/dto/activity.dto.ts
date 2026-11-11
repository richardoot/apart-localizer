import { createZodDto } from 'nestjs-zod'
import {
  ActivityPageSchema,
  ActivityQuerySchema,
  ClaudeStatusSchema,
} from '@apart/contracts'

export class ActivityQueryDto extends createZodDto(ActivityQuerySchema) {}
export class ActivityPageDto extends createZodDto(ActivityPageSchema) {}
/** Lot 26 : l'usage du connecteur, lu dans le journal. */
export class ClaudeStatusDto extends createZodDto(ClaudeStatusSchema) {}
