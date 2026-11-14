import { z } from 'zod'

/**
 * Lot 32 (ADR 0047) : les photos de l'annonce sur le portail, pour la
 * consulter sans y retourner. Ce sont des **liens** vers les images du
 * portail, relevés par Claude en lisant la page dans le navigateur de
 * l'utilisateur (ou par un membre) : le serveur ne télécharge jamais une
 * image ni une page de portail, le navigateur du membre affiche l'image
 * depuis le portail. Une image retirée par le portail disparaît de la fiche.
 */

/** Au plus trente photos par annonce : au-delà, la galerie n'aide plus. */
export const PORTAL_PHOTOS_MAX = 30

/** Longueur maximale d'un lien d'image (les CDN des portails ajoutent des paramètres). */
export const PORTAL_PHOTO_URL_MAX = 2000

export const PortalPhotoUrlSchema = z
  .string()
  .trim()
  .url()
  .max(PORTAL_PHOTO_URL_MAX)
  .refine(url => url.toLowerCase().startsWith('https://'), {
    message: 'Une photo du portail est un lien https.',
  })
  .describe(
    'Lien https d’une image de l’annonce, tel que la page du portail l’affiche (attribut src de la photo, en grande taille si la page la donne)'
  )

export const PortalPhotosSchema = z
  .array(PortalPhotoUrlSchema)
  .max(PORTAL_PHOTOS_MAX)
  .describe(
    `Lot 32 : les liens des photos de l’annonce sur le portail, dans l’ordre de la page (${PORTAL_PHOTOS_MAX} au plus, la première sert d’aperçu) ; jamais une photo inventée, ni le logo de l’agence, ni une carte, ni une photo d’une autre annonce`
  )
export type PortalPhotos = z.infer<typeof PortalPhotosSchema>
