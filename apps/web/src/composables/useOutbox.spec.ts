import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Visit } from '@apart/contracts'
import { ApiError } from '@/lib/api'
import { memoryOutboxStorage } from '@/lib/outbox-store'
import type { OutboxApi } from '@/lib/outbox-executor'
import { resetOutbox } from './useOutbox'

/**
 * Lot 24 : la file des écritures en attente de bout en bout, sans réseau :
 * une API factice, un stockage en mémoire partagé entre deux « pages »
 * (rechargement), une horloge et un minuteur à la main.
 */

const L = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'
const ME = '33333333-3333-4333-8333-333333333333'

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: V,
  listingId: L,
  visitedAt: '2026-11-10T17:30:00.000Z',
  status: 'planned',
  participantIds: [ME],
  report: null,
  pros: null,
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: ME,
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  photoCount: 0,
  photos: [],
  ...over,
})

const offline = () => new TypeError('Failed to fetch')

function fakeApi() {
  const calls: string[] = []
  let down = false
  const guard = <T>(name: string, value: () => T): Promise<T> => {
    calls.push(name)
    if (down) return Promise.reject(offline())
    return Promise.resolve(value())
  }
  const api = {
    tasks: {
      update: vi.fn((_l: string, t: string, u: { done: boolean }) =>
        guard(`task ${t} ${u.done}`, () => ({ id: t }) as never)
      ),
    },
    visits: {
      list: vi.fn(() => guard('list', () => [] as Visit[])),
      get: vi.fn(() => guard('get', () => visit())),
      create: vi.fn(() =>
        guard('create', () => ({ visit: visit({ id: 'created' }) }) as never)
      ),
      update: vi.fn((_l: string, v: string, u: Record<string, unknown>) =>
        guard(
          `update ${v} ${Object.keys(u).sort().join(',')}`,
          () =>
            ({
              visit: visit({ id: v, updatedAt: `after-${calls.length}` }),
            }) as never
        )
      ),
      requestPhotoUpload: vi.fn(() =>
        guard(
          'announce',
          () =>
            ({
              photo: { id: 'photo-1' },
              upload: {
                signedUrl: 'https://s/p',
                path: 'p',
                token: 't',
                contentType: 'image/jpeg',
                maxBytes: 10_000,
              },
              thumbnailUpload: {
                signedUrl: 'https://s/t',
                path: 't',
                token: 't',
                contentType: 'image/webp',
                maxBytes: 10_000,
              },
            }) as never
        )
      ),
      completePhoto: vi.fn(() => guard('complete', () => ({}) as never)),
    },
    opinions: {
      upsertMine: vi.fn(() =>
        guard('opinion', () => ({ updatedAt: 'avis-2' }) as never)
      ),
      list: vi.fn(() => guard('opinions', () => [])),
    },
    upload: vi.fn((target: { path: string }) =>
      guard(`put ${target.path}`, () => undefined)
    ),
  }
  return {
    api: api as unknown as OutboxApi & typeof api,
    calls,
    setDown: (value: boolean) => {
      down = value
    },
  }
}

function setup(storage = memoryOutboxStorage(), fake = fakeApi()) {
  let clock = 1_000_000
  let ids = 0
  const wakes: Array<() => void> = []
  const outbox = resetOutbox({
    storage: Promise.resolve(storage),
    api: fake.api,
    now: () => clock,
    newId: () => `id-${++ids}`,
    schedule: fn => {
      wakes.push(fn)
      return () => undefined
    },
  })
  return {
    outbox,
    fake,
    storage,
    advance: (ms: number) => {
      clock += ms
      wakes.splice(0).forEach(fn => fn())
    },
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
async function flushAll() {
  for (let i = 0; i < 10; i += 1) await settle()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Lot 24 : la file des écritures (useOutbox)', () => {
  it('sans réseau : gardée, montrée, rejouée dans l’ordre au retour, sans doublon', async () => {
    const { outbox, fake } = setup()
    fake.setDown(true)
    await outbox.start('user-1', ME)
    await outbox.add({
      kind: 'task',
      listingId: L,
      taskId: 't1',
      done: true,
      label: 'Vérifier la cave',
    })
    await outbox.add({
      kind: 'remark',
      listingId: L,
      visitRef: V,
      text: 'cave saine',
      at: '2026-11-10T17:42:00.000Z',
    })
    await flushAll()
    expect(outbox.entries.value).toHaveLength(2)
    expect(outbox.isOnline.value).toBe(false)
    expect(outbox.summary.value.text).toBe('2 changements en attente du réseau')

    fake.setDown(false)
    fake.calls.length = 0
    outbox.online()
    await flushAll()
    expect(fake.calls).toEqual(['task t1 true', `update ${V} remark`])
    expect(outbox.entries.value).toEqual([])
    expect(outbox.summary.value.text).toBe('Tout est envoyé')
  })

  it('survit au rechargement : une nouvelle page relit la file et la rejoue', async () => {
    const storage = memoryOutboxStorage()
    const first = setup(storage)
    first.fake.setDown(true)
    await first.outbox.start('user-1', ME)
    await first.outbox.add({
      kind: 'task',
      listingId: L,
      taskId: 't1',
      done: true,
      label: 'x',
    })
    await flushAll()

    const second = setup(storage)
    await second.outbox.start('user-1', ME)
    await flushAll()
    expect(second.fake.calls).toEqual(['task t1 true'])
    expect(second.outbox.entries.value).toEqual([])
    // La file d'un autre membre sur le même appareil n'est jamais rejouée par celui-ci.
    const other = setup(storage)
    await other.outbox.start('user-2')
    await flushAll()
    expect(other.fake.calls).toEqual([])
  })

  it('un refus reste « à revoir » ; « Réessayer » et « Abandonner »', async () => {
    const { outbox, fake } = setup()
    fake.api.tasks.update.mockRejectedValueOnce(
      new ApiError(404, 'Tâche introuvable')
    )
    await outbox.start('user-1', ME)
    await outbox.add({
      kind: 'task',
      listingId: L,
      taskId: 't1',
      done: true,
      label: 'x',
    })
    await flushAll()
    expect(outbox.entries.value[0]).toMatchObject({
      state: 'blocked',
      error: 'Tâche introuvable',
    })
    expect(outbox.summary.value.tone).toBe('bad')
    await outbox.retry(outbox.entries.value[0]?.id as string)
    await flushAll()
    expect(outbox.entries.value).toEqual([])

    fake.api.tasks.update.mockRejectedValueOnce(
      new ApiError(404, 'Tâche introuvable')
    )
    await outbox.add({
      kind: 'task',
      listingId: L,
      taskId: 't2',
      done: true,
      label: 'x',
    })
    await flushAll()
    const removed = await outbox.discard(outbox.entries.value[0]?.id as string)
    expect(removed).toHaveLength(1)
    expect(outbox.entries.value).toEqual([])
  })

  it('un conflit sur une écriture déjà appliquée (réponse perdue) passe ; un vrai conflit attend', async () => {
    const { outbox, fake } = setup()
    await outbox.start('user-1', ME)
    fake.api.visits.update.mockRejectedValueOnce(
      new ApiError(409, 'La visite a changé')
    )
    fake.api.visits.get.mockResolvedValueOnce(
      visit({ rating: 4, updatedAt: 'lu' })
    )
    await outbox.add({
      kind: 'visit',
      listingId: L,
      visitRef: V,
      changes: { rating: 4 },
      base: 'ancien',
    })
    await flushAll()
    expect(outbox.entries.value).toEqual([])

    fake.api.visits.update.mockRejectedValueOnce(
      new ApiError(409, 'La visite a changé')
    )
    fake.api.visits.get.mockResolvedValueOnce(visit({ rating: 2 }))
    await outbox.add({
      kind: 'visit',
      listingId: L,
      visitRef: V,
      changes: { rating: 4 },
      base: 'ancien',
    })
    await flushAll()
    expect(outbox.entries.value[0]).toMatchObject({
      state: 'blocked',
      conflict: true,
      error: 'La visite a changé',
    })
  })

  it('mon avis : conflit déjà appliqué reconnu par mes notes ; sinon à revoir', async () => {
    const { outbox, fake } = setup()
    await outbox.start('user-1', ME)
    const op = {
      kind: 'opinion' as const,
      listingId: L,
      rating: 3,
      text: '',
      ratingChanged: true,
      scores: { quiet: { score: 2, word: null } },
      labels: { quiet: 'Calme' },
      base: null,
    }
    fake.api.opinions.upsertMine.mockRejectedValueOnce(
      new ApiError(409, 'Ton avis a changé')
    )
    fake.api.opinions.list.mockResolvedValueOnce([
      {
        memberId: ME,
        rating: 3,
        updatedAt: 'x',
        scores: [{ key: 'quiet', score: 2, word: null }],
      } as never,
    ])
    await outbox.add(op, { holdMs: 0 })
    await flushAll()
    expect(outbox.entries.value).toEqual([])
    fake.api.opinions.upsertMine.mockRejectedValueOnce(
      new ApiError(409, 'Ton avis a changé')
    )
    await outbox.add(op, { holdMs: 0 })
    await flushAll()
    expect(outbox.entries.value[0]?.conflict).toBe(true)
  })

  it('les notes attendent le regroupement, puis partent en une seule écriture', async () => {
    const { outbox, fake, advance } = setup()
    await outbox.start('user-1', ME)
    const op = (key: string) => ({
      kind: 'opinion' as const,
      listingId: L,
      rating: 0,
      text: '',
      ratingChanged: false,
      scores: { [key]: { score: 4, word: null } },
      labels: {},
      base: null,
    })
    await outbox.add(op('quiet'))
    await outbox.add(op('light'))
    await flushAll()
    expect(fake.api.opinions.upsertMine).not.toHaveBeenCalled()
    advance(20_000)
    await flushAll()
    expect(fake.api.opinions.upsertMine).toHaveBeenCalledTimes(1)
    expect(
      (fake.api.opinions.upsertMine.mock.calls[0] as unknown[])[1]
    ).toMatchObject({
      scores: { quiet: { score: 4 }, light: { score: 4 } },
      expectedUpdatedAt: null,
    })
  })

  it('une visite commencée hors ligne n’est pas créée deux fois', async () => {
    const { outbox, fake } = setup()
    await outbox.start('user-1', ME)
    const at = '2026-11-10T17:30:00.000Z'
    // La création passe côté serveur, la réponse se perd.
    fake.api.visits.create.mockRejectedValueOnce(offline())
    await outbox.add({
      kind: 'visit-create',
      listingId: L,
      localId: 'loc',
      input: { visitedAt: at, status: 'planned' },
    })
    await outbox.add({
      kind: 'remark',
      listingId: L,
      visitRef: 'local:loc',
      text: 'cave',
      at,
    })
    await flushAll()
    fake.api.visits.list.mockResolvedValueOnce([
      visit({ id: 'server-id', visitedAt: at }),
    ])
    outbox.online()
    await flushAll()
    expect(fake.api.visits.create).toHaveBeenCalledTimes(1)
    expect(fake.api.visits.update.mock.calls[0]?.[1]).toBe('server-id')
    expect(outbox.entries.value).toEqual([])
  })

  it('une photo : gardée sur l’appareil, envoyée, effacée ; une coupure reprend sans doublon', async () => {
    const storage = memoryOutboxStorage()
    const { outbox, fake } = setup(storage)
    await outbox.start('user-1', ME)
    const blobs = { photo: new Blob(['p']), thumbnail: new Blob(['t']) }
    // La photo part, la vignette tombe sur une coupure.
    fake.api.upload.mockResolvedValueOnce(undefined)
    fake.api.upload.mockRejectedValueOnce(offline())
    const id = await outbox.add(
      {
        kind: 'photo',
        listingId: L,
        visitRef: V,
        name: 'IMG_0001.jpg',
        meta: {
          contentType: 'image/jpeg',
          sizeBytes: 1,
          width: 10,
          height: 10,
          thumbnail: { contentType: 'image/webp', sizeBytes: 1 },
        },
        progress: null,
      },
      { blobs }
    )
    await flushAll()
    expect(await storage.getBlobs(id)).not.toBeNull()
    expect(outbox.entries.value[0]?.op).toMatchObject({
      progress: { photoId: 'photo-1', uploaded: false },
    })
    // Au retour : terminer d'abord (pas encore arrivée : 409), renvoyer, terminer.
    fake.api.visits.completePhoto.mockRejectedValueOnce(
      new ApiError(409, 'pas encore arrivée')
    )
    outbox.online()
    await flushAll()
    expect(fake.api.visits.requestPhotoUpload).toHaveBeenCalledTimes(1)
    expect(fake.api.visits.completePhoto).toHaveBeenCalledTimes(2)
    expect(outbox.entries.value).toEqual([])
    expect(await storage.getBlobs(id)).toBeNull()
  })

  it('une URL d’envoi périmée : nouvelle annonce au prochain essai ; une photo effacée de l’appareil est à revoir', async () => {
    const storage = memoryOutboxStorage()
    const { outbox, fake } = setup(storage)
    await outbox.start('user-1', ME)
    fake.api.upload.mockRejectedValueOnce(new ApiError(400, 'refusé'))
    const op = {
      kind: 'photo' as const,
      listingId: L,
      visitRef: V,
      name: 'IMG.jpg',
      meta: {
        contentType: 'image/jpeg' as const,
        sizeBytes: 1,
        width: null,
        height: null,
        thumbnail: { contentType: 'image/jpeg' as const, sizeBytes: 1 },
      },
      progress: null,
    }
    await outbox.add(op, {
      blobs: { photo: new Blob(['p']), thumbnail: new Blob(['t']) },
    })
    await flushAll()
    expect(outbox.entries.value[0]).toMatchObject({
      state: 'pending',
      op: { progress: null },
    })
    outbox.online()
    await flushAll()
    expect(fake.api.visits.requestPhotoUpload).toHaveBeenCalledTimes(2)
    expect(outbox.entries.value).toEqual([])

    await outbox.add(op)
    await flushAll()
    expect(outbox.entries.value[0]).toMatchObject({
      state: 'blocked',
      error: 'La photo n’est plus sur l’appareil : reprends-la si tu peux.',
    })
  })

  it('une photo déjà téléversée : terminer suffit ; annonce nettoyée : on recommence', async () => {
    const storage = memoryOutboxStorage()
    const { outbox, fake } = setup(storage)
    await outbox.start('user-1', ME)
    const upload = {
      signedUrl: 'https://s/p',
      path: 'p',
      token: 't',
      contentType: 'image/jpeg' as const,
      maxBytes: 10,
    }
    const op = {
      kind: 'photo' as const,
      listingId: L,
      visitRef: V,
      name: 'IMG.jpg',
      meta: {
        contentType: 'image/jpeg' as const,
        sizeBytes: 1,
        width: null,
        height: null,
        thumbnail: { contentType: 'image/jpeg' as const, sizeBytes: 1 },
      },
      progress: {
        photoId: 'old',
        upload,
        thumbnailUpload: upload,
        uploaded: true,
      },
    }
    fake.api.visits.completePhoto.mockRejectedValueOnce(
      new ApiError(404, 'Photo introuvable')
    )
    await outbox.add(op, {
      blobs: { photo: new Blob(['p']), thumbnail: new Blob(['t']) },
    })
    await flushAll()
    expect(fake.api.visits.requestPhotoUpload).toHaveBeenCalledTimes(1)
    expect(outbox.entries.value).toEqual([])
  })
})
