import { z } from 'zod'
import { ActivityChannelSchema } from './enums.js'
import type { ActivityChannel } from './enums.js'

/**
 * Le journal d'activité lisible (besoin S6) : qui, quoi, quand, par quel
 * canal, avec le détail des champs modifiés. Le libellé et le détail sont
 * dérivés du type d'événement et de l'avant / après par `domain`
 * (`describeActivity`), pour que le web et le MCP disent la même chose.
 */

export const ACTIVITY_CHANNEL_LABELS: Record<ActivityChannel, string> = {
  web: 'Web',
  mcp: 'MCP (Claude)',
  import: 'Import',
  system: 'Système',
}

export const ActivityKindSchema = z
  .enum([
    'listing',
    'status',
    'price',
    'task',
    'opinion',
    'offer',
    'visit',
    'criteria',
    'ai',
    'assumptions',
    'study',
    'draft',
    'member',
    'check',
    'exploration',
    'agency',
    'link',
    'other',
  ])
  .describe(
    "Sorte d'événement : annonce, statut, prix, tâche, avis, offre, visite, critère, IA, hypothèses, étude (scénarios, comparables), brouillon à valider, membres de l'espace (invitations, arrivées, retraits, rôles), vérification sur le portail (lot 15), exploration des portails par Claude (lot 16), échanges avec l'annonceur (contact, demandes, réponses ; lot 17), liens de l'annonce sur les portails (ajout, retrait, détachement ; lot 18), autre"
  )
export type ActivityKind = z.infer<typeof ActivityKindSchema>

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  listing: 'Annonce',
  status: 'Statut',
  price: 'Prix',
  task: 'Tâche',
  opinion: 'Avis',
  offer: 'Offre',
  visit: 'Visite',
  criteria: 'Critère',
  ai: 'IA',
  assumptions: 'Hypothèses',
  study: 'Étude',
  draft: 'Brouillon à valider',
  member: 'Membres',
  check: 'Vérification',
  exploration: 'Exploration',
  agency: 'Échanges',
  link: 'Liens des portails',
  other: 'Autre',
}

/**
 * Les actions de chaque sorte : actions exactes d'abord, puis préfixes
 * (avant le point). L'API traduit la même table en filtre SQL.
 */
export const ACTIVITY_KIND_RULES: Record<
  Exclude<ActivityKind, 'other'>,
  { actions?: readonly string[]; prefixes?: readonly string[] }
> = {
  status: { actions: ['listing.status_changed'] },
  price: { actions: ['listing.price_changed'] },
  check: { actions: ['listing.checked'] },
  listing: { prefixes: ['listing'] },
  task: { prefixes: ['task'] },
  opinion: { prefixes: ['opinion'] },
  offer: { prefixes: ['offer'] },
  visit: { prefixes: ['visit'] },
  criteria: { prefixes: ['criteria'] },
  ai: { prefixes: ['ai'] },
  assumptions: { prefixes: ['assumptions'] },
  study: { prefixes: ['scenario', 'rent_comparable'] },
  draft: { prefixes: ['draft'] },
  member: { prefixes: ['member', 'workspace'] },
  exploration: { prefixes: ['exploration'] },
  agency: { prefixes: ['agency_request', 'contact'] },
  link: { prefixes: ['listing_link'] },
}

/** La sorte d'une action (`listing.status_changed` → `status`). */
export function activityKindOf(action: string): ActivityKind {
  for (const [kind, rule] of Object.entries(ACTIVITY_KIND_RULES)) {
    if (rule.actions?.includes(action)) return kind as ActivityKind
  }
  const prefix = action.split('.')[0] ?? ''
  for (const [kind, rule] of Object.entries(ACTIVITY_KIND_RULES)) {
    if (rule.prefixes?.includes(prefix)) return kind as ActivityKind
  }
  return 'other'
}

/**
 * Libellés des champs d'une annonce (et de ses sous-objets) pour le détail
 * des modifications. Un champ absent de la table est affiché par son nom.
 */
export const LISTING_FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  source: 'Portail',
  sourceLabel: 'Source',
  url: 'Lien',
  externalId: 'Référence',
  publishedAt: 'Publiée le',
  sourceUpdatedAt: 'Mise à jour sur le portail',
  description: 'Description',
  notes: 'Notes',
  price: 'Prix',
  feesAmount: "Honoraires d'agence",
  feesPercent: "Honoraires d'agence (%)",
  feesPayer: 'Honoraires à la charge de',
  surface: 'Surface Carrez',
  surfaceTotal: 'Surface totale',
  rooms: 'Pièces',
  bedrooms: 'Chambres',
  floor: 'Étage',
  floorsTotal: "Étages de l'immeuble",
  floorLabel: 'Étage (texte)',
  elevator: 'Ascenseur',
  constructionYear: 'Année de construction',
  constructionPeriod: 'Époque de construction',
  dpeClass: 'DPE',
  dpeConsumption: 'Consommation énergétique',
  gesClass: 'GES',
  dpeDate: 'Date du DPE',
  dpeNumber: 'Numéro du DPE',
  heatingType: 'Chauffage',
  heatingCollective: 'Chauffage collectif',
  outdoor: 'Extérieur',
  parking: 'Stationnement',
  cellar: 'Cave',
  orientation: 'Orientation',
  condition: 'État général',
  annualCharges: 'Charges annuelles',
  nonRecoverableChargesMonthly: 'Charges non récupérables',
  lotsCount: 'Lots de la copropriété',
  proceedings: 'Procédures en cours',
  votedWorks: 'Travaux votés',
  syndic: 'Syndic',
  propertyTax: 'Taxe foncière',
  furnitureValue: 'Mobilier',
  location: 'Localisation',
  addressRaw: 'Adresse',
  addressNormalized: 'Adresse normalisée',
  commune: 'Commune',
  district: 'Quartier',
  point: 'Point sur la carte',
  precision: 'Précision',
  status: 'Statut',
  discardReason: "Raison d'écartement",
  renovation: 'Travaux',
  rentalPlan: 'Phase 2 (location)',
  assumptionsOverride: 'Hypothèses propres',
  fieldSources: 'Provenance',
  rating: 'Note',
  text: 'Texte',
  label: 'Libellé',
  done: 'Faite',
  assigneeId: 'Assignée à',
  response: 'Réponse',
  counterAmount: 'Contre-proposition',
  amount: 'Montant',
  channel: 'Canal',
  visitedAt: 'Date',
  participantIds: 'Participants',
  report: 'Compte rendu',
  pros: 'Points positifs',
  cons: 'Points négatifs',
  banId: 'Identifiant BAN',
  inseeCode: 'Code INSEE',
  year: 'Année de mise en location',
  leaseType: 'Bail',
  rentControl: 'Encadrement',
  referenceRentPerM2: 'Loyer de référence majoré',
  targetRent: 'Loyer visé',
  marketRent: 'Loyer de marché',
  demand: 'Demande locative',
  coOwnershipAllowsRental: 'Location permise par le règlement',
  decencyCompliant: 'Décence',
  rentalPermitRequired: 'Permis de louer',
  active: 'Actif',
  level: 'Ampleur',
  durationMonths: 'Durée (mois)',
  items: 'Postes',
  name: 'Nom',
  displayName: 'Nom affiché',
  email: 'E-mail',
  role: 'Rôle',
  filters: 'Filtres',
  perimeterType: 'Périmètre',
  online: 'En ligne',
  lastCheckedAt: 'Vérifiée le',
  lastSeenOnlineAt: 'Vue en ligne le',
  subject: 'Objet',
  body: 'Message',
  recipientName: 'Destinataire',
  // Lot 18 : vendeur et liens.
  sellerType: 'Vendeur',
  sellerName: 'Agence ou réseau',
  sellerReference: 'Référence de l’annonce',
  portal: 'Portail',
  linkPrice: 'Prix sur le portail',
}

/** Le libellé d'un champ, ou son nom. */
export function listingFieldLabel(field: string): string {
  return LISTING_FIELD_LABELS[field] ?? field
}

/** Filtres du journal (`GET /activity`, `GET /listings/:id/activity`). */
export const ActivityQuerySchema = z.object({
  memberId: z
    .string()
    .uuid()
    .optional()
    .describe('Seulement les actions de ce membre'),
  channel: ActivityChannelSchema.optional(),
  kind: ActivityKindSchema.optional(),
  listingId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>
export type ActivityQueryInput = z.input<typeof ActivityQuerySchema>

/** Un champ modifié, avant et après, en texte lisible. */
export const ActivityChangeSchema = z.object({
  field: z.string(),
  label: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
})
export type ActivityChange = z.infer<typeof ActivityChangeSchema>

export const ActivityActorSchema = z.object({
  id: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
})
export type ActivityActor = z.infer<typeof ActivityActorSchema>

/** Une ligne du journal, lisible. */
export const ActivityEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  action: z.string(),
  kind: ActivityKindSchema,
  channel: ActivityChannelSchema,
  channelLabel: z.string(),
  actor: ActivityActorSchema.nullable().describe(
    'Le membre qui a agi ; null pour un import ou le système'
  ),
  listing: z
    .object({ id: z.string().uuid(), title: z.string() })
    .nullable()
    .describe("L'annonce concernée, s'il y en a une"),
  summary: z
    .string()
    .describe('Ce qui s’est passé, en français (« a changé le statut »)'),
  changes: z
    .array(ActivityChangeSchema)
    .describe('Champs modifiés, avant et après'),
})
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>

export const ActivityPageSchema = z.object({
  items: z.array(ActivityEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  pageCount: z.number().int().min(0),
})
export type ActivityPage = z.infer<typeof ActivityPageSchema>
