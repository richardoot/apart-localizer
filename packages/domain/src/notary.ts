import type {
  Assumptions,
  ListingFinancials,
  NotaryFeesBreakdown,
  NotaryScale,
  NotaryScaleBand,
} from '@apart/contracts'

export interface NotaryScaleFeesInput {
  /** Prix de vente en euros, honoraires acquéreur déjà retirés (net vendeur). */
  price: number
  /**
   * Mobilier compris dans la vente, en euros : hors assiette des droits de
   * mutation. 0 par défaut. Le `furnitureValue` d'une annonce est du mobilier
   * à acheter pour louer meublé : il n'entre pas ici.
   */
  furniture?: number
  scale: NotaryScale
}

/**
 * Émoluments proportionnels par tranches cumulatives (article A444-91 du
 * code de commerce) : chaque tranche applique son taux à la part du prix
 * qu'elle contient. Hors TVA.
 */
export function notaryEmoluments(
  base: number,
  bands: readonly NotaryScaleBand[]
): number {
  let total = 0
  let lower = 0
  for (const band of bands) {
    if (base <= lower) break
    const upper = band.upTo ?? Number.POSITIVE_INFINITY
    total += (Math.min(base, upper) - lower) * band.rate
    lower = upper
  }
  return total
}

/**
 * Frais de notaire par barème (modèle § 2, lot E5) : droits de mutation
 * (droit départemental et ses frais d'assiette, taxe communale), émoluments
 * proportionnels avec TVA, contribution de sécurité immobilière (avec
 * minimum), débours et formalités en forfait. Renvoie le détail par poste.
 * Une assiette nulle ne coûte rien : il n'y a pas de vente.
 */
export function notaryFeesFromScale(
  input: NotaryScaleFeesInput
): NotaryFeesBreakdown {
  const { scale } = input
  const base = Math.max(0, input.price - Math.max(0, input.furniture ?? 0))
  if (base <= 0) {
    return {
      mode: 'scale',
      base: 0,
      transferTax: 0,
      emoluments: 0,
      emolumentsVat: 0,
      securityContribution: 0,
      disbursements: 0,
      total: 0,
      estimated: true,
    }
  }
  const departmental = base * scale.departmentalRate
  const transferTax =
    departmental * (1 + scale.collectionFeeRate) + base * scale.communalRate
  const emoluments = notaryEmoluments(base, scale.emolumentBands)
  const emolumentsVat = emoluments * scale.emolumentVatRate
  const securityContribution = Math.max(
    scale.securityContributionMinimum,
    base * scale.securityContributionRate
  )
  const disbursements = scale.disbursements
  return {
    mode: 'scale',
    base,
    transferTax,
    emoluments,
    emolumentsVat,
    securityContribution,
    disbursements,
    total:
      transferTax +
      emoluments +
      emolumentsVat +
      securityContribution +
      disbursements,
    estimated: true,
  }
}

/**
 * Détail des frais de notaire d'une annonce selon le mode des hypothèses :
 * taux forfaitaire sur le net vendeur (parité avec l'artefact, défaut) ou
 * barème. Dans les deux cas la valeur est une estimation (≈).
 */
export function notaryFeesDetail(
  input: ListingFinancials,
  a: Assumptions
): NotaryFeesBreakdown {
  const base = Math.max(0, input.price - input.buyerFees)
  if (a.notaryMode === 'scale') {
    return notaryFeesFromScale({ price: base, scale: a.notaryScale })
  }
  return {
    mode: 'rate',
    base,
    transferTax: null,
    emoluments: null,
    emolumentsVat: null,
    securityContribution: null,
    disbursements: null,
    total: a.notaryRate * base,
    estimated: true,
  }
}
