import { describe, expect, it, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { ExtractionRequestSchema } from '@apart/contracts'
import {
  SAMPLE_LISTING_TEXT,
  emptyExtraction,
  fakeParsedMessage,
  sampleExtraction,
} from '../../test/fixtures/ai-extraction'
import type { AnthropicLike } from './ai-client'
import { aiConfig } from './ai.config'
import { AiService } from './ai.service'

const config = aiConfig({
  ANTHROPIC_API_KEY: 'sk-test',
  AI_MAX_IMAGES: '2',
  AI_MAX_IMAGE_MB: '0.1',
})

function service(parse: ReturnType<typeof vi.fn>) {
  const client = { messages: { parse } } as unknown as AnthropicLike
  return new AiService(client, config)
}

const request = ExtractionRequestSchema.parse({
  text: SAMPLE_LISTING_TEXT,
  url: 'https://agence-fictive.invalid/annonce/AGF-12345',
})

describe('AiService.extractListing', () => {
  it('appelle le modèle avec la sortie structurée, la réflexion adaptative et le cache, puis rend la lecture et le coût', async () => {
    const parse = vi.fn(() =>
      Promise.resolve(fakeParsedMessage(sampleExtraction()))
    )
    const outcome = await service(parse).extractListing(request)
    expect(outcome.raw.price.value).toBe(189_000)
    expect(outcome.usage).toMatchObject({
      model: 'claude-opus-5-5',
      inputTokens: 3200,
      outputTokens: 1400,
      cacheCreationInputTokens: 900,
      cacheReadInputTokens: 0,
    })
    // 3200 × 4 + 1400 × 20 + 900 × 5 par million = 0,0453 $
    expect(outcome.usage.estimatedCostUsd).toBe(0.0453)

    expect(parse).toHaveBeenCalledTimes(1)
    const params = (parse.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.max_tokens).toBe(16_000)
    expect(params.thinking).toEqual({ type: 'adaptive' })
    const outputConfig = params.output_config as {
      effort: string
      format: { type: string; schema: { properties: Record<string, unknown> } }
    }
    expect(outputConfig.effort).toBe('medium')
    expect(outputConfig.format.type).toBe('json_schema')
    expect(Object.keys(outputConfig.format.schema.properties)).toContain(
      'price'
    )
    const system = params.system as Array<{
      text: string
      cache_control: unknown
    }>
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' })
    expect(system[0]?.text).toContain('annonces immobilières')
    const messages = params.messages as Array<{
      role: string
      content: Array<{ type: string; text?: string }>
    }>
    expect(messages[0]?.role).toBe('user')
    const text = messages[0]?.content.find(b => b.type === 'text')?.text ?? ''
    expect(text).toContain(
      '<annonce_source url="https://agence-fictive.invalid/annonce/AGF-12345">'
    )
    expect(text).toContain('189 000 € FAI')
  })

  it('en qualité « fast », le modèle économique répond et les captures passent en blocs image', async () => {
    const parse = vi.fn(() =>
      Promise.resolve(
        fakeParsedMessage(emptyExtraction(), { model: 'claude-haiku-5-5' })
      )
    )
    const png = Buffer.from('capture').toString('base64')
    const outcome = await service(parse).extractListing(
      ExtractionRequestSchema.parse({
        images: [{ mediaType: 'image/png', data: png }],
        quality: 'fast',
      })
    )
    expect(outcome.usage.model).toBe('claude-haiku-5-5')
    expect(outcome.usage.estimatedCostUsd).toBeLessThan(0.01)
    const params = (parse.mock.calls[0] as unknown[])[0] as {
      model: string
      messages: Array<{ content: Array<Record<string, unknown>> }>
    }
    expect(params.model).toBe('claude-haiku-5-5')
    expect(params.messages[0]?.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: png },
    })
  })

  it('une réponse partiellement vide est rendue telle quelle (le mappeur en fait une fiche de repli)', async () => {
    const parse = vi.fn(() =>
      Promise.resolve(fakeParsedMessage(emptyExtraction()))
    )
    const outcome = await service(parse).extractListing(request)
    expect(outcome.raw.price.value).toBeNull()
    expect(outcome.raw.remarks).toEqual([])
  })

  it('un refus est relu par le modèle économique, puis refusé proprement (422)', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(
        fakeParsedMessage(null, {
          stopReason: 'refusal',
          refusalCategory: 'cyber',
        })
      )
      .mockResolvedValueOnce(
        fakeParsedMessage(null, {
          stopReason: 'refusal',
          model: 'claude-haiku-5-5',
        })
      )
    await expect(service(parse).extractListing(request)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("refusé d'analyser"),
    })
    expect(parse).toHaveBeenCalledTimes(2)
    expect(
      ((parse.mock.calls[1] as unknown[])[0] as { model: string }).model
    ).toBe('claude-haiku-5-5')
  })

  it('le repli réussit quand le second modèle répond', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(fakeParsedMessage(null, { stopReason: 'refusal' }))
      .mockResolvedValueOnce(
        fakeParsedMessage(sampleExtraction(), { model: 'claude-haiku-5-5' })
      )
    const outcome = await service(parse).extractListing(request)
    expect(outcome.usage.model).toBe('claude-haiku-5-5')
    expect(outcome.raw.title.value).toContain('T2 Talence')
  })

  it('une réponse tronquée ou hors schéma est une erreur 502', async () => {
    const truncated = vi.fn(() =>
      Promise.resolve(
        fakeParsedMessage(sampleExtraction(), { stopReason: 'max_tokens' })
      )
    )
    await expect(
      service(truncated).extractListing(request)
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('tronquée'),
    })
    const unparsed = vi.fn(() =>
      Promise.resolve(fakeParsedMessage(null, { parsedOutput: null }))
    )
    await expect(
      service(unparsed).extractListing(request)
    ).rejects.toMatchObject({ status: 502 })
    const invalid = vi.fn(() =>
      Promise.reject(
        new Anthropic.AnthropicError('Failed to parse structured output')
      )
    )
    await expect(
      service(invalid).extractListing(request)
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('inexploitable'),
    })
  })

  it('traduit les erreurs du SDK en 503 lisibles, de la plus précise à la plus générale', async () => {
    const headers = new Headers()
    const cases: Array<[Error, string]> = [
      [
        new Anthropic.AuthenticationError(401, {}, 'bad key', headers),
        'ANTHROPIC_API_KEY',
      ],
      [new Anthropic.RateLimitError(429, {}, 'slow down', headers), 'débit'],
      [
        new Anthropic.APIConnectionError({ message: 'ECONNRESET' }),
        'injoignable',
      ],
      [
        new Anthropic.InternalServerError(529, {}, 'overloaded', headers),
        '529',
      ],
    ]
    for (const [error, fragment] of cases) {
      const parse = vi.fn(() => Promise.reject(error))
      await expect(
        service(parse).extractListing(request)
      ).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining(fragment),
      })
    }
    const bad = vi.fn(() =>
      Promise.reject(
        new Anthropic.BadRequestError(
          400,
          { message: 'image too large' },
          'image too large',
          headers
        )
      )
    )
    await expect(service(bad).extractListing(request)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('image too large'),
    })
  })

  it('sans clé : 503 « IA non configurée », sans appel', async () => {
    const disabled = new AiService(null, config)
    expect(disabled.enabled).toBe(false)
    await expect(disabled.extractListing(request)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('IA non configurée'),
    })
  })

  it('applique les plafonds de configuration aux captures avant tout appel', async () => {
    const parse = vi.fn()
    const png = Buffer.from('x').toString('base64')
    await expect(
      service(parse).extractListing(
        ExtractionRequestSchema.parse({
          images: Array.from({ length: 3 }, () => ({
            mediaType: 'image/png',
            data: png,
          })),
        })
      )
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('2'),
    })
    const big = Buffer.alloc(200 * 1024, 1).toString('base64')
    await expect(
      service(parse).extractListing(
        ExtractionRequestSchema.parse({
          images: [{ mediaType: 'image/jpeg', data: big }],
        })
      )
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Mo'),
    })
    expect(parse).not.toHaveBeenCalled()
  })
})
