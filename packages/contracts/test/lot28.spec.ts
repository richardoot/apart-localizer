/**
 * Lot 28 : loyers observés par l'observatoire local des loyers (ADR 0038).
 * Valeurs fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  BORDEAUX_RENT_OBSERVATORY,
  ListingContextSchema,
  MarketContextReportSchema,
  RENT_OBSERVATORY_ATTRIBUTION,
  RentObservatoryLookupSchema,
  RentObservatoryTableSchema,
} from '../src/index.js'

const table = {
  territory: 'bordeaux',
  observatory: 'L9900',
  year: 2030,
  observedAt: '2030-01-01',
  housingType: 'apartment',
  zones: [
    {
      zone: 1,
      label: 'Zone 1',
      stats: [
        {
          rooms: null,
          medianPerM2: 12,
          q1PerM2: 10,
          q3PerM2: 14,
          observations: 300,
        },
      ],
    },
  ],
  irisZones: { '990010101': 1 },
  communeZones: { '99002': 1 },
  source: {
    url: null,
    file: 'fictif.zip',
    sha256: 'abc',
    importedAt: '2030-11-11T10:00:00.000Z',
  },
}

describe('loyers observés (lot 28)', () => {
  it('la table d’une enquête : locataires récents absents par défaut', () => {
    const parsed = RentObservatoryTableSchema.parse(table)
    expect(parsed.zones[0]?.recentTenants).toBeNull()
    expect(BORDEAUX_RENT_OBSERVATORY).toBe('L3300')
    expect(RENT_OBSERVATORY_ATTRIBUTION).toContain(
      'Observatoire local des loyers'
    )
  })

  it('refuse une zone sans loyer, des pièces hors tranche, un type autre qu’appartement', () => {
    const zone = table.zones[0] as (typeof table.zones)[number]
    expect(
      RentObservatoryTableSchema.safeParse({
        ...table,
        zones: [{ ...zone, stats: [] }],
      }).success
    ).toBe(false)
    expect(
      RentObservatoryTableSchema.safeParse({
        ...table,
        zones: [{ ...zone, stats: [{ ...zone.stats[0], rooms: 5 }] }],
      }).success
    ).toBe(false)
    expect(
      RentObservatoryTableSchema.safeParse({ ...table, housingType: 'house' })
        .success
    ).toBe(false)
    expect(
      RentObservatoryTableSchema.safeParse({ ...table, zones: [] }).success
    ).toBe(false)
  })

  it('le résultat pour une annonce : état, quartiles, place du loyer visé', () => {
    const lookup = {
      status: 'ok',
      zone: { zone: 1, label: 'Zone 1' },
      approximate: false,
      rooms: null,
      medianPerM2: 12,
      q1PerM2: 10,
      q3PerM2: 14,
      observations: 300,
      monthlyMedian: 480,
      monthlyQ1: 400,
      monthlyQ3: 560,
      targetRent: 600,
      gapToMedian: 0.25,
      position: 'above_q3',
      year: 2030,
      observedAt: '2030-01-01',
      sourceUrl: null,
      attribution: RENT_OBSERVATORY_ATTRIBUTION,
      reasons: [],
      notes: [],
    }
    expect(RentObservatoryLookupSchema.parse(lookup)).toEqual(lookup)
    expect(
      RentObservatoryLookupSchema.safeParse({ ...lookup, position: 'high' })
        .success
    ).toBe(false)
    expect(
      RentObservatoryLookupSchema.safeParse({ ...lookup, status: 'done' })
        .success
    ).toBe(false)
  })

  it('le contexte de la fiche et le contexte de marché portent le loyer observé', () => {
    expect(ListingContextSchema.shape.rentObservatory).toBeDefined()
    expect(MarketContextReportSchema.shape.rentObservatory).toBeDefined()
  })
})
