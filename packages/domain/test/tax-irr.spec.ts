/**
 * Lot 5 : fiscalité locative estimée (E6), plus-value immobilière, TRI et
 * VAN (E7). Valeurs calculées à la main à partir des paramètres datés.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_TAX_PARAMETERS } from '@apart/contracts'
import type { TaxParameters } from '@apart/contracts'
import {
  EMPTY_TAX_STATE,
  capitalGainsSurtax,
  capitalGainsTax,
  defaultRegime,
  holdingAllowance,
  irr,
  isBicRegime,
  isFurnishedLease,
  microBicParams,
  microCeiling,
  npv,
  regimesFor,
  rentalTaxYear,
  resolveRegime,
} from '../src/index.js'
import type { RentalTaxYearInput, TaxContext } from '../src/index.js'

const P: TaxParameters = DEFAULT_TAX_PARAMETERS
const CTX: TaxContext = {
  params: P,
  marginalTaxRate: 0.3,
  furnishedKind: 'long_term',
}

const YEAR: RentalTaxYearInput = {
  grossRent: 9000,
  operatingCosts: 1500,
  propertyTax: 900,
  interest: 6000,
  loanInsurance: 200,
  rentedMonths: 12,
  depreciation: { building: 0, furniture: 0 },
}

describe('régimes', () => {
  it('régime par défaut, équivalent selon le bail, liste, plafonds', () => {
    expect(defaultRegime('unfurnished')).toBe('micro_foncier')
    expect(defaultRegime('furnished')).toBe('micro_bic')
    expect(defaultRegime('shared')).toBe('micro_bic')
    expect(isFurnishedLease('shared')).toBe(true)
    expect(isBicRegime('lmnp_reel')).toBe(true)
    expect(isBicRegime('reel_foncier')).toBe(false)
    expect(resolveRegime(null, 'furnished')).toEqual({
      regime: 'micro_bic',
      adjusted: false,
    })
    expect(resolveRegime('reel_foncier', 'unfurnished')).toEqual({
      regime: 'reel_foncier',
      adjusted: false,
    })
    expect(resolveRegime('micro_bic', 'unfurnished')).toEqual({
      regime: 'micro_foncier',
      adjusted: true,
    })
    expect(resolveRegime('reel_foncier', 'furnished')).toEqual({
      regime: 'lmnp_reel',
      adjusted: true,
    })
    expect(regimesFor('unfurnished')).toEqual(['micro_foncier', 'reel_foncier'])
    expect(regimesFor('furnished')).toEqual(['micro_bic', 'lmnp_reel'])
    expect(microCeiling('micro_foncier', CTX)).toBe(15_000)
    expect(microCeiling('micro_bic', CTX)).toBe(83_600)
    expect(microCeiling('lmnp_reel', CTX)).toBeNull()
    expect(microBicParams(P, 'tourism_classified').allowanceRate).toBe(0.5)
    expect(microBicParams(P, 'tourism_unclassified')).toEqual({
      allowanceRate: 0.3,
      receiptsCeiling: 15_000,
    })
  })
})

describe('impôt d’une année de location', () => {
  it('micro-foncier : abattement de 30 %, IR à la TMI, prélèvements sociaux à 17,2 %', () => {
    const { tax, state } = rentalTaxYear(
      'micro_foncier',
      YEAR,
      EMPTY_TAX_STATE,
      CTX
    )
    expect(tax.regime).toBe('micro_foncier')
    expect(tax.eligible).toBe(true)
    expect(tax.deductions).toBe(2700)
    expect(tax.taxableIncome).toBe(6300)
    expect(tax.incomeTax).toBeCloseTo(1890, 9)
    expect(tax.socialContributions).toBeCloseTo(1083.6, 9)
    expect(tax.total).toBeCloseTo(2973.6, 9)
    expect(state.year).toBe(1)
  })

  it('micro-foncier au-delà de 15 000 € : réel imposé cette année, signalé', () => {
    const { tax } = rentalTaxYear(
      'micro_foncier',
      { ...YEAR, grossRent: 16_000 },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(tax.eligible).toBe(false)
    expect(tax.regime).toBe('reel_foncier')
    expect(tax.requestedRegime).toBe('micro_foncier')
    expect(tax.notes[0]).toMatch(/plafond du régime micro/)
  })

  it('réel foncier bénéficiaire : charges, intérêts, assurance et frais de gestion forfaitaires déduits', () => {
    const { tax } = rentalTaxYear('reel_foncier', YEAR, EMPTY_TAX_STATE, CTX)
    // 9 000 − (6 000 + 200) − (1 500 + 900 + 20) = 380
    expect(tax.deductions).toBe(8620)
    expect(tax.taxableIncome).toBeCloseTo(380, 9)
    expect(tax.globalIncomeOffset).toBe(0)
    expect(tax.incomeTax).toBeCloseTo(114, 9)
  })

  it('réel foncier déficitaire : charges hors intérêts imputées sur le revenu global, intérêts reportés, report consommé l’année suivante', () => {
    const first = rentalTaxYear(
      'reel_foncier',
      { ...YEAR, grossRent: 5000 },
      EMPTY_TAX_STATE,
      CTX
    )
    // 5 000 − 6 200 = −1 200 (intérêts, reportés) ; 2 420 de charges sur le revenu global.
    expect(first.tax.taxableIncome).toBe(0)
    expect(first.tax.globalIncomeOffset).toBeCloseTo(2420, 9)
    expect(first.tax.incomeTax).toBeCloseTo(-726, 9)
    expect(first.tax.socialContributions).toBe(0)
    expect(first.tax.carryForward).toBeCloseTo(1200, 9)
    expect(first.state.landDeficits).toEqual([{ amount: 1200, lastYear: 10 }])
    const second = rentalTaxYear(
      'reel_foncier',
      { ...YEAR, grossRent: 11_620 },
      first.state,
      CTX
    )
    // Net 3 000, report de 1 200 imputé.
    expect(second.tax.taxableIncome).toBeCloseTo(1800, 9)
    expect(second.tax.notes.join(' ')).toMatch(/antérieur imputé/)
    expect(second.state.landDeficits).toEqual([])
  })

  it('réel foncier : déficit de charges au-delà de 10 700 € reporté, déficit expiré après dix ans', () => {
    const big = rentalTaxYear(
      'reel_foncier',
      { ...YEAR, grossRent: 7000, operatingCosts: 13_000 },
      EMPTY_TAX_STATE,
      CTX
    )
    // 7 000 − 6 200 = 800 ; 800 − 13 920 = −13 120 ; 10 700 imputés, 2 420 reportés.
    expect(big.tax.globalIncomeOffset).toBe(10_700)
    expect(big.tax.carryForward).toBeCloseTo(2420, 9)
    const old = rentalTaxYear(
      'reel_foncier',
      YEAR,
      {
        ...EMPTY_TAX_STATE,
        year: 11,
        landDeficits: [{ amount: 500, lastYear: 10 }],
      },
      CTX
    )
    expect(old.tax.notes.join(' ')).toMatch(/expiration/)
    expect(old.tax.taxableIncome).toBeCloseTo(380, 9)
  })

  it('micro-BIC : abattement de 50 %, minimum de 305 €, prélèvements sociaux à 18,6 % ; tourisme non classé plafonné à 15 000 €', () => {
    const { tax } = rentalTaxYear('micro_bic', YEAR, EMPTY_TAX_STATE, CTX)
    expect(tax.taxableIncome).toBe(4500)
    expect(tax.socialContributions).toBeCloseTo(837, 9)
    const small = rentalTaxYear(
      'micro_bic',
      { ...YEAR, grossRent: 400 },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(small.tax.deductions).toBe(305)
    expect(small.tax.taxableIncome).toBe(95)
    const tiny = rentalTaxYear(
      'micro_bic',
      { ...YEAR, grossRent: 200 },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(tiny.tax.taxableIncome).toBe(0)
    const zero = rentalTaxYear(
      'micro_bic',
      { ...YEAR, grossRent: 0 },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(zero.tax.deductions).toBe(0)
    const tourism = rentalTaxYear(
      'micro_bic',
      { ...YEAR, grossRent: 16_000 },
      EMPTY_TAX_STATE,
      { ...CTX, furnishedKind: 'tourism_unclassified' }
    )
    expect(tourism.tax.regime).toBe('lmnp_reel')
    expect(tourism.tax.eligible).toBe(false)
  })

  it('LMNP réel : les amortissements ne créent pas de déficit, l’excédent est différé ; un déficit de charges est reporté', () => {
    const { tax, state } = rentalTaxYear(
      'lmnp_reel',
      { ...YEAR, depreciation: { building: 3000, furniture: 1000 } },
      EMPTY_TAX_STATE,
      CTX
    )
    // 9 000 − 8 600 = 400 : 400 d'amortissements utilisés, 3 600 différés.
    expect(tax.deductions).toBe(8600)
    expect(tax.depreciation).toBeCloseTo(400, 9)
    expect(tax.taxableIncome).toBe(0)
    expect(tax.carryForward).toBeCloseTo(3600, 9)
    expect(state.deductedBuildingDepreciation).toBeCloseTo(300, 9)
    expect(state.deductedFurnitureDepreciation).toBeCloseTo(100, 9)
    expect(tax.notes.join(' ')).toMatch(/différés/)
    const loss = rentalTaxYear(
      'lmnp_reel',
      { ...YEAR, grossRent: 5000, depreciation: { building: 0, furniture: 0 } },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(loss.tax.taxableIncome).toBe(0)
    expect(loss.state.bicDeficits).toEqual([{ amount: 3600, lastYear: 10 }])
    const profit = rentalTaxYear(
      'lmnp_reel',
      { ...YEAR, grossRent: 15_000 },
      loss.state,
      CTX
    )
    // 15 000 − 8 600 = 6 400, déficit de 3 600 imputé : 2 800 imposables.
    expect(profit.tax.taxableIncome).toBeCloseTo(2800, 9)
    expect(profit.tax.socialContributions).toBeCloseTo(2800 * 0.186, 9)
    const expired = rentalTaxYear(
      'lmnp_reel',
      YEAR,
      {
        ...EMPTY_TAX_STATE,
        year: 12,
        bicDeficits: [{ amount: 50, lastYear: 11 }],
      },
      CTX
    )
    expect(expired.tax.notes.join(' ')).toMatch(
      /BIC reporté arrive à expiration/
    )
  })

  it('sans TMI : impôt sur le revenu et total inconnus, prélèvements sociaux calculés', () => {
    const { tax } = rentalTaxYear('micro_foncier', YEAR, EMPTY_TAX_STATE, {
      ...CTX,
      marginalTaxRate: null,
    })
    expect(tax.incomeTax).toBeNull()
    expect(tax.total).toBeNull()
    expect(tax.socialContributions).toBeCloseTo(1083.6, 9)
  })

  it('réel foncier sans mois loué : pas de frais de gestion forfaitaires', () => {
    const { tax } = rentalTaxYear(
      'reel_foncier',
      {
        ...YEAR,
        rentedMonths: 0,
        grossRent: 0,
        interest: 0,
        loanInsurance: 0,
        operatingCosts: 0,
        propertyTax: 0,
      },
      EMPTY_TAX_STATE,
      CTX
    )
    expect(tax.deductions).toBe(0)
  })
})

describe('plus-value immobilière', () => {
  it('abattements pour durée de détention : IR exonéré après 22 ans, prélèvements sociaux après 30', () => {
    const ir = P.capitalGains.incomeTaxAllowances
    const ps = P.capitalGains.socialAllowances
    expect(holdingAllowance(5, ir)).toBe(0)
    expect(holdingAllowance(6, ir)).toBeCloseTo(0.06, 12)
    expect(holdingAllowance(21, ir)).toBeCloseTo(0.96, 12)
    expect(holdingAllowance(22, ir)).toBe(1)
    expect(holdingAllowance(40, ir)).toBe(1)
    expect(holdingAllowance(22, ps)).toBeCloseTo(0.28, 12)
    expect(holdingAllowance(29, ps)).toBeCloseTo(0.91, 12)
    expect(holdingAllowance(30, ps)).toBe(1)
  })

  it('surtaxe lissée au-delà de 50 000 €', () => {
    const b = P.capitalGains.surtaxBrackets
    expect(capitalGainsSurtax(50_000, b)).toBe(0)
    expect(capitalGainsSurtax(55_000, b)).toBeCloseTo(850, 9)
    expect(capitalGainsSurtax(80_000, b)).toBeCloseTo(1600, 9)
    expect(capitalGainsSurtax(105_000, b)).toBeCloseTo(2650, 9)
    expect(capitalGainsSurtax(300_000, b)).toBeCloseTo(18_000, 9)
  })

  it('vente imposable après dix ans : forfaits, abattements, IR 19 % et prélèvements sociaux 17,2 %', () => {
    const result = capitalGainsTax({
      salePrice: 260_000,
      saleCosts: 13_000,
      acquisitionPrice: 200_000,
      acquisitionCosts: 15_000,
      works: 0,
      holdingYears: 10,
      depreciationDeducted: 0,
      mainResidenceAtSale: false,
      params: P,
    })
    expect(result.exempt).toBe(false)
    expect(result.acquisitionCosts).toBe(15_000)
    // Forfait travaux de 15 % après cinq ans.
    expect(result.works).toBe(30_000)
    expect(result.grossGain).toBe(2000)
    expect(result.incomeTaxAllowance).toBeCloseTo(0.3, 12)
    expect(result.socialAllowance).toBeCloseTo(0.0825, 12)
    expect(result.incomeTax).toBeCloseTo(1400 * 0.19, 9)
    expect(result.socialContributions).toBeCloseTo(2000 * 0.9175 * 0.172, 9)
    expect(result.surtax).toBe(0)
    expect(result.notes.join(' ')).toMatch(/forfait de 15 %/)
    expect(result.notes.join(' ')).toMatch(/plus la résidence principale/)
  })

  it('frais au forfait de 7,5 %, amortissements LMNP réintégrés, surtaxe, sans forfait travaux avant cinq ans', () => {
    const result = capitalGainsTax({
      salePrice: 400_000,
      saleCosts: 0,
      acquisitionPrice: 200_000,
      acquisitionCosts: 5000,
      works: 10_000,
      holdingYears: 4,
      depreciationDeducted: 20_000,
      mainResidenceAtSale: false,
      params: P,
    })
    expect(result.acquisitionCosts).toBe(15_000)
    expect(result.works).toBe(10_000)
    expect(result.depreciationReintegrated).toBe(20_000)
    // 400 000 − (200 000 + 15 000 + 10 000 − 20 000) = 195 000
    expect(result.grossGain).toBe(195_000)
    expect(result.surtax).toBeCloseTo(195_000 * 0.04, 9)
    expect(result.notes.join(' ')).toMatch(/réintégrés/)
    expect(result.notes.join(' ')).toMatch(/quotes-parts/)
    const noReintegration = capitalGainsTax({
      salePrice: 400_000,
      saleCosts: 0,
      acquisitionPrice: 200_000,
      acquisitionCosts: 5000,
      works: 10_000,
      holdingYears: 4,
      depreciationDeducted: 20_000,
      mainResidenceAtSale: false,
      params: {
        ...P,
        capitalGains: { ...P.capitalGains, reintegrateLmnpDepreciation: false },
      },
    })
    expect(noReintegration.grossGain).toBe(175_000)
  })

  it('résidence principale au jour de la vente : exonérée ; moins-value : pas d’impôt', () => {
    const exempt = capitalGainsTax({
      salePrice: 300_000,
      saleCosts: 0,
      acquisitionPrice: 200_000,
      acquisitionCosts: 15_000,
      works: 0,
      holdingYears: 3,
      depreciationDeducted: 0,
      mainResidenceAtSale: true,
      params: P,
    })
    expect(exempt.exempt).toBe(true)
    expect(exempt.total).toBe(0)
    expect(exempt.exemptionReason).toMatch(/150 U/)
    const loss = capitalGainsTax({
      salePrice: 180_000,
      saleCosts: 9000,
      acquisitionPrice: 200_000,
      acquisitionCosts: 15_000,
      works: 0,
      holdingYears: 3,
      depreciationDeducted: 0,
      mainResidenceAtSale: false,
      params: {
        ...P,
        capitalGains: { ...P.capitalGains, mainResidenceExemption: false },
      },
    })
    expect(loss.grossGain).toBe(0)
    expect(loss.total).toBe(0)
  })
})

describe('TRI et VAN', () => {
  it('flux connus', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 10)
    expect(irr([-1000, 0, 0, 1331])).toBeCloseTo(0.1, 10)
    expect(irr([-100, 50, 50, 50])).toBeCloseTo(0.2337519, 6)
    expect(irr([-100, 60, 60])).toBeCloseTo(0.1306623, 6)
    // Perte : TRI négatif.
    expect(irr([-100, 50])).toBeCloseTo(-0.5, 10)
    expect(npv(0.1, [-100, 110])).toBeCloseTo(0, 10)
    expect(npv(0, [-100, 30, 30])).toBe(-40)
  })

  it('pas de changement de signe : pas de TRI', () => {
    expect(irr([100, 10])).toBeNull()
    expect(irr([-100, -10])).toBeNull()
    expect(irr([])).toBeNull()
  })

  it('Newton hors des bornes : bissection de secours ; pas de racine dans les bornes : null', () => {
    // Un point de départ absurde fait sortir Newton des bornes.
    expect(irr([-100, 110], { guess: 9.99 })).toBeCloseTo(0.1, 8)
    // Peu d'itérations : la bissection termine.
    expect(irr([-100, 50, 50, 50], { maxIterations: 1 })).toBeCloseTo(
      0.2337519,
      6
    )
    // Un TRI au-delà de 1 000 % : hors des bornes de recherche.
    expect(irr([-1, 1e6], { guess: 0.05 })).toBeNull()
    // Dérivée nulle au point de départ (flux pairs) : bissection.
    expect(irr([-100, 0, 121], { guess: -1 + 1e-12 })).toBeCloseTo(0.1, 6)
  })
})
