import { createZodDto } from 'nestjs-zod'
import { OpinionInputSchema, OpinionSchema } from '@apart/contracts'

export class OpinionInputDto extends createZodDto(OpinionInputSchema) {}
export class OpinionDto extends createZodDto(OpinionSchema) {}
