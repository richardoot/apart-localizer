import { describe, expect, it } from 'vitest'
import { aiConfig } from './ai.config'

describe('aiConfig', () => {
  it('sans clé : IA désactivée, modèles par défaut', () => {
    const config = aiConfig({ ANTHROPIC_API_KEY: '' })
    expect(config.apiKey).toBeNull()
    expect(config.model).toBe('claude-opus-5-5')
    expect(config.bulkModel).toBe('claude-haiku-5-5')
    expect(config.effort).toBe('medium')
    expect(config.maxImages).toBe(4)
    expect(config.maxImageBytes).toBe(5 * 1024 * 1024)
    expect(config.maxTokens).toBe(16_000)
  })

  it('lit les variables et plafonne la taille des captures', () => {
    const config = aiConfig({
      ANTHROPIC_API_KEY: 'sk-test',
      AI_MODEL: 'claude-sonnet-5-5',
      AI_MODEL_BULK: 'claude-haiku-5-5',
      AI_EFFORT: 'low',
      AI_MAX_IMAGES: '2',
      AI_MAX_IMAGE_MB: '1.5',
      AI_MAX_TOKENS: '8192',
    })
    expect(config.apiKey).toBe('sk-test')
    expect(config.model).toBe('claude-sonnet-5-5')
    expect(config.effort).toBe('low')
    expect(config.maxImages).toBe(2)
    expect(config.maxImageBytes).toBe(Math.round(1.5 * 1024 * 1024))
    expect(config.maxTokens).toBe(8192)
  })

  it('refuse une valeur hors bornes en nommant la variable', () => {
    expect(() => aiConfig({ AI_MAX_IMAGES: '50' })).toThrow('AI_MAX_IMAGES')
    expect(() => aiConfig({ AI_EFFORT: 'max' })).toThrow('AI_EFFORT')
  })
})
