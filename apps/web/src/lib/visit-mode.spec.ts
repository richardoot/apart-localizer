import { describe, expect, it } from 'vitest'
import type { Opinion, Visit } from '@apart/contracts'
import { emptyOutbox, enqueue, succeed } from './outbox'
import type { OutboxData, OutboxOp } from './outbox'
import {
  entriesOfListing,
  localVisits,
  myScoresOf,
  namesText,
  pendingPhotos,
  projectScores,
  projectTaskDone,
  projectVisit,
  visitFinishLabel,
  visitViewOf,
} from './visit-mode'

const L = 'listing-1'
const visit: Visit = {
  id: 'v1',
  listingId: L,
  visitedAt: '2026-11-10T17:30:00.000Z',
  status: 'planned',
  participantIds: ['me'],
  report: 'Lumineux.',
  pros: null,
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: 'me',
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  photoCount: 0,
  photos: [],
}

let n = 0
const add = (data: OutboxData, op: OutboxOp) =>
  enqueue(data, op, { id: `e${++n}`, now: 0 })

describe('Lot 24 : ce que le mode visite affiche', () => {
  it('la visite avec le compte rendu, les remarques et les champs en attente', () => {
    let data = add(emptyOutbox(), {
      kind: 'remark',
      listingId: L,
      visitRef: 'v1',
      text: 'cave saine',
      at: '2026-11-10T17:42:00.000Z',
    })
    data = add(data, {
      kind: 'visit',
      listingId: L,
      visitRef: 'v1',
      changes: { rating: 4, status: 'done', pros: undefined },
      base: visit.updatedAt,
    })
    data = add(data, {
      kind: 'remark',
      listingId: L,
      visitRef: 'autre',
      text: 'rien',
      at: '2026-11-10T17:43:00.000Z',
    })
    const view = projectVisit(visitViewOf(visit), data)
    expect(view).toMatchObject({
      ref: 'v1',
      report: 'Lumineux.\n18 h 42 : cave saine',
      rating: 4,
      status: 'done',
      pros: null,
      local: false,
    })
  })

  it('une visite commencée hors ligne : montrée, puis suivie sous son vrai nom', () => {
    let data = add(emptyOutbox(), {
      kind: 'visit-create',
      listingId: L,
      localId: 'loc',
      input: {
        visitedAt: '2026-11-10T17:00:00.000Z',
        status: 'planned',
        participantIds: ['me'],
      },
    })
    data = add(data, {
      kind: 'remark',
      listingId: L,
      visitRef: 'local:loc',
      text: 'cave',
      at: '2026-11-10T17:05:00.000Z',
    })
    const [local] = localVisits(data, L, 'me')
    expect(local).toMatchObject({
      ref: 'local:loc',
      status: 'planned',
      local: true,
      createdById: 'me',
      updatedAt: null,
      report: null,
      rating: 0,
    })
    expect(localVisits(data, 'autre', 'me')).toEqual([])
    expect(projectVisit(local!, data).report).toBe('18 h 05 : cave')
    data = succeed(data, data.entries[0]!.id, { createdVisitId: 'v1' })
    expect(localVisits(data, L, 'me')).toEqual([])
    expect(projectVisit(visitViewOf(visit), data).report).toBe(
      'Lumineux.\n18 h 05 : cave'
    )
  })

  it('une tâche : le dernier choix en attente gagne', () => {
    const data = add(emptyOutbox(), {
      kind: 'task',
      listingId: L,
      taskId: 't1',
      done: true,
      label: 'x',
    })
    expect(projectTaskDone('t1', false, data)).toBe(true)
    expect(projectTaskDone('t2', false, data)).toBe(false)
  })

  it('mes notes avec ce qui attend', () => {
    const mine = myScoresOf({
      rating: 2,
      text: 'Bien situé',
      updatedAt: '2026-11-10T10:00:00.000Z',
      scores: [
        { key: 'quiet', score: 2, word: 'bus', updatedAt: 'x' },
        { key: 'light', score: 4, word: null, updatedAt: 'x' },
      ],
    } as Opinion)
    expect(mine).toEqual({
      rating: 2,
      text: 'Bien situé',
      base: '2026-11-10T10:00:00.000Z',
      scores: {
        quiet: { score: 2, word: 'bus' },
        light: { score: 4, word: null },
      },
    })
    expect(myScoresOf(null)).toEqual({
      rating: 0,
      text: '',
      scores: {},
      base: null,
    })
    const data = add(emptyOutbox(), {
      kind: 'opinion',
      listingId: L,
      rating: 3,
      text: 'Bien situé',
      ratingChanged: true,
      scores: { quiet: { score: 3, word: 'bus' }, light: null },
      labels: {},
      base: mine.base,
    })
    expect(projectScores(mine, L, data)).toMatchObject({
      rating: 3,
      scores: { quiet: { score: 3, word: 'bus' } },
    })
    expect(projectScores(mine, L, data).scores.light).toBeUndefined()
  })

  it('les photos et les écritures d’une annonce', () => {
    let data = add(emptyOutbox(), {
      kind: 'photo',
      listingId: L,
      visitRef: 'local:loc',
      name: 'IMG.jpg',
      meta: {
        contentType: 'image/jpeg',
        sizeBytes: 1,
        width: null,
        height: null,
        thumbnail: { contentType: 'image/jpeg', sizeBytes: 1 },
      },
      progress: null,
    })
    data = { ...data, refs: { loc: 'v1' } }
    expect(pendingPhotos(data, { ref: 'v1' })).toHaveLength(1)
    expect(pendingPhotos(data, { ref: 'v2' })).toHaveLength(0)
    expect(entriesOfListing(data, L)).toHaveLength(1)
    expect(entriesOfListing(data, 'autre')).toHaveLength(0)
  })

  it('les petites phrases', () => {
    expect(namesText([])).toBe('personne')
    expect(namesText(['Camille'])).toBe('Camille')
    expect(namesText(['Camille', 'Sacha', 'Alex'])).toBe(
      'Camille, Sacha et Alex'
    )
    expect(visitFinishLabel('planned')).toBe('Terminer la visite')
    expect(visitFinishLabel('done')).toBe('Fermer')
  })
})
