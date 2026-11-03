import { createZodDto } from 'nestjs-zod'
import {
  VisitInputSchema,
  VisitPhotoSchema,
  VisitPhotoUploadRequestSchema,
  VisitPhotoUploadSchema,
  VisitSchema,
  VisitUpdateSchema,
  VisitWriteResultSchema,
} from '@apart/contracts'

export class VisitDto extends createZodDto(VisitSchema) {}
export class VisitInputDto extends createZodDto(VisitInputSchema) {}
export class VisitUpdateDto extends createZodDto(VisitUpdateSchema) {}
export class VisitWriteResultDto extends createZodDto(VisitWriteResultSchema) {}
export class VisitPhotoDto extends createZodDto(VisitPhotoSchema) {}
export class VisitPhotoUploadRequestDto extends createZodDto(
  VisitPhotoUploadRequestSchema
) {}
export class VisitPhotoUploadDto extends createZodDto(VisitPhotoUploadSchema) {}
