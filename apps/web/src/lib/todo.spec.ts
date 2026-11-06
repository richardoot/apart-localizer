import { describe, expect, it } from 'vitest'
import {
  TODO_FILTERS,
  TODO_GROUP_LABELS,
  requestRows,
  taskLabelFor,
  todoCounts,
  visitChecklist,
} from './todo'

describe('À faire (lot 19) : libellés, demandes, visite', () => {
  it('une question pour l’agence devient une tâche « Demander … »', () => {
    expect(taskLabelFor('  Appeler   le syndic ', false)).toBe(
      'Appeler le syndic'
    )
    expect(taskLabelFor('la quote-part du ravalement', true)).toBe(
      'Demander la quote-part du ravalement'
    )
    expect(taskLabelFor('La quote-part du ravalement', true)).toBe(
      'Demander la quote-part du ravalement'
    )
    expect(taskLabelFor('DTG et carnet d’entretien', true)).toBe(
      'Demander DTG et carnet d’entretien'
    )
    expect(taskLabelFor('demander les diagnostics', true)).toBe(
      'Demander les diagnostics'
    )
    expect(taskLabelFor('Demander les PV', true)).toBe('Demander les PV')
    expect(taskLabelFor('   ', true)).toBeNull()
    expect(taskLabelFor('', false)).toBeNull()
  })

  it('les actions d’une demande vont sur sa première ligne ; les autres questions sont nommées', () => {
    const rows = requestRows([
      { key: 'visit:v1', requestId: null, title: 'Visite' },
      { key: 'task:a', requestId: 'r1', title: 'Demander la taxe' },
      { key: 'task:b', requestId: 'r2', title: 'Demander le DPE' },
      { key: 'task:c', requestId: 'r1', title: 'Demander les charges' },
    ])
    expect([...rows.entries()]).toEqual([
      ['r1', { firstKey: 'task:a', others: ['Demander les charges'] }],
      ['r2', { firstKey: 'task:b', others: [] }],
    ])
  })

  it('pendant la visite : nos tâches « Vérifier … » ouvertes, dans leur ordre ; rien d’inventé', () => {
    expect(
      visitChecklist([
        {
          id: 'b',
          label: 'Vérifier le bruit côté rue',
          field: null,
          done: false,
          position: 2,
        },
        {
          id: 'a',
          label: 'Vérifier l’état de la toiture',
          field: null,
          done: false,
          position: 1,
        },
        {
          id: 'c',
          label: 'Vérifier la cave',
          field: null,
          done: true,
          position: 0,
        },
        {
          id: 'd',
          label: 'Demander le DPE',
          field: 'dpeClass',
          done: false,
          position: 3,
        },
        {
          id: 'e',
          label: 'Simuler le prêt',
          field: null,
          done: false,
          position: 4,
        },
      ])
    ).toEqual([
      { id: 'a', label: 'Vérifier l’état de la toiture' },
      { id: 'b', label: 'Vérifier le bruit côté rue' },
    ])
    expect(visitChecklist([])).toEqual([])
  })

  it('filtres et comptes', () => {
    expect(TODO_FILTERS.map(f => f.label)).toEqual([
      'Tout',
      'Nous',
      'Agence',
      'Visites',
    ])
    expect(TODO_GROUP_LABELS).toEqual({
      us: 'Nous',
      agency: 'Agence',
      visit: 'Visite',
    })
    expect(
      todoCounts([
        { group: 'us' },
        { group: 'agency' },
        { group: 'agency' },
        { group: 'visit' },
      ])
    ).toEqual({ all: 4, us: 1, agency: 2, visit: 1 })
  })
})
