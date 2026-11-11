import { z } from 'zod'

/**
 * Lot 25 (ADR 0035) : la fiche répond d'abord. Les trois jugements d'une
 * annonce, toujours étiquetés et toujours dans le même ordre (une seule
 * source pour leurs libellés), et la photo de couverture (la première photo
 * de visite, ou celle qu'un membre choisit ; jamais une image de portail).
 */

/**
 * Les trois jugements indépendants d'une annonce : la rentabilité face aux
 * seuils de l'espace (le verdict), la recherche (l'adéquation aux critères
 * actifs) et la location en phase 2 (la louabilité).
 */
export const JudgementKeySchema = z
  .enum(['profitability', 'search', 'rental'])
  .describe(
    'Un des trois jugements d’une annonce : rentabilité, recherche, location'
  )
export type JudgementKey = z.infer<typeof JudgementKeySchema>

/** L'ordre d'affichage, partout (liste, cartes, tableau, fiche, tri, accueil). */
export const JUDGEMENT_KEYS: readonly JudgementKey[] =
  JudgementKeySchema.options

/** L'étiquette de chaque jugement. */
export const JUDGEMENT_LABELS: Record<JudgementKey, string> = {
  profitability: 'Rentabilité',
  search: 'Recherche',
  rental: 'Location',
}

/** Sa forme courte, là où la place manque (ligne collée du téléphone). */
export const JUDGEMENT_SHORT_LABELS: Record<JudgementKey, string> = {
  profitability: 'Renta.',
  search: 'Rech.',
  rental: 'Loc.',
}

/** Ce que juge chacun, en une phrase (infobulle, lecteur d'écran, légende). */
export const JUDGEMENT_DESCRIPTIONS: Record<JudgementKey, string> = {
  profitability:
    'Rentabilité : rendement brut, effort mensuel et DPE face aux seuils des hypothèses de l’espace.',
  search:
    'Recherche : l’annonce face aux critères de recherche actifs (périmètre, prix, surface, pièces, DPE).',
  rental:
    'Location : peut-on la louer en phase 2 (DPE, encadrement des loyers, règles de la commune).',
}

/** La photo de couverture d'une annonce, en vignette signée à durée courte. */
export const ListingCoverSchema = z.object({
  listingId: z.string().uuid(),
  photoId: z.string().uuid(),
  visitId: z.string().uuid(),
  thumbnailUrl: z
    .string()
    .url()
    .nullable()
    .describe(
      'Vignette de la photo, URL signée à durée courte (null si le stockage ne répond pas)'
    ),
  urlExpiresAt: z
    .string()
    .datetime()
    .nullable()
    .describe('Fin de validité de l’URL signée'),
  chosen: z
    .boolean()
    .describe(
      'Vrai si un membre l’a choisie ; faux pour la première photo de la première visite'
    ),
})
export type ListingCover = z.infer<typeof ListingCoverSchema>

/** Les couvertures de plusieurs annonces (liste, cartes) : une seule signature par lecture. */
export const ListingCoversSchema = z.object({
  covers: z
    .array(ListingCoverSchema)
    .describe(
      'Une couverture par annonce qui en a une (aucune avant la première photo de visite)'
    ),
})
export type ListingCovers = z.infer<typeof ListingCoversSchema>

/** Au plus deux cents annonces par lecture des couvertures. */
export const LISTING_COVERS_MAX = 200

export const ListingCoversQuerySchema = z.object({
  ids: z
    .string()
    .transform(value =>
      value
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).max(LISTING_COVERS_MAX))
    .describe(
      'Identifiants des annonces, séparés par des virgules (200 au plus)'
    ),
})
export type ListingCoversQuery = z.infer<typeof ListingCoversQuerySchema>

/** Choisir la couverture (une photo prête d'une visite de l'annonce), ou revenir à la première (null). */
export const ListingCoverInputSchema = z.object({
  photoId: z
    .string()
    .uuid()
    .nullable()
    .describe(
      'La photo choisie, prête, d’une visite de l’annonce ; null : la première photo de la première visite'
    ),
})
export type ListingCoverInput = z.infer<typeof ListingCoverInputSchema>
