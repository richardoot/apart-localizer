import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  ListingEvaluationSchema,
  ListingInputSchema,
  ListingListQuerySchema,
  ListingSchema,
  ListingStatusChangeSchema,
  ListingUpdateSchema,
} from '@apart/contracts'

export class CreateListingDto extends createZodDto(ListingInputSchema) {}
export class UpdateListingDto extends createZodDto(ListingUpdateSchema) {}
export class ListingStatusChangeDto extends createZodDto(
  ListingStatusChangeSchema
) {}
export class ListingListQueryDto extends createZodDto(ListingListQuerySchema) {}

/** Une annonce et ses calculs, telle que chaque lecture la renvoie. */
export const EvaluatedListingSchema = z.object({
  listing: ListingSchema,
  evaluation: ListingEvaluationSchema,
  /** Distance au point du filtre « près de », en mètres, quand il est actif. */
  distanceMeters: z.number().nullable().default(null),
  /** Vrai si le membre connecté n'a pas encore ouvert l'annonce. */
  isNewForMe: z.boolean(),
})
export type EvaluatedListing = z.infer<typeof EvaluatedListingSchema>
export class EvaluatedListingDto extends createZodDto(EvaluatedListingSchema) {}

export const ListingListSchema = z.object({
  items: z.array(EvaluatedListingSchema),
  total: z.number().int(),
})
export class ListingListDto extends createZodDto(ListingListSchema) {}
