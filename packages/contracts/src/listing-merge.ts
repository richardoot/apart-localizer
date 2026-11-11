import { z } from 'zod'
import {
  ActivityChannelSchema,
  DpeClassSchema,
  ListingStatusSchema,
  ObservedSellerTypeSchema,
  SellerTypeSchema,
} from './enums.js'

/**
 * Lot 27 (ADR 0037) : fusionner deux fiches du même bien, enregistrer chaque
 * agence qui le vend avec sa référence, et retrouver une annonce « déjà vue »
 * par ressemblance. Une fusion ne supprime rien : la fiche absorbée est
 * gardée, cachée des listes, et la fusion s'annule dans l'application. Les
 * règles (ressemblance, ce qui passe d'une fiche à l'autre, agences) sont
 * dans `domain` (`similar-listings.ts`, `listing-merge.ts`, `seller.ts`).
 */

/** Au-delà, une agence ne s'ajoute plus à une annonce (garde-fou). */
export const LISTING_SELLERS_MAX = 8

/** Combien d'annonces ressemblantes sont proposées par défaut, et au plus. */
export const SIMILAR_LISTINGS_DEFAULT = 8
export const SIMILAR_LISTINGS_MAX = 20

/**
 * Seuils de la ressemblance, de 0 à 1 : « très proche » à partir de 0,75,
 * « proche » à partir de 0,5 ; en dessous de 0,35 une annonce n'est plus
 * proposée sans texte cherché. Surface comparée jusqu'à 15 % d'écart, prix
 * jusqu'à 20 %, distance jusqu'à 1 km (voir `domain`).
 */
export const SIMILARITY_THRESHOLDS = {
  veryClose: 0.75,
  close: 0.5,
  floor: 0.35,
  surfaceSpan: 0.15,
  priceSpan: 0.2,
  distanceSpanMeters: 1000,
} as const

// ---------------------------------------------------------------------------
// Plusieurs agences pour un même bien
// ---------------------------------------------------------------------------

export const ListingSellerOriginSchema = z
  .enum(['manual', 'claude', 'link', 'merge'])
  .describe(
    'D’où vient cette agence : manual (saisie dans la fiche), claude (ajoutée par Claude au connecteur après accord), link (lue sur la page d’un lien que le membre a rattaché à la fiche), merge (reprise d’une fiche fusionnée)'
  )
export type ListingSellerOrigin = z.infer<typeof ListingSellerOriginSchema>

export const LISTING_SELLER_ORIGIN_LABELS: Record<ListingSellerOrigin, string> =
  {
    manual: 'saisie à la main',
    claude: 'ajoutée par Claude',
    link: 'lue sur la page d’un lien',
    merge: 'reprise d’une fiche fusionnée',
  }

/**
 * Une autre agence qui vend le même bien (mandat simple), avec sa propre
 * référence. L'agence principale reste sur l'annonce (`sellerType`,
 * `sellerName`, `sellerReference`) ; celles-ci s'y ajoutent.
 */
export const ListingSellerSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  sellerType: SellerTypeSchema.describe(
    'Agence, mandataire, particulier ; unknown quand la page n’a montré qu’un nom ou une référence (jamais deviné)'
  ),
  sellerName: z
    .string()
    .nullable()
    .describe('Agence, ou réseau pour un mandataire ; jamais une personne'),
  sellerReference: z
    .string()
    .nullable()
    .describe('La référence du bien chez cette agence'),
  sellerReferenceKey: z
    .string()
    .nullable()
    .describe('La référence réduite pour la comparer ; calculée'),
  origin: ListingSellerOriginSchema,
  addedById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
})
export type ListingSeller = z.infer<typeof ListingSellerSchema>

/** `POST /listings/:id/sellers` : une autre agence qui vend le même bien. */
export const ListingSellerInputSchema = z
  .object({
    sellerType: ObservedSellerTypeSchema.default('agency'),
    sellerName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe(
        "Agence, ou réseau pour un mandataire ; jamais le nom d'une personne"
      ),
    sellerReference: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe(
        'La référence du bien chez cette agence (« Réf. EX-2041 », « Mandat n° 2041 »)'
      ),
    expectedUpdatedAt: z
      .string()
      .datetime()
      .optional()
      .describe('Garde-fou : `updatedAt` de l’annonce lu avant'),
  })
  .refine(
    value =>
      value.sellerType === 'private' ||
      Boolean(value.sellerName) ||
      Boolean(value.sellerReference),
    { message: 'Donne le nom de l’agence ou sa référence' }
  )
export type ListingSellerInput = z.infer<typeof ListingSellerInputSchema>
export type ListingSellerInputRaw = z.input<typeof ListingSellerInputSchema>

// ---------------------------------------------------------------------------
// Annonces ressemblantes (« Déjà vue »)
// ---------------------------------------------------------------------------

export const SimilarReasonKindSchema = z
  .enum([
    'same_url',
    'same_reference',
    'same_reference_other_agency',
    'same_address',
    'same_agency',
    'commune',
    'district',
    'distance',
    'surface',
    'price',
    'rooms',
    'floor',
    'dpe',
    'year',
  ])
  .describe(
    'Ce qui est comparé : lien, référence, adresse, agence, commune, quartier, distance, surface, prix, pièces, étage, DPE, année de construction'
  )
export type SimilarReasonKind = z.infer<typeof SimilarReasonKindSchema>

export const SimilarReasonSchema = z.object({
  kind: SimilarReasonKindSchema,
  text: z
    .string()
    .max(200)
    .describe('En clair : « 45 m² contre 46 m² », « Même commune »'),
})
export type SimilarReason = z.infer<typeof SimilarReasonSchema>

export const SimilarityLevelSchema = z
  .enum(['certain', 'very_close', 'close', 'far'])
  .describe(
    'certain : même lien, ou même agence et même référence ; very_close : presque tout concorde ; close : plusieurs caractéristiques proches ; far : peu de points communs'
  )
export type SimilarityLevel = z.infer<typeof SimilarityLevelSchema>

export const SIMILARITY_LEVEL_LABELS: Record<SimilarityLevel, string> = {
  certain: 'La même annonce',
  very_close: 'Très proche',
  close: 'Proche',
  far: 'Peu ressemblante',
}

/** Une annonce suivie qui ressemble à celle qu'on regarde, avec pourquoi. */
export const SimilarListingSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
  price: z.number().describe('Prix affiché en euros'),
  surface: z.number().nullable().describe('Surface en m²'),
  rooms: z.number().nullable(),
  commune: z.string().nullable(),
  district: z.string().nullable(),
  url: z.string().nullable(),
  sellerName: z.string().nullable(),
  sellerReference: z.string().nullable(),
  linkCount: z.number().int().min(0),
  updatedAt: z
    .string()
    .datetime()
    .describe('Pour le garde-fou d’une fusion ou d’un rattachement'),
  score: z.number().min(0).max(1).describe('Ressemblance, de 0 à 1'),
  level: SimilarityLevelSchema,
  matches: z
    .array(SimilarReasonSchema)
    .describe('Ce qui concorde, le plus fort d’abord'),
  differences: z.array(SimilarReasonSchema).describe('Ce qui diffère'),
})
export type SimilarListing = z.infer<typeof SimilarListingSchema>

const probeText = (max: number, what: string) =>
  z.string().trim().min(1).max(max).optional().describe(what)

/** Les caractéristiques libres qu'on peut comparer sans annonce enregistrée. */
export const SimilarProbeFieldsSchema = z.object({
  url: probeText(2000, 'Lien de l’annonce'),
  address: probeText(300, 'Adresse'),
  commune: probeText(120, 'Commune'),
  district: probeText(120, 'Quartier'),
  price: z.number().min(0).optional().describe('Prix affiché en euros'),
  surface: z.number().positive().optional().describe('Surface en m²'),
  rooms: z.number().int().min(0).optional().describe('Nombre de pièces'),
  floor: z.number().int().optional().describe('Étage'),
  dpeClass: DpeClassSchema.optional(),
  constructionYear: z.number().int().optional(),
  sellerType: ObservedSellerTypeSchema.optional(),
  sellerName: probeText(120, 'Agence ou réseau lus'),
  reference: probeText(60, 'Référence de l’annonce lue'),
})
export type SimilarProbeFields = z.infer<typeof SimilarProbeFieldsSchema>

/**
 * `GET /listings/similar` : les annonces suivies qui ressemblent à une annonce
 * enregistrée (`listingId`), à un brouillon « À valider » (`draftId`) ou à un
 * texte cherché (`q`), de la plus ressemblante à la moins ressemblante.
 */
export const SimilarListingsQuerySchema = z
  .object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe('Annonce enregistrée à comparer (exclue des résultats)'),
    draftId: z
      .string()
      .uuid()
      .optional()
      .describe('Brouillon « À valider » à comparer'),
    q: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe(
        'Texte cherché dans le titre, la commune, le quartier, l’adresse, l’agence, la référence, le prix ou la surface ; les annonces trouvées restent classées par ressemblance'
      ),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SIMILAR_LISTINGS_MAX)
      .default(SIMILAR_LISTINGS_DEFAULT),
  })
  .refine(
    query =>
      query.listingId !== undefined ||
      query.draftId !== undefined ||
      Boolean(query.q),
    { message: 'Donne listingId, draftId ou un texte à chercher (q)' }
  )
export type SimilarListingsQuery = z.infer<typeof SimilarListingsQuerySchema>

// ---------------------------------------------------------------------------
// Fusion de deux fiches
// ---------------------------------------------------------------------------

/** `POST /listings/:id/merge` : la fiche `:id` est gardée, l'autre absorbée. */
export const ListingMergeInputSchema = z.object({
  absorbedId: z
    .string()
    .uuid()
    .describe(
      'La fiche en double : ses liens, ses agences et son suivi rejoignent la fiche gardée ; elle est cachée des listes, jamais supprimée'
    ),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe('Garde-fou : `updatedAt` de la fiche gardée lu avant'),
  expectedAbsorbedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe('Garde-fou : `updatedAt` de la fiche absorbée lu avant'),
})
export type ListingMergeInput = z.infer<typeof ListingMergeInputSchema>

/** Ce qu'une fusion a fait passer d'une fiche à l'autre. */
export const ListingMergeCountsSchema = z.object({
  links: z.number().int().min(0),
  sellers: z.number().int().min(0),
  visits: z.number().int().min(0),
  offers: z.number().int().min(0),
  opinions: z.number().int().min(0),
  tasks: z.number().int().min(0),
  agencyRequests: z.number().int().min(0),
  fields: z.number().int().min(0).describe('Champs vides complétés'),
  notes: z.boolean().describe('Notes recopiées à la suite'),
})
export type ListingMergeCounts = z.infer<typeof ListingMergeCountsSchema>

export const EMPTY_MERGE_COUNTS: ListingMergeCounts = {
  links: 0,
  sellers: 0,
  visits: 0,
  offers: 0,
  opinions: 0,
  tasks: 0,
  agencyRequests: 0,
  fields: 0,
  notes: false,
}

/** Une fusion enregistrée, telle que la fiche la montre. */
export const ListingMergeRecordSchema = z.object({
  id: z.string().uuid(),
  keptId: z.string().uuid(),
  keptTitle: z.string(),
  absorbedId: z.string().uuid(),
  absorbedTitle: z.string(),
  mergedAt: z.string().datetime(),
  mergedById: z.string().uuid().nullable(),
  channel: ActivityChannelSchema.describe(
    'Par l’application (web), ou par Claude au connecteur (mcp)'
  ),
  summary: z.string().describe('Ce qui a rejoint la fiche gardée, en clair'),
  counts: ListingMergeCountsSchema,
})
export type ListingMergeRecord = z.infer<typeof ListingMergeRecordSchema>

/** La fiche qui a absorbé celle-ci (une fiche fusionnée n'est plus suivie). */
export const ListingMergedIntoSchema = z.object({
  mergeId: z.string().uuid(),
  id: z.string().uuid(),
  title: z.string(),
  mergedAt: z.string().datetime(),
})
export type ListingMergedInto = z.infer<typeof ListingMergedIntoSchema>

/** Un champ comparé entre les deux fiches. */
export const ListingMergeFieldSchema = z.object({
  field: z.string(),
  label: z.string(),
  kept: z.string().nullable().describe('La valeur de la fiche gardée'),
  other: z.string().nullable().describe('La valeur de la fiche absorbée'),
})
export type ListingMergeField = z.infer<typeof ListingMergeFieldSchema>

/** Une des deux fiches, en quelques faits. */
export const ListingMergeSideSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
  price: z.number(),
  surface: z.number().nullable(),
  commune: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  links: z.number().int().min(0),
  visits: z.number().int().min(0),
  offers: z.number().int().min(0),
  opinions: z.number().int().min(0),
  tasks: z.number().int().min(0),
})
export type ListingMergeSide = z.infer<typeof ListingMergeSideSchema>

/**
 * `GET /listings/:id/merge-preview?with=` : ce que la fusion ferait, sans
 * rien écrire. `refusal` dit pourquoi elle est impossible.
 */
export const ListingMergePreviewSchema = z.object({
  keep: ListingMergeSideSchema,
  absorb: ListingMergeSideSchema,
  suggestedKeepId: z
    .string()
    .uuid()
    .describe('La fiche qu’il vaut mieux garder (la plus avancée)'),
  suggestionReason: z.string(),
  moves: z
    .array(z.string())
    .describe('Ce qui rejoint la fiche gardée, une ligne par sorte'),
  fills: z
    .array(ListingMergeFieldSchema)
    .describe('Champs vides de la fiche gardée, complétés par l’autre'),
  differences: z
    .array(ListingMergeFieldSchema)
    .describe(
      'Champs remplis des deux côtés avec des valeurs différentes : la fiche gardée l’emporte'
    ),
  sellers: z
    .array(z.string())
    .describe('Les agences de la fiche après la fusion, une ligne chacune'),
  leftBehind: z
    .array(z.string())
    .describe('Ce qui reste sur la fiche absorbée (non repris)'),
  refusal: z.string().nullable(),
})
export type ListingMergePreview = z.infer<typeof ListingMergePreviewSchema>

export const ListingMergePreviewQuerySchema = z.object({
  with: z.string().uuid().describe('L’autre fiche (celle qui serait absorbée)'),
})
export type ListingMergePreviewQuery = z.infer<
  typeof ListingMergePreviewQuerySchema
>
