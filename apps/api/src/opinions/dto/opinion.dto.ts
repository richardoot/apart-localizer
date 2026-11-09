import { createZodDto } from 'nestjs-zod'
import {
  OpinionCriteriaOrderSchema,
  OpinionCriterionCreateSchema,
  OpinionCriterionUpdateSchema,
  OpinionInputSchema,
  OpinionRevealSchema,
  OpinionSchema,
  OpinionSettingsSchema,
  OpinionSettingsUpdateSchema,
} from '@apart/contracts'

export class OpinionInputDto extends createZodDto(OpinionInputSchema) {}
export class OpinionDto extends createZodDto(OpinionSchema) {}
export class OpinionRevealDto extends createZodDto(OpinionRevealSchema) {}

// Lot 20 : les critères des avis de l'espace.
export class OpinionSettingsDto extends createZodDto(OpinionSettingsSchema) {}
export class OpinionSettingsUpdateDto extends createZodDto(
  OpinionSettingsUpdateSchema
) {}
export class OpinionCriterionCreateDto extends createZodDto(
  OpinionCriterionCreateSchema
) {}
export class OpinionCriterionUpdateDto extends createZodDto(
  OpinionCriterionUpdateSchema
) {}
export class OpinionCriteriaOrderDto extends createZodDto(
  OpinionCriteriaOrderSchema
) {}
