import type {
  Assumptions,
  ListingCriteriaFit,
  ListingMetrics,
  TargetPrice,
} from '@apart/contracts'
import { fitReasonsText, marketGap } from '@apart/domain'
import { formatEuros, formatEurosPerMonth } from './format'
import type { ListingTab } from './listing-tabs'

/**
 * Lot 19 (ADR 0029) : les textes de la Synthèse (« Faut-il y aller ? »),
 * mis en forme à partir des calculs de `domain` : les quatre chiffres qui
 * ouvrent leur onglet, la ligne de l'adéquation aux critères. Aucun calcul
 * ici, seulement des phrases ; rien d'inventé.
 */

export interface KeyFigure {
  key: 'price' | 'total_cost' | 'payment' | 'target_price'
  label: string
  value: string
  /** La précision sous le chiffre ; null s'il n'y a rien à dire. */
  sub: string | null
  /** L'onglet qui détaille le chiffre. */
  tab: ListingTab
  /** Le prix cible se détache (fond accent). */
  accent: boolean
}

/** « 3 % » d'une fraction, arrondi à l'entier. */
function wholePercent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100).toLocaleString('fr-FR')} %`
}

/**
 * Les quatre chiffres de la Synthèse : prix affiché (et son écart aux ventes
 * du quartier), coût tout compris, mensualité, prix cible.
 */
export function keyFigures(input: {
  metrics: ListingMetrics
  targetPrice: TargetPrice | null
  assumptions: Assumptions | null
  /** La médiane DVF de l'instantané (€/m²), null si inconnue. */
  medianPricePerM2: number | null
}): KeyFigure[] {
  const m = input.metrics
  const gap = marketGap(m.pricePerM2, input.medianPricePerM2)
  const priceSub =
    gap === null
      ? 'ventes du quartier inconnues'
      : Math.round(gap * 100) === 0
        ? 'au prix des ventes du quartier'
        : `${gap > 0 ? '+' : '−'}${wholePercent(gap)} sur les ventes du quartier`
  const costParts = [
    `notaire ${m.notaryFeesDetail.estimated ? '≈ ' : ''}${formatEuros(m.notaryFees)}`,
    m.renovationTotal > 0 ? `travaux ${formatEuros(m.renovationTotal)}` : null,
    m.furnitureValue > 0 ? `mobilier ${formatEuros(m.furnitureValue)}` : null,
  ].filter(Boolean)
  const a = input.assumptions
  const target = input.targetPrice?.targetPrice ?? null
  const discount = input.targetPrice?.discount ?? null
  const targetSub =
    target === null
      ? 'non calculable : loyer visé à renseigner'
      : discount !== null && discount > 0
        ? `−${wholePercent(discount)} : « Cible » jusqu’à ce prix`
        : 'le prix affiché est déjà dans la cible'
  return [
    {
      key: 'price',
      label: 'Prix affiché',
      value: formatEuros(m.price),
      sub: priceSub,
      tab: 'negocier',
      accent: false,
    },
    {
      key: 'total_cost',
      label: 'Coût tout compris',
      value: formatEuros(m.totalCost),
      sub: `dont ${costParts.join(', ')}`,
      tab: 'budget',
      accent: false,
    },
    {
      key: 'payment',
      label: 'Mensualité',
      value: formatEurosPerMonth(m.monthlyPayment),
      sub: a
        ? `${a.durationYears} ans, apport ${formatEuros(a.downPayment)}`
        : null,
      tab: 'budget',
      accent: false,
    },
    {
      key: 'target_price',
      label: 'Prix cible',
      value: target === null ? '—' : formatEuros(target),
      sub: targetSub,
      tab: 'negocier',
      accent: true,
    },
  ]
}

/**
 * L'adéquation en une ligne : le meilleur critère et ce qui le fait, ou ce
 * qu'il manque. Le détail par critère se déplie à côté.
 */
export function fitLine(fit: ListingCriteriaFit): string {
  if (fit.activeCriteria === 0) {
    return 'Aucun critère actif : crées-en un pour la comparer à ce que tu cherches.'
  }
  const name = fit.name ? `« ${fit.name} »` : 'Le meilleur critère'
  if (fit.level === 'in') {
    const best = fit.criteria.find(c => c.criteriaId === fit.criteriaId)
    const values = (best?.checks ?? [])
      .filter(c => c.level === 'in' && c.value)
      .slice(0, 3)
      // Lot 25 : un sigle en tête (« DPE ») garde ses majuscules.
      .map(c =>
        /^\p{Lu}{2}/u.test(c.label)
          ? `${c.label} (${c.value})`
          : `${c.label.charAt(0).toLowerCase()}${c.label.slice(1)} (${c.value})`
      )
    return values.length
      ? `${name} : ${values.join(', ')}.`
      : `${name} : tous les filtres sont respectés.`
  }
  const reasons = fitReasonsText(fit.reasons)
  return reasons ? `${name} : ${reasons}.` : `${name}.`
}
