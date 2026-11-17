import type Anthropic from '@anthropic-ai/sdk'
import type { AiConfig } from './ai.config'
import { anthropicSdk } from './anthropic-sdk'
import type { AnthropicSdk } from './anthropic-sdk'

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

/**
 * Le client réel n'est construit (et le SDK chargé) qu'au premier appel
 * (ADR 0048) : un démarrage à froid qui ne sert pas d'extraction ne le paie
 * pas.
 */
export function createAnthropicClient(
  config: AiConfig,
  load: () => Pick<AnthropicSdk, 'Anthropic'> = anthropicSdk
): AnthropicLike | null {
  const apiKey = config.apiKey
  if (!apiKey) return null
  let client: Anthropic | undefined
  const real = (): Anthropic =>
    (client ??= new (load().Anthropic)({ apiKey, maxRetries: 2 }))
  const parse = ((...args: Parameters<Anthropic['messages']['parse']>) =>
    real().messages.parse(...args)) as Anthropic['messages']['parse']
  return { messages: { parse } }
}
