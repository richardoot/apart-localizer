import { z } from 'zod'
import {
  ActivityChannelSchema,
  FieldSourceSchema,
  MemberRoleSchema,
  OfferResponseSchema,
  TaskOriginSchema,
} from './enums.js'

/** Membre d'un espace de travail. */
export const MemberSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  handle: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/)
    .describe(
      "Identifiant court et stable dans l'espace (« richard », « chloe »)"
    ),
  displayName: z.string().min(1).max(120),
  email: z.string().email().nullable(),
  authUserId: z
    .string()
    .nullable()
    .describe(
      "Identifiant Supabase Auth ; null tant que le membre ne s'est pas connecté"
    ),
  role: MemberRoleSchema,
  createdAt: z.string().datetime(),
})
export type Member = z.infer<typeof MemberSchema>

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  members: z.array(MemberSchema),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

/** Réponse de `GET /workspace` : l'espace et le membre connecté. */
export const WorkspaceMeSchema = z.object({
  workspace: WorkspaceSchema,
  me: MemberSchema,
})
export type WorkspaceMe = z.infer<typeof WorkspaceMeSchema>

export const OpinionInputSchema = z.object({
  rating: z
    .number()
    .int()
    .min(0)
    .max(5)
    .describe('Note sur 5 ; 0 = pas de note, texte seul'),
  text: z.string().max(5000).default(''),
})
export type OpinionInput = z.infer<typeof OpinionInputSchema>

export const OpinionSchema = OpinionInputSchema.extend({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  memberId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Opinion = z.infer<typeof OpinionSchema>

export const TaskInputSchema = z.object({
  label: z.string().min(1).max(300),
  assigneeId: z.string().uuid().nullable().default(null),
  origin: TaskOriginSchema.default('manual'),
})
export type TaskInput = z.infer<typeof TaskInputSchema>

export const TaskSchema = TaskInputSchema.extend({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  done: z.boolean(),
  doneAt: z.string().datetime().nullable(),
  position: z.number().int().min(0).describe("Ordre d'affichage"),
  createdAt: z.string().datetime(),
})
export type Task = z.infer<typeof TaskSchema>

/** Mise à jour d'une tâche : cocher ou décocher, renommer, assigner. */
export const TaskUpdateSchema = z
  .object({
    done: z.boolean().optional().describe('Vrai = faite, faux = à faire'),
    label: z.string().min(1).max(300).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
  })
  .refine(
    value =>
      value.done !== undefined ||
      value.label !== undefined ||
      value.assigneeId !== undefined,
    { message: 'Au moins un champ à modifier' }
  )
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>

/** Checklist par défaut d'une nouvelle annonce, reprise de l'artefact. */
export const DEFAULT_TASKS: readonly string[] = [
  'Demander le montant des charges de copropriété annuelles (budget prévisionnel)',
  'Demander le montant de la taxe foncière',
  "Demander les 3 derniers PV d'AG et vérifier les procédures en cours",
  'Demander le DTG ou le plan pluriannuel de travaux de la copropriété',
  "Évaluer l'ampleur réelle des travaux",
  'Vérifier le loyer de marché (et le plafond si commune de Bordeaux)',
  'Vérifier la desserte (tram, bus) et le stationnement',
  'Vérifier dans le règlement de copropriété que la location visée est autorisée',
  'Vérifier auprès de la mairie si un permis de louer est exigé dans le secteur',
]

export const PriceEventSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  oldPrice: z.number().min(0).nullable().describe('Ancien prix en euros'),
  newPrice: z.number().min(0).describe('Nouveau prix en euros'),
  source: FieldSourceSchema,
})
export type PriceEvent = z.infer<typeof PriceEventSchema>

/**
 * Baisse ou hausse constatée sur l'annonce source : met le prix affiché à
 * jour et ajoute une ligne à l'historique.
 */
export const PriceEventInputSchema = z.object({
  newPrice: z.number().min(0).describe('Nouveau prix affiché en euros'),
  occurredAt: z
    .string()
    .datetime()
    .optional()
    .describe('Date du constat, ISO 8601 ; absent = maintenant'),
  source: FieldSourceSchema.default('user'),
  expectedPrice: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Garde-fou optimiste : prix actuel attendu en euros ; refus si différent'
    ),
})
export type PriceEventInput = z.infer<typeof PriceEventInputSchema>

export const OfferSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  madeAt: z.string().datetime(),
  amount: z.number().min(0).describe("Montant de l'offre en euros"),
  response: OfferResponseSchema,
  counterAmount: z
    .number()
    .min(0)
    .nullable()
    .describe('Contre-proposition du vendeur en euros'),
  notes: z.string().max(5000).nullable(),
})
export type Offer = z.infer<typeof OfferSchema>

export const ActivityLogSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  listingId: z.string().uuid().nullable(),
  actorMemberId: z.string().uuid().nullable(),
  channel: ActivityChannelSchema,
  action: z
    .string()
    .max(80)
    .describe('Action (listing.created, listing.status_changed...)'),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.string().datetime(),
})
export type ActivityLog = z.infer<typeof ActivityLogSchema>
