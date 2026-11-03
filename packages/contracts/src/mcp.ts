import { z } from 'zod'
import { OpinionInputSchema } from './collaboration.js'
import { ListingFiltersSchema } from './filters.js'
import {
  ListingInputSchema,
  ListingStatusChangeSchema,
  ListingUpdateGuardsSchema,
  ListingUpdateSchema,
} from './listing.js'
import { EvaluateRequestSchema } from './views.js'

/**
 * Entrées des outils MCP. Chaque schéma réutilise ceux de l'API : un outil
 * accepte exactement ce que le REST accepte, plus l'identifiant de l'annonce
 * et, pour les écritures, la provenance et les garde-fous.
 */

/** Portées OAuth du connecteur. */
export const MCP_SCOPE_READ = 'listings:read'
export const MCP_SCOPE_WRITE = 'listings:write'
export const MCP_SCOPES = [MCP_SCOPE_READ, MCP_SCOPE_WRITE] as const
export type McpScope = (typeof MCP_SCOPES)[number]

/** Provenance que le MCP attribue aux champs qu'il écrit. */
export const McpProvenanceSchema = z
  .enum(['ai', 'user'])
  .default('ai')
  .describe(
    "Provenance des champs écrits : « ai » quand Claude a lu l'annonce, « user » quand il relaie une valeur dictée par le membre"
  )
export type McpProvenance = z.infer<typeof McpProvenanceSchema>

const listingId = z
  .string()
  .uuid()
  .describe("Identifiant de l'annonce (uuid, voir list_listings)")

export const McpListListingsInputSchema = ListingFiltersSchema
export type McpListListingsInput = z.infer<typeof McpListListingsInputSchema>

export const McpGetListingInputSchema = z.object({ listingId })
export type McpGetListingInput = z.infer<typeof McpGetListingInputSchema>

export const McpEvaluateListingInputSchema = EvaluateRequestSchema
export type McpEvaluateListingInput = z.infer<
  typeof McpEvaluateListingInputSchema
>

export const McpCreateListingInputSchema = z.object({
  listing: ListingInputSchema.describe(
    "L'annonce normalisée : titre et prix obligatoires, le reste si l'annonce le donne"
  ),
  provenance: McpProvenanceSchema,
})
export type McpCreateListingInput = z.infer<typeof McpCreateListingInputSchema>

export const McpUpdateListingInputSchema = z.object({
  listingId,
  patch: ListingUpdateSchema.describe(
    'Champs à modifier ; les sous-objets fournis (travaux, phase 2, localisation) remplacent les existants'
  ),
  ...ListingUpdateGuardsSchema.shape,
  provenance: McpProvenanceSchema,
})
export type McpUpdateListingInput = z.infer<typeof McpUpdateListingInputSchema>

export const McpSetListingStatusInputSchema = z.object({
  listingId,
  ...ListingStatusChangeSchema.shape,
})
export type McpSetListingStatusInput = z.infer<
  typeof McpSetListingStatusInputSchema
>

export const McpAddOpinionInputSchema = z.object({
  listingId,
  ...OpinionInputSchema.shape,
})
export type McpAddOpinionInput = z.infer<typeof McpAddOpinionInputSchema>

export const McpAddTaskInputSchema = z.object({
  listingId,
  label: z.string().min(1).max(300).describe('Libellé de la tâche'),
  assigneeHandle: z
    .string()
    .max(40)
    .optional()
    .describe(
      'Membre à qui l’assigner, par son identifiant court (« richard », « chloe »)'
    ),
})
export type McpAddTaskInput = z.infer<typeof McpAddTaskInputSchema>

export const McpCompleteTaskInputSchema = z.object({
  listingId,
  taskId: z
    .string()
    .uuid()
    .describe('Identifiant de la tâche (voir get_listing)'),
  done: z
    .boolean()
    .default(true)
    .describe('Vrai = cocher (défaut), faux = décocher'),
})
export type McpCompleteTaskInput = z.infer<typeof McpCompleteTaskInputSchema>
