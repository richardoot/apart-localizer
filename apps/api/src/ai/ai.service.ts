import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { AiListingExtractionSchema, base64Bytes } from '@apart/contracts'
import type {
  AiListingExtraction,
  ExtractionRequest,
  ExtractionUsage,
} from '@apart/contracts'
import { AI_CONFIG, ANTHROPIC_CLIENT } from './ai-client'
import type { AnthropicLike } from './ai-client'
import type { AiConfig } from './ai.config'
import {
  AiBadResponseException,
  AiNotConfiguredException,
  AiRefusedException,
  AiUnavailableException,
} from './ai.errors'
import { EXTRACTION_SYSTEM_PROMPT, buildUserContent } from './extraction.prompt'
import { estimateCostUsd } from './pricing'

/** Ce que le modèle a lu, et ce que l'appel a coûté. */
export interface AiExtractionOutcome {
  raw: AiListingExtraction
  usage: ExtractionUsage
}

/**
 * L'appel au modèle : sortie structurée par le schéma `AiListingExtraction`
 * de `contracts`, réflexion adaptative, invite système mise en cache. Le
 * client est injecté (nul sans clé) ; les erreurs du SDK et les arrêts
 * anormaux (refus, troncature) deviennent des erreurs métier lisibles.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicLike | null,
    @Inject(AI_CONFIG) private readonly config: AiConfig
  ) {}

  /** Vrai quand une clé est configurée. */
  get enabled(): boolean {
    return this.client !== null
  }

  /** Le modèle retenu pour une qualité demandée. */
  modelFor(quality: ExtractionRequest['quality']): string {
    return quality === 'fast' ? this.config.bulkModel : this.config.model
  }

  async extractListing(
    request: ExtractionRequest
  ): Promise<AiExtractionOutcome> {
    if (!this.client) throw new AiNotConfiguredException()
    this.checkImages(request)
    const model = this.modelFor(request.quality)
    const startedAt = Date.now()
    let response = await this.call(this.client, model, request)
    if (response.stop_reason === 'refusal' && model !== this.config.bulkModel) {
      // Repli : un second modèle relit une fois avant de renoncer.
      this.logger.warn(
        `Refus du modèle ${model} (${response.stop_details?.category ?? 'sans catégorie'}) ; relecture par ${this.config.bulkModel}`
      )
      response = await this.call(this.client, this.config.bulkModel, request)
    }
    const usage = usageOf(response, Date.now() - startedAt)
    if (response.stop_reason === 'refusal') {
      throw new AiRefusedException(response.stop_details?.category ?? null)
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiBadResponseException(
        'réponse tronquée (max_tokens) ; réduis le texte collé ou le nombre de captures.'
      )
    }
    if (!response.parsed_output) {
      throw new AiBadResponseException(
        'aucune fiche structurée dans la réponse.'
      )
    }
    return { raw: response.parsed_output, usage }
  }

  private checkImages(request: ExtractionRequest): void {
    if (request.images.length > this.config.maxImages) {
      throw new BadRequestException(
        `Au plus ${this.config.maxImages} capture${this.config.maxImages > 1 ? 's' : ''} par analyse (AI_MAX_IMAGES).`
      )
    }
    for (const image of request.images) {
      if (base64Bytes(image.data) > this.config.maxImageBytes) {
        throw new BadRequestException(
          `Une capture dépasse ${Math.round(this.config.maxImageBytes / 1024 / 1024)} Mo (AI_MAX_IMAGE_MB).`
        )
      }
    }
  }

  private async call(
    client: AnthropicLike,
    model: string,
    request: ExtractionRequest
  ) {
    try {
      return await client.messages.parse({
        model,
        max_tokens: this.config.maxTokens,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: this.config.effort,
          format: zodOutputFormat(AiListingExtractionSchema),
        },
        system: [
          {
            type: 'text',
            text: EXTRACTION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: buildUserContent(request) }],
      })
    } catch (error) {
      throw translate(error)
    }
  }
}

function usageOf(
  response: Anthropic.Message,
  durationMs: number
): ExtractionUsage {
  const tokens = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
  }
  return {
    model: response.model,
    ...tokens,
    estimatedCostUsd: estimateCostUsd(response.model, tokens),
    durationMs,
  }
}

/** Du plus précis au plus général : le SDK distingue les causes, l'appelant aussi. */
function translate(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiUnavailableException(
      'clé refusée par Anthropic ; vérifie ANTHROPIC_API_KEY.'
    )
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiUnavailableException(
      'accès refusé par Anthropic pour ce modèle ou cette organisation.'
    )
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiUnavailableException(
      'limite de débit atteinte ; réessaie dans une minute.'
    )
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiBadResponseException(
      `requête refusée par Anthropic (${error.message}).`
    )
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiUnavailableException('Anthropic est injoignable ; réessaie.')
  }
  if (error instanceof Anthropic.APIError) {
    return new AiUnavailableException(
      `Anthropic a répondu ${error.status ?? 'sans statut'} ; réessaie.`
    )
  }
  if (error instanceof Anthropic.AnthropicError) {
    return new AiBadResponseException(error.message)
  }
  return error instanceof Error ? error : new Error(String(error))
}
