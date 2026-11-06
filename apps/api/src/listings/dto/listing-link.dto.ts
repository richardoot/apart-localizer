import { createZodDto } from 'nestjs-zod'
import {
  ListingLinkInputSchema,
  ListingLinkPatchSchema,
  ListingLinkWriteResultSchema,
  ListingLinksResultSchema,
} from '@apart/contracts'

/** Lot 18 : les liens d'une annonce sur les portails. */
export class ListingLinksResultDto extends createZodDto(
  ListingLinksResultSchema
) {}
export class ListingLinkInputDto extends createZodDto(ListingLinkInputSchema) {}
export class ListingLinkPatchDto extends createZodDto(ListingLinkPatchSchema) {}
export class ListingLinkWriteResultDto extends createZodDto(
  ListingLinkWriteResultSchema
) {}
