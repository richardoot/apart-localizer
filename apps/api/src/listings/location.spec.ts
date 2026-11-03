import { describe, expect, it } from 'vitest'
import { ListingLocationInputSchema } from '@apart/contracts'
import {
  applyLocated,
  needsGeocoding,
  withOpenDataProvenance,
} from './location'

const located = {
  point: {
    type: 'Point' as const,
    coordinates: [-0.5906, 44.8083] as [number, number],
  },
  precision: 'exact' as const,
  addressNormalized: '12 Rue du Forum 33400 Talence',
  banId: '33522_1234_00012',
  commune: 'Talence',
  inseeCode: '33522',
  score: 0.9,
}

describe('applyLocated', () => {
  it('pose le point et les champs normalisés, complète la commune absente', () => {
    const base = ListingLocationInputSchema.parse({
      addressRaw: '12 rue du Forum',
    })
    const { location, keys } = applyLocated(base, located)
    expect(location.point).toEqual(located.point)
    expect(location.precision).toBe('exact')
    expect(location.addressNormalized).toBe('12 Rue du Forum 33400 Talence')
    expect(location.banId).toBe('33522_1234_00012')
    expect(location.inseeCode).toBe('33522')
    expect(location.commune).toBe('Talence')
    expect(keys).toEqual([
      'point',
      'precision',
      'addressNormalized',
      'banId',
      'inseeCode',
      'commune',
    ])
  })

  it('ne touche pas une commune saisie', () => {
    const base = ListingLocationInputSchema.parse({ commune: 'talence' })
    const { location, keys } = applyLocated(base, located)
    expect(location.commune).toBe('talence')
    expect(keys).not.toContain('commune')
  })

  it('marque les clés en données ouvertes', () => {
    const now = new Date('2026-11-03T10:00:00.000Z')
    const map = withOpenDataProvenance(
      { price: { source: 'user' } },
      ['point', 'precision'],
      now
    )
    expect(map.price).toEqual({ source: 'user' })
    expect(map.point).toEqual({
      source: 'open_data',
      recordedAt: '2026-11-03T10:00:00.000Z',
    })
  })
})

describe('needsGeocoding', () => {
  it('seulement sans point et avec une adresse ou une commune', () => {
    expect(
      needsGeocoding({ point: null, addressRaw: '1 rue X', commune: null })
    ).toBe(true)
    expect(
      needsGeocoding({ point: null, addressRaw: null, commune: 'Talence' })
    ).toBe(true)
    expect(
      needsGeocoding({ point: null, addressRaw: '  ', commune: null })
    ).toBe(false)
    expect(
      needsGeocoding({
        point: { type: 'Point', coordinates: [0, 0] },
        addressRaw: '1 rue X',
        commune: null,
      })
    ).toBe(false)
  })
})
