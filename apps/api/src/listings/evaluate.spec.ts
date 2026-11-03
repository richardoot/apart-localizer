import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { REFERENCE_RENT_KEY } from '@apart/domain'
import { evaluateListing } from './evaluate'
import type { EvaluableListing } from './evaluate'

/** Une annonce fictive de Bordeaux dont le plafond a été posé d'office. */
const listing: EvaluableListing = {
  price: 200_000,
  surface: 40,
  dpeClass: 'D',
  location: { commune: 'Bordeaux' },
  rentalPlan: {
    targetRent: 900,
    referenceRentPerM2: 15,
  } as EvaluableListing['rentalPlan'],
  fieldSources: { [REFERENCE_RENT_KEY]: { source: 'open_data' } },
  openDataContext: { rentControl: { validUntil: '2030-06-30' } },
}

describe('evaluateListing', () => {
  it('plafonne le loyer tant que l’arrêté s’applique, plus après sa fin', () => {
    const during = evaluateListing(
      listing,
      DEFAULT_ASSUMPTIONS,
      new Date('2030-06-01T12:00:00Z')
    )
    expect(during.metrics.rentCap).toBe(600)
    expect(during.metrics.rent).toBe(600)
    const after = evaluateListing(
      listing,
      DEFAULT_ASSUMPTIONS,
      new Date('2030-07-01T12:00:00Z')
    )
    expect(after.metrics.rentCap).toBeNull()
    expect(after.metrics.rent).toBe(900)
  })
})
