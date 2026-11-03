import { createZodDto } from 'nestjs-zod'
import { ActivityPageSchema, ActivityQuerySchema } from '@apart/contracts'

export class ActivityQueryDto extends createZodDto(ActivityQuerySchema) {}
export class ActivityPageDto extends createZodDto(ActivityPageSchema) {}
