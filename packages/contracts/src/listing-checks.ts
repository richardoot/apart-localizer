import { z } from 'zod'
import { ExtractionImageSchema, ExtractionQualitySchema } from './ai.js'
import { DpeClassSchema, ListingStatusSchema } from './enums.js'

/**
 * Suivi des mises à jour des annonces (lot 15, ADR 0025). Une vérification
 * compare ce que Claude a lu sur la page du portail (dans le navigateur de
 * l'utilisateur, ou dans le texte qu'il a collé) avec la fiche enregistrée :
 * les faits (prix, charges, taxe foncière, surface, pièces, DPE, description,
 * dates, lien) s'appliquent à la fiche ; un changement de statut (« vendu ou
 * retiré ») n'est jamais appliqué d'office, il est proposé. Le serveur ne
 * télécharge jamais une page de portail. Les règles et les phrases sont dans
 * `domain` (`listingCheckDiff`), l'écriture dans l'API.
 */

/** Au-delà de ce nombre de jours sans vérification, une annonce active est « à revérifier ». */
export const DEFAULT_STALE_DAYS = 7

/** Longueur maximale de l'extrait-preuve gardé avec une vérification. */
export const LISTING_CHECK_EVIDENCE_MAX = 500

/**
 * Tolérances d'arrondi : en deçà, une valeur lue est égale à la valeur
 * enregistrée. Prix et taxe à l'euro ; charges annuelles à 12 € (un euro par
 * mois quand le portail affiche des charges mensuelles) ; surface au
 * demi-mètre carré (45,2 m² affichés « 45 m² ») ; consommation au kWh.
 */
export const LISTING_CHECK_TOLERANCES = {
  price: 1,
  annualCharges: 12,
  propertyTax: 1,
  surface: 0.5,
  dpeConsumption: 1,
} as const

export const ListingCheckOutcomeSchema = z
  .enum(['unchanged', 'changed', 'offline', 'republished', 'inaccessible'])
  .describe(
    "Résultat : inchangée, mise à jour (un fait a changé), plus en ligne, republiée (autre lien ou autre annonce), page inaccessible (captcha, blocage, introuvable : rien n'est vérifié)"
  )
export type ListingCheckOutcome = z.infer<typeof ListingCheckOutcomeSchema>

export const LISTING_CHECK_OUTCOME_LABELS: Record<ListingCheckOutcome, string> =
  {
    unchanged: 'Inchangée',
    changed: 'Mise à jour',
    offline: 'Plus en ligne',
    republished: 'Republiée',
    inaccessible: 'Non vérifiée : page inaccessible',
  }

/** Canal d'une vérification : Claude par le connecteur, ou un membre dans l'application. */
export const ListingCheckChannelSchema = z
  .enum(['mcp', 'web'])
  .describe('Canal : Claude par le connecteur MCP, ou un membre dans le web')
export type ListingCheckChannel = z.infer<typeof ListingCheckChannelSchema>

export const ListingCheckFieldSchema = z
  .enum([
    'price',
    'annualCharges',
    'propertyTax',
    'surface',
    'rooms',
    'dpeClass',
    'gesClass',
    'dpeConsumption',
    'description',
    'publishedAt',
    'sourceUpdatedAt',
    'url',
    'online',
    'status',
  ])
  .describe('Champ comparé par une vérification')
export type ListingCheckField = z.infer<typeof ListingCheckFieldSchema>

export const ListingCheckDispositionSchema = z
  .enum(['applied', 'proposed', 'noted'])
  .describe(
    'Sort d’un écart : appliqué à la fiche (fait lu sur le portail), proposé (statut, jamais appliqué d’office), noté (signalé sans rien changer, par exemple une annonce « remontée » dont la première date de publication est gardée)'
  )
export type ListingCheckDisposition = z.infer<
  typeof ListingCheckDispositionSchema
>

export const LISTING_CHECK_DISPOSITION_LABELS: Record<
  ListingCheckDisposition,
  string
> = {
  applied: 'appliqué',
  proposed: 'proposé',
  noted: 'noté',
}

/** Une date lue sur la page : AAAA-MM-JJ, ou ISO 8601 complet. */
const observedDate = (what: string) =>
  z
    .union([z.string().date(), z.string().datetime({ offset: true })])
    .optional()
    .describe(`${what}, AAAA-MM-JJ ou ISO 8601 ; absent = non lue`)

const observedAmount = (what: string) =>
  z
    .number()
    .min(0)
    .optional()
    .describe(`${what} lu sur la page, en euros ; absent = non lu`)

/**
 * Ce que Claude a lu lui-même sur la page de l'annonce. Seuls les champs
 * fournis sont comparés : un champ absent n'est pas un changement. Les clés
 * inconnues sont refusées (une faute de frappe ne passe pas en silence).
 */
export const ListingObservedSchema = z
  .strictObject({
    online: z
      .boolean()
      .optional()
      .describe(
        'Vrai si la page de l’annonce est en ligne ; faux si elle a disparu (page introuvable, « annonce expirée », « vendu ») ; absent = non constaté'
      ),
    price: observedAmount('Prix affiché FAI'),
    annualCharges: observedAmount(
      'Charges de copropriété annuelles (montant mensuel × 12)'
    ),
    propertyTax: observedAmount('Taxe foncière annuelle'),
    surface: z
      .number()
      .positive()
      .optional()
      .describe('Surface Carrez en m² lue sur la page'),
    rooms: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Nombre de pièces principales lu sur la page'),
    dpeClass: DpeClassSchema.optional().describe('Classe DPE lue sur la page'),
    gesClass: DpeClassSchema.optional().describe('Classe GES lue sur la page'),
    dpeConsumption: z
      .number()
      .min(0)
      .optional()
      .describe('Consommation du DPE en kWh/m²/an lue sur la page'),
    description: z
      .string()
      .max(20_000)
      .optional()
      .describe('Description de l’annonce telle qu’affichée'),
    publishedAt: observedDate('Date de publication affichée'),
    sourceUpdatedAt: observedDate('Date de mise à jour affichée'),
    url: z
      .string()
      .url()
      .max(2000)
      .optional()
      .describe(
        'Lien actuel de l’annonce, s’il diffère du lien enregistré (annonce republiée sous un autre lien)'
      ),
  })
  .describe(
    'Valeurs lues sur la page par Claude (ou par le membre) ; seules celles fournies sont comparées'
  )
export type ListingObserved = z.infer<typeof ListingObservedSchema>

const checkValue = z
  .union([z.string(), z.number(), z.boolean()])
  .nullable()
  .describe('Valeur (euros, m², classe, date ISO, texte tronqué), null si vide')

/** Un écart entre la fiche et la page, avec son sort et sa phrase. */
export const ListingCheckChangeSchema = z.object({
  field: ListingCheckFieldSchema,
  label: z.string().describe('Libellé du champ en français'),
  before: checkValue,
  after: checkValue,
  disposition: ListingCheckDispositionSchema,
  text: z
    .string()
    .describe(
      'La phrase : « Prix 215 000 € → 205 000 € », « Plus en ligne : statut proposé « Vendu ou retiré » »'
    ),
})
export type ListingCheckChange = z.infer<typeof ListingCheckChangeSchema>

/** Une annonce liée (republication), en quelques champs. */
export const LinkedListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
})
export type LinkedListing = z.infer<typeof LinkedListingSchema>

/** Une vérification enregistrée : la chronologie « Mises à jour » de la fiche. */
export const ListingCheckSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  checkedAt: z.string().datetime(),
  authorId: z
    .string()
    .uuid()
    .nullable()
    .describe('Le membre qui a vérifié (ou pour qui Claude a vérifié)'),
  channel: ListingCheckChannelSchema,
  outcome: ListingCheckOutcomeSchema,
  changes: z
    .array(ListingCheckChangeSchema)
    .describe('Écarts trouvés : appliqués, proposés ou notés'),
  summary: z.string().describe('Le résumé en une phrase'),
  evidence: z
    .string()
    .max(LISTING_CHECK_EVIDENCE_MAX)
    .nullable()
    .describe(
      'Extrait court de la page qui prouve le constat, sans coordonnées d’agent ni de vendeur'
    ),
  checkedUrl: z
    .string()
    .nullable()
    .describe('URL consultée pour la vérification'),
  linkedListing: LinkedListingSchema.nullable().describe(
    'Annonce rattachée par une republication'
  ),
  suggestedStatus: ListingStatusSchema.nullable().describe(
    'Statut proposé à la suite de la vérification ; jamais appliqué d’office'
  ),
})
export type ListingCheck = z.infer<typeof ListingCheckSchema>

/** Le dernier résultat, porté par chaque annonce de la liste. */
export const ListingCheckSummarySchema = ListingCheckSchema.pick({
  id: true,
  checkedAt: true,
  channel: true,
  authorId: true,
  outcome: true,
  summary: true,
})
export type ListingCheckSummary = z.infer<typeof ListingCheckSummarySchema>

/** Les liens de republication d'une annonce : celle qu'elle reprend, celle qui la reprend. */
export const ListingRepublicationSchema = z.object({
  from: LinkedListingSchema.nullable().describe(
    'Annonce plus ancienne que celle-ci reprend (même bien, publication antérieure)'
  ),
  to: LinkedListingSchema.nullable().describe(
    'Annonce plus récente qui reprend celle-ci'
  ),
})
export type ListingRepublication = z.infer<typeof ListingRepublicationSchema>

const evidenceInput = z
  .string()
  .max(5000)
  .optional()
  .describe(
    `Extrait de la page qui prouve le constat (« Annonce expirée », « Prix : 205 000 € ») ; tronqué à ${LISTING_CHECK_EVIDENCE_MAX} caractères, téléphones et adresses e-mail masqués`
  )

/**
 * Une vérification à enregistrer (`POST /listings/:id/checks`, outil MCP
 * `apply_listing_check`). Garde-fous optimistes : `expectedUpdatedAt`
 * obligatoire, `expectedPrice` facultatif.
 */
export const ListingCheckInputSchema = z.object({
  observed: ListingObservedSchema.default({}),
  outcome: ListingCheckOutcomeSchema.optional().describe(
    'Résultat constaté ; absent = déduit des valeurs observées. « inaccessible » quand la page ne s’affiche pas (captcha, blocage) : rien n’est appliqué'
  ),
  evidence: evidenceInput,
  checkedUrl: z
    .string()
    .url()
    .max(2000)
    .optional()
    .describe('URL réellement consultée'),
  republishedListingId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Autre annonce de l’espace qui est la republication du même bien (ou celle que celle-ci reprend) : les deux sont rattachées, la plus ancienne devient la publication d’origine'
    ),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .describe(
      "Garde-fou : `updatedAt` lu avec get_listing ou check_listing ; refus si l'annonce a changé depuis"
    ),
  expectedPrice: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Garde-fou : prix enregistré attendu en euros ; refus si différent'
    ),
})
export type ListingCheckInput = z.infer<typeof ListingCheckInputSchema>
export type ListingCheckInputRaw = z.input<typeof ListingCheckInputSchema>

/**
 * Une vérification à blanc (`POST /listings/:id/checks/preview`, outil MCP
 * `check_listing`) : les valeurs lues (`observed`), ou le texte de la page
 * (`pageText`, et des captures) lu par l'extraction côté serveur ; les
 * valeurs de `observed` priment sur celles extraites. Rien n'est écrit.
 */
export const ListingCheckPreviewRequestSchema = z
  .object({
    observed: ListingObservedSchema.optional(),
    pageText: z
      .string()
      .max(50_000)
      .optional()
      .describe(
        'Texte de la page lu dans le navigateur (ou collé) ; lu par le modèle d’extraction côté serveur (coût signalé)'
      ),
    images: z
      .array(ExtractionImageSchema)
      .max(8)
      .default([])
      .describe('Captures de la page (base64), avec pageText'),
    quality: ExtractionQualitySchema.default('fast'),
    outcome: ListingCheckOutcomeSchema.optional().describe(
      'Résultat envisagé, pour voir ce que apply_listing_check en ferait'
    ),
    republishedListingId: z.string().uuid().optional(),
  })
  .refine(
    value =>
      value.observed !== undefined ||
      (value.pageText !== undefined && value.pageText.trim().length > 0) ||
      value.images.length > 0,
    {
      message:
        'Donnez observed (valeurs lues sur la page) ou pageText (texte de la page)',
      path: ['observed'],
    }
  )
export type ListingCheckPreviewRequest = z.infer<
  typeof ListingCheckPreviewRequestSchema
>
export type ListingCheckPreviewRequestInput = z.input<
  typeof ListingCheckPreviewRequestSchema
>

/** Un statut proposé, et l'annonce à laquelle il s'applique (jamais appliqué d'office). */
export const ListingCheckSuggestionSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  currentStatus: ListingStatusSchema,
  status: ListingStatusSchema,
  reason: z.string().describe('Pourquoi ce statut est proposé'),
})
export type ListingCheckSuggestion = z.infer<
  typeof ListingCheckSuggestionSchema
>
