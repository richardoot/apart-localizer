import { createZodDto } from 'nestjs-zod'
import {
  DecisionCardSchema,
  DecisionInputSchema,
  DecisionRespondSchema,
  DecisionResultSchema,
  DecisionSessionResultSchema,
  DecisionSettingsUpdateSchema,
  DecisionSettleSchema,
  WorkflowOverviewSchema,
} from '@apart/contracts'

export class DecisionInputDto extends createZodDto(DecisionInputSchema) {}
export class DecisionRespondDto extends createZodDto(DecisionRespondSchema) {}
export class DecisionSettleDto extends createZodDto(DecisionSettleSchema) {}
export class DecisionResultDto extends createZodDto(DecisionResultSchema) {}
export class DecisionSessionResultDto extends createZodDto(
  DecisionSessionResultSchema
) {}
export class DecisionCardDto extends createZodDto(DecisionCardSchema) {}
export class WorkflowOverviewDto extends createZodDto(WorkflowOverviewSchema) {}
export class DecisionSettingsUpdateDto extends createZodDto(
  DecisionSettingsUpdateSchema
) {}
