import { z } from 'zod'
import { ActivityChannelSchema, ListingStatusSchema } from './enums.js'
import type { ListingStatus } from './enums.js'

/**
 * Lot 21 (ADR 0031) : suivre ses annonces, étape par étape. Les six étapes
 * de la page Annonces (`?etape=`), les décisions qui se prennent à plusieurs
 * (une proposition, des réponses par membre), le réglage de l'espace
 * « Décider à plusieurs » et ce que la page lit pour ses compteurs et son
 * bandeau « Ce qui t'attend ». Les règles sont dans `domain`
 * (`decisions.ts`, `workflow.ts`), les textes du journal et des
 * notifications dans `decision-activity.ts`.
 */

// ---------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------

export const WorkflowStageSchema = z
  .enum([
    'a-valider',
    'a-etudier',
    'a-visiter',
    'visitees',
    'offres',
    'archives',
  ])
  .describe(
    "Étape du suivi, identifiant d'URL (`?etape=`) : à valider (brouillons en attente), à étudier, à visiter, visitées, offres, archives"
  )
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>

/** Les étapes, dans l'ordre de la barre. */
export const WORKFLOW_STAGES: readonly WorkflowStage[] =
  WorkflowStageSchema.options

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  'a-valider': 'À valider',
  'a-etudier': 'À étudier',
  'a-visiter': 'À visiter',
  visitees: 'Visitées',
  offres: 'Offres',
  archives: 'Archives',
}

/** La question de chaque étape, en tête de la liste. */
export const WORKFLOW_STAGE_QUESTIONS: Record<WorkflowStage, string> = {
  'a-valider': 'On la garde ?',
  'a-etudier': 'Ça vaut une visite ?',
  'a-visiter': 'Quand y va-t-on ?',
  visitees: 'On en pense quoi ?',
  offres: 'Où en est-on ?',
  archives: 'Ce qu’on a laissé de côté',
}

export const WORKFLOW_STAGE_INTROS: Record<WorkflowStage, string> = {
  'a-valider':
    'Les brouillons de Claude et des alertes. Une annonce n’entre dans le suivi que si tout le monde est d’accord.',
  'a-etudier':
    'On regarde les chiffres et la fiche, puis on décide : on visite ou on écarte.',
  'a-visiter': 'Les annonces sans date d’abord, puis les visites dans l’ordre.',
  visitees:
    'Les avis de chacun côte à côte, pour décider : offre, contre-visite ou on écarte.',
  offres: 'Les offres en cours et leurs réponses.',
  archives: 'Rien n’est perdu : une annonce écartée se repêche à tout moment.',
}

/** Les statuts de chaque étape d'annonces (« À valider » = les brouillons). */
export const STAGE_STATUSES: Record<
  Exclude<WorkflowStage, 'a-valider'>,
  readonly ListingStatus[]
> = {
  'a-etudier': ['to_study'],
  'a-visiter': ['to_visit'],
  visitees: ['visited'],
  offres: ['offer_made', 'offer_accepted'],
  archives: ['discarded', 'offer_refused', 'sold_or_withdrawn'],
}

/** Le mode tri porte sur ces étapes. */
export const TRIAGE_STAGES: readonly WorkflowStage[] = [
  'a-valider',
  'a-etudier',
]

// ---------------------------------------------------------------------------
// Les propositions
// ---------------------------------------------------------------------------

export const DecisionTargetKindSchema = z
  .enum(['listing', 'draft'])
  .describe('Ce que la décision vise : une annonce suivie, ou un brouillon')
export type DecisionTargetKind = z.infer<typeof DecisionTargetKindSchema>

export const DecisionChoiceSchema = z
  .enum(['keep', 'to_visit', 'discard'])
  .describe(
    'Le choix : keep (un brouillon devient une annonce à étudier ; une annonce reste où elle est), to_visit (passer À visiter), discard (écarter)'
  )
export type DecisionChoice = z.infer<typeof DecisionChoiceSchema>

export const DecisionStateSchema = z
  .enum(['open', 'to_settle', 'applied', 'withdrawn', 'stale'])
  .describe(
    'État d’une proposition : ouverte (en attente des autres membres), à trancher ensemble (les choix diffèrent), appliquée, retirée par son auteur, caduque (l’annonce ou le brouillon a changé entre-temps)'
  )
export type DecisionState = z.infer<typeof DecisionStateSchema>

export const DECISION_STATE_LABELS: Record<DecisionState, string> = {
  open: 'En attente',
  to_settle: 'À trancher',
  applied: 'Appliquée',
  withdrawn: 'Retirée',
  stale: 'Caduque',
}

/** Les états d'une proposition qui attend encore quelque chose. */
export const OPEN_DECISION_STATES: readonly DecisionState[] = [
  'open',
  'to_settle',
]

export const DecisionResolutionSchema = z
  .enum(['agreed', 'settled', 'without_waiting'])
  .describe(
    'Comment une proposition s’est appliquée : d’accord de tous, tranchée ensemble, ou décidée sans attendre'
  )
export type DecisionResolution = z.infer<typeof DecisionResolutionSchema>

/** Longueur maximale d'une raison (la colonne des brouillons et des annonces). */
export const DECISION_REASON_MAX = 500

/** Les raisons proposées en un clic pour écarter ; « Autre » ouvre le texte libre. */
export const DISCARD_QUICK_REASONS = [
  'Trop cher',
  'Quartier',
  'Trop de travaux',
  'Trop petit',
  'Déjà vue',
] as const

const reasonText = z.string().trim().max(DECISION_REASON_MAX)

export const DecisionTargetSchema = z
  .object({
    kind: DecisionTargetKindSchema,
    id: z.string().uuid(),
  })
  .strict()
export type DecisionTarget = z.infer<typeof DecisionTargetSchema>

const SessionIdSchema = z
  .string()
  .uuid()
  .describe(
    'La session de tri : les propositions et réponses d’une session font une seule notification, à la fin'
  )

/**
 * `POST /decisions` : garder ou écarter un brouillon, passer une annonce À
 * visiter, écarter une annonce. Une proposition si l'espace décide à
 * plusieurs, sinon appliqué tout de suite.
 */
export const DecisionInputSchema = z
  .object({
    target: DecisionTargetSchema,
    choice: DecisionChoiceSchema,
    reason: reasonText
      .nullable()
      .optional()
      .describe('Pourquoi : obligatoire pour écarter'),
    sessionId: SessionIdSchema.optional(),
    expectedStatus: ListingStatusSchema.optional().describe(
      'Garde-fou optimiste : statut attendu de l’annonce ; refus si différent'
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.choice === 'discard' && !value.reason?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Écarter demande une raison',
      })
    }
    if (value.target.kind === 'draft' && value.choice === 'to_visit') {
      ctx.addIssue({
        code: 'custom',
        path: ['choice'],
        message: 'Un brouillon se garde ou s’écarte',
      })
    }
    if (value.target.kind === 'listing' && value.choice === 'keep') {
      ctx.addIssue({
        code: 'custom',
        path: ['choice'],
        message: 'Une annonce passe À visiter ou s’écarte',
      })
    }
  })
export type DecisionInput = z.infer<typeof DecisionInputSchema>

/** `POST /decisions/:id/respond` : d'accord, ou non avec un autre choix. */
export const DecisionRespondSchema = z
  .object({
    agree: z.boolean().describe('Vrai : d’accord avec la proposition'),
    choice: DecisionChoiceSchema.optional().describe(
      'Avec `agree: false` : le choix à la place'
    ),
    reason: reasonText.nullable().optional(),
    sessionId: SessionIdSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.agree && !value.choice) {
      ctx.addIssue({
        code: 'custom',
        path: ['choice'],
        message: 'Dire non demande le choix à la place',
      })
    }
    if (!value.agree && value.choice === 'discard' && !value.reason?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Écarter demande une raison',
      })
    }
  })
export type DecisionRespond = z.infer<typeof DecisionRespondSchema>

/** `POST /decisions/:id/settle` : un clic sur l'un des choix suffit. */
export const DecisionSettleSchema = z
  .object({ choice: DecisionChoiceSchema })
  .strict()
export type DecisionSettle = z.infer<typeof DecisionSettleSchema>

/** La réponse de la fin d'une session de tri. */
export const DecisionSessionResultSchema = z.object({
  notified: z
    .boolean()
    .describe('Vrai si une notification vient de partir pour cette session'),
  applied: z.number().int().min(0),
  stale: z.number().int().min(0),
  message: z.string(),
})
export type DecisionSessionResult = z.infer<typeof DecisionSessionResultSchema>

/** `PATCH /workspace/decisions` : réservé aux propriétaires, journalisé. */
export const DecisionSettingsUpdateSchema = z
  .object({
    decideTogether: z
      .boolean()
      .describe(
        '« Décider à plusieurs » : un changement d’étape attend l’accord de tous'
      ),
  })
  .strict()
export type DecisionSettingsUpdate = z.infer<
  typeof DecisionSettingsUpdateSchema
>

const MemberRefSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
})
export type DecisionMemberRef = z.infer<typeof MemberRefSchema>

export const DecisionResponseViewSchema = z.object({
  member: MemberRefSchema,
  agrees: z.boolean(),
  choice: DecisionChoiceSchema.nullable().describe(
    'Le choix à la place, quand ce membre n’est pas d’accord'
  ),
  reason: z.string().nullable(),
  at: z.string().datetime(),
})
export type DecisionResponseView = z.infer<typeof DecisionResponseViewSchema>

/** Ce que le membre connecté peut faire sur une proposition (`domain`). */
export const DecisionViewerSchema = z.object({
  isAuthor: z.boolean(),
  hasResponded: z.boolean(),
  canRespond: z.boolean().describe('À toi de confirmer'),
  canWithdraw: z.boolean(),
  canDecideNow: z
    .boolean()
    .describe(
      '« Décider sans attendre » (l’auteur, sur une proposition ouverte)'
    ),
  canSettle: z.boolean().describe('À trancher ensemble : un clic suffit'),
  nobodyLeft: z
    .boolean()
    .describe(
      'Plus personne à attendre (membres retirés ou partis) : applicable par son auteur'
    ),
})
export type DecisionViewer = z.infer<typeof DecisionViewerSchema>

/** Une proposition telle qu'un membre la lit. */
export const DecisionProposalSchema = z.object({
  id: z.string().uuid(),
  target: DecisionTargetKindSchema,
  listingId: z.string().uuid().nullable(),
  draftId: z.string().uuid().nullable(),
  title: z.string().describe('Le titre de l’annonce ou du brouillon'),
  choice: DecisionChoiceSchema,
  choiceLabel: z.string().describe('« À visiter », « Écarter »'),
  reason: z.string().nullable(),
  state: DecisionStateSchema,
  resolution: DecisionResolutionSchema.nullable(),
  appliedChoice: DecisionChoiceSchema.nullable(),
  fromStatus: ListingStatusSchema.nullable().describe(
    'Le statut de l’annonce au moment de la proposition ; null pour un brouillon'
  ),
  fromStage: WorkflowStageSchema,
  author: MemberRefSchema.nullable(),
  channel: ActivityChannelSchema,
  sessionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  closedBy: MemberRefSchema.nullable(),
  responses: z.array(DecisionResponseViewSchema),
  waitingFor: z
    .array(MemberRefSchema)
    .describe('Les membres actifs qui n’ont pas encore répondu'),
  settleOptions: z
    .array(DecisionChoiceSchema)
    .describe(
      'Les choix entre lesquels trancher ; vide tant que tout le monde va dans le même sens'
    ),
  viewer: DecisionViewerSchema,
})
export type DecisionProposal = z.infer<typeof DecisionProposalSchema>

/** Une proposition dans l'export : sans ce que le membre qui exporte peut en faire. */
export const ExportDecisionProposalSchema = DecisionProposalSchema.omit({
  viewer: true,
})
export type ExportDecisionProposal = z.infer<
  typeof ExportDecisionProposalSchema
>

export const DecisionOutcomeSchema = z
  .enum(['proposed', 'applied', 'waiting', 'to_settle', 'stale', 'withdrawn'])
  .describe(
    'Ce qui s’est passé : proposé (rien ne bouge), appliqué, en attente des autres réponses, à trancher ensemble, caduque (rien n’est appliqué), retiré'
  )
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>

/** La réponse d'une écriture de décision. */
export const DecisionResultSchema = z.object({
  outcome: DecisionOutcomeSchema,
  message: z.string().describe('La phrase à montrer à l’écran'),
  proposal: DecisionProposalSchema.nullable(),
  listingId: z
    .string()
    .uuid()
    .nullable()
    .describe('L’annonce concernée, ou celle que le brouillon vient de créer'),
  draftId: z.string().uuid().nullable(),
  createdListing: z
    .boolean()
    .describe(
      'Vrai si un brouillon vient de devenir une annonce : rien à annuler'
    ),
  undoable: z.boolean().describe('Vrai si « Annuler » est offert'),
})
export type DecisionResult = z.infer<typeof DecisionResultSchema>

// ---------------------------------------------------------------------------
// Ce que la page lit : compteurs et « Ce qui t'attend »
// ---------------------------------------------------------------------------

export const WorkflowStageCountSchema = z.object({
  stage: WorkflowStageSchema,
  count: z
    .number()
    .int()
    .min(0)
    .describe('Annonces de l’étape, hors critères repliées non comptées'),
  outOfCriteria: z.number().int().min(0),
  toSort: z.number().int().min(0),
  sub: z.string().describe('« 4 à trier », « 1 sans date »'),
})
export type WorkflowStageCount = z.infer<typeof WorkflowStageCountSchema>

export const WorkflowAgendaKeySchema = z.enum([
  'to_sort',
  'to_confirm',
  'to_settle',
  'ready',
  'visits_to_plan',
  'opinions_to_give',
])
export type WorkflowAgendaKey = z.infer<typeof WorkflowAgendaKeySchema>

export const WorkflowAgendaItemSchema = z.object({
  key: WorkflowAgendaKeySchema,
  count: z.number().int().min(1),
  label: z.string().describe('« à trier », « visite à planifier »'),
  stage: WorkflowStageSchema.nullable().describe(
    'L’étape à ouvrir ; null pour le tri des propositions ou « À trancher ensemble »'
  ),
})
export type WorkflowAgendaItem = z.infer<typeof WorkflowAgendaItemSchema>

/** `GET /decisions/overview`. */
export const WorkflowOverviewSchema = z.object({
  decideTogether: z.boolean(),
  agreementRequired: z
    .boolean()
    .describe(
      'Vrai si les décisions à deux attendent l’accord de tous : au moins deux membres actifs et le réglage activé'
    ),
  others: z
    .array(MemberRefSchema)
    .describe('Les autres membres actifs : « Terminer et prévenir … »'),
  stages: z.array(WorkflowStageCountSchema),
  agenda: z
    .array(WorkflowAgendaItemSchema)
    .describe('Ce qui t’attend, dans l’ordre du bandeau'),
  proposals: z
    .array(DecisionProposalSchema)
    .describe('Les propositions ouvertes ou à trancher de l’espace'),
})
export type WorkflowOverview = z.infer<typeof WorkflowOverviewSchema>

/** Les faits d'une ligne d'étape que la liste des annonces porte (`EvaluatedListing.stage`). */
export const ListingStageFactsSchema = z.object({
  nextVisitAt: z
    .string()
    .datetime()
    .nullable()
    .describe('La prochaine visite prévue ; null s’il n’y en a pas'),
  nextVisitNames: z
    .array(z.string())
    .describe('Les participants de la prochaine visite'),
  lastVisitAt: z
    .string()
    .datetime()
    .nullable()
    .describe('La dernière visite faite'),
  archivedAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Quand l’annonce est entrée aux archives'),
  archivedBy: z
    .string()
    .nullable()
    .describe('Qui l’y a mise : « Richard et Chloé », « Refus du vendeur »'),
})
export type ListingStageFacts = z.infer<typeof ListingStageFactsSchema>
