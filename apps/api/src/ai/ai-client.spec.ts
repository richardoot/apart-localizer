import { describe, expect, it, vi } from 'vitest'
import { createAnthropicClient } from './ai-client'
import { aiConfig } from './ai.config'

describe('createAnthropicClient', () => {
  it('rend null sans clé, sans charger le SDK', () => {
    const load = vi.fn()
    expect(createAnthropicClient(aiConfig({}), load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it("ne charge le SDK et ne construit le client qu'au premier appel", async () => {
    const parse = vi.fn(() => Promise.resolve({ ok: true }))
    const Anthropic = vi.fn(function (this: { messages: unknown }) {
      this.messages = { parse }
    })
    const load = vi.fn(() => ({ Anthropic }))
    const client = createAnthropicClient(
      aiConfig({ ANTHROPIC_API_KEY: 'sk-test' }),
      load as never
    )
    expect(client).not.toBeNull()
    expect(load).not.toHaveBeenCalled()
    await client?.messages.parse({ model: 'm' } as never)
    await client?.messages.parse({ model: 'm' } as never)
    expect(load).toHaveBeenCalledTimes(1)
    expect(Anthropic).toHaveBeenCalledTimes(1)
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-test', maxRetries: 2 })
    expect(parse).toHaveBeenCalledTimes(2)
  })
})
