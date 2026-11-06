import type { NegotiationBrief, TargetPrice } from '@apart/contracts'
import { formatEuros, formatPercent } from './format'

/**
 * Lot 19 : le texte de « Copier le brief de négociation » (onglet Négocier) :
 * le prix affiché, le prix cible et sa décote, l'offre suggérée et les
 * arguments factuels du brief de `domain`, à coller dans un message ou une
 * note. Aucun argument inventé : la liste est celle du brief. Pur.
 */
export function negotiationBriefText(input: {
  title: string
  price: number
  targetPrice: TargetPrice | null
  negotiation: NegotiationBrief | null
}): string {
  const target = input.targetPrice?.targetPrice ?? null
  const discount = input.targetPrice?.discount ?? null
  const offer = input.negotiation?.suggestedOffer ?? null
  const lines = [
    `Brief de négociation : ${input.title}`,
    `Prix affiché : ${formatEuros(input.price)}`,
  ]
  if (target !== null) {
    lines.push(
      `Prix cible : ${formatEuros(target)}${
        discount !== null && discount > 0
          ? ` (${formatPercent(discount)} sous le prix affiché)`
          : ''
      }`
    )
  }
  if (offer !== null) lines.push(`Offre suggérée : ${formatEuros(offer)}`)
  const args = input.negotiation?.arguments ?? []
  if (args.length) {
    lines.push('Arguments :', ...args.map(a => `- ${a.text}`))
  }
  return lines.join('\n')
}
