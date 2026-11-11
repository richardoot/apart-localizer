import { describe, expect, it } from 'vitest'
import {
  OPINION_HOLD_MS,
  backoffMs,
  discardEntry,
  emptyOutbox,
  enqueue,
  entryLabel,
  fail,
  laneOf,
  nextReady,
  opinionAlreadyApplied,
  outboxSummary,
  outcomeOf,
  releaseHolds,
  resolveVisitRef,
  retryEntry,
  succeed,
  updateOp,
  visitAlreadyApplied,
} from './outbox'
import type { OutboxData, OutboxOp } from './outbox'

const L = 'listing-1'
const task = (taskId: string, done: boolean): OutboxOp => ({
  kind: 'task',
  listingId: L,
  taskId,
  done,
  label: `Vérifier ${taskId}`,
})
const opinion = (
  scores: Record<string, { score: number | null; word: string | null } | null>,
  rating = 0
): OutboxOp => ({
  kind: 'opinion',
  listingId: L,
  rating,
  text: '',
  ratingChanged: rating > 0,
  scores,
  labels: Object.fromEntries(Object.keys(scores).map(k => [k, `« ${k} »`])),
  base: '2026-11-10T10:00:00.000Z',
})

let counter = 0
function add(
  data: OutboxData,
  op: OutboxOp,
  now = 0,
  holdMs = 0,
  inFlight?: Set<string>
) {
  counter += 1
  return enqueue(data, op, {
    id: `e${counter}`,
    now,
    holdMs,
    ...(inFlight ? { inFlight } : {}),
  })
}

describe('Lot 24 : la file des écritures en attente', () => {
  it('une tâche cochée puis décochée avant l’envoi : une seule écriture, le dernier état', () => {
    let data = add(emptyOutbox(), task('t1', true))
    data = add(data, task('t1', false))
    data = add(data, task('t2', true))
    expect(data.entries).toHaveLength(2)
    expect(data.entries[0]?.op).toMatchObject({ taskId: 't1', done: false })
  })

  it('une écriture déjà en route ne se modifie plus : la suivante attend derrière', () => {
    let data = add(emptyOutbox(), task('t1', true))
    const sending = new Set([data.entries[0]?.id as string])
    data = add(data, task('t1', false), 0, 0, sending)
    expect(data.entries.map(e => (e.op as { done: boolean }).done)).toEqual([
      true,
      false,
    ])
    // La seconde ne part qu'après la première (même voie).
    expect(nextReady(data, 0, sending).entry).toBeNull()
  })

  it('les notes se regroupent par clé, avec le garde-fou le plus ancien', () => {
    let data = add(
      emptyOutbox(),
      opinion({ quiet: { score: 2, word: null } }),
      0,
      OPINION_HOLD_MS
    )
    data = add(
      data,
      {
        ...(opinion({ light: { score: 4, word: 'sud' } }, 3) as Extract<
          OutboxOp,
          { kind: 'opinion' }
        >),
        base: 'plus récent',
      },
      1_000,
      OPINION_HOLD_MS
    )
    expect(data.entries).toHaveLength(1)
    const op = data.entries[0]?.op
    expect(op).toMatchObject({
      rating: 3,
      ratingChanged: true,
      base: '2026-11-10T10:00:00.000Z',
      scores: {
        quiet: { score: 2, word: null },
        light: { score: 4, word: 'sud' },
      },
    })
    // Le regroupement repousse l'envoi.
    expect(data.entries[0]?.holdUntil).toBe(1_000 + OPINION_HOLD_MS)
    expect(nextReady(data, 2_000)).toEqual({
      entry: null,
      wakeAt: 1_000 + OPINION_HOLD_MS,
    })
    expect(nextReady(releaseHolds(data), 2_000).entry?.id).toBe(
      data.entries[0]?.id
    )
  })

  it('une modification de visite ne se fond pas par-dessus une remarque intercalée', () => {
    const visit = (changes: Record<string, unknown>): OutboxOp => ({
      kind: 'visit',
      listingId: L,
      visitRef: 'v1',
      changes,
      base: 'b0',
    })
    let data = add(emptyOutbox(), visit({ report: 'A' }))
    data = add(data, visit({ rating: 4 }))
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]?.op).toMatchObject({
      changes: { report: 'A', rating: 4 },
    })
    data = add(data, {
      kind: 'remark',
      listingId: L,
      visitRef: 'v1',
      text: 'cave',
      at: '2026-11-10T17:00:00Z',
    })
    data = add(data, visit({ pros: 'Lumière' }))
    expect(data.entries.map(e => e.op.kind)).toEqual([
      'visit',
      'remark',
      'visit',
    ])
  })

  it('l’ordre : une voie à la fois, les voies indépendantes avancent', () => {
    let data = add(emptyOutbox(), task('t1', true))
    data = add(data, task('t2', true))
    const first = data.entries[0]?.id as string
    // t1 refusée : t2 part quand même.
    data = fail(data, first, 'refused', 'Tâche introuvable', 0)
    expect(nextReady(data, 0).entry?.op).toMatchObject({ taskId: 't2' })
    expect(data.entries[0]).toMatchObject({
      state: 'blocked',
      error: 'Tâche introuvable',
      conflict: false,
    })
    // Rien ne part par-dessus une écriture refusée de la même voie.
    data = add(data, task('t1', false))
    expect(data.entries.filter(e => laneOf(e.op) === 'task:t1')).toHaveLength(2)
  })

  it('un échec de réseau réessaie plus tard (2 s, 4 s, … une minute au plus)', () => {
    let data = add(emptyOutbox(), task('t1', true))
    const id = data.entries[0]?.id as string
    data = fail(data, id, 'retry', 'Pas de connexion', 10_000)
    expect(data.entries[0]).toMatchObject({
      attempts: 1,
      nextTryAt: 12_000,
      state: 'pending',
    })
    expect(nextReady(data, 11_000)).toEqual({ entry: null, wakeAt: 12_000 })
    expect(nextReady(data, 12_000).entry?.id).toBe(id)
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([2_000, 4_000, 8_000, 60_000])
    expect(backoffMs(0)).toBe(2_000)
  })

  it('les codes HTTP : réseau et serveur réessaient, conflit et refus attendent le membre', () => {
    expect([null, 401, 408, 429, 500, 503].map(outcomeOf)).toEqual(
      Array(6).fill('retry')
    )
    expect(outcomeOf(409)).toBe('conflict')
    expect([400, 403, 404, 413].map(outcomeOf)).toEqual(
      Array(4).fill('refused')
    )
  })

  it('« Réessayer » et « Abandonner »', () => {
    let data = add(emptyOutbox(), task('t1', true))
    const id = data.entries[0]?.id as string
    data = fail(data, id, 'conflict', 'Modifié entre-temps', 0)
    expect(data.entries[0]?.conflict).toBe(true)
    data = retryEntry(data, id)
    expect(data.entries[0]).toMatchObject({
      state: 'pending',
      conflict: false,
      error: null,
    })
    const { data: after, removed } = discardEntry(data, id)
    expect(after.entries).toEqual([])
    expect(removed.map(e => e.id)).toEqual([id])
    expect(discardEntry(after, 'inconnu').removed).toEqual([])
    expect(retryEntry(after, 'inconnu')).toEqual(after)
  })

  it('une visite commencée hors ligne part d’abord ; ce qui la vise attend son identifiant', () => {
    let data = add(emptyOutbox(), {
      kind: 'visit-create',
      listingId: L,
      localId: 'loc1',
      input: { visitedAt: '2026-11-10T17:00:00.000Z', status: 'planned' },
    })
    data = add(data, {
      kind: 'remark',
      listingId: L,
      visitRef: 'local:loc1',
      text: 'cave',
      at: '2026-11-10T17:05:00Z',
    })
    data = add(data, task('t1', true))
    const create = data.entries[0]?.id as string
    // La remarque est dans la même voie que la création : elle attend.
    expect(nextReady(data, 0).entry?.id).toBe(create)
    expect(resolveVisitRef(data, 'local:loc1')).toBeNull()
    expect(resolveVisitRef(data, 'v-real')).toBe('v-real')
    data = succeed(data, create, { createdVisitId: 'v-real' })
    expect(data.refs).toEqual({ loc1: 'v-real' })
    expect(resolveVisitRef(data, 'local:loc1')).toBe('v-real')
    expect(nextReady(data, 0).entry?.op.kind).toBe('remark')
    // Plus rien ne vise la visite locale : la référence s'oublie.
    data = succeed(data, data.entries[0]?.id as string)
    expect(data.refs).toEqual({})
  })

  it('abandonner une visite commencée hors ligne abandonne ce qui la visait', () => {
    let data = add(emptyOutbox(), {
      kind: 'visit-create',
      listingId: L,
      localId: 'loc1',
      input: { visitedAt: '2026-11-10T17:00:00.000Z' },
    })
    data = add(data, {
      kind: 'remark',
      listingId: L,
      visitRef: 'local:loc1',
      text: 'cave',
      at: '2026-11-10T17:05:00Z',
    })
    data = add(data, task('t1', true))
    const { data: after, removed } = discardEntry(
      data,
      data.entries[0]?.id as string
    )
    expect(removed.map(e => e.op.kind)).toEqual(['visit-create', 'remark'])
    expect(after.entries.map(e => e.op.kind)).toEqual(['task'])
  })

  it('après une écriture, la suite de la voie prend le nouveau garde-fou', () => {
    let data = add(emptyOutbox(), {
      kind: 'remark',
      listingId: L,
      visitRef: 'v1',
      text: 'cave',
      at: '2026-11-10T17:05:00Z',
    })
    data = add(data, {
      kind: 'visit',
      listingId: L,
      visitRef: 'v1',
      changes: { rating: 4 },
      base: 'ancien',
    })
    data = add(data, opinion({ quiet: { score: 3, word: null } }))
    data = add(
      data,
      opinion({ light: { score: 3, word: null } }),
      0,
      0,
      new Set([data.entries[2]?.id as string])
    )
    data = succeed(data, data.entries[0]?.id as string, {
      visitUpdatedAt: 'nouveau',
    })
    expect(data.entries[0]?.op).toMatchObject({
      kind: 'visit',
      base: 'nouveau',
    })
    data = succeed(data, data.entries[1]?.id as string, {
      opinionUpdatedAt: 'avis-2',
    })
    expect(data.entries[1]?.op).toMatchObject({
      kind: 'opinion',
      base: 'avis-2',
    })
    expect(succeed(data, 'inconnu')).toEqual(data)
  })

  it('la progression d’une photo est gardée', () => {
    let data = add(emptyOutbox(), {
      kind: 'photo',
      listingId: L,
      visitRef: 'v1',
      name: 'IMG_0001.jpg',
      meta: {
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        width: 10,
        height: 10,
        thumbnail: { contentType: 'image/webp', sizeBytes: 100 },
      },
      progress: null,
    })
    const id = data.entries[0]?.id as string
    const op = data.entries[0]?.op as Extract<OutboxOp, { kind: 'photo' }>
    const upload = {
      signedUrl: 'https://s/x',
      path: 'p',
      token: 't',
      contentType: 'image/jpeg' as const,
      maxBytes: 10,
    }
    data = updateOp(data, id, {
      ...op,
      progress: {
        photoId: 'ph1',
        upload,
        thumbnailUpload: upload,
        uploaded: true,
      },
    })
    expect(data.entries[0]?.op).toMatchObject({
      progress: { photoId: 'ph1', uploaded: true },
    })
  })
})

describe('Lot 24 : une écriture déjà appliquée (réponse perdue)', () => {
  const current = {
    status: 'done' as const,
    report: 'Lumineux',
    pros: null,
    cons: 'Bruit',
    rating: 4,
    participantIds: ['a', 'b'],
  }
  it('la visite porte déjà ces valeurs', () => {
    expect(
      visitAlreadyApplied({ rating: 4, participantIds: ['b', 'a'] }, current)
    ).toBe(true)
    expect(
      visitAlreadyApplied(
        { report: 'Lumineux', status: 'done', pros: undefined },
        current
      )
    ).toBe(true)
    expect(visitAlreadyApplied({ rating: 3 }, current)).toBe(false)
    expect(visitAlreadyApplied({ participantIds: ['a'] }, current)).toBe(false)
  })
  it('mon avis porte déjà ces notes', () => {
    const mine = {
      rating: 3,
      scores: [
        { key: 'quiet', score: 2, word: null },
        { key: 'light', score: null, word: null },
      ],
    }
    const op = opinion(
      { quiet: { score: 2, word: null }, light: null, view: null },
      3
    ) as Extract<OutboxOp, { kind: 'opinion' }>
    expect(opinionAlreadyApplied(op, mine)).toBe(true)
    expect(opinionAlreadyApplied({ ...op, rating: 4 }, mine)).toBe(false)
    expect(
      opinionAlreadyApplied(
        { ...op, scores: { quiet: { score: 3, word: null } } },
        mine
      )
    ).toBe(false)
    expect(
      opinionAlreadyApplied({ ...op, scores: { quiet: null } }, mine)
    ).toBe(false)
    expect(opinionAlreadyApplied(op, null)).toBe(false)
  })
})

describe('Lot 24 : les phrases de la file', () => {
  it('chaque écriture en quelques mots', () => {
    expect(entryLabel(task('la desserte', true))).toBe(
      'Point coché : Vérifier la desserte'
    )
    expect(entryLabel(task('la desserte', false))).toBe(
      'Point décoché : Vérifier la desserte'
    )
    expect(
      entryLabel({
        kind: 'visit-create',
        listingId: L,
        localId: 'x',
        input: { visitedAt: '2026-11-10T17:00:00Z' },
      })
    ).toBe('Visite commencée')
    expect(
      entryLabel({
        kind: 'visit',
        listingId: L,
        visitRef: 'v',
        base: null,
        changes: { status: 'done', report: 'x', rating: 3 },
      })
    ).toBe('Visite faite, compte rendu, note de la visite')
    expect(
      entryLabel({
        kind: 'visit',
        listingId: L,
        visitRef: 'v',
        base: null,
        changes: { pros: 'x', cons: 'y', participantIds: [] },
      })
    ).toBe('Points forts, points faibles, participants')
    expect(
      entryLabel({
        kind: 'visit',
        listingId: L,
        visitRef: 'v',
        base: null,
        changes: {},
      })
    ).toBe('Visite')
    expect(
      entryLabel({
        kind: 'remark',
        listingId: L,
        visitRef: 'v',
        text: 'cave saine',
        at: 'x',
      })
    ).toBe('Remarque : cave saine')
    expect(entryLabel(opinion({ quiet: { score: 2, word: null } }, 3))).toBe(
      'Mes notes : « quiet », note globale'
    )
    expect(entryLabel(opinion({}))).toBe('Mes notes : avis')
    expect(
      entryLabel({
        kind: 'photo',
        listingId: L,
        visitRef: 'v',
        name: 'IMG_0001.jpg',
        meta: {
          contentType: 'image/jpeg',
          sizeBytes: 1,
          width: null,
          height: null,
          thumbnail: { contentType: 'image/jpeg', sizeBytes: 1 },
        },
        progress: null,
      })
    ).toBe('Photo « IMG_0001.jpg »')
  })

  it('la pastille de l’écran', () => {
    expect(outboxSummary([], { online: false, sending: false })).toMatchObject({
      clear: true,
      text: 'Tout est envoyé',
      tone: 'good',
    })
    let data = add(emptyOutbox(), task('a', true))
    data = add(data, task('b', true))
    expect(
      outboxSummary(data.entries, { online: false, sending: false })
    ).toMatchObject({
      text: '2 changements en attente du réseau',
      tone: 'warn',
      pending: 2,
    })
    expect(
      outboxSummary(data.entries, { online: true, sending: true }).text
    ).toBe('Envoi… (2 en attente)')
    expect(
      outboxSummary(data.entries.slice(0, 1), { online: true, sending: false })
        .text
    ).toBe('1 changement à envoyer')
    data = fail(data, data.entries[0]?.id as string, 'refused', 'non', 0)
    expect(
      outboxSummary(data.entries, { online: true, sending: false })
    ).toMatchObject({
      text: '1 changement à revoir · 1 en attente',
      tone: 'bad',
      blocked: 1,
    })
    data = fail(data, data.entries[1]?.id as string, 'refused', 'non', 0)
    expect(
      outboxSummary(data.entries, { online: true, sending: false }).text
    ).toBe('2 changements à revoir')
  })
})
