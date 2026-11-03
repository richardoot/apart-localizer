import Anthropic from '@anthropic-ai/sdk'
import type { AiConfig } from './ai.config'

/**
 * Le client Anthropic, ou `null` quand la clé n'est pas configurée. Déclaré
 * derrière un jeton d'injection pour que les tests le remplacent par un
 * faux et n'atteignent jamais le réseau. Seule la méthode utilisée est
 * exigée du type, pour qu'un faux tienne en quelques lignes.
 */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT')
export const AI_CONFIG = Symbol('AI_CONFIG')

export interface AnthropicLike {
  messages: Pick<Anthropic['messages'], 'parse'>
}

export function createAnthropicClient(config: AiConfig): AnthropicLike | null {
  if (!config.apiKey) return null
  return new Anthropic({ apiKey: config.apiKey, maxRetries: 2 })
}
