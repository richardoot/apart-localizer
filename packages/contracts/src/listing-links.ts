import { z } from 'zod'
import { ObservedSellerTypeSchema } from './enums.js'
import { ListingPortalSchema } from './portals.js'

/**
 * Une annonce, plusieurs portails (lot 18, ADR 0028). Une même annonce est
 * souvent publiée sur plusieurs portails : chaque lien est une ligne de
 * `listing_links` (portail, URL normalisée unique par espace, identifiant
 * sur le portail, prix affiché et sa date, première vue, dernière vue en
 * ligne, dernière vérification, hors ligne depuis, origine, auteur). Le lien
 * principal (le plus ancien en ligne, à défaut le plus ancien) reste recopié
 * dans `Listing.url`, `source` et `externalId` pour l'export de version 1 et
 * les clients existants. Le prix de la fiche est le plus bas des liens en
 * ligne dont le prix est connu (règles dans `domain`, `listing-links.ts`).
 * Le serveur ne joint jamais un portail : un lien se lit dans le navigateur
 * de l'utilisateur (Claude) ou se colle à la main.
 */

/** Au-delà, un lien ne s'ajoute plus à une annonce (garde-fou). */
export const LISTING_LINKS_MAX = 20

/** Longueur maximale de l'extrait-preuve gardé avec un lien. */
export const LISTING_LINK_EVIDENCE_MAX = 500

/**
 * Combien de jours un lien rattaché d'office (même agence, même référence)
 * reste montré dans « Liens rattachés d'office » de l'onglet « À valider ».
 */
export const AUTO_ATTACH_REVIEW_DAYS = 14

export const ListingLinkOriginSchema = z
  .enum(['original', 'manual', 'claude', 'exploration', 'share', 'email'])
  .describe(
    'Origine du lien : original (lien de l’annonce à sa création, ou repris par la migration du lot 18), manual (ajouté à la main dans l’application), claude (ajouté par Claude au connecteur), exploration (trouvé par une exploration des portails : rattaché d’office ou confirmé par un membre), share (partagé depuis le téléphone), email (reçu dans une alerte e-mail)'
  )
export type ListingLinkOrigin = z.infer<typeof ListingLinkOriginSchema>

export const LISTING_LINK_ORIGIN_LABELS: Record<ListingLinkOrigin, string> = {
  original: 'lien d’origine',
  manual: 'rattaché à la main',
  claude: 'rattaché par Claude',
  exploration: 'trouvé par Claude en explorant',
  share: 'partagé depuis le téléphone',
  email: 'reçu dans une alerte e-mail',
}

/** Où en est l'annonce sur ses portails : aucun lien, en ligne partout, en partie, plus en ligne. */
export const ListingLinksAvailabilitySchema = z
  .enum(['none', 'online', 'partial', 'offline'])
  .describe(
    'none : aucun lien ; online : tous les liens en ligne ; partial : certains plus en ligne ; offline : plus en ligne nulle part'
  )
export type ListingLinksAvailability = z.infer<
  typeof ListingLinksAvailabilitySchema
>

export const LISTING_LINKS_AVAILABILITY_LABELS: Record<
  ListingLinksAvailability,
  string
> = {
  none: 'Aucun lien',
  online: 'En ligne',
  partial: 'En ligne en partie',
  offline: 'Plus en ligne',
}

const isoDate = (what: string) =>
  z.string().datetime().nullable().describe(what)

/** Un lien d'une annonce, tel que l'API le rend. */
export const ListingLinkSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  portal: ListingPortalSchema,
  url: z.string().describe('Le lien tel qu’il a été donné'),
  normalizedUrl: z
    .string()
    .describe(
      'Le lien réduit à ce qui identifie l’annonce (https, hôte sans www, chemin, requête retirée sur un portail connu) ; unique dans l’espace'
    ),
  externalId: z
    .string()
    .nullable()
    .describe('Identifiant de l’annonce sur ce portail (numéro Leboncoin…)'),
  price: z
    .number()
    .nullable()
    .describe('Prix affiché sur ce portail, en euros ; null = à relever'),
  priceAt: isoDate('Date à laquelle ce prix a été relevé'),
  firstSeenAt: isoDate('Première fois que ce lien a été vu'),
  lastSeenOnlineAt: isoDate('Dernière fois que ce lien a été vu en ligne'),
  lastCheckedAt: isoDate('Dernière vérification de ce lien'),
  offlineSince: isoDate(
    'Plus en ligne depuis cette date ; null = en ligne (ou pas encore vérifié)'
  ),
  online: z
    .boolean()
    .describe('Vrai tant que le lien n’a pas été constaté hors ligne'),
  primary: z
    .boolean()
    .describe(
      'Le lien principal (recopié dans listing.url) : le plus ancien en ligne, à défaut le plus ancien'
    ),
  origin: ListingLinkOriginSchema,
  readSellerName: z
    .string()
    .nullable()
    .describe('L’agence ou le réseau affichés sur ce portail, si lus'),
  readReference: z
    .string()
    .nullable()
    .describe('La référence affichée sur ce portail, si lue'),
  evidence: z
    .string()
    .max(LISTING_LINK_EVIDENCE_MAX)
    .nullable()
    .describe(
      'Extrait court de la page lu à l’ajout (téléphones et e-mails masqués)'
    ),
  addedById: z
    .string()
    .uuid()
    .nullable()
    .describe('Le membre qui l’a ajouté (ou pour qui Claude l’a ajouté)'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ListingLink = z.infer<typeof ListingLinkSchema>

const observedPrice = z
  .number()
  .min(0)
  .max(100_000_000)
  .optional()
  .describe('Prix affiché sur ce portail, en euros ; absent = non relevé')

const readText = (max: number, what: string) =>
  z.string().trim().min(1).max(max).optional().describe(what)

/**
 * Ce qui a été lu sur la page d'un lien à son ajout (REST et MCP). Seul ce
 * qui a été lu compte ; rien n'est deviné.
 */
export const ListingLinkReadingSchema = z.object({
  portal: ListingPortalSchema.optional().describe(
    'Portail ; absent = reconnu d’après le lien (« autre » si l’hôte n’est pas un portail connu)'
  ),
  price: observedPrice,
  online: z
    .boolean()
    .optional()
    .describe(
      'Vrai si la page est en ligne (lue à l’instant) ; faux si l’annonce a disparu ; absent = non constaté (lien collé sans être ouvert)'
    ),
  externalId: readText(
    120,
    'Identifiant de l’annonce sur ce portail, s’il est affiché (numéro Leboncoin…)'
  ),
  sellerType: ObservedSellerTypeSchema.optional(),
  sellerName: readText(
    120,
    "Agence, ou réseau pour un mandataire, affichés sur la page ; jamais le nom d'une personne"
  ),
  reference: readText(
    60,
    'Référence de l’annonce affichée (« Réf. EX-2041 », « Mandat n° 2041 ») ; jamais pour un particulier'
  ),
  publishedAt: z
    .union([z.string().date(), z.string().datetime({ offset: true })])
    .optional()
    .describe('Date de publication affichée, AAAA-MM-JJ ou ISO 8601'),
  evidence: z
    .string()
    .max(5000)
    .optional()
    .describe(
      `Extrait de la page qui prouve que c'est la même annonce (« Réf. EX-2041 », « 219 000 € ») ; tronqué à ${LISTING_LINK_EVIDENCE_MAX} caractères, téléphones et e-mails masqués`
    ),
})
export type ListingLinkReading = z.infer<typeof ListingLinkReadingSchema>

/** `POST /listings/:id/links` : un lien de la même annonce sur un autre portail. */
export const ListingLinkInputSchema = ListingLinkReadingSchema.extend({
  url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .describe('Lien de la même annonce sur un portail (page de l’annonce)'),
  origin: z
    .enum(['manual', 'share'])
    .default('manual')
    .describe(
      'manual : collé dans la fiche ; share : partagé depuis le téléphone (« c’est la même »)'
    ),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Garde-fou : `updatedAt` de l’annonce lu avant ; refus si elle a changé depuis'
    ),
})
export type ListingLinkInput = z.infer<typeof ListingLinkInputSchema>
export type ListingLinkInputRaw = z.input<typeof ListingLinkInputSchema>

/**
 * `PATCH /listings/:id/links/:linkId` : le prix affiché ou l'état relevés à
 * la main (une vérification du lot 15 sur ce lien), ou le portail et
 * l'identifiant corrigés. Au moins un champ.
 */
export const ListingLinkPatchSchema = z
  .object({
    price: observedPrice,
    online: z
      .boolean()
      .optional()
      .describe(
        'Vrai : vu en ligne aujourd’hui ; faux : plus en ligne (le statut de l’annonce n’est proposé que si plus aucun lien n’est en ligne)'
      ),
    portal: ListingPortalSchema.optional(),
    externalId: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .optional()
      .describe('Identifiant sur le portail ; null pour l’effacer'),
    expectedUpdatedAt: z
      .string()
      .datetime()
      .optional()
      .describe('Garde-fou : `updatedAt` de l’annonce lu avant'),
  })
  .refine(
    value =>
      value.price !== undefined ||
      value.online !== undefined ||
      value.portal !== undefined ||
      value.externalId !== undefined,
    { message: 'Donne le prix, l’état, le portail ou l’identifiant du lien' }
  )
export type ListingLinkPatch = z.infer<typeof ListingLinkPatchSchema>
