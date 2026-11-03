import { createZodDto } from 'nestjs-zod'
import {
  ComplianceReportSchema,
  OccupancyReportSchema,
  ProjectionQuerySchema,
  ProjectionReportSchema,
  RentComparableInputSchema,
  RentComparableListSchema,
  RentComparableUpdateSchema,
  RentComparableWriteResultSchema,
  ScenarioComparisonSchema,
  ScenarioEvaluateRequestSchema,
  ScenarioInputSchema,
  ScenarioListQuerySchema,
  ScenarioSchema,
  ScenarioUpdateSchema,
} from '@apart/contracts'

/** Lot 5 : phase 1, scénarios, projection, loyer de marché, conformité. */
export class OccupancyReportDto extends createZodDto(OccupancyReportSchema) {}
export class ProjectionQueryDto extends createZodDto(ProjectionQuerySchema) {}
export class ProjectionReportDto extends createZodDto(ProjectionReportSchema) {}
export class ScenarioDto extends createZodDto(ScenarioSchema) {}
export class ScenarioInputDto extends createZodDto(ScenarioInputSchema) {}
export class ScenarioUpdateDto extends createZodDto(ScenarioUpdateSchema) {}
export class ScenarioListQueryDto extends createZodDto(
  ScenarioListQuerySchema
) {}
export class ScenarioEvaluateRequestDto extends createZodDto(
  ScenarioEvaluateRequestSchema
) {}
export class ScenarioComparisonDto extends createZodDto(
  ScenarioComparisonSchema
) {}
export class RentComparableInputDto extends createZodDto(
  RentComparableInputSchema
) {}
export class RentComparableUpdateDto extends createZodDto(
  RentComparableUpdateSchema
) {}
export class RentComparableListDto extends createZodDto(
  RentComparableListSchema
) {}
export class RentComparableWriteResultDto extends createZodDto(
  RentComparableWriteResultSchema
) {}
export class ComplianceReportDto extends createZodDto(ComplianceReportSchema) {}
