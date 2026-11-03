import { describe, expect, it } from 'vitest'
import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_REGULATORY_RULES,
  DEFAULT_TAX_PARAMETERS,
  McpAddRentComparableInputSchema,
  McpEvaluateScenarioInputSchema,
  McpGetProjectionInputSchema,
  ProjectionQuerySchema,
  RegulatoryRulesTableSchema,
  RentComparableInputSchema,
  RentComparableUpdateSchema,
  ScenarioEvaluateRequestSchema,
  ScenarioInputSchema,
  ScenarioUpdateSchema,
  TaxParametersSchema,
} from '../src/index.js'

const LISTING = '11111111-1111-4111-8111-111111111111'

describe('contrats du lot 5', () => {
  it('les tables datées par défaut sont valides et sourcées', () => {
    expect(TaxParametersSchema.parse(DEFAULT_TAX_PARAMETERS)).toEqual(
      DEFAULT_TAX_PARAMETERS
    )
    const shares = DEFAULT_TAX_PARAMETERS.lmnpReal.components.reduce(
      (s, c) => s + c.share,
      0
    )
    expect(shares).toBeCloseTo(1, 12)
    expect(DEFAULT_TAX_PARAMETERS.sources.length).toBeGreaterThan(3)
    expect(DEFAULT_TAX_PARAMETERS.uncertainties.length).toBeGreaterThan(0)
    expect(
      RegulatoryRulesTableSchema.parse(DEFAULT_REGULATORY_RULES).rules
    ).toHaveLength(DEFAULT_REGULATORY_RULES.rules.length)
    for (const rule of DEFAULT_REGULATORY_RULES.rules) {
      expect(rule.source.consultedAt, rule.key).toBe('2026-11-03')
    }
  })

  it('les hypothèses enregistrées avant le lot 5 sont relues avec les défauts du lot', () => {
    const {
      taxParameters: _t,
      horizonYears: _h,
      ...older
    } = DEFAULT_ASSUMPTIONS
    const parsed = AssumptionsSchema.parse(older)
    expect(parsed.horizonYears).toBe(15)
    expect(parsed.marginalTaxRate).toBeNull()
    expect(parsed.taxParameters.asOf).toBe('2026-11-03')
    expect(
      AssumptionsSchema.safeParse({ ...DEFAULT_ASSUMPTIONS, horizonYears: 0 })
        .success
    ).toBe(false)
  })

  it('comparables : défauts à la création, aucun à la modification', () => {
    expect(
      RentComparableInputSchema.parse({ rent: 700, surface: 40 })
    ).toMatchObject({
      furnished: false,
      source: 'autre',
      observedAt: null,
    })
    expect(RentComparableUpdateSchema.parse({})).toEqual({})
    expect(RentComparableUpdateSchema.parse({ rent: 710 })).toEqual({
      rent: 710,
    })
    expect(
      RentComparableInputSchema.safeParse({ rent: 0, surface: 40 }).success
    ).toBe(false)
    expect(
      McpAddRentComparableInputSchema.safeParse({
        listingId: LISTING,
        rent: 700,
        surface: 40,
      }).success
    ).toBe(true)
  })

  it('scénarios : surcharges, évaluation par identifiant ou surcharges, saveAs exige des surcharges', () => {
    expect(
      ScenarioInputSchema.parse({ name: ' Taux ', overrides: { price: 1 } })
    ).toMatchObject({ name: 'Taux', listingId: null, notes: null })
    expect(ScenarioUpdateSchema.parse({})).toEqual({})
    expect(ScenarioEvaluateRequestSchema.safeParse({}).success).toBe(false)
    expect(
      ScenarioEvaluateRequestSchema.safeParse({ overrides: {} }).success
    ).toBe(true)
    expect(
      McpEvaluateScenarioInputSchema.safeParse({ listingId: LISTING }).success
    ).toBe(false)
    expect(
      McpEvaluateScenarioInputSchema.safeParse({
        listingId: LISTING,
        scenarioId: LISTING,
        saveAs: { name: 'x' },
      }).success
    ).toBe(false)
    expect(
      McpEvaluateScenarioInputSchema.parse({
        listingId: LISTING,
        overrides: { assumptions: { interestRate: 0.032 } },
        saveAs: { name: 'Taux 3,2 %' },
      }).saveAs?.scope
    ).toBe('listing')
  })

  it('projection : paramètres de requête convertis, bornés', () => {
    expect(ProjectionQuerySchema.parse({ horizonYears: '20' })).toEqual({
      horizonYears: 20,
    })
    expect(
      ProjectionQuerySchema.safeParse({ horizonYears: '41' }).success
    ).toBe(false)
    expect(ProjectionQuerySchema.safeParse({ regime: 'pinel' }).success).toBe(
      false
    )
    expect(
      McpGetProjectionInputSchema.parse({
        listingId: LISTING,
        regime: 'lmnp_reel',
        assumptions: { marginalTaxRate: 0.3 },
      }).assumptions
    ).toEqual({ marginalTaxRate: 0.3 })
  })
})
