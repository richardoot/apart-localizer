import type { OutboxData } from './outbox'

/**
 * Lot 24 (ADR 0034) : où la file des écritures en attente est gardée sur
 * l'appareil. IndexedDB (une base `apart-localizer` : la file par membre, les
 * photos pas encore envoyées, le dernier état lu du mode visite) ; sans
 * IndexedDB (navigation privée ancienne, tests), en mémoire : la file vit
 * alors tant que la page reste ouverte, et l'écran le dit.
 *
 * Rien de ce qui est gardé ici ne part ailleurs que vers l'API de
 * l'application ; une photo gardée est déjà réduite (2 048 px) et sans
 * métadonnées (EXIF, position GPS), et s'efface dès qu'elle est envoyée.
 */

export interface PhotoBlobs {
  photo: Blob
  thumbnail: Blob
}

export interface OutboxStorage {
  /** Vrai si ce qui est gardé survit à un rechargement. */
  readonly persistent: boolean
  load(key: string): Promise<OutboxData | null>
  save(key: string, data: OutboxData): Promise<void>
  putBlobs(id: string, blobs: PhotoBlobs): Promise<void>
  getBlobs(id: string): Promise<PhotoBlobs | null>
  deleteBlobs(id: string): Promise<void>
  putSnapshot(key: string, value: unknown): Promise<void>
  getSnapshot<T>(key: string): Promise<T | null>
}

/** En mémoire : les tests, et le repli sans IndexedDB. */
export function memoryOutboxStorage(): OutboxStorage {
  const queues = new Map<string, OutboxData>()
  const blobs = new Map<string, PhotoBlobs>()
  const snapshots = new Map<string, unknown>()
  return {
    persistent: false,
    load: async key => {
      const data = queues.get(key)
      return data ? structuredClone(data) : null
    },
    save: async (key, data) => {
      queues.set(key, structuredClone(data))
    },
    putBlobs: async (id, value) => {
      blobs.set(id, value)
    },
    getBlobs: async id => blobs.get(id) ?? null,
    deleteBlobs: async id => {
      blobs.delete(id)
    },
    putSnapshot: async (key, value) => {
      snapshots.set(key, structuredClone(value))
    },
    getSnapshot: async <T>(key: string) =>
      (snapshots.has(key)
        ? structuredClone(snapshots.get(key))
        : null) as T | null,
  }
}

const DB_NAME = 'apart-localizer'
const DB_VERSION = 1
const STORES = ['outbox', 'blobs', 'snapshots'] as const
type StoreName = (typeof STORES)[number]

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Base locale bloquée'))
  })
}

/** IndexedDB, ou null s'il n'est pas utilisable ici. */
export async function indexedDbOutboxStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB
): Promise<OutboxStorage | null> {
  if (!factory) return null
  let db: IDBDatabase
  try {
    db = await openDatabase(factory)
  } catch {
    return null
  }
  const run = async <T>(
    store: StoreName,
    mode: IDBTransactionMode,
    action: (s: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const tx = db.transaction(store, mode)
    const result = await request(action(tx.objectStore(store)))
    if (mode === 'readwrite') {
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }
    return result
  }
  return {
    persistent: true,
    load: async key =>
      ((await run('outbox', 'readonly', s => s.get(key))) as OutboxData) ??
      null,
    save: async (key, data) => {
      // Une copie simple (les proxys réactifs ne se clonent pas).
      await run('outbox', 'readwrite', s =>
        s.put(JSON.parse(JSON.stringify(data)), key)
      )
    },
    putBlobs: async (id, value) => {
      await run('blobs', 'readwrite', s => s.put(value, id))
    },
    getBlobs: async id =>
      ((await run('blobs', 'readonly', s => s.get(id))) as PhotoBlobs) ?? null,
    deleteBlobs: async id => {
      await run('blobs', 'readwrite', s => s.delete(id))
    },
    putSnapshot: async (key, value) => {
      await run('snapshots', 'readwrite', s =>
        s.put(JSON.parse(JSON.stringify(value)), key)
      )
    },
    getSnapshot: async <T>(key: string) =>
      ((await run('snapshots', 'readonly', s => s.get(key))) as T) ?? null,
  }
}
