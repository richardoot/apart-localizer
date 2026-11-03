import { z } from 'zod'
import { ListingStatusSchema } from './enums.js'
import { PointSchema } from './geojson.js'

/**
 * Détection de doublons : ce que l'API cherche quand une annonce est extraite
 * ou créée, et ce qu'elle répond. Les seuils vivent ici pour que la doc, les
 * tests et le MCP parlent des mêmes chiffres.
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
    'same_address',
    'same_commune_price_surface',
    'nearby_similar',
  ])
  .describe(
    'Motif : même URL normalisée, même adresse normalisée, même commune avec surface à ±3 % et prix à ±5 %, ou à moins de 50 m avec une surface proche'
  )
export type DuplicateReasonKind = z.infer<typeof DuplicateReasonKindSchema>

export const DUPLICATE_REASON_LABELS: Record<DuplicateReasonKind, string> = {
  same_url: 'Même lien',
  same_address: 'Même adresse',
  same_commune_price_surface: 'Même commune, surface et prix proches',
  nearby_similar: 'À moins de 50 m, surface proche',
}

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
    url: z.string().max(2000).optional().describe("Lien de l'annonce"),
    address: z.string().max(300).optional().describe('Adresse à comparer'),
    commune: z.string().max(120).optional(),
    price: z.number().min(0).optional().describe('Prix affiché en euros'),
    surface: z.number().positive().optional().describe('Surface en m²'),
    point: PointSchema.optional().describe(
      'Point GeoJSON [lng, lat] pour la recherche à moins de 50 m'
    ),
  })
  .refine(
    probe =>
      probe.listingId !== undefined ||
      probe.url !== undefined ||
      probe.address !== undefined ||
      probe.point !== undefined ||
      (probe.commune !== undefined &&
        probe.price !== undefined &&
        probe.surface !== undefined),
    {
      message:
        'Donnez listingId, url, address, point, ou le trio commune + price + surface',
    }
  )
export type DuplicateProbe = z.infer<typeof DuplicateProbeSchema>
