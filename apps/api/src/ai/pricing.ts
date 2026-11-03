import type { ExtractionUsage } from '@apart/contracts'

/**
 * Grille tarifaire indicative, en dollars par million de jetons, pour
 * estimer le coût d'une analyse et le journaliser. Lecture de cache à 5 %
 * du prix d'entrée sur les modèles 5.x, écriture de cache à 125 %.
 * À tenir à jour avec la page de tarifs d'Anthropic ; un modèle inconnu
 * donne un coût `null`, jamais un chiffre inventé.
 */
export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
}

export function pricingFor(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const known = Object.keys(MODEL_PRICING).find(id => model.startsWith(id))
  return known ? (MODEL_PRICING[known] ?? null) : null
}

export type TokenUsage = Pick<
  ExtractionUsage,
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadInputTokens'
  | 'cacheCreationInputTokens'
>

/** Coût estimé en dollars, arrondi au dix-millième ; null si le modèle est inconnu. */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage
): number | null {
  const pricing = pricingFor(model)
  if (!pricing) return null
  const perToken = 1 / 1_000_000
  const cost =
    usage.inputTokens * pricing.input * perToken +
    usage.outputTokens * pricing.output * perToken +
    usage.cacheReadInputTokens * pricing.cacheRead * perToken +
    usage.cacheCreationInputTokens * pricing.cacheWrite * perToken
  return Math.round(cost * 10_000) / 10_000
}
