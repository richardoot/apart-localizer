import { Module } from '@nestjs/common'
import { AI_CONFIG, ANTHROPIC_CLIENT, createAnthropicClient } from './ai-client'
import { AiService } from './ai.service'
import { aiConfig } from './ai.config'
import type { AiConfig } from './ai.config'

/**
 * L'IA : le client Anthropic (nul sans ANTHROPIC_API_KEY, l'application
 * fonctionne sans lui) et le service d'extraction. La clé n'est lue qu'ici,
 * côté serveur.
 */
@Module({
  providers: [
    { provide: AI_CONFIG, useFactory: (): AiConfig => aiConfig(process.env) },
    {
      provide: ANTHROPIC_CLIENT,
      inject: [AI_CONFIG],
      useFactory: (config: AiConfig) => createAnthropicClient(config),
    },
    AiService,
  ],
  exports: [AiService, AI_CONFIG],
})
export class AiModule {}
