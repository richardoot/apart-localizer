import { describe, expect, it } from 'vitest'
import { Prisma } from '../generated/prisma'
import type { RentComparable, Scenario } from '../generated/prisma'
import { toRentComparableDto, toScenarioDto } from './study.mapper'

const now = new Date('2026-11-03T10:00:00.000Z')

describe('lignes du lot 5 vers le contrat', () => {
  it('scénario : surcharges lues, illisibles = aucune', () => {
    const row: Scenario = {
      id: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      listingId: null,
      name: 'Taux 3,2 %',
      overrides: { assumptions: { interestRate: 0.032 }, price: 180_000 },
      notes: null,
      createdById: null,
      createdAt: now,
      updatedAt: now,
    }
    expect(toScenarioDto(row)).toMatchObject({
      name: 'Taux 3,2 %',
      listingId: null,
      overrides: { assumptions: { interestRate: 0.032 }, price: 180_000 },
      createdAt: '2026-11-03T10:00:00.000Z',
    })
    expect(
      toScenarioDto({ ...row, overrides: { price: -5 } }).overrides
    ).toEqual({})
  })

  it('comparable : décimaux en nombres, date du jour', () => {
    const row: RentComparable = {
      id: '33333333-3333-4333-8333-333333333333',
      listingId: '11111111-1111-4111-8111-111111111111',
      rent: new Prisma.Decimal('680.50'),
      surface: new Prisma.Decimal('40.00'),
      furnished: true,
      rooms: 2,
      observedAt: new Date('2026-10-01T00:00:00.000Z'),
      source: 'leboncoin',
      sourceLabel: null,
      url: 'https://example.invalid/annonce',
      address: 'Talence centre',
      note: null,
      createdById: null,
      createdAt: now,
      updatedAt: now,
    }
    expect(toRentComparableDto(row)).toMatchObject({
      rent: 680.5,
      surface: 40,
      furnished: true,
      observedAt: '2026-10-01',
      source: 'leboncoin',
    })
    expect(
      toRentComparableDto({ ...row, observedAt: null }).observedAt
    ).toBeNull()
  })
})
