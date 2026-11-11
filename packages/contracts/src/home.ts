import { z } from 'zod'
import { TaskSchema } from './collaboration.js'
import { WorkflowStageSchema } from './decisions.js'
import { ListingStatusSchema } from './enums.js'

/**
 * Lot 23 (ADR 0033) : ce que l'accueil lit en plus de « Ce qui t'attend »
 * (`WorkflowOverviewSchema`) : toutes les tâches ouvertes, par annonce et par
 * retard (`GET /tasks/open`), et la mise en route d'un espace vide (`GET
 * /workspace/getting-started`). Les règles sont dans `domain`
 * (`open-tasks.ts`, `getting-started.ts`).
 */

// ---------------------------------------------------------------------------
// Toutes les tâches ouvertes
// ---------------------------------------------------------------------------

export const OpenTaskSchema = TaskSchema.extend({
  overdue: z
    .boolean()
    .describe('Ouverte depuis plus de `overdueDays` jours (en retard)'),
  openDays: z
    .number()
    .int()
    .min(0)
    .describe('Jours entiers depuis la création de la tâche'),
})
export type OpenTask = z.infer<typeof OpenTaskSchema>

export const OpenTasksListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
  stage: WorkflowStageSchema,
  commune: z.string().nullable(),
})
export type OpenTasksListing = z.infer<typeof OpenTasksListingSchema>

export const OpenTasksGroupSchema = z.object({
  listing: OpenTasksListingSchema,
  overdue: z.number().int().min(0).describe('Tâches en retard de l’annonce'),
  tasks: z
    .array(OpenTaskSchema)
    .describe(
      'Les tâches ouvertes, en retard d’abord (la plus ancienne en tête), puis dans l’ordre de la fiche'
    ),
})
export type OpenTasksGroup = z.infer<typeof OpenTasksGroupSchema>

/** `GET /tasks/open`. */
export const OpenTasksSchema = z.object({
  open: z.number().int().min(0),
  overdue: z.number().int().min(0),
  overdueDays: z.number().int().min(1),
  groups: z
    .array(OpenTasksGroupSchema)
    .describe(
      'Une entrée par annonce suivie qui a des tâches ouvertes : celles qui ont du retard d’abord (le plus de retard en tête), puis les autres par nombre de tâches'
    ),
})
export type OpenTasks = z.infer<typeof OpenTasksSchema>

// ---------------------------------------------------------------------------
// Mise en route
// ---------------------------------------------------------------------------

export const GettingStartedStepKeySchema = z.enum([
  'assumptions',
  'criteria',
  'listing',
  'claude',
])
export type GettingStartedStepKey = z.infer<typeof GettingStartedStepKeySchema>

export const GettingStartedStepSchema = z.object({
  key: GettingStartedStepKeySchema,
  done: z.boolean(),
  title: z.string().describe('« Régler tes hypothèses »'),
  text: z
    .string()
    .describe(
      'Ce que l’étape apporte, ou ce qui est déjà fait (« 2 critères actifs »)'
    ),
})
export type GettingStartedStep = z.infer<typeof GettingStartedStepSchema>

/** Ce que la mise en route lit de l'espace : des faits, pas de calcul. */
export const GettingStartedFactsSchema = z.object({
  assumptionsSaved: z
    .boolean()
    .describe(
      'Un membre a enregistré les hypothèses (elles ne sont plus celles par défaut)'
    ),
  criteriaCount: z
    .number()
    .int()
    .min(0)
    .describe('Critères de recherche actifs'),
  listingCount: z
    .number()
    .int()
    .min(0)
    .describe('Annonces suivies, toutes étapes'),
  draftCount: z.number().int().min(0).describe('Annonces À valider'),
  claudeSeen: z
    .boolean()
    .describe(
      'Le connecteur MCP a déjà écrit dans l’espace (journal, canal `mcp`) ; une lecture seule ne laisse pas de trace'
    ),
})
export type GettingStartedFacts = z.infer<typeof GettingStartedFactsSchema>

/** `GET /workspace/getting-started`. */
export const GettingStartedSchema = z.object({
  mode: z
    .enum(['full', 'compact', 'none'])
    .describe(
      'full : espace vide, la liste remplace les chiffres ; compact : reste au moins une étape ; none : tout est fait'
    ),
  doneCount: z.number().int().min(0),
  steps: z.array(GettingStartedStepSchema).describe('Dans l’ordre conseillé'),
})
export type GettingStarted = z.infer<typeof GettingStartedSchema>
