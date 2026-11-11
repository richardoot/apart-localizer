import { createZodDto } from 'nestjs-zod'
import {
  ListingCoverInputSchema,
  ListingCoverSchema,
  ListingCoversQuerySchema,
  ListingCoversSchema,
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

// Lot 25 : la photo de couverture.
export class ListingCoverDto extends createZodDto(ListingCoverSchema) {}
export class ListingCoversDto extends createZodDto(ListingCoversSchema) {}
export class ListingCoversQueryDto extends createZodDto(
  ListingCoversQuerySchema
) {}
export class ListingCoverInputDto extends createZodDto(
  ListingCoverInputSchema
) {}
