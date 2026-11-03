import { describe, expect, it } from 'vitest'
import { provenanceAfterPatch, withProvenance } from './provenance'

const now = new Date('2026-11-03T10:00:00.000Z')

describe('withProvenance', () => {
  it('attribue la source aux champs fournis, garde ceux déjà tracés', () => {
    const map = withProvenance(
      { price: { source: 'ai', confidence: 0.9, evidence: '200 000 €' } },
      { price: 200_000, surface: 45, title: 'T2', status: 'to_study' },
      'user',
      now
    )
    expect(map.price).toEqual({
      source: 'ai',
      confidence: 0.9,
      evidence: '200 000 €',
    })
    expect(map.surface).toEqual({
      source: 'user',
      recordedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(map.title?.source).toBe('user')
    expect(map.status).toBeUndefined()
  })

  it('ignore les valeurs absentes ou nulles et les clés techniques', () => {
    const map = withProvenance(
      null,
      {
        price: undefined,
        fieldSources: {},
        sourceText: 'x',
        notes: null,
        location: {},
        commune: 'Talence',
      },
      'ai',
      now
    )
    expect(Object.keys(map)).toEqual(['commune'])
  })
})

describe('provenanceAfterPatch', () => {
  it('marque les champs du patch, respecte la carte fournie par le patch', () => {
    const map = provenanceAfterPatch(
      { price: { source: 'listing' }, surface: { source: 'listing' } },
      {
        price: 190_000,
        propertyTax: 900,
        fieldSources: { propertyTax: { source: 'user', evidence: 'avis' } },
      },
      'ai',
      now
    )
    expect(map.price).toEqual({
      source: 'ai',
      recordedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(map.propertyTax).toEqual({ source: 'user', evidence: 'avis' })
    expect(map.surface).toEqual({ source: 'listing' })
  })
})
