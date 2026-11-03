import { createZodDto } from 'nestjs-zod'
import {
  OfferInputSchema,
  OfferSchema,
  OfferUpdateSchema,
  OfferWriteResultSchema,
} from '@apart/contracts'

export class OfferInputDto extends createZodDto(OfferInputSchema) {}
export class OfferUpdateDto extends createZodDto(OfferUpdateSchema) {}
export class OfferDto extends createZodDto(OfferSchema) {}
export class OfferWriteResultDto extends createZodDto(OfferWriteResultSchema) {}
