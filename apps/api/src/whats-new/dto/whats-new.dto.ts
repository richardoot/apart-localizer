import { createZodDto } from 'nestjs-zod'
import {
  ListingChangesSchema,
  WhatsNewMarkSeenSchema,
  WhatsNewQuerySchema,
  WhatsNewReportSchema,
  WhatsNewVisitSchema,
} from '@apart/contracts'

export class WhatsNewQueryDto extends createZodDto(WhatsNewQuerySchema) {}
export class WhatsNewReportDto extends createZodDto(WhatsNewReportSchema) {}
export class WhatsNewVisitDto extends createZodDto(WhatsNewVisitSchema) {}
export class WhatsNewMarkSeenDto extends createZodDto(WhatsNewMarkSeenSchema) {}
export class ListingChangesDto extends createZodDto(ListingChangesSchema) {}
