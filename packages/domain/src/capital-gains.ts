import type {
  CapitalGainsResult,
  HoldingAllowanceBand,
  SurtaxBracket,
  TaxParameters,
} from '@apart/contracts'
import { formatEuros } from './format.js'

/**
 * Impôt sur la plus-value immobilière des particuliers (modèle § 7, besoin
 * E7) : prix de revient (prix, frais réels ou forfait, travaux réels ou
 * forfait, amortissements LMNP réintégrés), abattements pour durée de
 * détention, impôt sur le revenu, prélèvements sociaux, surtaxe.
 * Exonération si le bien est la résidence principale au jour de la vente.
 */

export interface CapitalGainsInput {
  salePrice: number
  /** Frais de cession à la charge du vendeur (honoraires, diagnostics). */
  saleCosts: number
  /** Prix d'acquisition stipulé : net vendeur. */
  acquisitionPrice: number
  /** Frais d'acquisition réels : notaire et honoraires à la charge de l'acquéreur. */
  acquisitionCosts: number
  /** Travaux réels non déduits des revenus. */
  works: number
  holdingYears: number
  /** Amortissements LMNP du bâti déduits, réintégrables. */
  depreciationDeducted: number
  mainResidenceAtSale: boolean
  params: TaxParameters
}

/** Somme des abattements pour une durée de détention en années révolues, plafonnée à 100 %. */
export function holdingAllowance(
  holdingYears: number,
  bands: readonly HoldingAllowanceBand[]
): number {
  let allowance = 0
  for (const band of bands) {
    const years = Math.min(holdingYears, band.toYear) - band.fromYear + 1
    if (years > 0) allowance += years * band.ratePerYear
  }
  return Math.min(1, allowance)
}

/** Surtaxe sur une plus-value imposable (barème lissé de l'article 1609 nonies G du CGI). */
export function capitalGainsSurtax(
  taxableGain: number,
  brackets: readonly SurtaxBracket[]
): number {
  for (const bracket of brackets) {
    const inside =
      taxableGain > bracket.from &&
      (bracket.to === null || taxableGain <= bracket.to)
    if (!inside) continue
    const smoothing =
      bracket.to === null ? 0 : (bracket.to - taxableGain) * bracket.smoothing
    return Math.max(0, bracket.rate * taxableGain - smoothing)
  }
  return 0
}

export function capitalGainsTax(input: CapitalGainsInput): CapitalGainsResult {
  const p = input.params.capitalGains
  const socialRate = input.params.socialContributions.capitalGainsRate
  const notes: string[] = []
  const base = {
    salePrice: input.salePrice,
    saleCosts: input.saleCosts,
    acquisitionPrice: input.acquisitionPrice,
    holdingYears: input.holdingYears,
  }
  if (input.mainResidenceAtSale && p.mainResidenceExemption) {
    return {
      ...base,
      exempt: true,
      exemptionReason:
        'Résidence principale au jour de la vente : plus-value exonérée (CGI, art. 150 U II 1°).',
      acquisitionCosts: input.acquisitionCosts,
      works: input.works,
      depreciationReintegrated: 0,
      grossGain: 0,
      incomeTaxAllowance: 0,
      socialAllowance: 0,
      incomeTax: 0,
      socialContributions: 0,
      surtax: 0,
      total: 0,
      notes,
    }
  }
  const flatCosts = input.acquisitionPrice * p.acquisitionCostsFlatRate
  const acquisitionCosts = Math.max(input.acquisitionCosts, flatCosts)
  if (flatCosts > input.acquisitionCosts) {
    notes.push(
      `Frais d’acquisition au forfait de ${Math.round(p.acquisitionCostsFlatRate * 1000) / 10} % (${formatEuros(flatCosts)}), plus favorable que les frais réels.`
    )
  }
  const flatWorks = input.acquisitionPrice * p.worksFlatRate
  const worksFlatAllowed = input.holdingYears > p.worksFlatMinYears
  const works = worksFlatAllowed
    ? Math.max(input.works, flatWorks)
    : input.works
  if (worksFlatAllowed && flatWorks > input.works) {
    notes.push(
      `Travaux au forfait de ${Math.round(p.worksFlatRate * 100)} % du prix d’achat (${formatEuros(flatWorks)}), détention de plus de ${p.worksFlatMinYears} ans.`
    )
  }
  const depreciationReintegrated = p.reintegrateLmnpDepreciation
    ? Math.max(0, input.depreciationDeducted)
    : 0
  if (depreciationReintegrated > 0) {
    notes.push(
      `Amortissements LMNP déduits réintégrés : ${formatEuros(depreciationReintegrated)} (loi de finances pour 2025).`
    )
  }
  const costBasis =
    input.acquisitionPrice + acquisitionCosts + works - depreciationReintegrated
  const grossGain = Math.max(0, input.salePrice - input.saleCosts - costBasis)
  const incomeTaxAllowance = holdingAllowance(
    input.holdingYears,
    p.incomeTaxAllowances
  )
  const socialAllowance = holdingAllowance(
    input.holdingYears,
    p.socialAllowances
  )
  const taxableIncomeTax = grossGain * (1 - incomeTaxAllowance)
  const taxableSocial = grossGain * (1 - socialAllowance)
  const incomeTax = taxableIncomeTax * p.incomeTaxRate
  const socialContributions = taxableSocial * socialRate
  const surtax = capitalGainsSurtax(taxableIncomeTax, p.surtaxBrackets)
  if (surtax > 0) {
    notes.push(
      'Surtaxe calculée sur la plus-value totale ; son seuil de 50 000 € s’apprécie par vendeur, selon les quotes-parts.'
    )
  }
  if (!input.mainResidenceAtSale && p.mainResidenceExemption) {
    notes.push(
      'Le bien n’est plus la résidence principale au jour de la vente (loué) : pas d’exonération.'
    )
  }
  return {
    ...base,
    exempt: false,
    exemptionReason: null,
    acquisitionCosts,
    works,
    depreciationReintegrated,
    grossGain,
    incomeTaxAllowance,
    socialAllowance,
    incomeTax,
    socialContributions,
    surtax,
    total: incomeTax + socialContributions + surtax,
    notes,
  }
}
