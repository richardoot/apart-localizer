import { computed, readonly, ref, shallowRef } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { ApiError, api, uploadToSignedUrl } from '@/lib/api'
import { errorMessage, isNetworkError } from '@/lib/errors'
import {
  OPINION_HOLD_MS,
  discardEntry,
  emptyOutbox,
  enqueue,
  fail,
  nextReady,
  outboxSummary,
  outcomeOf,
  releaseHolds,
  resolveVisitRef,
  retryEntry,
  succeed,
  updateOp,
} from '@/lib/outbox'
import type {
  OutboxData,
  OutboxEntry,
  OutboxOp,
  OutboxSuccess,
} from '@/lib/outbox'
import { OutboxRefusal, OutboxRetry, executeEntry } from '@/lib/outbox-executor'
import type { OutboxApi } from '@/lib/outbox-executor'
import { indexedDbOutboxStorage, memoryOutboxStorage } from '@/lib/outbox-store'
import type { OutboxStorage, PhotoBlobs } from '@/lib/outbox-store'

/**
 * Lot 24 (ADR 0034) : la file des écritures en attente, une par membre
 * connecté sur l'appareil. Chaque écriture du mode visite y entre d'abord
 * (gardée sur l'appareil avant tout envoi), puis part dans l'ordre de sa
 * voie dès que le serveur répond ; un échec de réseau réessaie plus tard, un
 * refus ou un conflit reste « à revoir » jusqu'au choix du membre. Une seule
 * file pour l'application (singleton) : ouvrir deux écrans ne double rien.
 */

export interface OutboxDeps {
  storage?: Promise<OutboxStorage>
  api?: OutboxApi
  now?: () => number
  newId?: () => string
  /** Planifie un réveil (minuteur) ; renvoie de quoi l'annuler. */
  schedule?: (fn: () => void, ms: number) => () => void
}

const defaultApi: OutboxApi = {
  tasks: { update: (l, t, u) => api.tasks.update(l, t, u) },
  visits: {
    list: l => api.visits.list(l),
    get: (l, v) => api.visits.get(l, v),
    create: (l, i) => api.visits.create(l, i),
    update: (l, v, u) => api.visits.update(l, v, u),
    requestPhotoUpload: (l, v, r) => api.visits.requestPhotoUpload(l, v, r),
    completePhoto: (l, v, p) => api.visits.completePhoto(l, v, p),
  },
  opinions: {
    upsertMine: (l, i) => api.opinions.upsertMine(l, i),
    list: l => api.opinions.list(l),
  },
  upload: uploadToSignedUrl,
}

/** Combien de temps une écriture passée reste montrée en attendant la relecture. */
const CONFIRMED_MS = 5 * 60_000

function statusOf(error: unknown): number | null {
  if (error instanceof OutboxRetry) return null
  if (error instanceof OutboxRefusal) return 400
  if (error instanceof ApiError) return error.status
  return null
}

function createOutbox(deps: OutboxDeps = {}) {
  const storagePromise =
    deps.storage ??
    indexedDbOutboxStorage().then(found => found ?? memoryOutboxStorage())
  const client = deps.api ?? defaultApi
  const now = deps.now ?? (() => Date.now())
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms)
      return () => clearTimeout(timer)
    })

  const data = shallowRef<OutboxData>(emptyOutbox())
  const userKey = ref<string | null>(null)
  const memberId = ref<string | null>(null)
  const persistent = ref(true)
  const ready = ref(false)
  /** Le dernier envoi a trouvé le serveur (faux après une coupure). */
  const reachable = ref(true)
  const browserOnline = ref(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  )
  const sending = ref<string | null>(null)
  /**
   * Les écritures passées, gardées en mémoire quelques minutes : l'écran les
   * montre encore jusqu'à ce que sa lecture du serveur les contienne (pas de
   * retour en arrière visible entre la réponse et la relecture).
   */
  const confirmed = shallowRef<{ entry: OutboxEntry; at: number }[]>([])
  let storage: OutboxStorage | null = null
  let running = false
  let again = false
  let cancelWake: (() => void) | null = null
  let queryClient: QueryClient | null = null
  let loading: Promise<void> | null = null

  const keyOf = (user: string) => `outbox:${user}`

  async function persist(): Promise<void> {
    if (!storage || !userKey.value) return
    try {
      await storage.save(keyOf(userKey.value), data.value)
    } catch {
      persistent.value = false
    }
  }

  /** Ouvre la file du membre connecté (une fois par membre). */
  function start(user: string, member: string | null = null): Promise<void> {
    if (member) memberId.value = member
    if (userKey.value === user && loading) return loading
    userKey.value = user
    ready.value = false
    loading = (async () => {
      storage = await storagePromise
      persistent.value = storage.persistent
      const stored = await storage.load(keyOf(user)).catch(() => null)
      // Ce qui a pu être ajouté avant la lecture reste derrière ce qui était gardé.
      data.value = stored
        ? {
            entries: [...stored.entries, ...data.value.entries],
            refs: { ...stored.refs, ...data.value.refs },
          }
        : data.value
      // Une nouvelle page réessaie tout de suite ce qui attendait le réseau.
      data.value = {
        ...data.value,
        entries: data.value.entries.map(e => ({ ...e, nextTryAt: 0 })),
      }
      ready.value = true
      if (data.value.entries.length > 0) {
        // Garder la file même si le navigateur manque de place (meilleur effort).
        void navigator.storage?.persist?.().catch(() => undefined)
      }
      kick()
    })()
    return loading
  }

  function setQueryClient(client: QueryClient): void {
    queryClient = client
  }

  function invalidate(entry: OutboxEntry): void {
    const client = queryClient
    if (!client) return
    const id = entry.op.listingId
    void client.invalidateQueries({ queryKey: ['listings', 'detail', id] })
    void client.invalidateQueries({ queryKey: ['listings', 'activity', id] })
    void client.invalidateQueries({ queryKey: ['listings', 'list'] })
    if (entry.op.kind === 'task') {
      void client.invalidateQueries({ queryKey: ['tasks', 'open'] })
    }
    if (entry.op.kind !== 'task' && entry.op.kind !== 'opinion') {
      void client.invalidateQueries({ queryKey: ['listings', 'visits', id] })
    }
    void client.invalidateQueries({ queryKey: ['decisions', 'overview'] })
  }

  /** Ajoute une écriture (gardée avant tout envoi) ; renvoie son identifiant. */
  async function add(
    op: OutboxOp,
    options: { holdMs?: number; blobs?: PhotoBlobs } = {}
  ): Promise<string> {
    const id = newId()
    if (options.blobs) {
      storage = storage ?? (await storagePromise)
      await storage.putBlobs(id, options.blobs)
    }
    const inFlight = new Set(sending.value ? [sending.value] : [])
    data.value = enqueue(data.value, op, {
      id,
      now: now(),
      holdMs: options.holdMs ?? (op.kind === 'opinion' ? OPINION_HOLD_MS : 0),
      inFlight,
    })
    await persist()
    kick()
    return id
  }

  function kick(): void {
    if (!ready.value) return
    if (running) {
      again = true
      return
    }
    void loop()
  }

  async function loop(): Promise<void> {
    running = true
    cancelWake?.()
    cancelWake = null
    try {
      for (;;) {
        again = false
        const inFlight = new Set<string>()
        const { entry, wakeAt } = nextReady(data.value, now(), inFlight)
        if (!entry) {
          if (wakeAt !== null) {
            cancelWake = schedule(kick, Math.max(0, wakeAt - now()))
          }
          if (!again) break
          continue
        }
        sending.value = entry.id
        let result: OutboxSuccess | null = null
        try {
          result = await executeEntry(entry, {
            data: data.value,
            api: client,
            storage: storage ?? (await storagePromise),
            memberId: memberId.value,
            saveOp: async op => {
              data.value = updateOp(data.value, entry.id, op)
              await persist()
            },
          })
          reachable.value = true
        } catch (error) {
          const status = statusOf(error)
          if (isNetworkError(error)) reachable.value = false
          data.value = fail(
            data.value,
            entry.id,
            outcomeOf(status),
            error instanceof OutboxRefusal || error instanceof OutboxRetry
              ? error.message
              : errorMessage(error, 'L’envoi a échoué.'),
            now()
          )
        } finally {
          sending.value = null
        }
        if (result) {
          const op = entry.op
          const resolved =
            'visitRef' in op
              ? {
                  ...op,
                  visitRef:
                    resolveVisitRef(data.value, op.visitRef) ?? op.visitRef,
                }
              : op
          const at = now()
          confirmed.value = [
            ...confirmed.value.filter(c => at - c.at < CONFIRMED_MS),
            { entry: { ...entry, op: resolved }, at },
          ].slice(-100)
          data.value = succeed(data.value, entry.id, result)
          invalidate(entry)
        }
        await persist()
      }
    } finally {
      running = false
    }
  }

  /** Le réseau revient : tout repart sans attendre la prochaine tentative. */
  function online(): void {
    browserOnline.value = true
    data.value = {
      ...data.value,
      entries: data.value.entries.map(e =>
        e.state === 'pending' ? { ...e, nextTryAt: 0 } : e
      ),
    }
    kick()
  }

  function offline(): void {
    browserOnline.value = false
  }

  /** Fin de visite, page cachée ou quittée : plus de regroupement. */
  async function flush(): Promise<void> {
    data.value = releaseHolds(data.value)
    await persist()
    kick()
  }

  async function retry(entryId: string): Promise<void> {
    data.value = retryEntry(data.value, entryId)
    await persist()
    kick()
  }

  /** « Abandonner » (choix du membre) ; renvoie ce qui est retiré. */
  async function discard(entryId: string): Promise<OutboxEntry[]> {
    const { data: next, removed } = discardEntry(data.value, entryId)
    data.value = next
    for (const entry of removed) {
      if (entry.op.kind === 'photo') await storage?.deleteBlobs(entry.id)
    }
    await persist()
    kick()
    return removed
  }

  async function blobsOf(entryId: string): Promise<PhotoBlobs | null> {
    storage = storage ?? (await storagePromise)
    return storage.getBlobs(entryId)
  }

  async function saveSnapshot(key: string, value: unknown): Promise<void> {
    storage = storage ?? (await storagePromise)
    await storage.putSnapshot(key, value).catch(() => undefined)
  }

  async function readSnapshot<T>(key: string): Promise<T | null> {
    storage = storage ?? (await storagePromise)
    return storage.getSnapshot<T>(key).catch(() => null)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush()
    })
  }

  const isOnline = computed(() => browserOnline.value && reachable.value)

  return {
    data: computed<OutboxData>(() => data.value),
    entries: computed(() => data.value.entries),
    confirmed: computed(() => confirmed.value),
    ready: readonly(ready),
    persistent: readonly(persistent),
    sending: readonly(sending),
    isOnline,
    summary: computed(() =>
      outboxSummary(data.value.entries, {
        online: isOnline.value,
        sending: sending.value !== null,
      })
    ),
    start,
    setQueryClient,
    add,
    flush,
    retry,
    discard,
    blobsOf,
    saveSnapshot,
    readSnapshot,
    online,
    offline,
    kick,
  }
}

export type Outbox = ReturnType<typeof createOutbox>

let instance: Outbox | null = null

/** La file de l'application (créée au premier usage). */
export function useOutbox(): Outbox {
  instance = instance ?? createOutbox()
  return instance
}

/** Tests : une file neuve, avec ses dépendances. */
export function resetOutbox(deps: OutboxDeps = {}): Outbox {
  instance = createOutbox(deps)
  return instance
}
