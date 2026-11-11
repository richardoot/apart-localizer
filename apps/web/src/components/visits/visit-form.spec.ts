import { describe, expect, it } from 'vitest'
import type { Visit } from '@apart/contracts'
import { toLocalInput, visitEditForm, visitEditPayload } from './visit-form'

const visit: Visit = {
  id: 'v1',
  listingId: 'l1',
  visitedAt: '2026-11-10T17:30:00.000Z',
  status: 'planned',
  participantIds: ['a'],
  report: null,
  pros: 'Lumière',
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: 'a',
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  photoCount: 0,
  photos: [],
}

describe('Lot 24 : corriger une visite', () => {
  it('la saisie part de la visite', () => {
    expect(visitEditForm(visit)).toEqual({
      visitedAt: toLocalInput(new Date(visit.visitedAt)),
      participantIds: ['a'],
      rating: 0,
      report: '',
      pros: 'Lumière',
      cons: '',
    })
  })

  it('seulement ce qui change, avec le garde-fou ; « Marquer faite » porte le compte rendu', () => {
    const form = {
      ...visitEditForm(visit),
      report: '  Bon état  ',
      rating: 4,
      participantIds: ['a', 'b'],
      pros: '',
    }
    expect(visitEditPayload(form, visit, true)).toEqual({
      changed: true,
      update: {
        expectedUpdatedAt: visit.updatedAt,
        participantIds: ['a', 'b'],
        rating: 4,
        report: 'Bon état',
        pros: null,
        status: 'done',
      },
    })
    expect(visitEditPayload(visitEditForm(visit), visit)).toEqual({
      changed: false,
      update: { expectedUpdatedAt: visit.updatedAt },
    })
    // Marquer faite sans rien écrire : la visite passe faite.
    expect(
      visitEditPayload(visitEditForm(visit), visit, true)?.update.status
    ).toBe('done')
    expect(
      visitEditPayload(
        visitEditForm({ ...visit, status: 'done' } as Visit),
        { ...visit, status: 'done' },
        true
      )?.changed
    ).toBe(false)
  })

  it('la date : modifiée à la minute, ou illisible', () => {
    const moved = visitEditPayload(
      { ...visitEditForm(visit), visitedAt: '2026-11-11T09:00' },
      visit
    )
    expect(moved?.update.visitedAt).toBe(
      new Date('2026-11-11T09:00').toISOString()
    )
    expect(
      visitEditPayload(
        { ...visitEditForm(visit), visitedAt: 'pas une date' },
        visit
      )
    ).toBeNull()
  })
})
