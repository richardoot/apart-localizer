import {
  VISIT_PHOTO_MAX_BYTES,
  VISIT_PHOTO_MAX_EDGE,
  VISIT_PHOTO_MIME_TYPES,
  VISIT_THUMBNAIL_EDGE,
  VISIT_THUMBNAIL_MAX_BYTES,
} from '@apart/contracts'
import type { VisitPhotoMimeType } from '@apart/contracts'

/**
 * Une photo de visite prête à partir : réduite dans le navigateur (2 048 px
 * de grand côté, JPEG) et sa vignette (360 px), toutes deux réencodées sur
 * une toile, ce qui retire au passage les métadonnées EXIF (position GPS
 * comprise). Sans toile (tests, ancien navigateur), le fichier part tel quel
 * s'il tient dans les limites et sert aussi de vignette s'il est léger.
 */
export interface PreparedPhoto {
  photo: Blob
  photoType: VisitPhotoMimeType
  thumbnail: Blob
  thumbnailType: VisitPhotoMimeType
  width: number | null
  height: number | null
}

export class PhotoRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoRejectedError'
  }
}

function isAllowed(type: string): type is VisitPhotoMimeType {
  return (VISIT_PHOTO_MIME_TYPES as readonly string[]).includes(type)
}

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  type: 'image/jpeg' | 'image/webp',
  quality: number
): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (typeof createImageBitmap === 'function') {
    const bitmap: ImageBitmap | null = await createImageBitmap(file).catch(
      () => null
    )
    if (bitmap) {
      const photo = await encode(
        bitmap,
        VISIT_PHOTO_MAX_EDGE,
        'image/jpeg',
        0.85
      )
      let thumbnail = await encode(
        bitmap,
        VISIT_THUMBNAIL_EDGE,
        'image/webp',
        0.8
      )
      let thumbnailType: VisitPhotoMimeType = 'image/webp'
      // Safari ancien ne sait pas écrire du WebP : il rend du PNG à la place.
      if (!thumbnail || thumbnail.type !== 'image/webp') {
        thumbnail = await encode(
          bitmap,
          VISIT_THUMBNAIL_EDGE,
          'image/jpeg',
          0.8
        )
        thumbnailType = 'image/jpeg'
      }
      const width = bitmap.width
      const height = bitmap.height
      bitmap.close?.()
      if (photo && thumbnail) {
        if (photo.size > VISIT_PHOTO_MAX_BYTES) {
          throw new PhotoRejectedError(
            `« ${file.name} » reste trop lourde après réduction.`
          )
        }
        return {
          photo,
          photoType: 'image/jpeg',
          thumbnail,
          thumbnailType,
          width,
          height,
        }
      }
    }
  }
  if (!isAllowed(file.type)) {
    throw new PhotoRejectedError(
      `« ${file.name} » n'est pas une image jpeg, png ou webp.`
    )
  }
  if (file.size > VISIT_PHOTO_MAX_BYTES) {
    throw new PhotoRejectedError(
      `« ${file.name} » dépasse ${VISIT_PHOTO_MAX_BYTES / 1024 / 1024} Mo.`
    )
  }
  if (file.size > VISIT_THUMBNAIL_MAX_BYTES) {
    throw new PhotoRejectedError(
      `Impossible de réduire « ${file.name} » dans ce navigateur.`
    )
  }
  return {
    photo: file,
    photoType: file.type,
    thumbnail: file,
    thumbnailType: file.type,
    width: null,
    height: null,
  }
}
