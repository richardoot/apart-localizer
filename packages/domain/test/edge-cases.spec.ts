import { describe, expect, it } from 'vitest'
import {
  compute,
  firstYearInterest,
  isRentControlled,
  maxPriceForEffort,
  maxPriceForGrossYield,
  maxPriceForNetYield,
  maxPriceForRule220,
  mergeAssumptions,
  monthlyFactor,
  monthlyPayment,
  normalizeCommune,
  occupationCost,
  remainingPrincipal,
  renovationTotal,
  rentCap,
  score,
  targetPrice,
  verdict,
  classifyDiscount,
  formatEuros,
  formatPercent,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, financials } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS

describe('cas limites de compute', () => {
  it('surface nulle : prix et loyer au m² indéfinis, pas de plafond', () => {
    const m = compute(
      financials({ surface: 0, rentControlled: true, referenceRentPerM2: 15 }),
      A
    )
    expect(m.pricePerM2).toBeNaN()
    expect(m.rentPerM2).toBeNaN()
    expect(m.rentCap).toBeNull()
    expect(m.rent).toBe(750)
  })

  it('apport supérieur au coût : rien emprunté, mensualité nulle', () => {
    const m = compute(financials({ price: 30_000, furnitureValue: 0 }), A)
    expect(m.loanAmount).toBe(0)
    expect(m.monthlyPayment).toBe(0)
    expect(m.effort).toBeCloseTo(m.netOperating / 12, 9)
  })

  it('taux nul : amortissement linéaire plus assurance', () => {
    const a = { ...A, interestRate: 0 }
    const m = compute(financials(), a)
    expect(m.monthlyFactor).toBeCloseTo(1 / 300 + 0.001 / 12, 12)
    expect(m.monthlyPayment).toBeCloseTo(
      180_000 / 300 + (180_000 * 0.001) / 12,
      6
    )
  })

  it('prix nul et aucun coût : rendements indéfinis, verdict hors cible', () => {
    const m = compute(
      financials({
        price: 0,
        furnitureValue: 0,
        renovationTotal: 0,
        targetRent: 0,
      }),
      A
    )
    expect(m.totalCost).toBe(0)
    expect(m.grossYield).toBeNaN()
    expect(m.netYield).toBeNaN()
    expect(m.verdict).toBe('off_target')
    expect(m.failures).toContain('gross_yield')
  })

  it('honoraires acquéreur retirés de la base des frais de notaire', () => {
    const m = compute(financials({ buyerFees: 10_000 }), A)
    expect(m.notaryFees).toBe(0.075 * 190_000)
    // Des honoraires supérieurs au prix ne donnent jamais une base négative.
    expect(
      compute(financials({ price: 1000, buyerFees: 5000 }), A).notaryFees
    ).toBe(0)
  })

  it('plafond : loyer visé borné, part non récupérable estimée à 25 %', () => {
    const m = compute(
      financials({
        rentControlled: true,
        referenceRentPerM2: 14,
        targetRent: 900,
        annualCharges: 1200,
      }),
      A
    )
    expect(m.rentCap).toBe(630)
    expect(m.rent).toBe(630)
    expect(m.nonRecoverableChargesEstimated).toBe(true)
    expect(m.nonRecoverableChargesMonthly).toBe(25)
    expect(m.propertyTax).toBe(630)
  })

  it("loyer de référence nul ou charges nulles : pas de plafond, pas d'estimation", () => {
    expect(
      rentCap(financials({ rentControlled: true, referenceRentPerM2: 0 }))
    ).toBeNull()
    const m = compute(financials({ annualCharges: 0 }), A)
    expect(m.nonRecoverableChargesEstimated).toBe(false)
    expect(m.nonRecoverableChargesMonthly).toBe(0)
  })

  it('part non récupérable saisie : reprise telle quelle', () => {
    const m = compute(
      financials({ annualCharges: 1200, nonRecoverableChargesMonthly: 70 }),
      A
    )
    expect(m.nonRecoverableChargesMonthly).toBe(70)
    expect(m.nonRecoverableChargesEstimated).toBe(false)
  })
})

describe('verdict', () => {
  it("« de peu » sur le brut et l'effort, échec sur le DPE", () => {
    const near = verdict({ grossYield: 0.05, effort: -200, dpeClass: 'C' }, A)
    expect(near.verdict).toBe('to_dig')
    expect(near.nearMisses).toEqual(['gross_yield', 'effort'])
    const bad = verdict({ grossYield: 0.06, effort: -100, dpeClass: 'F' }, A)
    expect(bad.verdict).toBe('off_target')
    expect(bad.failures).toEqual(['dpe'])
    const unknown = verdict(
      { grossYield: 0.06, effort: -100, dpeClass: null },
      A
    )
    expect(unknown.verdict).toBe('to_dig')
    expect(unknown.nearMisses).toEqual(['dpe_unknown'])
    const good = verdict({ grossYield: 0.06, effort: 10, dpeClass: 'B' }, A)
    expect(good.verdict).toBe('target')
  })

  it('les marges sont paramétrables', () => {
    const strict = { ...A, grossYieldMargin: 0, effortMargin: 0 }
    expect(
      verdict({ grossYield: 0.054, effort: -151, dpeClass: 'C' }, strict)
        .failures
    ).toEqual(['gross_yield', 'effort'])
  })

  it('score : palier par verdict plus brut × 1000', () => {
    expect(score('target', 0.06)).toBe(2060)
    expect(score('to_dig', 0.05)).toBe(1050)
    expect(score('off_target', 0.04)).toBe(40)
  })
})

describe('travaux', () => {
  it('somme des postes si actif, 0 sinon, 0 si poste non chiffré', () => {
    expect(renovationTotal(null)).toBe(0)
    expect(renovationTotal({ active: false, items: [{ amount: 1000 }] })).toBe(
      0
    )
    expect(renovationTotal({ active: true, items: [] })).toBe(0)
    expect(
      renovationTotal({
        active: true,
        items: [{ amount: 1000 }, { amount: null }, { amount: 250 }],
      })
    ).toBe(1250)
  })
})

describe('encadrement', () => {
  it('normalise la commune et respecte le forçage', () => {
    expect(normalizeCommune('  Bordéaux ')).toBe('bordeaux')
    expect(normalizeCommune(null)).toBe('')
    expect(isRentControlled('Bordeaux')).toBe(true)
    expect(isRentControlled('Talence')).toBe(false)
    expect(isRentControlled('Talence', 'yes')).toBe(true)
    expect(isRentControlled('Bordeaux', 'no')).toBe(false)
    expect(isRentControlled('Paris', 'auto', ['paris'])).toBe(true)
  })
})

describe('crédit', () => {
  it('facteur et mensualité', () => {
    expect(monthlyFactor(0.0365, 0, 0.001)).toBeNaN()
    expect(monthlyPayment(0, 0.0365, 25, 0.001)).toBe(0)
    expect(monthlyPayment(180_000, 0.0365, 25, 0.001)).toBeCloseTo(930.67, 2)
  })

  it('capital restant dû : bornes et taux nul', () => {
    expect(remainingPrincipal(0, 0.03, 20, 12)).toBe(0)
    expect(remainingPrincipal(100_000, 0.03, 0, 12)).toBe(0)
    expect(remainingPrincipal(120_000, 0, 10, 60)).toBe(60_000)
    expect(remainingPrincipal(120_000, 0.03, 10, -5)).toBe(120_000)
    expect(remainingPrincipal(120_000, 0.03, 10, 999)).toBeCloseTo(0, 6)
    const after12 = remainingPrincipal(180_000, 0.0365, 25, 12)
    expect(after12).toBeGreaterThan(175_000)
    expect(after12).toBeLessThan(180_000)
  })

  it('intérêts de la première année : proches de emprunt × t, nuls sans crédit', () => {
    const exact = firstYearInterest(180_000, 0.0365, 25)
    expect(exact).toBeGreaterThan(180_000 * 0.0365 * 0.97)
    expect(exact).toBeLessThan(180_000 * 0.0365)
    expect(firstYearInterest(0, 0.0365, 25)).toBe(0)
    expect(firstYearInterest(1000, 0, 25)).toBe(0)
    expect(firstYearInterest(1000, 0.03, 0)).toBe(0)
    // Un prêt plus court que douze mois ne compte que ses mensualités.
    expect(firstYearInterest(1200, 0.12, 0.5)).toBeGreaterThan(0)
  })

  it("coût d'occupation en phase 1", () => {
    const cost = occupationCost({
      monthlyPayment: 930.67,
      loanAmount: 180_000,
      interestRate: 0.0365,
      durationYears: 25,
      insuranceRate: 0.001,
      annualCharges: 1200,
      propertyTax: 900,
      maintenanceAnnual: 600,
      currentRent: 850,
    })
    expect(cost.monthly).toBeCloseTo(930.67 + 100 + 75 + 50, 6)
    expect(cost.sunkMonthly).toBeLessThan(cost.monthly)
    expect(cost.rentGap).toBeCloseTo(cost.monthly - 850, 9)
    expect(
      occupationCost({
        monthlyPayment: 0,
        loanAmount: 0,
        interestRate: 0,
        durationYears: 25,
        insuranceRate: 0,
        annualCharges: 0,
        propertyTax: 0,
        maintenanceAnnual: 0,
        currentRent: null,
      }).rentGap
    ).toBeNull()
  })
})

describe('prix cible, cas limites', () => {
  it("sans loyer : ni brut ni repère 220 ; l'effort reste calculable (un bien assez bon marché se porte seul)", () => {
    const f = financials({ targetRent: 0 })
    expect(maxPriceForGrossYield(f, A)).toBeNull()
    expect(maxPriceForRule220(f, A)).toBeNull()
    const t = targetPrice(f, A)
    expect(t.bindingCriterion).toBe('effort')
    expect(t.targetPrice).toBeGreaterThan(0)
    const onlyYield = targetPrice(f, { ...A, targetCriteria: ['gross_yield'] })
    expect(onlyYield.targetPrice).toBeNull()
    expect(onlyYield.discount).toBeNull()
    expect(onlyYield.discountClass).toBeNull()
  })

  it('seuil brut nul ou critères inactifs', () => {
    expect(
      maxPriceForGrossYield(financials(), { ...A, grossYieldThreshold: 0 })
    ).toBeNull()
    const t = targetPrice(financials(), { ...A, targetCriteria: ['market'] })
    expect(t.targetPrice).toBeNull()
  })

  it('rendement net : inactif sans seuil, nul si le résultat net est négatif', () => {
    expect(maxPriceForNetYield(financials(), A)).toBeNull()
    const withNet = { ...A, netYieldThreshold: 0.03 }
    expect(maxPriceForNetYield(financials(), withNet)).toBeGreaterThan(0)
    expect(
      maxPriceForNetYield(financials({ targetRent: 10 }), withNet)
    ).toBeNull()
    expect(
      maxPriceForNetYield(financials(), { ...A, netYieldThreshold: 0 })
    ).toBeNull()
  })

  it("effort : nul si même sans emprunt l'effort dépasse le maximum, nul si k indéfini", () => {
    expect(
      maxPriceForEffort(financials({ targetRent: 10 }), {
        ...A,
        maxMonthlyEffort: 0,
      })
    ).toBeNull()
    expect(
      maxPriceForEffort(financials(), { ...A, durationYears: 0 })
    ).toBeNull()
    expect(maxPriceForEffort(financials(), A)).toBeGreaterThan(0)
  })

  it('décote : classement selon les seuils, prix affiché nul', () => {
    expect(classifyDiscount(-0.1, A)).toBe('in_target')
    expect(classifyDiscount(0, A)).toBe('in_target')
    expect(classifyDiscount(0.04, A)).toBe('negotiable')
    expect(classifyDiscount(0.09, A)).toBe('tight')
    expect(classifyDiscount(0.2, A)).toBe('out_of_reach')
    const t = targetPrice(financials({ price: 0 }), A)
    expect(t.targetPrice).not.toBeNull()
    expect(t.discount).toBeNull()
  })

  it('une annonce déjà dans la cible a une décote négative ou nulle', () => {
    const t = targetPrice(financials({ price: 100_000, furnitureValue: 0 }), A)
    expect(t.discount as number).toBeLessThanOrEqual(0)
    expect(t.discountClass).toBe('in_target')
  })
})

describe('fusion des hypothèses', () => {
  it('surcharge champ par champ, ignore undefined et null de surcharge', () => {
    expect(mergeAssumptions(A, null)).toBe(A)
    const merged = mergeAssumptions(A, {
      downPayment: 60_000,
      interestRate: undefined,
    })
    expect(merged.downPayment).toBe(60_000)
    expect(merged.interestRate).toBe(A.interestRate)
    expect(A.downPayment).toBe(40_000)
  })
})

describe('formats', () => {
  it('euros et pourcentages fr-FR, tiret sur une valeur indéfinie', () => {
    expect(formatEuros(1234.6)).toBe(`1${' '}235 €`)
    expect(formatEuros(Number.NaN)).toBe('—')
    expect(formatPercent(0.0845)).toBe('8,5 %')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—')
  })
})
