import { z } from 'zod'
import {
  ListingStatusSchema,
  ObservedSellerTypeSchema,
  SellerTypeSchema,
} from './enums.js'
import { PointSchema } from './geojson.js'

/**
 * Détection de doublons : ce que l'API cherche quand une annonce est extraite
 * ou créée, et ce qu'elle répond. Les seuils vivent ici pour que la doc, les
 * tests et le MCP parlent des mêmes chiffres ; la comparaison est dans
 * `domain` (`same-listing.ts`). Lot 18 : le lien est comparé à tous les liens
 * de chaque annonce, et la même agence avec la même référence reconnaît la
 * même annonce publiée sur un autre portail.
 */

/** Tolérances : surface à ±3 %, prix à ±5 %, voisinage à 50 m avec surface à ±5 %. */
export const DUPLICATE_TOLERANCES = {
  surface: 0.03,
  price: 0.05,
  nearbyMeters: 50,
  nearbySurface: 0.05,
} as const

export const DuplicateReasonKindSchema = z
  .enum([
    'same_url',
    'same_reference',
    'same_reference_other_agency',
    'same_address',
    'same_commune_price_surface',
    'nearby_similar',
  ])
  .describe(
    'Motif : même lien (comparé à tous les liens de l’annonce : certain), même agence et même référence (certain, lot 18), même référence avec une agence différente ou inconnue (probable, à trancher), même adresse normalisée, même commune avec surface à ±3 % et prix à ±5 %, ou à moins de 50 m avec une surface proche'
  )
export type DuplicateReasonKind = z.infer<typeof DuplicateReasonKindSchema>

export const DUPLICATE_REASON_LABELS: Record<DuplicateReasonKind, string> = {
  same_url: 'Même lien',
  same_reference: 'Même agence, même référence',
  same_reference_other_agency: 'Même référence, autre agence',
  same_address: 'Même adresse',
  same_commune_price_surface: 'Même commune, surface et prix proches',
  nearby_similar: 'À moins de 50 m, surface proche',
}

/** Les motifs qui suffisent à dire que c'est la même annonce (lot 18). */
export const CERTAIN_DUPLICATE_REASONS: readonly DuplicateReasonKind[] = [
  'same_url',
  'same_reference',
]

export const DuplicateReasonSchema = z.object({
  kind: DuplicateReasonKindSchema,
  score: z.number().min(0).max(1).describe('Vraisemblance du doublon, 0 à 1'),
  detail: z.string().max(300).describe('Explication en français'),
})
export type DuplicateReason = z.infer<typeof DuplicateReasonSchema>

/** Une annonce existante qui ressemble à celle qu'on extrait ou crée. */
export const DuplicateCandidateSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
  price: z.number().describe('Prix affiché en euros'),
  surface: z.number().nullable().describe('Surface en m²'),
  commune: z.string().nullable(),
  url: z.string().nullable(),
  score: z
    .number()
    .min(0)
    .max(1)
    .describe('Le meilleur score parmi les motifs'),
  reasons: z.array(DuplicateReasonSchema).min(1),
  certain: z
    .boolean()
    .default(false)
    .describe(
      'Lot 18 : vrai si c’est la même annonce sans aucun doute (même lien, ou même agence et même référence) : ajoutez le lien à sa fiche plutôt que de créer une annonce'
    ),
  sellerType: SellerTypeSchema.default('unknown').describe(
    'Le vendeur de l’annonce existante'
  ),
  sellerName: z
    .string()
    .nullable()
    .default(null)
    .describe('L’agence ou le réseau de l’annonce existante'),
  sellerReference: z
    .string()
    .nullable()
    .default(null)
    .describe('La référence de l’annonce existante'),
  linkCount: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Nombre de liens (portails) de l’annonce existante'),
})
export type DuplicateCandidate = z.infer<typeof DuplicateCandidateSchema>

/**
 * Ce qu'on compare : une annonce enregistrée (par son identifiant, qui est
 * alors exclue des candidats), ou des champs libres. Au moins un critère.
 */
export const DuplicateProbeSchema = z
  .object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe(
        'Annonce enregistrée dont on cherche les doublons (exclue des résultats)'
      ),
    url: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Lien de l'annonce (comparé à tous les liens de chaque annonce)"
      ),
    address: z.string().max(300).optional().describe('Adresse à comparer'),
    commune: z.string().max(120).optional(),
    price: z.number().min(0).optional().describe('Prix affiché en euros'),
    surface: z.number().positive().optional().describe('Surface en m²'),
    point: PointSchema.optional().describe(
      'Point GeoJSON [lng, lat] pour la recherche à moins de 50 m'
    ),
    sellerType: ObservedSellerTypeSchema.optional(),
    sellerName: z
      .string()
      .max(120)
      .optional()
      .describe('Agence ou réseau lus (comparés après normalisation)'),
    reference: z
      .string()
      .max(60)
      .optional()
      .describe(
        'Référence de l’annonce lue (comparée sans espaces, tirets ni points)'
      ),
  })
  .refine(
    probe =>
      probe.listingId !== undefined ||
      probe.url !== undefined ||
      probe.address !== undefined ||
      probe.point !== undefined ||
      probe.reference !== undefined ||
      (probe.commune !== undefined &&
        probe.price !== undefined &&
        probe.surface !== undefined),
    {
      message:
        'Donnez listingId, url, address, point, reference, ou le trio commune + price + surface',
    }
  )
export type DuplicateProbe = z.infer<typeof DuplicateProbeSchema>
