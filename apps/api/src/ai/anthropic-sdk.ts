import type Anthropic from '@anthropic-ai/sdk'
import type { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { lazyModule } from '../common/lazy-module'

/** Ce que l'API prend du SDK Anthropic : le client et ses erreurs, la sortie structurée. */
export interface AnthropicSdk {
  Anthropic: typeof Anthropic
  zodOutputFormat: typeof zodOutputFormat
}

/**
 * Le SDK Anthropic, chargé à la première extraction (ADR 0048) : environ
 * 140 ms de chargement que les autres démarrages à froid ne paient plus.
 */
export const anthropicSdk = lazyModule<AnthropicSdk>(() => {
  /* eslint-disable @typescript-eslint/no-require-imports -- chargement différé voulu */
  const sdk = require('@anthropic-ai/sdk') as { default: typeof Anthropic }
  const helpers = require('@anthropic-ai/sdk/helpers/zod') as {
    zodOutputFormat: typeof zodOutputFormat
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { Anthropic: sdk.default, zodOutputFormat: helpers.zodOutputFormat }
})
