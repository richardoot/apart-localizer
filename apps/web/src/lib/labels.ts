import {
  COMPLIANCE_CATEGORY_LABELS,
  FURNISHED_RENTAL_KIND_LABELS,
  TAX_REGIME_LABELS,
  DISCOUNT_CLASS_LABELS,
  LEASE_TYPE_LABELS,
  LISTING_STATUS_LABELS,
  OFFER_CHANNEL_LABELS,
  OFFER_RESPONSE_LABELS,
  RENOVATION_LEVEL_LABELS,
  RENTAL_VERDICT_LABELS,
  SENSITIVITY_AXIS_LABELS,
  TARGET_CRITERION_LABELS,
  VERDICT_LABELS,
} from '@apart/contracts'
import type {
  CheckLevel,
  DiscountClass,
  DpeClass,
  ListingSort,
  ListingStatus,
  OfferResponse,
  RentalVerdict,
  Verdict,
} from '@apart/contracts'
import type { ProfitabilityStatus } from '@apart/domain'

export {
  COMPLIANCE_CATEGORY_LABELS,
  FURNISHED_RENTAL_KIND_LABELS,
  TAX_REGIME_LABELS,
  DISCOUNT_CLASS_LABELS,
  LEASE_TYPE_LABELS,
  LISTING_STATUS_LABELS,
  OFFER_CHANNEL_LABELS,
  OFFER_RESPONSE_LABELS,
  RENOVATION_LEVEL_LABELS,
  RENTAL_VERDICT_LABELS,
  SENSITIVITY_AXIS_LABELS,
  TARGET_CRITERION_LABELS,
  VERDICT_LABELS,
}

/**
 * Les deux bases de calcul de la fiche (lot 9) : une valeur se compare au
 * prix affiché (« sur le prix ») ou porte sur le coût tout compris.
 */
export type CostBasis = 'price' | 'all_in'

export const COST_BASIS_LABELS: Record<CostBasis, string> = {
  price: 'sur le prix',
  all_in: 'tout compris',
}

export const COST_BASIS_HINTS: Record<CostBasis, string> = {
  price: 'se compare au prix affiché',
  all_in: 'prix + notaire + travaux + mobilier',
}

/** Symbole d'un verdict : il n'est jamais dit par la seule couleur. */
export const VERDICT_SYMBOLS: Record<Verdict, string> = {
  target: '✓',
  to_dig: '~',
  off_target: '✗',
}

/** Critères du verdict en échec, en clair. */
export const VERDICT_FAILURE_LABELS: Record<
  'gross_yield' | 'effort' | 'dpe',
  string
> = {
  gross_yield: 'rendement brut',
  effort: 'effort',
  dpe: 'DPE E, F ou G',
}

/** Critères du verdict manqués de peu, en clair. */
export const VERDICT_NEAR_MISS_LABELS: Record<
  'gross_yield' | 'effort' | 'dpe_unknown',
  string
> = {
  gross_yield: 'rendement brut',
  effort: 'effort',
  dpe_unknown: 'DPE inconnu',
}

/** État d'un contrôle de rentabilité (`profitabilityChecks` de `domain`). */
export const PROFITABILITY_STATUS_SYMBOLS: Record<ProfitabilityStatus, string> =
  {
    ok: '✓',
    near: '~',
    fail: '✗',
    not_retained: '',
  }

export const PROFITABILITY_STATUS_LABELS: Record<ProfitabilityStatus, string> =
  {
    ok: 'seuil atteint',
    near: 'manqué de peu',
    fail: 'en échec',
    not_retained: 'non retenu',
  }

/** Fond de la ligne d'un contrôle de rentabilité. */
export const PROFITABILITY_STATUS_CLASSES: Record<ProfitabilityStatus, string> =
  {
    ok: 'bg-good-soft',
    near: 'bg-warn-soft',
    fail: 'bg-bad-soft',
    not_retained: 'bg-surface-2',
  }

/** Encre de la valeur d'un contrôle de rentabilité. */
export const PROFITABILITY_STATUS_TEXT: Record<ProfitabilityStatus, string> = {
  ok: 'text-good',
  near: 'text-warn',
  fail: 'text-bad',
  not_retained: 'text-fg',
}

/** Classes Tailwind d'une classe de décote (≤ 0, ≤ 5 %, ≤ 10 %, au-delà). */
export const DISCOUNT_CLASS_CLASSES: Record<DiscountClass, string> = {
  in_target: 'bg-good-soft text-good',
  negotiable: 'bg-good-soft text-good',
  tight: 'bg-warn-soft text-warn',
  out_of_reach: 'bg-bad-soft text-bad',
}

/** Classes Tailwind de la réponse du vendeur à une offre. */
export const OFFER_RESPONSE_CLASSES: Record<OfferResponse, string> = {
  pending: 'bg-surface-2 text-muted',
  accepted: 'bg-good-soft text-good',
  refused: 'bg-bad-soft text-bad',
  counter_offer: 'bg-warn-soft text-warn',
}

/** Classes Tailwind (jetons de style.css) d'un verdict financier. */
export const VERDICT_CLASSES: Record<Verdict, string> = {
  target: 'bg-good-soft text-good',
  to_dig: 'bg-warn-soft text-warn',
  off_target: 'bg-bad-soft text-bad',
}

/** Couleur pleine d'un verdict, pour un marqueur de carte. */
export const VERDICT_COLORS: Record<Verdict, string> = {
  target: 'var(--good)',
  to_dig: 'var(--warn)',
  off_target: 'var(--bad)',
}

export const RENTAL_VERDICT_CLASSES: Record<RentalVerdict, string> = {
  compatible: 'bg-good-soft text-good',
  conditional: 'bg-warn-soft text-warn',
  incompatible: 'bg-bad-soft text-bad',
}

export const CHECK_LEVEL_CLASSES: Record<CheckLevel, string> = {
  ok: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
  unknown: 'text-muted',
}

/** Libellé d'un niveau de contrôle dans la checklist réglementaire. */
export const CHECK_LEVEL_LABELS: Record<CheckLevel, string> = {
  ok: 'conforme',
  warn: 'attention',
  bad: 'bloquant',
  unknown: 'à vérifier',
}

export const CHECK_LEVEL_SYMBOLS: Record<CheckLevel, string> = {
  ok: '✓',
  warn: '!',
  bad: '✕',
  unknown: '?',
}

export const STATUS_CLASSES: Record<ListingStatus, string> = {
  to_study: 'bg-surface-2 text-muted',
  to_visit: 'bg-accent-soft text-fg',
  visited: 'bg-accent-soft text-fg',
  offer_made: 'bg-good-soft text-good',
  offer_accepted: 'bg-good-soft text-good',
  offer_refused: 'bg-bad-soft text-bad',
  discarded: 'bg-surface-2 text-muted line-through',
  sold_or_withdrawn: 'bg-surface-2 text-muted line-through',
}

/** Couleur de fond d'une classe DPE et encre lisible dessus. */
export const DPE_CLASSES: Record<DpeClass, string> = {
  A: 'bg-dpe-a text-white',
  B: 'bg-dpe-b text-white',
  C: 'bg-dpe-c text-[var(--dpe-ink-light)]',
  D: 'bg-dpe-d text-[var(--dpe-ink-light)]',
  E: 'bg-dpe-e text-[var(--dpe-ink-light)]',
  F: 'bg-dpe-f text-white',
  G: 'bg-dpe-g text-white',
}

export const SORT_LABELS: Record<ListingSort, string> = {
  score: 'Meilleur verdict',
  grossYield: 'Rendement brut',
  netYield: 'Rendement net',
  effort: 'Effort mensuel',
  pricePerM2: 'Prix au m²',
  price: 'Prix',
  surface: 'Surface',
  rentalRank: 'Compatibilité location (phase 2)',
  opinion: 'Nos avis (moyenne)',
  createdAt: "Date d'ajout",
  discount: 'Décote nécessaire',
}

/** Communes de Bordeaux Métropole proposées dans le formulaire (liste ouverte). */
export const SUGGESTED_COMMUNES: readonly string[] = [
  'Talence',
  'Mérignac',
  'Pessac',
  'Bègles',
  'Bordeaux',
  'Le Bouscat',
  "Villenave-d'Ornon",
  'Gradignan',
]
