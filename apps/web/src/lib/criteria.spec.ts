import { describe, expect, it } from 'vitest'
import { criteriaChangesMessage } from './criteria'

const match = (name: string, approximate = false) => ({
  criteriaId: `id-${name}`,
  name,
  matchedAt: '2026-11-03T10:00:00.000Z',
  approximate,
})

describe('criteriaChangesMessage', () => {
  it('rien à dire sans changement', () => {
    expect(criteriaChangesMessage(null)).toBeNull()
    expect(criteriaChangesMessage(undefined)).toBeNull()
    expect(
      criteriaChangesMessage({ entered: [], left: [], current: [] })
    ).toBeNull()
  })

  it('une entrée, avec la réserve d’une localisation imprécise', () => {
    expect(
      criteriaChangesMessage({
        entered: [match('Talence', true)],
        left: [],
        current: [],
      })
    ).toBe('Entre dans le critère « Talence » (sous réserve).')
  })

  it('plusieurs entrées et une sortie, au pluriel et au singulier', () => {
    expect(
      criteriaChangesMessage({
        entered: [match('Talence'), match('Tram')],
        left: [match('Bègles')],
        current: [],
      })
    ).toBe(
      'Entre dans les critères « Talence », « Tram ». Sort du critère « Bègles ».'
    )
    expect(
      criteriaChangesMessage({
        entered: [],
        left: [match('A'), match('B')],
        current: [],
      })
    ).toBe('Sort des critères « A », « B ».')
  })
})
