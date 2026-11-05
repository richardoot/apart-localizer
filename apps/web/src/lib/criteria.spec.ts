import { describe, expect, it } from 'vitest'
import type { CriteriaFitLevel } from '@apart/contracts'
import { criteriaChangesMessage } from './criteria'

const match = (
  name: string,
  level: CriteriaFitLevel = 'in',
  approximate = false
) => ({
  criteriaId: `id-${name}`,
  name,
  matchedAt: '2026-11-03T10:00:00.000Z',
  approximate,
  level,
  reasons: [],
})
const left = (name: string) => ({ criteriaId: `id-${name}`, name, reasons: [] })

describe('criteriaChangesMessage', () => {
  it('rien à dire sans changement', () => {
    expect(criteriaChangesMessage(null)).toBeNull()
    expect(criteriaChangesMessage(undefined)).toBeNull()
    expect(
      criteriaChangesMessage({
        entered: [],
        left: [],
        changed: [],
        current: [],
      })
    ).toBeNull()
  })

  it('lot 14 : une entrée « à confirmer » dit son niveau', () => {
    expect(
      criteriaChangesMessage({
        entered: [match('Talence', 'to_confirm', true)],
        left: [],
        changed: [],
        current: [],
      })
    ).toBe('Entre dans le critère « Talence » (à confirmer).')
  })

  it('plusieurs entrées, une sortie, un changement de niveau', () => {
    expect(
      criteriaChangesMessage({
        entered: [match('Talence'), match('Tram', 'margin')],
        left: [left('Bègles')],
        changed: [
          {
            criteriaId: 'id-Centre',
            name: 'Centre',
            before: 'margin',
            after: 'in',
            reasons: [],
          },
        ],
        current: [],
      })
    ).toBe(
      'Entre dans les critères « Talence », « Tram » (à la marge). Sort du critère « Bègles » (hors critères). « Centre » : à la marge → dans les critères.'
    )
    expect(
      criteriaChangesMessage({
        entered: [],
        left: [left('A'), left('B')],
        changed: [],
        current: [],
      })
    ).toBe('Sort des critères « A », « B » (hors critères).')
  })
})
