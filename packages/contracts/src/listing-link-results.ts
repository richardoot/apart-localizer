import { z } from 'zod'
import { ListingCheckSchema } from './listing-checks.js'
import { ListingLinkSchema } from './listing-links.js'
import { ListingPortalSchema } from './portals.js'
import { EvaluatedListingSchema } from './views.js'

/**
 * Les réponses des écritures sur les liens (lot 18, ADR 0028), à part de
 * `listing-links.ts` (lu par `views.ts`) pour éviter une importation
 * circulaire, comme les vérifications du lot 15.
 */

/** Le prix le plus bas en ligne, gardé en proposition parce que le prix de la fiche a été saisi à la main. */
export const FichePriceProposalSchema = z.object({
  from: z.number().describe('Le prix de la fiche, saisi à la main, gardé'),
  to: z.number().describe('Le prix le plus bas affiché en ligne'),
  portal: ListingPortalSchema.describe('Le portail qui affiche ce prix'),
  text: z.string().describe('La phrase de la proposition'),
})
export type FichePriceProposal = z.infer<typeof FichePriceProposalSchema>

/** Ce qu'un ajout, une vérification, un retrait ou un détachement de lien a fait. */
export const ListingLinkWriteResultSchema = z.object({
  link: ListingLinkSchema.nullable().describe(
    'Le lien ajouté ou modifié ; null après un retrait'
  ),
  check: ListingCheckSchema.nullable().describe(
    'La vérification enregistrée (onglet « Historique » de la fiche) (lien ajouté avec ce qui a été lu, prix ou état relevés) ; null sans lecture'
  ),
  listing: EvaluatedListingSchema.describe('L’annonce après l’écriture'),
  priceProposal: FichePriceProposalSchema.nullable().describe(
    'Le prix le plus bas en ligne n’a pas remplacé le prix saisi à la main : à proposer au membre'
  ),
  summary: z.string().describe('Ce qui a été fait, en une phrase'),
})
export type ListingLinkWriteResult = z.infer<
  typeof ListingLinkWriteResultSchema
>

/** `GET /listings/:id/links`. */
export const ListingLinksResultSchema = z.object({
  links: z.array(ListingLinkSchema),
  fichePrice: z.number().describe('Le prix de la fiche, en euros'),
  lowestOnlinePrice: z
    .number()
    .nullable()
    .describe('Le prix le plus bas des liens en ligne dont le prix est connu'),
  priceProposal: FichePriceProposalSchema.nullable(),
  summary: z.string().describe('« 3 liens · 2 en ligne »'),
})
export type ListingLinksResult = z.infer<typeof ListingLinksResultSchema>
