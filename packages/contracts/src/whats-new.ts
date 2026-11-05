import { z } from 'zod'
import { ActivityChannelSchema } from './enums.js'
import { ActivityActorSchema, ActivityEntrySchema } from './activity.js'

/**
 * « Ce qui a changé depuis ma dernière visite » (besoin K4). Pour le membre
 * connecté : depuis sa dernière visite de l'application (horodatage par
 * membre) et, annonce par annonce, depuis sa dernière ouverture de la fiche
 * (le « vu par »). Le calcul est dans `domain` (`computeWhatsNew`) ; le web
 * et l'outil MCP `whats_new` le partagent.
 */

export const WhatsNewKindSchema = z
  .enum([
    'new_listing',
    'price_change',
    'status_change',
    'opinion',
    'task',
    'criteria_match',
    'listing_check',
    'criteria_exit',
  ])
  .describe(
    "Nouvelle annonce, changement de prix, de statut, avis ou tâche de l'autre membre, annonce entrée dans un critère, annonce passée hors critères (lot 14), mise à jour trouvée en vérifiant une annonce sur le portail (lot 15)"
  )
export type WhatsNewKind = z.infer<typeof WhatsNewKindSchema>

export const WHATS_NEW_KIND_LABELS: Record<WhatsNewKind, string> = {
  new_listing: 'Nouvelles annonces',
  price_change: 'Changements de prix',
  status_change: 'Changements de statut',
  opinion: 'Nouveaux avis',
  task: 'Tâches',
  criteria_match: 'Entrées dans un critère',
  listing_check: "Mises à jour d'annonces",
  criteria_exit: 'Sorties des critères',
}

export const WhatsNewItemSchema = z.object({
  kind: WhatsNewKindSchema,
  listingId: z.string().uuid(),
  listingTitle: z.string(),
  at: z.string().datetime(),
  actor: ActivityActorSchema.nullable(),
  channel: ActivityChannelSchema,
  summary: z.string().describe('Ce qui a changé, en français'),
  before: z.string().nullable(),
  after: z.string().nullable(),
})
export type WhatsNewItem = z.infer<typeof WhatsNewItemSchema>

export const WhatsNewSinceSourceSchema = z
  .enum(['previous_visit', 'marked_seen', 'member_created', 'explicit'])
  .describe(
    'Origine du point de départ : visite précédente, « tout marquer comme vu », arrivée du membre, date donnée'
  )
export type WhatsNewSinceSource = z.infer<typeof WhatsNewSinceSourceSchema>

export const WhatsNewListingSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  kinds: z.array(WhatsNewKindSchema),
  count: z.number().int().min(1),
  lastAt: z.string().datetime(),
})
export type WhatsNewListing = z.infer<typeof WhatsNewListingSchema>

export const WhatsNewReportSchema = z.object({
  since: z
    .string()
    .datetime()
    .describe('Point de départ : dernière visite de l’application'),
  sinceSource: WhatsNewSinceSourceSchema,
  generatedAt: z.string().datetime(),
  total: z.number().int().min(0),
  counts: z.record(WhatsNewKindSchema, z.number().int().min(0)),
  items: z
    .array(WhatsNewItemSchema)
    .describe('Du plus récent au plus ancien, tronqué à `limit`'),
  listings: z
    .array(WhatsNewListingSchema)
    .describe(
      'Annonces concernées, de la plus récemment changée à la plus ancienne'
    ),
})
export type WhatsNewReport = z.infer<typeof WhatsNewReportSchema>

export const WhatsNewQuerySchema = z.object({
  since: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Point de départ ISO 8601 à la place de la dernière visite (lecture seule)'
    ),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type WhatsNewQuery = z.infer<typeof WhatsNewQuerySchema>

/** Réponse de `POST /whats-new/visit` : la fenêtre de la visite en cours. */
export const WhatsNewVisitSchema = z.object({
  since: z.string().datetime(),
  sinceSource: WhatsNewSinceSourceSchema,
  lastVisitAt: z.string().datetime(),
  newSession: z
    .boolean()
    .describe('Vrai si cette visite ouvre une nouvelle session'),
})
export type WhatsNewVisit = z.infer<typeof WhatsNewVisitSchema>

export const WhatsNewMarkSeenSchema = z.object({
  since: z.string().datetime(),
  markedListings: z
    .number()
    .int()
    .min(0)
    .describe('Annonces marquées vues pour le membre'),
})
export type WhatsNewMarkSeen = z.infer<typeof WhatsNewMarkSeenSchema>

/** Les changements d'une annonce depuis la dernière ouverture de sa fiche par le membre. */
export const ListingChangesSchema = z.object({
  listingId: z.string().uuid(),
  since: z
    .string()
    .datetime()
    .nullable()
    .describe('Dernière ouverture de la fiche ; null si jamais ouverte'),
  changedFields: z
    .array(z.string())
    .describe('Champs de la fiche modifiés depuis (prix, statut, surface…)'),
  entries: z.array(ActivityEntrySchema),
})
export type ListingChanges = z.infer<typeof ListingChangesSchema>
