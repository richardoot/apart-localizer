import { describe, expect, it } from 'vitest'
import { emptyForm, formFromInput } from './listing-form'
import {
  changedFormPaths,
  confidenceClass,
  provenanceAfterEdits,
  provenanceKeyOf,
  provenanceOf,
} from './provenance'
import { fakeExtractionResult } from '@/test/fixtures'

describe('provenance côté interface', () => {
  it('retrouve la clé de provenance d’un champ du formulaire', () => {
    expect(provenanceKeyOf('price')).toBe('price')
    expect(provenanceKeyOf('longitude')).toBe('point')
    expect(provenanceKeyOf('latitude')).toBe('point')
    expect(provenanceKeyOf('renovation.level')).toBe('renovation')
    expect(provenanceKeyOf('rentalPlan.targetRent')).toBe('rentalPlan')
    const sources = fakeExtractionResult().listing.fieldSources
    expect(provenanceOf(sources, 'price')?.confidence).toBe(0.95)
    expect(provenanceOf(sources, 'longitude')?.source).toBe('open_data')
    expect(provenanceOf(sources, 'notes')).toBeNull()
    expect(provenanceOf(null, 'price')).toBeNull()
  })

  it('colore la confiance : sûre, à vérifier, douteuse', () => {
    expect(confidenceClass(0.95)).toContain('good')
    expect(confidenceClass(0.7)).toContain('warn')
    expect(confidenceClass(0.3)).toContain('bad')
    expect(confidenceClass(undefined)).toContain('warn')
  })

  it('les champs corrigés perdent leur provenance IA, les autres la gardent', () => {
    const result = fakeExtractionResult()
    const extracted = formFromInput(result.listing)
    const edited = formFromInput(result.listing)
    edited.price = '185 000'
    edited.rentalPlan.targetRent = '800'
    edited.longitude = '-0.59'
    expect(changedFormPaths(extracted, edited)).toEqual([
      'longitude',
      'price',
      'rentalPlan.targetRent',
    ])
    const after = provenanceAfterEdits(
      result.listing.fieldSources,
      extracted,
      edited
    )
    expect(after.price).toBeUndefined()
    expect(after.point).toBeUndefined()
    expect(after.rentalPlan).toBeUndefined()
    expect(after.surface).toEqual(result.listing.fieldSources.surface)
    expect(after.addressRaw?.source).toBe('ai')
    // Sans modification, rien ne change.
    expect(
      provenanceAfterEdits(result.listing.fieldSources, extracted, emptyForm())
    ).not.toHaveProperty('title')
    expect(
      provenanceAfterEdits(result.listing.fieldSources, extracted, extracted)
    ).toEqual(result.listing.fieldSources)
  })
})
