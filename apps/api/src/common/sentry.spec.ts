import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  sampleRate,
  scrubBreadcrumb,
  scrubPath,
  scrubUrl,
  sentryOptions,
} from './sentry'

describe('sentryOptions', () => {
  it('reste inerte sans DSN', () => {
    expect(sentryOptions({})).toBeUndefined()
    expect(sentryOptions({ SENTRY_DSN: '' })).toBeUndefined()
  })

  it("prend l'environnement Vercel, puis NODE_ENV, et anonymise les fils d'Ariane", () => {
    const options = sentryOptions({
      SENTRY_DSN: 'https://public@sentry.invalid/1',
      VERCEL_ENV: 'production',
      NODE_ENV: 'development',
      VERCEL_GIT_COMMIT_SHA: 'abc1234',
      SENTRY_TRACES_SAMPLE_RATE: '0.2',
    })
    expect(options?.environment).toBe('production')
    expect(options?.release).toBe('abc1234')
    expect(options?.tracesSampleRate).toBe(0.2)
    expect(options?.beforeBreadcrumb).toBe(scrubBreadcrumb)
    expect(
      sentryOptions({ SENTRY_DSN: 'https://x@s.invalid/1', NODE_ENV: 'test' })
        ?.environment
    ).toBe('test')
  })
})

describe('sampleRate', () => {
  it('accepte un nombre dans [0, 1] et retombe sur le défaut sinon', () => {
    expect(sampleRate(undefined)).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('0.5')).toBe(0.5)
    expect(sampleRate('0')).toBe(0)
    expect(sampleRate('2')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('abc', 0.3)).toBe(0.3)
  })
})

describe('scrub', () => {
  it('remplace les identifiants des chemins et retire la chaîne de requête', () => {
    expect(
      scrubPath('/listings/11111111-1111-4111-8111-111111111111/tasks?x=1')
    ).toBe('/listings/:id/tasks')
    expect(scrubPath('/health')).toBe('/health')
    expect(
      scrubUrl('https://api.example.invalid/listings/123456789?token=secret')
    ).toBe('https://api.example.invalid/listings/:id')
    expect(scrubUrl('not a url/123456789')).toBe('not a url/:id')
  })

  it('anonymise le fil d’Ariane HTTP et laisse les autres intacts', () => {
    const crumb = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://supabase.invalid/auth/v1/user?apikey=k' },
    })
    expect(crumb.data?.url).toBe('https://supabase.invalid/auth/v1/user')
    const other = scrubBreadcrumb({ category: 'console', message: 'x' })
    expect(other).toEqual({ category: 'console', message: 'x' })
  })
})
