import { z } from 'zod'
import {
  ActivityChannelSchema,
  FieldSourceSchema,
  ListingStatusSchema,
  MemberRoleSchema,
  MemberStatusSchema,
  OfferChannelSchema,
  OfferResponseSchema,
  TaskOriginSchema,
} from './enums.js'
import { InvitationSchema } from './members.js'
import { ListingQuestionFieldSchema } from './question-fields.js'

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
  status: MemberStatusSchema,
  createdAt: z.string().datetime(),
  joinedAt: z
    .string()
    .datetime()
    .nullable()
    .describe(
      "Première connexion dans l'espace (invitation acceptée, membre pré-créé rattaché) ; null si inconnue"
    ),
  removedAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Date du retrait ou du départ ; null pour un membre actif'),
})
export type Member = z.infer<typeof MemberSchema>

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  members: z
    .array(MemberSchema)
    .describe(
      'Membres actifs puis anciens membres (retirés ou partis, pour leur historique)'
    ),
  invitations: z
    .array(InvitationSchema)
    .describe('Invitations en attente, expirées ou refusées (lot 8)'),
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
  field: ListingQuestionFieldSchema.nullable()
    .default(null)
    .describe(
      "Lot 17 : le champ de la fiche que la tâche demande à l'annonceur ; null pour une tâche qui n'en demande aucun"
    ),
})
export type TaskInput = z.infer<typeof TaskInputSchema>
export type TaskInputRaw = z.input<typeof TaskInputSchema>

export const TaskSchema = TaskInputSchema.extend({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  done: z.boolean(),
  doneAt: z.string().datetime().nullable(),
  position: z.number().int().min(0).describe("Ordre d'affichage"),
  createdAt: z.string().datetime(),
  requestedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe(
      "Lot 17 : date d'envoi de la demande à l'annonceur qui porte la tâche ; null si elle n'a pas été demandée"
    ),
  requestId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Lot 17 : la demande à l'annonceur qui porte la tâche"),
  answeredAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe(
      "Lot 17 : date de la réponse de l'annonceur qui a fait cocher la tâche ; null sinon"
    ),
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

/** Une offre d'achat à enregistrer : montant, date, canal, réponse connue. */
export const OfferInputSchema = z.object({
  amount: z.number().min(0).describe("Montant de l'offre en euros"),
  madeAt: z
    .string()
    .datetime()
    .optional()
    .describe("Date de l'offre, ISO 8601 ; absent = maintenant"),
  channel: OfferChannelSchema.nullable().default(null),
  response: OfferResponseSchema.default('pending').describe(
    'Réponse du vendeur déjà connue ; « pending » (défaut) en attendant'
  ),
  counterAmount: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Contre-proposition du vendeur en euros, si réponse « counter_offer »'
    ),
  notes: z.string().max(5000).nullable().default(null),
})
export type OfferInput = z.infer<typeof OfferInputSchema>
export type OfferInputRaw = z.input<typeof OfferInputSchema>

/** Réponse du vendeur à une offre existante ; au moins un champ à modifier. */
export const OfferUpdateSchema = z
  .object({
    response: OfferResponseSchema.optional(),
    counterAmount: z
      .number()
      .min(0)
      .nullable()
      .optional()
      .describe('Contre-proposition du vendeur en euros'),
    notes: z.string().max(5000).nullable().optional(),
    respondedAt: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Date de la réponse, ISO 8601 ; absent = maintenant quand la réponse change'
      ),
    expectedResponse: OfferResponseSchema.optional().describe(
      'Garde-fou optimiste : réponse actuelle attendue ; refus si différente'
    ),
  })
  .refine(
    value =>
      value.response !== undefined ||
      value.counterAmount !== undefined ||
      value.notes !== undefined,
    { message: 'Au moins un champ à modifier (response, counterAmount, notes)' }
  )
export type OfferUpdate = z.infer<typeof OfferUpdateSchema>

export const OfferSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  madeAt: z.string().datetime(),
  amount: z.number().min(0).describe("Montant de l'offre en euros"),
  channel: OfferChannelSchema.nullable(),
  response: OfferResponseSchema,
  counterAmount: z
    .number()
    .min(0)
    .nullable()
    .describe('Contre-proposition du vendeur en euros'),
  respondedAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Date de la réponse du vendeur'),
  notes: z.string().max(5000).nullable(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Offer = z.infer<typeof OfferSchema>

/**
 * Réponse d'une écriture d'offre : l'offre, la liste à jour, et le statut
 * que l'offre suggère pour l'annonce (« offre faite », « offre acceptée »,
 * « offre refusée ») ; il n'est jamais appliqué d'office.
 */
export const OfferWriteResultSchema = z.object({
  offer: OfferSchema,
  offers: z
    .array(OfferSchema)
    .describe(
      'Toutes les offres de l’annonce, de la plus récente à la plus ancienne'
    ),
  currentStatus: ListingStatusSchema,
  suggestedStatus: ListingStatusSchema.nullable().describe(
    'Statut proposé à la suite de cette offre ; null si le statut actuel convient déjà'
  ),
})
export type OfferWriteResult = z.infer<typeof OfferWriteResultSchema>

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
