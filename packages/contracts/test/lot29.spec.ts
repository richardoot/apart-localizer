import { describe, expect, it } from 'vitest'
import {
  MARKET_TREND_HORIZONS,
  MARKET_TREND_MIN_SALES,
  MARKET_TREND_STABLE,
  MarketContextSchema,
  MarketTrendSchema,
} from '../src/index.js'

/** Une tendance fictive : deux années complètes, une incomplète. */
const trend = {
  status: 'ok',
  radiusMeters: 500,
  years: [
    { year: 2029, count: 40, medianPricePerM2: 5000, partial: false },
    { year: 2030, count: 38, medianPricePerM2: 4500, partial: false },
    { year: 2031, count: 4, medianPricePerM2: null, partial: true },
  ],
  referenceYear: 2030,
  changes: [
    { years: 1, fromYear: 2029, toYear: 2030, change: -0.1, annualized: -0.1 },
  ],
  peak: { year: 2029, medianPricePerM2: 5000, changeSince: -0.1 },
  direction: 'down',
  reasons: [],
  notes: ['Médianes en euros courants.'],
}

describe('lot 29 : tendance des prix de vente', () => {
  it('les seuils : dix ventes par an, écarts sur un, cinq et dix ans, stable à ±2 %', () => {
    expect(MARKET_TREND_MIN_SALES).toBe(10)
    expect([...MARKET_TREND_HORIZONS]).toEqual([1, 5, 10])
    expect(MARKET_TREND_STABLE).toBe(0.02)
  })

  it('une tendance se valide ; sans année de référence, ni pic ni sens', () => {
    expect(MarketTrendSchema.parse(trend)).toEqual(trend)
    const none = {
      ...trend,
      status: 'to_verify',
      radiusMeters: null,
      referenceYear: null,
      changes: [],
      peak: null,
      direction: null,
      reasons: ['Moins de 10 ventes par an : tendance non retenue.'],
    }
    expect(MarketTrendSchema.parse(none)).toEqual(none)
    expect(
      MarketTrendSchema.safeParse({ ...trend, direction: 'sideways' }).success
    ).toBe(false)
    expect(
      MarketTrendSchema.safeParse({
        ...trend,
        years: [{ year: 2030, count: -1, medianPricePerM2: 1, partial: false }],
      }).success
    ).toBe(false)
  })

  it('le contexte de marché porte la tendance', () => {
    const market = {
      status: 'to_verify',
      point: null,
      radiusMeters: null,
      surface: null,
      surfaceRange: null,
      period: { from: '2027-11-03', to: '2030-11-03' },
      stats: null,
      comparables: [],
      marketPrice: null,
      listingPricePerM2: null,
      gapToMarket: null,
      reasons: [],
      dataYears: [2029, 2030, 2031],
      trend,
    }
    expect(MarketContextSchema.parse(market).trend.referenceYear).toBe(2030)
    const { trend: _omitted, ...without } = market
    expect(MarketContextSchema.safeParse(without).success).toBe(false)
  })
})
