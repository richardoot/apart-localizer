import { z } from 'zod'
import {
  ListingMergeRecordSchema,
  ListingSellerSchema,
  SimilarListingSchema,
} from './listing-merge.js'
import { EvaluatedListingSchema } from './views.js'

/**
 * Les réponses du lot 27 (ADR 0037), à part de `listing-merge.ts` (lu par
 * `views.ts`) pour éviter une importation circulaire, comme les liens du
 * lot 18.
 */

/** Ce qu'une fusion, ou son annulation, a fait. */
export const ListingMergeResultSchema = z.object({
  merge: ListingMergeRecordSchema,
  listing: EvaluatedListingSchema.describe('La fiche gardée après l’écriture'),
  summary: z.string().describe('Ce qui a été fait, en une phrase'),
})
export type ListingMergeResult = z.infer<typeof ListingMergeResultSchema>

/** Ce qu'un ajout ou un retrait d'agence a fait. */
export const ListingSellerWriteResultSchema = z.object({
  seller: ListingSellerSchema.nullable().describe(
    'L’agence ajoutée ; null après un retrait'
  ),
  listing: EvaluatedListingSchema.describe('L’annonce après l’écriture'),
  summary: z.string().describe('Ce qui a été fait, en une phrase'),
})
export type ListingSellerWriteResult = z.infer<
  typeof ListingSellerWriteResultSchema
>

/** `GET /listings/similar` : les annonces ressemblantes, la plus proche d'abord. */
export const SimilarListingsResultSchema = z.object({
  items: z.array(SimilarListingSchema),
  compared: z
    .number()
    .int()
    .min(0)
    .describe('Nombre d’annonces de l’espace comparées'),
  summary: z
    .string()
    .describe('« 3 annonces ressemblantes, dont 1 très proche »'),
})
export type SimilarListingsResult = z.infer<typeof SimilarListingsResultSchema>
