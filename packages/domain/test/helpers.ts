import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { AssumptionsSchema } from '@apart/contracts'
import type {
  Assumptions,
  ListingFinancials,
  RentalDemand,
  TriState,
  DpeClass,
} from '@apart/contracts'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '..', '..', '..')

/** Hypothèses de l'artefact (modèle de calcul § 8), en fractions. */
export const ARTIFACT_ASSUMPTIONS: Assumptions = AssumptionsSchema.parse({
  downPayment: 40_000,
  interestRate: 0.0365,
  durationYears: 25,
  insuranceRate: 0.001,
  notaryRate: 0.075,
  vacancyMonths: 0.5,
  fixedCostsAnnual: 1050,
  grossYieldThreshold: 0.055,
  maxMonthlyEffort: 150,
})

/** L'annonce de l'exemple chiffré § 8. */
export const DOC_EXAMPLE: ListingFinancials = {
  price: 200_000,
  buyerFees: 0,
  surface: 45,
  targetRent: 750,
  rentControlled: false,
  referenceRentPerM2: null,
  furnitureValue: 5000,
  renovationTotal: 0,
  propertyTax: null,
  annualCharges: null,
  nonRecoverableChargesMonthly: null,
  dpeClass: 'D',
  marketPricePerM2: null,
}

/** Une entrée financière complète à partir d'une surcharge partielle. */
export function financials(
  over: Partial<ListingFinancials> = {}
): ListingFinancials {
  return { ...DOC_EXAMPLE, ...over }
}

export interface GoldenCase {
  id: string
  financials: ListingFinancials
  rental: {
    dpeClass: DpeClass | null
    year: number | null
    marketRent: number | null
    demand: RentalDemand | null
    coOwnershipAllowsRental: TriState
    decencyCompliant: TriState
    rentalPermitRequired: TriState
  }
  expected: {
    metrics: Record<string, unknown>
    rental: {
      year: number
      verdict: string
      rank: number
      unknownCount: number
      checks: { level: string; message: string }[]
    }
  }
}

export interface GoldenFile {
  assumptions: Assumptions
  cases: GoldenCase[]
  zeroRate?: { assumptions: Assumptions; cases: GoldenCase[] }
}

export function loadGolden(file: string): GoldenFile | null {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as GoldenFile
}

/** JSON ne connaît pas NaN : le générateur l'écrit en chaîne. */
export function fromJsonNumber(value: unknown): number {
  if (value === 'NaN') return Number.NaN
  return value as number
}

/**
 * Égalité « au centime » : les montants en euros à 0,005 près, les fractions
 * et ratios à 1e-9 près, NaN égal à NaN.
 */
export function expectClose(
  actual: number,
  expected: unknown,
  label: string
): void {
  const want = fromJsonNumber(expected)
  if (Number.isNaN(want)) {
    expect(actual, label).toBeNaN()
    return
  }
  const tolerance = Math.abs(want) >= 1 ? 0.005 : 1e-9
  expect(
    Math.abs(actual - want),
    `${label}: ${actual} vs ${want}`
  ).toBeLessThan(tolerance)
}
