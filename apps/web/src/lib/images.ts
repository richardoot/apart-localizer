import { AI_IMAGE_MEDIA_TYPES, AI_MAX_IMAGE_BYTES } from '@apart/contracts'
import type { AiImageMediaType, ExtractionImage } from '@apart/contracts'

/**
 * Les captures d'écran déposées dans « Coller une annonce » : lues en base64
 * et, quand le navigateur sait dessiner, réduites à 1 568 px de grand côté en
 * JPEG (ce que le modèle lit sans perte, pour un corps de requête léger ;
 * Vercel plafonne à 4,5 Mo). Sans toile (tests), le fichier part tel quel
 * s'il tient dans la limite.
 */

/** Grand côté maximal recommandé par Anthropic pour une image. */
export const MAX_IMAGE_EDGE = 1568

export class ImageTooLargeError extends Error {
  constructor(name: string) {
    super(
      `« ${name} » dépasse ${AI_MAX_IMAGE_BYTES / 1024 / 1024} Mo et ne peut pas être réduite ici.`
    )
    this.name = 'ImageTooLargeError'
  }
}

export class UnsupportedImageError extends Error {
  constructor(name: string) {
    super(`« ${name} » n'est pas une image jpeg, png, gif ou webp.`)
    this.name = 'UnsupportedImageError'
  }
}

function isSupported(type: string): type is AiImageMediaType {
  return (AI_IMAGE_MEDIA_TYPES as readonly string[]).includes(type)
}

/** La partie base64 d'une URL `data:`. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('Lecture impossible'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

/** Réduit l'image sur une toile ; null si le navigateur ne sait pas (tests, ancien moteur). */
async function downscale(file: File, maxEdge: number): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.startsWith('data:image/jpeg') ? dataUrl : null
}

/** Un fichier déposé vers une capture prête pour l'API. */
export async function fileToExtractionImage(
  file: File,
  maxEdge = MAX_IMAGE_EDGE
): Promise<ExtractionImage> {
  if (!isSupported(file.type)) throw new UnsupportedImageError(file.name)
  if (file.type !== 'image/gif') {
    const reduced = await downscale(file, maxEdge)
    if (reduced) {
      return { mediaType: 'image/jpeg', data: dataUrlToBase64(reduced) }
    }
  }
  if (file.size > AI_MAX_IMAGE_BYTES) throw new ImageTooLargeError(file.name)
  const dataUrl = await readAsDataUrl(file)
  return { mediaType: file.type, data: dataUrlToBase64(dataUrl) }
}
