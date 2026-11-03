import { describe, expect, it } from 'vitest'
import {
  emptyScenarioForm,
  scenarioFormFromOverrides,
  scenarioOverridesFromForm,
} from './scenario-form'

describe('formulaire de scénario', () => {
  it('vide : aucune surcharge', () => {
    expect(scenarioOverridesFromForm(emptyScenarioForm())).toEqual({
      overrides: {},
      error: null,
    })
  })

  it('champs remplis seulement, pourcentages en fractions, saisie française', () => {
    const { overrides, error } = scenarioOverridesFromForm({
      ...emptyScenarioForm(),
      price: '180 000',
      leaseType: 'furnished',
      interestRatePercent: '3,2',
      rentalStartDate: '2029-06-01',
      marginalTaxPercent: '30',
      taxRegime: 'lmnp_reel',
      appreciationPercent: '1',
    })
    expect(error).toBeNull()
    expect(overrides).toEqual({
      price: 180_000,
      leaseType: 'furnished',
      assumptions: {
        interestRate: 0.032,
        rentalStartDate: '2029-06-01',
        marginalTaxRate: 0.3,
        taxRegime: 'lmnp_reel',
        appreciationRate: 0.01,
      },
    })
  })

  it('valeur illisible ou hors bornes : erreur avec le champ', () => {
    const bad = scenarioOverridesFromForm({
      ...emptyScenarioForm(),
      price: 'abc',
    })
    expect(bad.overrides).toBeNull()
    expect(bad.error).toMatch(/price/)
    expect(
      scenarioOverridesFromForm({ ...emptyScenarioForm(), durationYears: '60' })
        .error
    ).toMatch(/assumptions\.durationYears/)
  })

  it('aller-retour depuis un scénario enregistré', () => {
    const overrides = {
      targetRent: 800,
      renovationTotal: 5000,
      assumptions: {
        downPayment: 60_000,
        durationYears: 20,
        vacancyMonths: 1,
        horizonYears: 10,
        interestRate: 0.032,
        marginalTaxRate: 0.11,
      },
    }
    const form = scenarioFormFromOverrides(overrides)
    expect(form.interestRatePercent).toBe('3.2')
    expect(form.marginalTaxPercent).toBe('11')
    expect(scenarioOverridesFromForm(form).overrides).toEqual(overrides)
    const blank = scenarioFormFromOverrides({})
    expect(blank).toEqual(emptyScenarioForm())
  })
})
