import { describe, expect, it } from 'vitest'
import { ListingLocationInputSchema } from '@apart/contracts'
import type { FieldProvenanceMap, ListingPlacement } from '@apart/contracts'
import { addressPlacement, communePlacement } from '@apart/domain'
import {
  applyLocated,
  inseeCodeForLocate,
  manualLocationPlacement,
  needsGeocoding,
  relocationNeeded,
  withOpenDataProvenance,
} from './location'

const AT = '2026-11-05T10:00:00.000Z'
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
  placement: addressPlacement('exact', '12 Rue du Forum 33400 Talence', AT),
  area: null,
}

describe('relocationNeeded (lot 12)', () => {
  const point = located.point
  const base = (
    precision: 'exact' | 'street' | 'district' | 'commune',
    placement: ListingPlacement | null = null,
    pointSource: 'open_data' | 'user' | null = 'open_data'
  ) => ({
    location: {
      ...ListingLocationInputSchema.parse({
        addressRaw: null,
        commune: 'Talence',
        district: 'Forum',
        point,
        precision,
      }),
      placement,
    },
    fieldSources: (pointSource
      ? { point: { source: pointSource } }
      : {}) as FieldProvenanceMap,
  })

  it('replace sur une adresse ou une commune changées, ou un quartier changé hors adresse', () => {
    expect(relocationNeeded(base('commune'), { addressRaw: '1 rue X' })).toBe(
      'relocate'
    )
    expect(relocationNeeded(base('exact'), { commune: 'Pessac' })).toBe(
      'relocate'
    )
    expect(relocationNeeded(base('commune'), { district: 'Peixotto' })).toBe(
      'relocate'
    )
    // Le quartier seul ne touche pas un repère à l'adresse.
    expect(relocationNeeded(base('exact'), { district: 'Peixotto' })).toBe(
      'none'
    )
    expect(relocationNeeded(base('street'), { district: 'Peixotto' })).toBe(
      'none'
    )
    // Rien de changé (casse et espaces ignorés).
    expect(relocationNeeded(base('commune'), { district: ' forum ' })).toBe(
      'none'
    )
  })

  it('le point renvoyé tel quel ne compte pas comme une saisie, sauf point saisi', () => {
    const commune = communePlacement({
      commune: 'Talence',
      inseeCode: '33522',
      computedAt: AT,
    })
    expect(
      relocationNeeded(base('commune', commune), {
        district: 'Peixotto',
        point,
      })
    ).toBe('relocate')
    expect(
      relocationNeeded(
        base(
          'commune',
          manualLocationPlacement({ point, precision: 'commune' })
        ),
        {
          district: 'Peixotto',
          point,
        }
      )
    ).toBe('none')
    // Annonce antérieure au lot 12 : la provenance du point décide.
    expect(
      relocationNeeded(base('commune', null, 'user'), {
        district: 'Peixotto',
        point,
      })
    ).toBe('none')
    expect(
      relocationNeeded(base('commune', null, null), {
        district: 'Peixotto',
        point,
      })
    ).toBe('relocate')
    // Un point nouveau prime.
    expect(
      relocationNeeded(base('commune'), {
        district: 'Peixotto',
        point: { type: 'Point', coordinates: [-0.6, 44.8] },
      })
    ).toBe('none')
  })

  it('un point saisi renvoyé tel quel : une adresse ou une commune changées le replacent si elles sont trouvées à l’adresse', () => {
    const manual = base(
      'district',
      manualLocationPlacement({ point, precision: 'district' })
    )
    expect(
      relocationNeeded(manual, { addressRaw: '12 rue du Forum', point })
    ).toBe('if_address')
    expect(relocationNeeded(manual, { commune: 'Pessac', point })).toBe(
      'if_address'
    )
    // Le quartier seul ne touche pas un point saisi.
    expect(relocationNeeded(manual, { district: 'Peixotto', point })).toBe(
      'none'
    )
    // Sans point dans le patch, l'adresse replace toujours.
    expect(relocationNeeded(manual, { addressRaw: '12 rue du Forum' })).toBe(
      'relocate'
    )
  })

  it('un point saisi reçoit un placement « point saisi »', () => {
    expect(manualLocationPlacement({ point, precision: 'exact' })?.method).toBe(
      'manual'
    )
    expect(manualLocationPlacement({ point: null, precision: null })).toBeNull()
  })
})

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

describe('inseeCodeForLocate', () => {
  const before = { commune: 'Talence', inseeCode: '33522' }
  it('garde le code de la fiche tant que la commune ne change pas', () => {
    expect(inseeCodeForLocate(before, { addressRaw: '1 rue X' })).toBe('33522')
    expect(inseeCodeForLocate(before, { commune: ' talence ' })).toBe('33522')
  })
  it('l’oublie quand la commune change, sauf code donné par le patch', () => {
    expect(inseeCodeForLocate(before, { commune: 'Pessac' })).toBeNull()
    expect(
      inseeCodeForLocate(before, { commune: 'Pessac', inseeCode: '33318' })
    ).toBe('33318')
    expect(
      inseeCodeForLocate({ commune: null, inseeCode: null }, {})
    ).toBeNull()
  })
})
