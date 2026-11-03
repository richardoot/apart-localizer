import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/vue', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  vueIntegration: vi.fn(() => ({ name: 'vue' })),
  browserTracingIntegration: vi.fn(() => ({ name: 'tracing' })),
}))

import * as Sentry from '@sentry/vue'
import { apiOrigin, sampleRate, sentryOptions, setSentryUser } from './sentry'

describe('sentryOptions', () => {
  it('reste inerte sans DSN', () => {
    expect(sentryOptions({})).toBeUndefined()
    expect(sentryOptions({ VITE_SENTRY_DSN: '' })).toBeUndefined()
  })

  it("trace vers l'API seulement et prend l'environnement Vercel", () => {
    const options = sentryOptions({
      VITE_SENTRY_DSN: 'https://k@o.ingest.sentry.invalid/1',
      VITE_API_URL: 'https://api.example.invalid/v1/',
      VITE_VERCEL_ENV: 'preview',
      MODE: 'production',
      VITE_SENTRY_TRACES_SAMPLE_RATE: '0.5',
    })
    expect(options?.environment).toBe('preview')
    expect(options?.tracesSampleRate).toBe(0.5)
    expect(options?.tracePropagationTargets).toEqual([
      'https://api.example.invalid',
    ])
  })

  it('taux et origine de repli', () => {
    expect(sampleRate('x')).toBe(1)
    expect(sampleRate('0.1')).toBe(0.1)
    expect(apiOrigin('nope')).toBe('http://localhost:3000')
    expect(apiOrigin(undefined)).toBe('http://localhost:3000')
  })

  it("connaît l'utilisateur par son identifiant seulement", () => {
    setSentryUser('u1')
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'u1' })
    setSentryUser(null)
    expect(Sentry.setUser).toHaveBeenLastCalledWith(null)
  })
})
