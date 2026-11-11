import { describe, expect, it } from 'vitest'
import { MarketTrendSchema } from '@apart/contracts'
import {
  MARKET_TREND_NOTE,
  MARKET_TREND_PARCEL_NOTE,
  formatTrendChange,
  isPartialDvfYear,
  latestPartialYear,
  marketTrend,
  marketTrendLine,
  trendCoversLastCompleteYear,
  trendDirection,
  trendDirectionLabel,
  trendHorizonLabel,
} from '../src/index.js'

/** Douze ventes fictives autour d'une médiane (de −5,5 % à +5,5 %). */
const around = (median: number, count = 12): number[] =>
  Array.from({ length: count }, (_, i) =>
    Math.round(median * (1 + (i - (count - 1) / 2) / 100))
  )

/** Médianes fictives d'un secteur : hausse jusqu'en 2022, baisse ensuite. */
const MEDIANS: Record<number, number> = {
  2015: 3000,
  2016: 3150,
  2017: 3500,
  2018: 3900,
  2019: 4100,
  2020: 4200,
  2021: 4500,
  2022: 4800,
  2023: 4600,
  2024: 4400,
  2025: 4200,
  2026: 4150,
}
const dataYears = Object.keys(MEDIANS).map(year => ({
  year: Number(year),
  lastDate: Number(year) === 2026 ? '2026-06-30' : `${year}-12-31`,
}))
const byYear = Object.entries(MEDIANS).map(([year, median]) => ({
  year: Number(year),
  pricesPerM2: around(median),
}))

describe('lot 29 : tendance des prix de vente', () => {
  it('médiane de chaque année, écarts sur un, cinq et dix ans, pic et sens', () => {
    const trend = marketTrend({ byYear, dataYears, radiusMeters: 500 })
    expect(MarketTrendSchema.parse(trend)).toEqual(trend)
    expect(trend.status).toBe('ok')
    expect(trend.radiusMeters).toBe(500)
    expect(trend.years).toHaveLength(12)
    expect(trend.years[0]).toEqual({
      year: 2015,
      count: 12,
      medianPricePerM2: 3000,
      partial: false,
    })
    // 2026 s'arrête en juin : année incomplète, jamais l'année de référence.
    expect(trend.years[11]).toMatchObject({ year: 2026, partial: true })
    expect(trend.referenceYear).toBe(2025)
    expect(trend.changes.map(c => [c.years, c.fromYear, c.toYear])).toEqual([
      [1, 2024, 2025],
      [5, 2020, 2025],
      [10, 2015, 2025],
    ])
    const [oneYear, fiveYears, tenYears] = trend.changes
    expect(oneYear?.change).toBeCloseTo(4200 / 4400 - 1, 10)
    expect(oneYear?.annualized).toBeCloseTo(4200 / 4400 - 1, 10)
    expect(fiveYears?.change).toBeCloseTo(0, 10)
    expect(tenYears?.change).toBeCloseTo(0.4, 10)
    expect(tenYears?.annualized).toBeCloseTo(Math.pow(1.4, 0.1) - 1, 10)
    expect(trend.peak).toEqual({
      year: 2022,
      medianPricePerM2: 4800,
      changeSince: 4200 / 4800 - 1,
    })
    expect(trend.direction).toBe('down')
    expect(trend.reasons).toEqual([])
    expect(trend.notes).toEqual([MARKET_TREND_NOTE, MARKET_TREND_PARCEL_NOTE])
    expect(trendCoversLastCompleteYear(trend)).toBe(true)
  })

  it('une année de moins de dix ventes n’a pas de médiane et ne porte aucun écart', () => {
    const sparse = byYear.map(y =>
      y.year === 2020 ? { ...y, pricesPerM2: around(4200, 9) } : y
    )
    const trend = marketTrend({ byYear: sparse, dataYears, radiusMeters: 500 })
    expect(trend.years.find(y => y.year === 2020)).toEqual({
      year: 2020,
      count: 9,
      medianPricePerM2: null,
      partial: false,
    })
    expect(trend.changes.map(c => c.years)).toEqual([1, 10])
    // Le seuil se règle ; les prix illisibles sont écartés du compte.
    const loose = marketTrend({
      byYear: [{ year: 2025, pricesPerM2: [4000, 4200, Number.NaN, -1] }],
      dataYears: [{ year: 2025, lastDate: '2025-12-30' }],
      radiusMeters: 1000,
      minSales: 2,
    })
    expect(loose.years[0]).toMatchObject({ count: 2, medianPricePerM2: 4100 })
  })

  it('la dernière année complète sans assez de ventes : la référence recule, le rayon ne suffit pas', () => {
    const sparse = byYear.map(y =>
      y.year === 2025 ? { ...y, pricesPerM2: around(4200, 3) } : y
    )
    const trend = marketTrend({ byYear: sparse, dataYears, radiusMeters: 500 })
    expect(trend.referenceYear).toBe(2024)
    expect(trend.changes[0]).toMatchObject({ fromYear: 2023, toYear: 2024 })
    expect(trendCoversLastCompleteYear(trend)).toBe(false)
  })

  it('aucune année retenue, une seule année, aucune vente importée, pas de repère', () => {
    const none = marketTrend({
      byYear: [{ year: 2024, pricesPerM2: [4000] }],
      dataYears: [{ year: 2024, lastDate: '2024-12-31' }],
      radiusMeters: 2000,
    })
    expect(none).toMatchObject({
      status: 'to_verify',
      referenceYear: null,
      changes: [],
      peak: null,
      direction: null,
      reasons: ['Moins de 10 ventes par an à 2000 m : tendance non retenue.'],
      notes: [],
    })
    expect(trendCoversLastCompleteYear(none)).toBe(false)
    expect(
      marketTrend({
        byYear: [],
        dataYears: [{ year: 2024 }],
        radiusMeters: null,
      }).reasons
    ).toEqual(['Moins de 10 ventes par an : tendance non retenue.'])

    const single = marketTrend({
      byYear: [{ year: 2024, pricesPerM2: around(4000) }],
      dataYears: [{ year: 2024, lastDate: '2024-12-31' }],
      radiusMeters: 500,
    })
    expect(single).toMatchObject({
      status: 'to_verify',
      referenceYear: 2024,
      changes: [],
      direction: null,
      peak: { year: 2024, changeSince: 0 },
      reasons: ['Une seule année comparable (2024) : pas d’écart calculé.'],
      // Aucune année d'avant 2021 : pas de mention de la parcelle.
      notes: [MARKET_TREND_NOTE],
    })

    const empty = marketTrend({ byYear: [], dataYears: [], radiusMeters: 500 })
    expect(empty).toMatchObject({ status: 'unavailable', years: [] })
    expect(empty.reasons[0]).toContain('pnpm import:dvf')
    expect(trendCoversLastCompleteYear(empty)).toBe(false)
    expect(latestPartialYear(empty)).toBeNull()

    const unlocated = marketTrend({
      byYear,
      dataYears,
      radiusMeters: null,
      located: false,
    })
    expect(unlocated).toMatchObject({
      status: 'to_verify',
      referenceYear: null,
      reasons: ['Adresse non localisée : pas de tendance.'],
    })
    expect(unlocated.years.every(y => y.medianPricePerM2 === null)).toBe(true)
  })

  it('un repère approché ajoute sa réserve ; au centre de la commune, « à vérifier »', () => {
    const reserve = 'Ventes cherchées autour du centre du quartier.'
    const approximate = marketTrend({
      byYear,
      dataYears,
      radiusMeters: 500,
      reserve,
    })
    expect(approximate.status).toBe('ok')
    expect(approximate.reasons).toEqual([reserve])
    const commune = marketTrend({
      byYear,
      dataYears,
      radiusMeters: 500,
      reserve,
      toVerify: true,
    })
    expect(commune.status).toBe('to_verify')
    expect(commune.changes).toHaveLength(3)
  })

  it('année incomplète, sens des prix et libellés', () => {
    expect(isPartialDvfYear(2026, '2026-06-30')).toBe(true)
    expect(isPartialDvfYear(2025, '2025-12-01')).toBe(false)
    expect(isPartialDvfYear(2025, null)).toBe(false)
    expect(isPartialDvfYear(2025, undefined)).toBe(false)
    expect(trendDirection(0.019)).toBe('stable')
    expect(trendDirection(-0.019)).toBe('stable')
    expect(trendDirection(0.02)).toBe('up')
    expect(trendDirection(-0.05)).toBe('down')
    expect(trendDirection(0.03, 0.05)).toBe('stable')
    expect(trendDirectionLabel('down')).toBe('Prix en baisse sur un an')
    expect(trendDirectionLabel('up')).toBe('Prix en hausse sur un an')
    expect(trendDirectionLabel('stable')).toBe('Prix stables sur un an')
    expect(trendHorizonLabel(1)).toBe('sur un an')
    expect(trendHorizonLabel(5)).toBe('sur cinq ans')
    expect(trendHorizonLabel(10)).toBe('sur dix ans')
    expect(trendHorizonLabel(3)).toBe('sur 3 ans')
    expect(formatTrendChange(0.034)).toBe('+3,4 %')
    expect(formatTrendChange(-0.125)).toBe('−13 %')
    expect(formatTrendChange(0.4)).toBe('+40 %')
    expect(formatTrendChange(4500 / 5000 - 1)).toBe('−10 %')
    expect(formatTrendChange(0.0996)).toBe('+10 %')
    expect(formatTrendChange(0)).toBe('0,0 %')
    expect(formatTrendChange(-0.0004)).toBe('0,0 %')
    expect(formatTrendChange(Number.NaN)).toBe('—')
  })

  it('la ligne du connecteur : médiane, écarts, pic, année incomplète, limites', () => {
    const trend = marketTrend({ byYear, dataYears, radiusMeters: 500 })
    const line = marketTrendLine(trend)
    expect(line).toContain('Tendance des prix (Calculé) : médiane 4')
    expect(line).toContain(
      '200 €/m² en 2025 (12 ventes d’appartements à moins de 500 m, toutes surfaces)'
    )
    expect(line).toContain(
      '−4,5 % sur un an, 0,0 % sur cinq ans (0,0 % par an), +40 % sur dix ans (+3,4 % par an)'
    )
    expect(line).toContain('pic en 2022 à 4')
    expect(line).toContain('−13 % depuis')
    expect(line).toContain('2026 (année incomplète) : 4')
    expect(line).toContain('série depuis 2015')
    expect(line).toContain('euros courants')
    expect(latestPartialYear(trend)).toMatchObject({ year: 2026 })

    // Le pic est l'année de référence, sans année incomplète ni rayon : rien de plus.
    const rising = marketTrend({
      byYear: byYear.filter(y => y.year <= 2022),
      dataYears: dataYears.filter(y => y.year <= 2022),
      radiusMeters: null,
    })
    const risingLine = marketTrendLine(rising)
    expect(risingLine).not.toContain('pic en')
    expect(risingLine).not.toContain('année incomplète')
    expect(risingLine).toContain('(12 ventes d’appartements, toutes surfaces)')
    expect(latestPartialYear(rising)).toBeNull()

    // Une année incomplète sans assez de ventes n'est pas citée.
    const thin = marketTrend({
      byYear: byYear.map(y =>
        y.year === 2026 ? { ...y, pricesPerM2: [4000] } : y
      ),
      dataYears,
      radiusMeters: 500,
    })
    expect(latestPartialYear(thin)).toBeNull()

    const single = marketTrend({
      byYear: [{ year: 2024, pricesPerM2: around(4000) }],
      dataYears: [{ year: 2024, lastDate: '2024-12-31' }],
      radiusMeters: 500,
    })
    const singleLine = marketTrendLine(single)
    expect(singleLine).toContain('Tendance des prix (À vérifier)')
    expect(singleLine).not.toContain('série depuis')
    expect(singleLine).toContain('Une seule année comparable (2024)')

    const none = marketTrend({ byYear: [], dataYears, radiusMeters: 500 })
    expect(marketTrendLine(none)).toBe(
      'Tendance des prix (À vérifier) : Moins de 10 ventes par an à 500 m : tendance non retenue.'
    )
    expect(marketTrendLine({ ...none, reasons: [] })).toBe(
      'Tendance des prix (À vérifier) : non disponible.'
    )
  })
})
