import type {
  FurnishedRentalKind,
  LeaseType,
  RentalTaxYear,
  TaxParameters,
  TaxRegime,
} from '@apart/contracts'
import { formatEuros } from './format.js'

/**
 * Fiscalité locative estimée (modèle § 7, besoin E6). Une année à la fois,
 * avec les reports d'une année sur l'autre (déficits fonciers, déficits BIC,
 * amortissements différés). Aucun taux en dur : tout vient des paramètres
 * datés (`TaxParameters`). Simplifications assumées : un seul bien, pas
 * d'autres revenus fonciers ou BIC du foyer, pas de CSG déductible, année
 * de détention assimilée à l'année civile.
 */

export interface RentalTaxYearInput {
  /** Loyers encaissés dans l'année (après vacance). */
  grossRent: number
  /** Charges non récupérables et frais fixes (PNO, CFE, gestion, comptable). */
  operatingCosts: number
  propertyTax: number
  interest: number
  loanInsurance: number
  /** Mois loués dans l'année : les frais de gestion forfaitaires du réel foncier ne comptent qu'avec au moins un mois. */
  rentedMonths: number
  /** Dotations aux amortissements de l'année (LMNP réel). */
  depreciation: { building: number; furniture: number }
}

interface Carry {
  amount: number
  /** Dernière année (rang fiscal) où ce report peut servir. */
  lastYear: number
}

export interface TaxCarryState {
  /** Rang de l'année fiscale suivante, à partir de 0. */
  year: number
  landDeficits: Carry[]
  bicDeficits: Carry[]
  deferredDepreciation: { building: number; furniture: number }
  /** Amortissements effectivement déduits (bâti, travaux), réintégrables à la revente. */
  deductedBuildingDepreciation: number
  deductedFurnitureDepreciation: number
}

export const EMPTY_TAX_STATE: TaxCarryState = {
  year: 0,
  landDeficits: [],
  bicDeficits: [],
  deferredDepreciation: { building: 0, furniture: 0 },
  deductedBuildingDepreciation: 0,
  deductedFurnitureDepreciation: 0,
}

export interface TaxContext {
  params: TaxParameters
  /** TMI du foyer ; null = non renseignée, l'impôt sur le revenu n'est pas estimé. */
  marginalTaxRate: number | null
  furnishedKind: FurnishedRentalKind
}

/** Les baux meublés (BIC) : meublé et colocation (supposée meublée). */
export function isFurnishedLease(leaseType: LeaseType): boolean {
  return leaseType !== 'unfurnished'
}

/** Le régime par défaut d'un bail : micro-foncier en vide, micro-BIC en meublé ou colocation. */
export function defaultRegime(leaseType: LeaseType): TaxRegime {
  return isFurnishedLease(leaseType) ? 'micro_bic' : 'micro_foncier'
}

const COUNTERPART: Record<TaxRegime, TaxRegime> = {
  micro_foncier: 'micro_bic',
  reel_foncier: 'lmnp_reel',
  micro_bic: 'micro_foncier',
  lmnp_reel: 'reel_foncier',
}

/** Vrai si le régime relève des BIC (location meublée). */
export function isBicRegime(regime: TaxRegime): boolean {
  return regime === 'micro_bic' || regime === 'lmnp_reel'
}

/**
 * Le régime retenu pour un bail : celui demandé s'il convient au bail, sinon
 * son équivalent (un régime BIC demandé pour un bail vide devient le régime
 * foncier correspondant, et inversement).
 */
export function resolveRegime(
  requested: TaxRegime | null,
  leaseType: LeaseType
): { regime: TaxRegime; adjusted: boolean } {
  if (requested === null)
    return { regime: defaultRegime(leaseType), adjusted: false }
  if (isBicRegime(requested) === isFurnishedLease(leaseType)) {
    return { regime: requested, adjusted: false }
  }
  return { regime: COUNTERPART[requested], adjusted: true }
}

/** Les régimes possibles pour un bail, micro d'abord. */
export function regimesFor(leaseType: LeaseType): TaxRegime[] {
  return isFurnishedLease(leaseType)
    ? ['micro_bic', 'lmnp_reel']
    : ['micro_foncier', 'reel_foncier']
}

/** Le régime micro-BIC applicable à la nature du meublé. */
export function microBicParams(
  params: TaxParameters,
  kind: FurnishedRentalKind
): { allowanceRate: number; receiptsCeiling: number } {
  if (kind === 'tourism_classified') return params.microBic.tourismClassified
  if (kind === 'tourism_unclassified')
    return params.microBic.tourismUnclassified
  return params.microBic.longTerm
}

/** Le plafond de recettes d'un régime micro ; null pour un régime réel. */
export function microCeiling(
  regime: TaxRegime,
  ctx: Pick<TaxContext, 'params' | 'furnishedKind'>
): number | null {
  if (regime === 'micro_foncier') return ctx.params.microFoncier.receiptsCeiling
  if (regime === 'micro_bic') {
    return microBicParams(ctx.params, ctx.furnishedKind).receiptsCeiling
  }
  return null
}

/** Consomme des reports dans l'ordre (le plus ancien d'abord), sans dépasser `amount`. */
function useCarries(
  carries: Carry[],
  amount: number,
  year: number
): { used: number; remaining: Carry[] } {
  let left = Math.max(0, amount)
  let used = 0
  const remaining: Carry[] = []
  for (const carry of carries) {
    if (carry.lastYear < year) continue
    const take = Math.min(left, carry.amount)
    used += take
    left -= take
    if (carry.amount - take > 0) {
      remaining.push({ amount: carry.amount - take, lastYear: carry.lastYear })
    }
  }
  return { used, remaining }
}

const live = (carries: Carry[], year: number): Carry[] =>
  carries.filter(c => c.lastYear >= year)

const total = (carries: Carry[]): number =>
  carries.reduce((sum, c) => sum + c.amount, 0)

/**
 * L'impôt estimé d'une année de location sous un régime demandé. Un régime
 * micro dont le plafond est dépassé bascule au réel pour l'année (signalé).
 */
export function rentalTaxYear(
  requested: TaxRegime,
  input: RentalTaxYearInput,
  state: TaxCarryState,
  ctx: TaxContext
): { tax: RentalTaxYear; state: TaxCarryState } {
  const { params } = ctx
  const year = state.year
  const notes: string[] = []
  let regime = requested
  const ceiling = microCeiling(requested, ctx)
  const eligible = ceiling === null || input.grossRent <= ceiling
  if (!eligible) {
    regime = requested === 'micro_foncier' ? 'reel_foncier' : 'lmnp_reel'
    notes.push(
      `Recettes de ${formatEuros(input.grossRent)} au-delà du plafond du régime micro (${formatEuros(ceiling ?? 0)}) : régime réel cette année.`
    )
  }

  let landDeficits = live(state.landDeficits, year)
  let bicDeficits = live(state.bicDeficits, year)
  if (landDeficits.length < state.landDeficits.length) {
    notes.push('Un déficit foncier reporté arrive à expiration.')
  }
  if (bicDeficits.length < state.bicDeficits.length) {
    notes.push('Un déficit BIC reporté arrive à expiration.')
  }
  let deferred = { ...state.deferredDepreciation }
  let deductedBuilding = state.deductedBuildingDepreciation
  let deductedFurniture = state.deductedFurnitureDepreciation
  // Chaque régime fixe l'abattement ou les charges, et le revenu imposable.
  let deductions: number
  let depreciation = 0
  let taxable: number
  let globalIncomeOffset = 0
  const gross = Math.max(0, input.grossRent)

  if (regime === 'micro_foncier') {
    deductions = gross * params.microFoncier.allowanceRate
    taxable = gross - deductions
  } else if (regime === 'micro_bic') {
    const micro = microBicParams(params, ctx.furnishedKind)
    deductions =
      gross > 0
        ? Math.min(
            gross,
            Math.max(
              params.microBic.minimumAllowance,
              gross * micro.allowanceRate
            )
          )
        : 0
    taxable = gross - deductions
  } else if (regime === 'reel_foncier') {
    const fee =
      input.rentedMonths > 0 ? params.realLand.managementFeePerUnit : 0
    const financial = input.interest + input.loanInsurance
    const other = input.operatingCosts + input.propertyTax + fee
    deductions = financial + other
    const afterFinancial = gross - financial
    let newCarry = 0
    let net = 0
    if (afterFinancial >= 0) {
      const afterOther = afterFinancial - other
      if (afterOther >= 0) {
        net = afterOther
      } else {
        globalIncomeOffset = Math.min(
          -afterOther,
          params.realLand.globalDeficitCap
        )
        newCarry = -afterOther - globalIncomeOffset
      }
    } else {
      globalIncomeOffset = Math.min(other, params.realLand.globalDeficitCap)
      newCarry = -afterFinancial + (other - globalIncomeOffset)
    }
    const used = useCarries(landDeficits, net, year)
    landDeficits = used.remaining
    taxable = net - used.used
    if (used.used > 0) {
      notes.push(
        `Déficit foncier antérieur imputé : ${formatEuros(used.used)}.`
      )
    }
    if (globalIncomeOffset > 0) {
      notes.push(
        `Déficit foncier de ${formatEuros(globalIncomeOffset)} imputé sur le revenu global (à condition de louer jusqu’au 31 décembre de la troisième année suivante).`
      )
    }
    if (newCarry > 0) {
      landDeficits = [
        ...landDeficits,
        {
          amount: newCarry,
          lastYear: year + params.realLand.deficitCarryForwardYears,
        },
      ]
      notes.push(
        `Déficit foncier reporté sur les revenus fonciers des ${params.realLand.deficitCarryForwardYears} années suivantes : ${formatEuros(newCarry)}.`
      )
    }
  } else {
    // LMNP réel : charges, puis déficits antérieurs, puis amortissements,
    // qui ne peuvent ni créer ni augmenter un déficit (CGI, art. 39 C).
    const expenses =
      input.operatingCosts +
      input.propertyTax +
      input.interest +
      input.loanInsurance
    deductions = expenses
    const result = gross - expenses
    deferred = {
      building: deferred.building + input.depreciation.building,
      furniture: deferred.furniture + input.depreciation.furniture,
    }
    if (result < 0) {
      bicDeficits = [
        ...bicDeficits,
        {
          amount: -result,
          lastYear: year + params.lmnpReal.deficitCarryForwardYears,
        },
      ]
      notes.push(`Déficit BIC reporté : ${formatEuros(-result)}.`)
      taxable = 0
    } else {
      const used = useCarries(bicDeficits, result, year)
      bicDeficits = used.remaining
      const afterDeficits = result - used.used
      const available = deferred.building + deferred.furniture
      depreciation = Math.min(afterDeficits, available)
      const share = available > 0 ? deferred.building / available : 0
      const building = depreciation * share
      const furniture = depreciation - building
      deferred = {
        building: deferred.building - building,
        furniture: deferred.furniture - furniture,
      }
      deductedBuilding += building
      deductedFurniture += furniture
      taxable = afterDeficits - depreciation
    }
    const stillDeferred = deferred.building + deferred.furniture
    if (stillDeferred > 0.005) {
      notes.push(
        `Amortissements différés (reportables sans limite) : ${formatEuros(stillDeferred)}.`
      )
    }
  }

  taxable = Math.max(0, taxable)
  const psRate = isBicRegime(regime)
    ? params.socialContributions.furnishedIncomeRate
    : params.socialContributions.landIncomeRate
  const socialContributions = taxable * psRate
  const tmi = ctx.marginalTaxRate
  const incomeTax = tmi === null ? null : (taxable - globalIncomeOffset) * tmi
  const nextState: TaxCarryState = {
    year: year + 1,
    landDeficits,
    bicDeficits,
    deferredDepreciation: deferred,
    deductedBuildingDepreciation: deductedBuilding,
    deductedFurnitureDepreciation: deductedFurniture,
  }
  return {
    tax: {
      regime,
      requestedRegime: requested,
      eligible,
      grossRent: gross,
      deductions,
      depreciation,
      taxableIncome: taxable,
      globalIncomeOffset,
      incomeTax,
      socialContributions,
      total: incomeTax === null ? null : incomeTax + socialContributions,
      carryForward:
        total(landDeficits) +
        total(bicDeficits) +
        deferred.building +
        deferred.furniture,
      notes,
    },
    state: nextState,
  }
}
