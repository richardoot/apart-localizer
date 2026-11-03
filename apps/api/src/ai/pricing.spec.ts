import { describe, expect, it } from 'vitest'
import { estimateCostUsd, pricingFor } from './pricing'

describe('estimation du coût', () => {
  const usage = {
    inputTokens: 3000,
    outputTokens: 1000,
    cacheReadInputTokens: 2000,
    cacheCreationInputTokens: 0,
  }

  it('applique la grille du modèle par défaut', () => {
    // 3000 × 4 $ + 1000 × 20 $ + 2000 × 0,20 $ par million = 0,0324 $
    expect(estimateCostUsd('claude-opus-5-5', usage)).toBe(0.0324)
  })

  it('le modèle économique coûte quelques dix-millièmes', () => {
    // 3000 × 0,10 + 1000 × 0,50 + 2000 × 0,01 par million = 0,00082 → 0,0008
    expect(estimateCostUsd('claude-haiku-5-5', usage)).toBe(0.0008)
  })

  it('un modèle inconnu donne null, un préfixe connu est accepté', () => {
    expect(estimateCostUsd('modele-inconnu', usage)).toBeNull()
    expect(pricingFor('claude-opus-5-5-preview')?.input).toBe(4)
    expect(pricingFor('autre')).toBeNull()
  })
})
