import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDistance,
  formatEuros,
  formatEurosPerM2,
  formatEurosPerMonth,
  formatRelativeDays,
  formatSurface,
  fractionToPercentInput,
  parseNumberInput,
  percentToFraction,
} from './format'

const nbsp = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')

describe('formats fr-FR', () => {
  it('montants, surfaces, distances', () => {
    expect(nbsp(formatEuros(200_000))).toBe('200 000 €')
    expect(nbsp(formatEurosPerMonth(-362.4))).toBe('-362 €/mois')
    expect(nbsp(formatEurosPerM2(4444.4))).toBe('4 444 €/m²')
    expect(formatEurosPerM2(Number.NaN)).toBe('—')
    expect(nbsp(formatSurface(62.5))).toBe('62,5 m²')
    expect(formatSurface(null)).toBe('—')
    expect(formatDistance(850.4)).toBe('850 m')
    expect(nbsp(formatDistance(2400))).toBe('2,4 km')
    expect(formatDistance(null)).toBe('—')
  })

  it('dates absolues et relatives', () => {
    expect(formatDate('2026-11-03T10:00:00.000Z')).toMatch(/2026/)
    expect(formatDate(null)).toBe('—')
    expect(formatDate('pas une date')).toBe('—')
    const now = new Date('2026-11-03T12:00:00.000Z')
    expect(formatRelativeDays('2026-11-03T08:00:00.000Z', now)).toBe(
      "aujourd'hui"
    )
    expect(formatRelativeDays('2026-11-02T08:00:00.000Z', now)).toBe('hier')
    expect(formatRelativeDays('2026-10-20T08:00:00.000Z', now)).toBe(
      'il y a 14 j'
    )
  })

  it('lit les nombres saisis à la française et convertit les pourcentages', () => {
    expect(parseNumberInput('62,5')).toBe(62.5)
    expect(parseNumberInput('200 000')).toBe(200_000)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput(12)).toBe(12)
    expect(percentToFraction('3,65')).toBeCloseTo(0.0365, 10)
    expect(percentToFraction('')).toBeNull()
    expect(fractionToPercentInput(0.0365)).toBe('3.65')
    expect(fractionToPercentInput(null)).toBe('')
  })
})
