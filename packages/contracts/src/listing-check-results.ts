import { z } from 'zod'
import { ExtractionUsageSchema } from './ai.js'
import { DuplicateCandidateSchema } from './duplicates.js'
import { ListingStatusSchema } from './enums.js'
import {
  LinkedListingSchema,
  ListingCheckChangeSchema,
  ListingCheckFieldSchema,
  ListingCheckOutcomeSchema,
  ListingCheckSchema,
  ListingCheckSuggestionSchema,
  ListingObservedSchema,
  ListingRepublicationSchema,
} from './listing-checks.js'
import { EvaluatedListingSchema } from './views.js'

/**
 * Les réponses d'une vérification (lot 15) : à blanc (`check_listing`,
 * rien n'est écrit) et enregistrée (`apply_listing_check`). Séparées de
 * `listing-checks.ts`, qui sert aussi à décrire une annonce vue
 * (`views.ts`), pour éviter une importation circulaire.
 */

/** Une vérification à blanc : ce qui a changé, ce que l'enregistrement ferait. */
export const ListingCheckPreviewSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  currentStatus: ListingStatusSchema,
  guards: z
    .object({
      expectedUpdatedAt: z.string().datetime(),
      expectedPrice: z.number(),
    })
    .describe(
      'Les garde-fous à repasser tels quels à apply_listing_check (état lu de la fiche)'
    ),
  observed: ListingObservedSchema.describe(
    'Les valeurs comparées : celles lues par Claude, complétées par l’extraction du texte'
  ),
  outcome: ListingCheckOutcomeSchema.nullable().describe(
    'Résultat que l’enregistrement retiendrait ; null si l’entrée est incohérente (voir problem)'
  ),
  problem: z
    .string()
    .nullable()
    .describe(
      'Pourquoi l’enregistrement serait refusé (résultat incohérent avec les valeurs observées)'
    ),
  changes: z.array(ListingCheckChangeSchema),
  summary: z.string(),
  applies: z
    .array(ListingCheckFieldSchema)
    .describe('Champs que l’enregistrement écrirait dans la fiche'),
  updatesLastSeenOnline: z
    .boolean()
    .describe('Vrai si l’enregistrement noterait l’annonce vue en ligne'),
  suggestion: ListingCheckSuggestionSchema.nullable(),
  duplicates: z
    .array(DuplicateCandidateSchema)
    .describe(
      'Annonces de l’espace qui ressemblent à la page lue : republications probables'
    ),
  republication: ListingRepublicationSchema,
  extraction: z
    .object({
      usage: ExtractionUsageSchema,
      warnings: z.array(z.string()),
    })
    .nullable()
    .describe('Avec pageText : le coût de l’extraction et ses remarques'),
  persisted: z.literal(false),
})
export type ListingCheckPreview = z.infer<typeof ListingCheckPreviewSchema>

/** Une vérification enregistrée : la ligne, la fiche à jour, le statut proposé. */
export const ListingCheckWriteResultSchema = z.object({
  check: ListingCheckSchema,
  listing: EvaluatedListingSchema.describe('L’annonce après la vérification'),
  suggestion: ListingCheckSuggestionSchema.nullable().describe(
    'Statut proposé (jamais appliqué) : à faire confirmer, puis set_listing_status'
  ),
  linked: LinkedListingSchema.nullable().describe(
    'Annonce rattachée par une republication'
  ),
})
export type ListingCheckWriteResult = z.infer<
  typeof ListingCheckWriteResultSchema
>
