import { describe, expect, it } from 'vitest'
import { marketTrend } from '@apart/domain'
import { FAKE_TREND_MEDIANS, fakeTrend } from '@/test/criteria-fixtures'
import {
  tickStep,
  trendChart,
  trendPartialText,
  trendPeakText,
  trendTiles,
  trendYearText,
} from './market-trend'

/** Les espaces insécables des nombres français ramenés à des espaces simples. */
const n = (text: string | null): string =>
  (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

describe('lot 29 : tracé et textes de la tendance des prix', () => {
  it('un pas rond pour six graduations au plus', () => {
    expect(tickStep(150)).toBe(50)
    expect(tickStep(900)).toBe(250)
    expect(tickStep(1800)).toBe(500)
    expect(tickStep(2003)).toBe(500)
    expect(tickStep(4000)).toBe(1000)
    expect(tickStep(50_000)).toBe(10_000)
  })

  it('les points en pourcentage de la zone de tracé, l’axe encadre les médianes', () => {
    const chart = trendChart(fakeTrend())
    expect(chart?.points).toHaveLength(12)
    expect(chart?.points[0]).toEqual({
      year: 2015,
      count: 12,
      value: 3000,
      partial: false,
      x: 0,
      y: 100,
    })
    // 2022, le pic : 7 années sur 11 en largeur, 4 800 sur l'axe 3 000 → 5 000.
    expect(chart?.points[7]).toMatchObject({ year: 2022, x: 63.64, y: 10 })
    expect(chart?.points[11]).toMatchObject({
      year: 2026,
      x: 100,
      partial: true,
    })
    expect(chart?.ticks).toEqual([
      { value: 5000, y: 0 },
      { value: 4500, y: 25 },
      { value: 4000, y: 50 },
      { value: 3500, y: 75 },
      { value: 3000, y: 100 },
    ])
    // Onze tronçons ; seul celui qui mène à l'année incomplète est marqué.
    expect(chart?.segments).toHaveLength(11)
    expect(chart?.segments[0]?.d).toBe('M0 100L9.09 92.5')
    expect(chart?.segments.map(s => s.partial).filter(Boolean)).toHaveLength(1)
    expect(chart?.segments[10]?.partial).toBe(true)
    // Une année sur deux sous l'axe, toujours la dernière.
    expect(chart?.xLabels.map(l => l.year)).toEqual([
      2016, 2018, 2020, 2022, 2024, 2026,
    ])
    // Le pic (au-dessus) et l'année de référence (dessous : la courbe y arrive en descendant).
    expect(chart?.labelled).toEqual([
      { year: 2022, below: false },
      { year: 2025, below: true },
    ])
  })

  it('une année sans médiane coupe la courbe ; un pic trop proche n’est pas écrit', () => {
    const years = Object.keys(FAKE_TREND_MEDIANS).map(Number)
    const trend = marketTrend({
      byYear: years.map(year => ({
        year,
        pricesPerM2: Array.from({ length: year === 2019 ? 3 : 12 }, () =>
          year === 2024 ? 5200 : (FAKE_TREND_MEDIANS[year] as number)
        ),
      })),
      dataYears: years.map(year => ({ year, lastDate: `${year}-12-30` })),
      radiusMeters: 500,
    })
    const chart = trendChart(trend)
    expect(chart?.points.find(p => p.year === 2019)).toMatchObject({
      value: null,
      y: null,
    })
    // Ni 2018 → 2019 ni 2019 → 2020.
    expect(chart?.segments).toHaveLength(9)
    // Pic en 2024, à deux ans de l'année de référence (2026) : pas écrit.
    expect(trend.peak?.year).toBe(2024)
    expect(chart?.labelled).toEqual([{ year: 2026, below: true }])
  })

  it('moins de deux années à relier : pas de graphique ; série courte : toutes les années sous l’axe', () => {
    expect(trendChart(fakeTrend({ 2025: 4200 }))).toBeNull()
    const flat = trendChart(fakeTrend({ 2024: 4000, 2025: 4000, 2026: 4000 }))
    expect(flat?.xLabels.map(l => l.year)).toEqual([2024, 2025, 2026])
    // Médianes égales : l'axe garde une hauteur (un pas).
    expect(flat?.ticks.map(t => t.value)).toEqual([4050, 4000])
    expect(flat?.points[0]?.y).toBe(100)
    // Sans année de référence ni pic : aucune valeur écrite.
    const noReference = trendChart({
      ...fakeTrend({ 2024: 4000, 2025: 4100 }),
      referenceYear: null,
      peak: null,
    })
    expect(noReference?.labelled).toEqual([])
    // Une année de référence au plus bas de l'axe : l'étiquette reste au-dessus (l'axe des années est dessous).
    const falling = trendChart(
      fakeTrend({ 2023: 4400, 2024: 4200, 2025: 4000, 2026: 4000 })
    )
    expect(falling?.labelled).toEqual([{ year: 2025, below: false }])
  })

  it('les textes : année lue, tuiles des écarts, pic, année incomplète', () => {
    const trend = fakeTrend()
    const yearOf = (year: number) =>
      trend.years.find(y => y.year === year) ?? {
        year,
        count: 0,
        value: null,
        partial: false,
      }
    expect(n(trendYearText(yearOf(2022)))).toBe('2022 : 4 800 €/m² · 12 ventes')
    expect(n(trendYearText(yearOf(2026)))).toBe(
      '2026 (année incomplète) : 4 150 €/m² · 12 ventes'
    )
    expect(
      trendYearText({ year: 2020, count: 1, value: null, partial: false })
    ).toBe('2020 : 1 vente, trop peu pour une médiane')
    expect(
      n(trendYearText({ year: 2021, count: 30, value: 4500, partial: false }))
    ).toBe('2021 : 4 500 €/m² · 30 ventes')
    expect(trendTiles(trend)).toEqual([
      { key: 1, value: '−4,5 %', label: 'sur un an', detail: '2024 → 2025' },
      {
        key: 5,
        value: '0,0 %',
        label: 'sur cinq ans',
        detail: '2020 → 2025, 0,0 % par an',
      },
      {
        key: 10,
        value: '+40 %',
        label: 'sur dix ans',
        detail: '2015 → 2025, +3,4 % par an',
      },
    ])
    expect(n(trendPeakText(trend))).toBe(
      'Pic en 2022 à 4 800 €/m² : −13 % depuis.'
    )
    expect(n(trendPartialText(trend))).toBe(
      '2026 (année incomplète) : 4 150 €/m² sur 12 ventes.'
    )
    // Prix toujours en hausse : le pic est l'année de référence, rien à dire.
    const rising = fakeTrend({ 2023: 4000, 2024: 4200, 2025: 4400 })
    expect(trendPeakText(rising)).toBeNull()
    expect(trendPeakText({ ...rising, peak: null })).toBeNull()
    const complete = marketTrend({
      byYear: [],
      dataYears: [{ year: 2025, lastDate: '2025-12-30' }],
      radiusMeters: 500,
    })
    expect(trendPartialText(complete)).toBeNull()
  })
})
