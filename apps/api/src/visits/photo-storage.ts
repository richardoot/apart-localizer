import { ServiceUnavailableException } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

/**
 * Le stockage des photos de visite (Supabase Storage, bucket privé), derrière
 * un jeton d'injection : le client Supabase en vrai (clé service_role, côté
 * serveur), un faux en mémoire dans les tests. Aucune politique d'accès
 * public : seules les URL signées émises par l'API ouvrent un objet.
 */
export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE')

export interface SignedUploadTarget {
  signedUrl: string
  token: string
  path: string
}

export interface StoredObjectInfo {
  size: number | null
  contentType: string | null
}

export interface PhotoStorage {
  readonly bucket: string
  /** Une URL d'envoi à usage unique pour ce chemin (PUT du fichier). */
  createSignedUploadUrl(path: string): Promise<SignedUploadTarget>
  /** Des URL de lecture valables `expiresIn` secondes, dans l'ordre des chemins (null si absent). */
  createSignedUrls(
    paths: string[],
    expiresIn: number
  ): Promise<Array<string | null>>
  /** Taille et type de l'objet, ou null s'il n'existe pas. */
  info(path: string): Promise<StoredObjectInfo | null>
  remove(paths: string[]): Promise<void>
}

/** Le stockage indisponible (bucket absent, Storage désactivé, panne) : un refus lisible. */
export class PhotoStorageUnavailableException extends ServiceUnavailableException {
  constructor(detail: string) {
    super(
      `Stockage des photos indisponible (${detail}) : vérifie que Supabase Storage est actif et que le bucket existe (docs/deploiement.md).`
    )
  }
}

/** Le client Storage de Supabase, borné au bucket des photos. */
export function createSupabasePhotoStorage(
  url: string,
  serviceRoleKey: string,
  bucket: string
): PhotoStorage {
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const files = () => client.storage.from(bucket)
  return {
    bucket,
    async createSignedUploadUrl(path) {
      const { data, error } = await files().createSignedUploadUrl(path)
      if (error || !data) {
        throw new PhotoStorageUnavailableException(
          error?.message ?? 'aucune URL'
        )
      }
      return { signedUrl: data.signedUrl, token: data.token, path: data.path }
    },
    async createSignedUrls(paths, expiresIn) {
      if (paths.length === 0) return []
      const { data, error } = await files().createSignedUrls(paths, expiresIn)
      if (error || !data) {
        throw new PhotoStorageUnavailableException(
          error?.message ?? 'aucune URL'
        )
      }
      const byPath = new Map(
        data.map(entry => [entry.path, entry.error ? null : entry.signedUrl])
      )
      return paths.map(path => byPath.get(path) ?? null)
    },
    async info(path) {
      const { data, error } = await files().info(path)
      if (error || !data) return null
      return {
        size: typeof data.size === 'number' ? data.size : null,
        contentType: data.contentType ?? null,
      }
    },
    async remove(paths) {
      if (paths.length === 0) return
      const { error } = await files().remove(paths)
      if (error) throw new PhotoStorageUnavailableException(error.message)
    },
  }
}
