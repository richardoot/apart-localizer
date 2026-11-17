import { describe, expect, it } from 'vitest'
import { needsTram } from './criteria-match.service'

const rule = (maxTramDistanceMeters: number | null) => ({
  filters: { maxTramDistanceMeters },
})

describe('needsTram (ADR 0049)', () => {
  it('faux sans règle ou sans filtre tram : la base ne calcule pas les distances', () => {
    expect(needsTram([])).toBe(false)
    expect(needsTram([rule(null), rule(null)])).toBe(false)
  })

  it('vrai dès qu’une règle filtre sur le tram, même à 0 m', () => {
    expect(needsTram([rule(null), rule(600)])).toBe(true)
    expect(needsTram([rule(0)])).toBe(true)
  })
})
