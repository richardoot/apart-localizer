import { describe, expect, it } from 'vitest'
import {
  formatCssPercent,
  formatDate,
  formatDay,
  formatMonthYear,
  formatNumber,
  formatRateCompact,
  formatSignedRate,
  toFrenchInput,
  formatDistance,
  formatEuros,
  formatEurosPerM2,
  formatEurosPerMonth,
  formatRate,
  formatRelativeDays,
  formatSignedEurosPerMonth,
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

  it('lot 9 : taux précis, effort signé, part en longueur CSS', () => {
    expect(formatRate(0.040909)).toBe('4,09 %')
    expect(formatRate(0.055)).toBe('5,5 %')
    expect(formatRate(0.0365)).toBe('3,65 %')
    expect(formatRate(Number.NaN)).toBe('—')
    expect(nbsp(formatSignedEurosPerMonth(-1362.4))).toBe('−1 362 €/mois')
    expect(formatSignedEurosPerMonth(15.2)).toBe('+15 €/mois')
    expect(formatSignedEurosPerMonth(0.3)).toBe('0 €/mois')
    expect(formatSignedEurosPerMonth(Number.NaN)).toBe('—')
    expect(formatCssPercent(0.737843)).toBe('73.78%')
    expect(formatCssPercent(1.2)).toBe('100%')
    expect(formatCssPercent(-0.1)).toBe('0%')
    expect(formatCssPercent(Number.NaN)).toBe('0%')
  })

  it('lot 13 : taux compacts et signés, nombres et dates du jour', () => {
    expect(formatRateCompact(0.3)).toBe('30 %')
    expect(formatRateCompact(0.055)).toBe('5,5 %')
    expect(formatRateCompact(0.0365)).toBe('3,65 %')
    expect(formatRateCompact(0.015700000000000002)).toBe('1,57 %')
    expect(formatRateCompact(Number.NaN)).toBe('—')
    expect(formatSignedRate(0.01)).toBe('+1 %')
    expect(formatSignedRate(-0.005)).toBe('−0,5 %')
    expect(formatSignedRate(0)).toBe('0 %')
    expect(formatSignedRate(Number.NaN)).toBe('—')
    expect(formatNumber(0.5)).toBe('0,5')
    expect(nbsp(formatNumber(40_000))).toBe('40 000')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatMonthYear('2026-12-15')).toBe('déc. 2026')
    expect(formatMonthYear('2028-01-01')).toBe('janv. 2028')
    expect(formatMonthYear('')).toBe('—')
    expect(formatMonthYear('2026-13-45')).toBe('—')
    expect(formatDay('2026-12-01')).toBe('1 déc. 2026')
    expect(formatDay(null)).toBe('—')
    expect(formatDay('2026-02-30x')).toBe('—')
    expect(formatDay('2026-99-99')).toBe('—')
  })

  it('lot 13 : nombres des champs à la française, relus à l’identique', () => {
    expect(nbsp(toFrenchInput('40000', true))).toBe('40 000')
    expect(nbsp(toFrenchInput('1050.1234567', true))).toBe('1 050,1234567')
    expect(toFrenchInput('3.65')).toBe('3,65')
    expect(toFrenchInput('2028')).toBe('2028')
    expect(toFrenchInput('-0.5')).toBe('-0,5')
    expect(toFrenchInput('')).toBe('')
    expect(toFrenchInput('1e21')).toBe('1e21')
    for (const value of [40_000, 0.023700000000000002, 1050.1234567, 6500]) {
      const raw = String(value)
      expect(parseNumberInput(toFrenchInput(raw, true))).toBe(value)
      expect(parseNumberInput(toFrenchInput(raw))).toBe(value)
    }
  })
})
