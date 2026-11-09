import { z } from 'zod'
import { DecisionProposalSchema } from './decisions.js'
import { ListingDraftSchema } from './drafts.js'
import { EvaluatedListingSchema } from './views.js'

/**
 * Lot 21 : une proposition avec ce qu'elle vise, pour le passage du second
 * membre et « À trancher ensemble ». À part de `decisions.ts`, que `views.ts`
 * et `drafts.ts` importent (pas d'import circulaire).
 */
export const DecisionCardSchema = z.object({
  proposal: DecisionProposalSchema,
  listing: EvaluatedListingSchema.nullable(),
  draft: ListingDraftSchema.nullable(),
})
export type DecisionCard = z.infer<typeof DecisionCardSchema>
