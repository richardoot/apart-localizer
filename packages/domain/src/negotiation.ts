import type {
  Assumptions,
  DpeClass,
  NegotiationArgument,
  NegotiationBrief,
  NegotiationCriterion,
  OfferResponse,
  TargetPrice,
} from '@apart/contracts'
import { formatEuros, formatPercent } from './format.js'
import { DEFAULT_DPE_BAN_SCHEDULE } from './rental-checks.js'
import { classifyDiscount } from './target-price.js'

/** Ce que le brief lit d'une annonce et de son historique. */
export interface NegotiationListing {
  /** Prix affiché en euros. */
  price: number
  publishedAt: string | null
  /** Date d'ajout dans l'espace ; repli pour la durée en ligne. */
  createdAt: string | null
  dpeClass: DpeClass | null
  renovationTotal: number
  annualCharges: number | null
  surface: number | null
  priceEvents: ReadonlyArray<{
    occurredAt: string
    oldPrice: number | null
    newPrice: number
  }>
  offers: ReadonlyArray<{
    madeAt: string
    amount: number
    response: OfferResponse
    counterAmount: number | null
  }>
}

export interface NegotiationOptions {
  /** « Maintenant », injecté pour les tests. */
  now?: Date
  /** Durée en ligne à partir de laquelle elle devient un argument (30 jours). */
  minDaysOnline?: number
  /** Charges annuelles au m² à partir desquelles elles deviennent un argument (40 €/m²/an). */
  highChargesPerM2?: number
  banSchedule?: Readonly<Partial<Record<DpeClass, number>>>
}

export const MIN_DAYS_ONLINE = 30
export const HIGH_CHARGES_PER_M2 = 40

/** Arrondi au millier inférieur (prix d'offre). */
export function floorToThousand(value: number): number {
  return Math.floor(value / 1000) * 1000
}

const dateFr = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const daysBetween = (from: string, now: Date): number | null => {
  const start = Date.parse(from)
  if (!Number.isFinite(start)) return null
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000))
}

/**
 * Le brief de négociation (besoins N2, N5) : décote par critère et sa classe,
 * prix d'offre suggéré (critère liant arrondi au millier inférieur, jamais
 * au-dessus du prix affiché), marge entre l'offre et le prix cible, durée en
 * ligne, baisses passées, dernière offre, et des arguments factuels. Aucune
 * IA : fonction pure.
 */
export function negotiationBrief(
  listing: NegotiationListing,
  target: TargetPrice,
  a: Assumptions,
  options: NegotiationOptions = {}
): NegotiationBrief {
  const now = options.now ?? new Date()
  const minDays = options.minDaysOnline ?? MIN_DAYS_ONLINE
  const chargesThreshold = options.highChargesPerM2 ?? HIGH_CHARGES_PER_M2
  const schedule = options.banSchedule ?? DEFAULT_DPE_BAN_SCHEDULE
  const price = listing.price

  const criteria: NegotiationCriterion[] = target.criteria.map(c => ({
    criterion: c.criterion,
    active: c.active,
    maxPrice: c.maxPrice,
    discount: c.discount,
    discountClass: c.discount === null ? null : classifyDiscount(c.discount, a),
  }))

  let suggestedOffer: number | null = null
  if (target.targetPrice !== null && price > 0) {
    const floored = floorToThousand(Math.min(target.targetPrice, price))
    suggestedOffer = floored > 0 ? floored : null
  }
  const suggestedOfferDiscount =
    suggestedOffer !== null && price > 0
      ? (price - suggestedOffer) / price
      : null
  const marginToTarget =
    suggestedOffer !== null && target.targetPrice !== null
      ? target.targetPrice - suggestedOffer
      : null

  const since = listing.publishedAt
    ? ('published' as const)
    : listing.createdAt
      ? ('added' as const)
      : null
  const daysOnline = since
    ? daysBetween(
        (since === 'published' ? listing.publishedAt : listing.createdAt) ?? '',
        now
      )
    : null

  const events = [...listing.priceEvents].sort(
    (x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt)
  )
  const first = events[0]
  const firstPrice = first ? (first.oldPrice ?? first.newPrice) : null
  const dropCount = events.filter(
    e => e.oldPrice !== null && e.newPrice < e.oldPrice
  ).length
  const totalDrop = firstPrice !== null ? firstPrice - price : 0
  const totalDropRate =
    firstPrice !== null && firstPrice > 0 ? totalDrop / firstPrice : null

  const lastOfferRaw = [...listing.offers].sort(
    (x, y) => Date.parse(y.madeAt) - Date.parse(x.madeAt)
  )[0]
  const lastOffer = lastOfferRaw
    ? {
        amount: lastOfferRaw.amount,
        response: lastOfferRaw.response,
        counterAmount: lastOfferRaw.counterAmount,
        madeAt: lastOfferRaw.madeAt,
      }
    : null

  const args: NegotiationArgument[] = []
  if (target.discount !== null && target.discount <= 0 && target.targetPrice) {
    args.push({
      kind: 'in_target',
      text: `Déjà dans la cible au prix affiché : ${formatEuros(target.targetPrice - price)} de marge sous le prix cible (${formatPercent(-target.discount)}).`,
    })
  }
  if (daysOnline !== null && daysOnline >= minDays) {
    args.push({
      kind: 'time_on_market',
      text:
        since === 'published'
          ? `En ligne depuis ${daysOnline} jours sans vente.`
          : `Suivie depuis ${daysOnline} jours (date de publication inconnue : vérifier l'ancienneté réelle sur le portail).`,
    })
  }
  if (dropCount > 0 && firstPrice !== null && totalDrop > 0) {
    args.push({
      kind: 'price_drops',
      text: `Déjà ${dropCount} baisse${dropCount > 1 ? 's' : ''} de prix : −${formatEuros(totalDrop)} (${formatPercent(totalDropRate ?? 0)}) depuis le premier prix constaté (${formatEuros(firstPrice)}) : le vendeur a de la marge.`,
    })
  }
  const ban = listing.dpeClass ? schedule[listing.dpeClass] : undefined
  if (listing.dpeClass && ban !== undefined) {
    args.push({
      kind: 'dpe',
      text: `DPE ${listing.dpeClass} : location interdite à partir de ${ban}, travaux énergétiques à prévoir avant la mise en location${ban <= a.rentalYear ? ` (prévue en ${a.rentalYear})` : ''}.`,
    })
  }
  if (listing.renovationTotal > 0) {
    args.push({
      kind: 'renovation',
      text: `Travaux estimés à ${formatEuros(listing.renovationTotal)} : à déduire du prix, ils sont déjà comptés dans le coût total.`,
    })
  }
  if (
    listing.annualCharges !== null &&
    listing.surface !== null &&
    listing.surface > 0 &&
    listing.annualCharges / listing.surface > chargesThreshold
  ) {
    args.push({
      kind: 'charges',
      text: `Charges de copropriété élevées : ${formatEuros(listing.annualCharges)}/an, soit ${formatEuros(listing.annualCharges / listing.surface)}/m²/an.`,
    })
  }
  if (lastOffer) {
    args.push({
      kind: 'previous_offer',
      text: describeLastOffer(lastOffer, target.targetPrice),
    })
  }

  return {
    listedPrice: price,
    targetPrice: target.targetPrice,
    bindingCriterion: target.bindingCriterion,
    discount: target.discount,
    discountClass: target.discountClass,
    criteria,
    suggestedOffer,
    suggestedOfferDiscount,
    marginToTarget,
    daysOnline,
    daysOnlineSince: daysOnline === null ? null : since,
    priceDrops: { count: dropCount, firstPrice, totalDrop, totalDropRate },
    lastOffer,
    arguments: args,
  }
}

function describeLastOffer(
  offer: NonNullable<NegotiationBrief['lastOffer']>,
  targetPrice: number | null
): string {
  const when = dateFr(offer.madeAt)
  switch (offer.response) {
    case 'accepted':
      return `Offre de ${formatEuros(offer.amount)} acceptée (${when}).`
    case 'refused':
      return `Offre de ${formatEuros(offer.amount)} refusée le ${when} : proposer plus haut ou étayer davantage.`
    case 'counter_offer': {
      const counter = offer.counterAmount
      if (counter === null) {
        return `Contre-proposition du vendeur (montant inconnu) à l'offre de ${formatEuros(offer.amount)} du ${when}.`
      }
      const position =
        targetPrice === null
          ? ''
          : counter <= targetPrice
            ? ', sous le prix cible : acceptable'
            : `, ${formatEuros(counter - targetPrice)} au-dessus du prix cible`
      return `Contre-proposition du vendeur à ${formatEuros(counter)}${position} (offre de ${formatEuros(offer.amount)} le ${when}).`
    }
    default:
      return `Offre de ${formatEuros(offer.amount)} en attente de réponse depuis le ${when}.`
  }
}
