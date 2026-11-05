import { z } from 'zod'
import { REQUIRED_LISTING_FIELDS } from './ai.js'
import { DEFAULT_TASKS, TaskSchema } from './collaboration.js'
import {
  DpeClassSchema,
  FieldSourceSchema,
  ListingStatusSchema,
} from './enums.js'
import { ListingQuestionFieldSchema } from './question-fields.js'
import type { ListingQuestionField } from './question-fields.js'
import { EvaluatedListingSchema } from './views.js'

/**
 * Lot 17 : questions aux agences (ADR 0027). Claude (claude.ai avec le
 * connecteur, ou Claude Code) prépare les messages qui posent à l'annonceur
 * (agence ou vendeur) les questions ouvertes d'une annonce ; un membre les
 * valide (dans l'application ou dans la conversation) ; Claude les envoie
 * avec ses propres outils (Gmail, messagerie du portail dans le navigateur
 * de l'utilisateur). **Le serveur n'envoie jamais de message à une agence** :
 * il garde la trace (demande, validation, envoi, réponse). La réponse remplit
 * la fiche (source « agence ») et coche les tâches ; une valeur qui contredit
 * une saisie à la main est proposée, jamais écrasée. Les règles et les textes
 * sont dans `domain` (`agency-requests.ts`), l'écriture dans l'API.
 */

/** Relance due après ce nombre de jours ouvrés sans réponse (défaut fixé le 5 novembre 2026). */
export const DEFAULT_FOLLOW_UP_BUSINESS_DAYS = 5
/** Date à laquelle la règle de relance a été fixée (avec Richard, lot 17). */
export const FOLLOW_UP_RULE_DATE = '2026-11-05'
/** Longueur maximale de l'extrait de réponse gardé (téléphones et e-mails masqués). */
export const AGENCY_ANSWER_EXCERPT_MAX = 1000
/** Longueur maximale du texte d'un message. */
export const AGENCY_MESSAGE_MAX = 8000
/** Longueur maximale de l'objet d'un message. */
export const AGENCY_SUBJECT_MAX = 200
/** Longueur maximale de la signature des messages. */
export const AGENCY_SIGNATURE_MAX = 300
/** Longueur maximale d'une référence de fil (identifiant Gmail, lien de conversation). */
export const AGENCY_THREAD_REF_MAX = 500
/** Questions au plus dans une demande. */
export const MAX_QUESTIONS_PER_REQUEST = 30

export const AgencyChannelSchema = z
  .enum(['email', 'portal_message', 'phone', 'other'])
  .describe(
    "Canal d'une demande à l'annonceur : e-mail (Gmail de l'utilisateur), messagerie du portail (dans le navigateur de l'utilisateur), téléphone (appel du membre), autre"
  )
export type AgencyChannel = z.infer<typeof AgencyChannelSchema>

export const AGENCY_CHANNEL_LABELS: Record<AgencyChannel, string> = {
  email: 'E-mail',
  portal_message: 'Messagerie du portail',
  phone: 'Téléphone',
  other: 'Autre',
}

export const AgencyRequestStatusSchema = z
  .enum(['draft', 'approved', 'sent', 'answered', 'no_answer', 'cancelled'])
  .describe(
    "État d'une demande : à valider (brouillon), validée (en attente d'envoi), envoyée, réponse reçue, sans réponse (close, ou relancée), annulée"
  )
export type AgencyRequestStatus = z.infer<typeof AgencyRequestStatusSchema>

export const AGENCY_REQUEST_STATUS_LABELS: Record<AgencyRequestStatus, string> =
  {
    draft: 'À valider',
    approved: 'Validée, à envoyer',
    sent: 'Envoyée',
    answered: 'Réponse reçue',
    no_answer: 'Sans réponse',
    cancelled: 'Annulée',
  }

/** Une demande « en cours » : ses questions ne se reposent pas dans une autre demande. */
export const ACTIVE_AGENCY_REQUEST_STATUSES: readonly AgencyRequestStatus[] = [
  'draft',
  'approved',
  'sent',
]

export const AgencyApprovalViaSchema = z
  .enum(['app', 'chat'])
  .describe(
    "Où l'envoi a été validé : dans l'application (bouton « Valider l'envoi »), ou dans la conversation avec Claude (accord explicite du membre)"
  )
export type AgencyApprovalVia = z.infer<typeof AgencyApprovalViaSchema>

export const AGENCY_APPROVAL_VIA_LABELS: Record<AgencyApprovalVia, string> = {
  app: "dans l'application",
  chat: 'dans la conversation avec Claude',
}

/**
 * La question posée pour chaque champ, telle qu'elle s'écrit dans le
 * message (« Pourriez-vous nous indiquer : - … »).
 */
export const LISTING_QUESTION_TEXTS: Record<ListingQuestionField, string> = {
  addressRaw: "l'adresse exacte du bien",
  surface: 'la surface loi Carrez',
  annualCharges:
    'le montant des charges de copropriété annuelles (budget prévisionnel)',
  propertyTax: 'le montant de la dernière taxe foncière',
  dpeClass:
    'le DPE (classe énergie, consommation et date du diagnostic), si possible le document',
  floor: "l'étage et la présence d'un ascenseur",
  constructionYear: "l'année ou l'époque de construction de l'immeuble",
  lotsCount: 'le nombre de lots de la copropriété',
  votedWorks:
    'les travaux votés en assemblée générale et leur prise en charge (vendeur ou acquéreur)',
  proceedings:
    "les trois derniers procès-verbaux d'assemblée générale et les éventuelles procédures en cours",
  heatingType: 'le mode de chauffage (individuel ou collectif, énergie)',
}

/**
 * Les tâches connues reliées à un champ : la checklist par défaut et les
 * tâches nées d'un champ manquant (lot 2). Sert à la création des tâches et
 * au rattrapage de la migration (libellé exact seulement : une correspondance
 * sûre). Une tâche absente de la table reste sans champ (`null`), mais se
 * pose quand même à l'annonceur si son libellé commence par « Demander ».
 */
export const TASK_FIELD_BY_LABEL: Readonly<
  Record<string, ListingQuestionField>
> = Object.freeze({
  [DEFAULT_TASKS[0] as string]: 'annualCharges',
  [DEFAULT_TASKS[1] as string]: 'propertyTax',
  [DEFAULT_TASKS[2] as string]: 'proceedings',
  ...Object.fromEntries(
    REQUIRED_LISTING_FIELDS.filter(r =>
      (ListingQuestionFieldSchema.options as readonly string[]).includes(
        r.provenanceKey
      )
    ).map(r => [r.taskLabel, r.provenanceKey as ListingQuestionField])
  ),
})

/** Le champ d'une tâche d'après son libellé exact, ou null. */
export function taskFieldForLabel(label: string): ListingQuestionField | null {
  return TASK_FIELD_BY_LABEL[label] ?? null
}

// ---------------------------------------------------------------------------
// Contact de l'annonceur
// ---------------------------------------------------------------------------

const contactText = (max: number, what: string) =>
  z.string().trim().min(1).max(max).describe(what)

const contactFields = {
  agencyName: contactText(120, "Nom de l'agence (ou « particulier »)"),
  contactName: contactText(
    120,
    "Interlocuteur (nom affiché : « Mme [Exemple] »), tel que l'annonce le donne"
  ),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .describe("Adresse e-mail de l'annonceur, telle que l'annonce la donne"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ().-]{6,30}$/, 'Numéro de téléphone illisible')
    .describe("Téléphone de l'annonceur, tel que l'annonce le donne"),
  portalMessageUrl: z
    .string()
    .trim()
    .url()
    .max(2000)
    .describe(
      "Lien de la messagerie du portail (conversation ou bouton « Contacter » de l'annonce)"
    ),
  preferredChannel: AgencyChannelSchema.describe(
    "Canal préféré pour écrire à l'annonceur"
  ),
}

/**
 * Le contact de l'annonceur, saisi ou mis à jour dans l'application (REST) :
 * données personnelles de tiers, minimales (ce que l'annonce donne), toutes
 * facultatives, effaçables (`DELETE /listings/:id/contact`). Un champ à null
 * est vidé.
 */
export const ListingContactInputSchema = z
  .object({
    agencyName: contactFields.agencyName.nullable().default(null),
    contactName: contactFields.contactName.nullable().default(null),
    email: contactFields.email.nullable().default(null),
    phone: contactFields.phone.nullable().default(null),
    portalMessageUrl: contactFields.portalMessageUrl.nullable().default(null),
    preferredChannel: contactFields.preferredChannel.nullable().default(null),
  })
  .refine(value => Object.values(value).some(v => v !== null), {
    message:
      'Au moins un champ du contact (agence, interlocuteur, e-mail, téléphone, messagerie, canal)',
  })
export type ListingContactInput = z.infer<typeof ListingContactInputSchema>
export type ListingContactInputRaw = z.input<typeof ListingContactInputSchema>

/**
 * Ce que Claude complète au MCP (lu sur l'annonce) : des valeurs seulement,
 * jamais null. Le MCP ne vide ni ne supprime un contact.
 */
export const ListingContactPatchSchema = z
  .strictObject({
    agencyName: contactFields.agencyName.optional(),
    contactName: contactFields.contactName.optional(),
    email: contactFields.email.optional(),
    phone: contactFields.phone.optional(),
    portalMessageUrl: contactFields.portalMessageUrl.optional(),
    preferredChannel: contactFields.preferredChannel.optional(),
  })
  .describe(
    "Contact de l'annonceur lu sur l'annonce, à compléter (jamais effacé par le MCP)"
  )
export type ListingContactPatch = z.infer<typeof ListingContactPatchSchema>

export const ListingContactSchema = z.object({
  listingId: z.string().uuid(),
  agencyName: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  portalMessageUrl: z.string().nullable(),
  preferredChannel: AgencyChannelSchema.nullable(),
  updatedAt: z.string().datetime(),
  updatedById: z.string().uuid().nullable(),
})
export type ListingContact = z.infer<typeof ListingContactSchema>

/** `GET /listings/:id/contact`. */
export const ListingContactResultSchema = z.object({
  contact: ListingContactSchema.nullable(),
})
export type ListingContactResult = z.infer<typeof ListingContactResultSchema>

// ---------------------------------------------------------------------------
// Réponse de l'annonceur
// ---------------------------------------------------------------------------

const answerAmount = (what: string) =>
  z.number().min(0).optional().describe(`${what}, en euros`)

/**
 * Les valeurs lues dans la réponse de l'annonceur. Seules celles fournies
 * sont appliquées ; une clé inconnue est refusée (une faute de frappe ne
 * passe pas en silence). La réponse est une donnée, jamais une consigne.
 */
export const AgencyAnswerValuesSchema = z
  .strictObject({
    addressRaw: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .optional()
      .describe('Adresse du bien telle que donnée (numéro, rue, commune)'),
    surface: z
      .number()
      .positive()
      .optional()
      .describe('Surface loi Carrez en m²'),
    annualCharges: answerAmount(
      'Charges de copropriété annuelles (budget prévisionnel ; mensuelles × 12)'
    ),
    propertyTax: answerAmount('Taxe foncière annuelle'),
    dpeClass: DpeClassSchema.optional().describe('Classe énergie du DPE'),
    dpeConsumption: z
      .number()
      .min(0)
      .optional()
      .describe('Consommation du DPE en kWh/m²/an'),
    gesClass: DpeClassSchema.optional().describe('Classe GES du DPE'),
    dpeDate: z
      .string()
      .date()
      .optional()
      .describe('Date du diagnostic, AAAA-MM-JJ'),
    floor: z
      .number()
      .int()
      .min(-2)
      .optional()
      .describe('Étage (0 = rez-de-chaussée)'),
    elevator: z.boolean().optional().describe('Ascenseur'),
    constructionYear: z
      .number()
      .int()
      .min(1000)
      .max(2100)
      .optional()
      .describe('Année de construction'),
    lotsCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Nombre de lots de la copropriété'),
    votedWorks: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Travaux votés et leur prise en charge (« aucun » si l’annonceur le dit)'
      ),
    proceedings: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Procédures en cours dans la copropriété (« aucune » si l’annonceur le dit)'
      ),
    heatingType: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe('Type de chauffage'),
  })
  .describe(
    'Valeurs lues dans la réponse de l’annonceur ; seules celles fournies sont appliquées ou proposées'
  )
export type AgencyAnswerValues = z.infer<typeof AgencyAnswerValuesSchema>

export const AgencyAnswerValueKeySchema = z
  .enum([
    'addressRaw',
    'surface',
    'annualCharges',
    'propertyTax',
    'dpeClass',
    'dpeConsumption',
    'gesClass',
    'dpeDate',
    'floor',
    'elevator',
    'constructionYear',
    'lotsCount',
    'votedWorks',
    'proceedings',
    'heatingType',
  ])
  .describe('Champ de la fiche rempli par une réponse de l’annonceur')
export type AgencyAnswerValueKey = z.infer<typeof AgencyAnswerValueKeySchema>

/** La question à laquelle chaque valeur répond (le DPE porte classe, consommation, GES et date). */
export const AGENCY_ANSWER_VALUE_FIELD: Record<
  AgencyAnswerValueKey,
  ListingQuestionField
> = {
  addressRaw: 'addressRaw',
  surface: 'surface',
  annualCharges: 'annualCharges',
  propertyTax: 'propertyTax',
  dpeClass: 'dpeClass',
  dpeConsumption: 'dpeClass',
  gesClass: 'dpeClass',
  dpeDate: 'dpeClass',
  floor: 'floor',
  elevator: 'floor',
  constructionYear: 'constructionYear',
  lotsCount: 'lotsCount',
  votedWorks: 'votedWorks',
  proceedings: 'proceedings',
  heatingType: 'heatingType',
}

export const AGENCY_ANSWER_VALUE_LABELS: Record<AgencyAnswerValueKey, string> =
  {
    addressRaw: 'Adresse',
    surface: 'Surface Carrez',
    annualCharges: 'Charges annuelles',
    propertyTax: 'Taxe foncière',
    dpeClass: 'DPE',
    dpeConsumption: 'Consommation énergétique',
    gesClass: 'GES',
    dpeDate: 'Date du DPE',
    floor: 'Étage',
    elevator: 'Ascenseur',
    constructionYear: 'Année de construction',
    lotsCount: 'Lots de la copropriété',
    votedWorks: 'Travaux votés',
    proceedings: 'Procédures en cours',
    heatingType: 'Chauffage',
  }

export const AgencyAnswerDispositionSchema = z
  .enum(['applied', 'proposed', 'unchanged'])
  .describe(
    'Sort d’une valeur de la réponse : appliquée à la fiche (source « agence »), proposée (elle contredit une valeur saisie à la main, qui n’est pas écrasée), inchangée (la fiche avait déjà cette valeur)'
  )
export type AgencyAnswerDisposition = z.infer<
  typeof AgencyAnswerDispositionSchema
>

export const AGENCY_ANSWER_DISPOSITION_LABELS: Record<
  AgencyAnswerDisposition,
  string
> = {
  applied: 'appliqué',
  proposed: 'proposé',
  unchanged: 'inchangé',
}

const answerValue = z
  .union([z.string(), z.number(), z.boolean()])
  .nullable()
  .describe('Valeur (euros, m², classe, date, texte), null si vide')

/** Une valeur de la réponse, avant et après, avec son sort et sa phrase. */
export const AgencyAnswerChangeSchema = z.object({
  key: AgencyAnswerValueKeySchema,
  field: ListingQuestionFieldSchema.describe(
    'La question à laquelle la valeur répond'
  ),
  label: z.string(),
  before: answerValue,
  after: answerValue,
  previousSource: FieldSourceSchema.nullable().describe(
    'Provenance de la valeur de la fiche avant la réponse ; null si inconnue'
  ),
  disposition: AgencyAnswerDispositionSchema,
  text: z
    .string()
    .describe(
      '« Charges annuelles : 1 680 € (appliqué) », « Taxe foncière : 950 € proposé, saisi 900 € »'
    ),
  appliedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe('Pour une valeur proposée puis appliquée par un membre : quand'),
})
export type AgencyAnswerChange = z.infer<typeof AgencyAnswerChangeSchema>

/** Une réponse enregistrée sur une demande (une demande peut en recevoir plusieurs : compléments). */
export const AgencyAnswerSchema = z.object({
  receivedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  authorId: z
    .string()
    .uuid()
    .nullable()
    .describe(
      'Le membre qui a enregistré la réponse (ou pour qui Claude l’a fait)'
    ),
  channel: z.enum(['web', 'mcp']),
  excerpt: z
    .string()
    .max(AGENCY_ANSWER_EXCERPT_MAX)
    .nullable()
    .describe(
      'Extrait de la réponse (1 000 caractères au plus), téléphones et e-mails masqués'
    ),
  values: AgencyAnswerValuesSchema,
  changes: z.array(AgencyAnswerChangeSchema),
  completedTaskIds: z
    .array(z.string().uuid())
    .describe('Tâches cochées par cette réponse'),
  summary: z.string(),
})
export type AgencyAnswer = z.infer<typeof AgencyAnswerSchema>

// ---------------------------------------------------------------------------
// Demandes
// ---------------------------------------------------------------------------

/** Une question d'une demande : la tâche, son champ, sa phrase. */
export const AgencyRequestQuestionSchema = z.object({
  taskId: z.string().uuid(),
  label: z.string(),
  field: ListingQuestionFieldSchema.nullable(),
  question: z
    .string()
    .describe('La question telle qu’elle s’écrit dans le message'),
  done: z.boolean(),
})
export type AgencyRequestQuestion = z.infer<typeof AgencyRequestQuestionSchema>

export const AgencyRequestListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
  url: z.string().nullable(),
})
export type AgencyRequestListing = z.infer<typeof AgencyRequestListingSchema>

export const AgencyRequestSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  listing: AgencyRequestListingSchema,
  status: AgencyRequestStatusSchema,
  channel: AgencyChannelSchema,
  recipientName: z
    .string()
    .nullable()
    .describe('Destinataire, nom affiché seulement (« Agence [Exemple] »)'),
  subject: z.string(),
  body: z.string().describe('Le texte du message'),
  taskIds: z.array(z.string().uuid()),
  questions: z.array(AgencyRequestQuestionSchema),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid().nullable(),
  createdChannel: z.enum(['web', 'mcp']),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  approvedVia: AgencyApprovalViaSchema.nullable(),
  approvedById: z.string().uuid().nullable(),
  sentAt: z.string().datetime().nullable(),
  sentById: z.string().uuid().nullable(),
  threadRef: z
    .string()
    .nullable()
    .describe(
      'Référence du fil : identifiant de fil Gmail ou lien de la conversation sur le portail, saisi par Claude'
    ),
  answeredAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Date de la dernière réponse reçue'),
  answers: z.array(AgencyAnswerSchema),
  closedAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Annulation, ou « pas de réponse »'),
  followUpOfId: z
    .string()
    .uuid()
    .nullable()
    .describe('La demande que celle-ci relance'),
  followUpDue: z
    .boolean()
    .describe(
      `Relance due : envoyée sans réponse (ou réponse partielle) depuis ${DEFAULT_FOLLOW_UP_BUSINESS_DAYS} jours ouvrés`
    ),
  followUpDueOn: z
    .string()
    .date()
    .nullable()
    .describe('Jour à partir duquel une relance est due (AAAA-MM-JJ)'),
})
export type AgencyRequest = z.infer<typeof AgencyRequestSchema>

export const OpenQuestionStateSchema = z
  .enum(['open', 'draft', 'approved', 'requested'])
  .describe(
    'Question ouverte : à poser, dans un message à valider, dans un message validé à envoyer, demandée (envoyée, sans réponse)'
  )
export type OpenQuestionState = z.infer<typeof OpenQuestionStateSchema>

/** Une tâche ouverte qu'on peut poser à l'annonceur, et où elle en est. */
export const OpenQuestionSchema = z.object({
  taskId: z.string().uuid(),
  label: z.string(),
  field: ListingQuestionFieldSchema.nullable(),
  question: z.string(),
  state: OpenQuestionStateSchema,
  requestId: z.string().uuid().nullable(),
  requestedAt: z.string().datetime().nullable(),
})
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>

/** `GET /listings/:id/agency-requests` : l'onglet « Échanges » de la fiche. */
export const ListingExchangesSchema = z.object({
  listingId: z.string().uuid(),
  listing: AgencyRequestListingSchema,
  expectedUpdatedAt: z
    .string()
    .datetime()
    .describe(
      'Garde-fou à repasser à record_agency_answer : `updatedAt` de l’annonce lu maintenant'
    ),
  contact: ListingContactSchema.nullable(),
  requests: z
    .array(AgencyRequestSchema)
    .describe('De la plus récente à la plus ancienne'),
  openQuestions: z.array(OpenQuestionSchema),
  signature: z.string().describe('La signature des messages de l’espace'),
  followUpBusinessDays: z.number().int().min(1),
})
export type ListingExchanges = z.infer<typeof ListingExchangesSchema>

/** `list_open_questions` (MCP) : par annonce, les questions, le contact, les demandes en cours. */
export const OpenQuestionsReportSchema = z.object({
  listings: z
    .array(ListingExchangesSchema)
    .describe(
      'Annonces avec une question ouverte ou une demande en cours ; demandes closes ou annulées omises'
    ),
  signature: z.string(),
  followUpBusinessDays: z.number().int().min(1),
})
export type OpenQuestionsReport = z.infer<typeof OpenQuestionsReportSchema>

/** `GET /agency-requests/pending` : ce qui attend un membre, toutes annonces confondues (Synthèse). */
export const PendingAgencyRequestsSchema = z.object({
  toApprove: z
    .array(AgencyRequestSchema)
    .describe('Messages à valider (brouillons), du plus ancien au plus récent'),
  toSend: z
    .array(AgencyRequestSchema)
    .describe(
      'Messages validés, en attente d’envoi par Claude ou par un membre'
    ),
  followUpsDue: z
    .array(AgencyRequestSchema)
    .describe('Demandes envoyées dont la relance est due'),
})
export type PendingAgencyRequests = z.infer<typeof PendingAgencyRequestsSchema>

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

const requestText = {
  subject: z
    .string()
    .trim()
    .min(1)
    .max(AGENCY_SUBJECT_MAX)
    .describe('Objet du message'),
  body: z
    .string()
    .trim()
    .min(1)
    .max(AGENCY_MESSAGE_MAX)
    .describe('Texte du message, tel qu’il partira'),
  recipientName: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe('Destinataire, nom affiché seulement (« Agence [Exemple] »)'),
}

/**
 * Un brouillon de demande : les tâches à poser (par défaut, toutes les
 * questions ouvertes de l'annonce), le canal (par défaut celui du contact),
 * le texte (par défaut le message poli de `domain`).
 */
export const AgencyRequestDraftInputSchema = z.object({
  taskIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_QUESTIONS_PER_REQUEST)
    .optional()
    .describe(
      'Tâches à poser ; absent = toutes les questions ouvertes de l’annonce (ou celles de la demande relancée)'
    ),
  channel: AgencyChannelSchema.optional().describe(
    'Canal ; absent = celui du contact (préféré, sinon e-mail, messagerie, téléphone)'
  ),
  recipientName: requestText.recipientName.optional(),
  subject: requestText.subject
    .optional()
    .describe('Objet ; absent = par défaut'),
  body: requestText.body
    .optional()
    .describe(
      'Texte ; absent = message par défaut (formule, questions, référence, signature)'
    ),
  followUpOf: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Relance : la demande envoyée sans réponse que celle-ci relance ; ses questions ouvertes sont reprises'
    ),
})
export type AgencyRequestDraftInput = z.infer<
  typeof AgencyRequestDraftInputSchema
>

/** Modifier un message avant l'envoi ; un message validé repasse « à valider ». */
export const AgencyRequestUpdateSchema = z
  .object({
    subject: requestText.subject.optional(),
    body: requestText.body.optional(),
    channel: AgencyChannelSchema.optional(),
    recipientName: requestText.recipientName.nullable().optional(),
  })
  .refine(value => Object.values(value).some(v => v !== undefined), {
    message: 'Au moins un champ à modifier (objet, texte, canal, destinataire)',
  })
export type AgencyRequestUpdate = z.infer<typeof AgencyRequestUpdateSchema>

/** Validation par lot (bouton « Valider l'envoi »). */
export const AgencyRequestApproveSchema = z.object({
  requestIds: z
    .array(z.string().uuid())
    .min(1)
    .max(50)
    .describe(
      'Les messages à valider ensemble ; tous doivent être « à valider »'
    ),
})
export type AgencyRequestApprove = z.infer<typeof AgencyRequestApproveSchema>

/** L'envoi d'un message validé, fait par Claude (Gmail, portail) ou par un membre. */
export const AgencyRequestSentSchema = z.object({
  sentAt: z
    .string()
    .datetime()
    .optional()
    .describe("Date de l'envoi, ISO 8601 ; absent = maintenant"),
  channel: AgencyChannelSchema.optional().describe(
    'Canal réellement utilisé, s’il diffère'
  ),
  threadRef: z
    .string()
    .trim()
    .min(1)
    .max(AGENCY_THREAD_REF_MAX)
    .optional()
    .describe(
      'Référence du fil : identifiant de fil Gmail ou lien de la conversation sur le portail'
    ),
})
export type AgencyRequestSent = z.infer<typeof AgencyRequestSentSchema>

/** Une réponse de l'annonceur : extrait, valeurs lues, tâches répondues. */
export const AgencyAnswerInputSchema = z.object({
  receivedAt: z
    .string()
    .datetime()
    .optional()
    .describe('Date de la réponse, ISO 8601 ; absent = maintenant'),
  excerpt: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      'La réponse (ou son passage utile) ; gardée en extrait de 1 000 caractères au plus, téléphones et e-mails masqués'
    ),
  values: AgencyAnswerValuesSchema.default({}),
  answeredTaskIds: z
    .array(z.string().uuid())
    .max(MAX_QUESTIONS_PER_REQUEST)
    .default([])
    .describe(
      'Tâches répondues sans valeur de fiche (DTG reçu, question libre) ; celles dont le champ est dans `values` se cochent d’elles-mêmes'
    ),
  threadRef: z
    .string()
    .trim()
    .min(1)
    .max(AGENCY_THREAD_REF_MAX)
    .optional()
    .describe('Référence du fil, si elle n’était pas encore connue'),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .describe(
      'Garde-fou optimiste : `updatedAt` de l’annonce lu avant (get_listing, list_open_questions) ; refus si elle a changé'
    ),
})
export type AgencyAnswerInput = z.infer<typeof AgencyAnswerInputSchema>
export type AgencyAnswerInputRaw = z.input<typeof AgencyAnswerInputSchema>

/** Appliquer des valeurs proposées (bouton « Appliquer »). */
export const AgencyApplyProposedSchema = z.object({
  keys: z
    .array(AgencyAnswerValueKeySchema)
    .min(1)
    .describe('Les valeurs proposées à appliquer'),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .describe('Garde-fou optimiste : `updatedAt` de l’annonce'),
})
export type AgencyApplyProposed = z.infer<typeof AgencyApplyProposedSchema>

/** La signature des messages de l'espace. */
export const AgencySettingsSchema = z.object({
  signature: z.string().describe('La signature en vigueur'),
  custom: z
    .boolean()
    .describe(
      'Vrai si l’espace a choisi sa signature ; faux pour la signature par défaut'
    ),
  defaultSignature: z
    .string()
    .describe(
      'La signature par défaut : les prénoms des membres (« Richard et Chloé »)'
    ),
  followUpBusinessDays: z.number().int().min(1),
})
export type AgencySettings = z.infer<typeof AgencySettingsSchema>

export const AgencySettingsUpdateSchema = z.object({
  signature: z
    .string()
    .trim()
    .min(1)
    .max(AGENCY_SIGNATURE_MAX)
    .nullable()
    .describe(
      'Signature des messages ; null = par défaut. Aucune adresse ni aucun téléphone de membre n’est ajouté s’il n’y figure pas'
    ),
})
export type AgencySettingsUpdate = z.infer<typeof AgencySettingsUpdateSchema>

// ---------------------------------------------------------------------------
// Réponses des écritures
// ---------------------------------------------------------------------------

export const AgencyRequestsWriteResultSchema = z.object({
  requests: z.array(AgencyRequestSchema),
})
export type AgencyRequestsWriteResult = z.infer<
  typeof AgencyRequestsWriteResultSchema
>

export const AgencyRequestWriteResultSchema = z.object({
  request: AgencyRequestSchema,
})
export type AgencyRequestWriteResult = z.infer<
  typeof AgencyRequestWriteResultSchema
>

/** Une réponse enregistrée : la demande, la fiche à jour, ce qui a été appliqué, proposé, coché. */
export const AgencyAnswerResultSchema = z.object({
  request: AgencyRequestSchema,
  answer: AgencyAnswerSchema,
  listing: EvaluatedListingSchema.describe('L’annonce après la réponse'),
  applied: z.array(AgencyAnswerChangeSchema),
  proposed: z
    .array(AgencyAnswerChangeSchema)
    .describe(
      'Valeurs qui contredisent une saisie à la main : à faire confirmer (bouton « Appliquer », ou update_listing après accord)'
    ),
  completedTasks: z.array(TaskSchema),
})
export type AgencyAnswerResult = z.infer<typeof AgencyAnswerResultSchema>

/** Des valeurs proposées appliquées à la demande d'un membre. */
export const AgencyApplyResultSchema = z.object({
  request: AgencyRequestSchema,
  listing: EvaluatedListingSchema,
  applied: z.array(AgencyAnswerChangeSchema),
})
export type AgencyApplyResult = z.infer<typeof AgencyApplyResultSchema>
