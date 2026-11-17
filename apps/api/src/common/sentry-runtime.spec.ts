import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureException,
  resetSentryForTests,
  sentryModules,
  startSentry,
} from './sentry-runtime'

function fakeSdk() {
  return {
    init: vi.fn(),
    prismaIntegration: vi.fn(() => ({ name: 'Prisma' })),
    captureException: vi.fn(() => 'event-id'),
  }
}

function fakeSetup() {
  return {
    SentryModule: { forRoot: vi.fn(() => ({ module: class SentryModule {} })) },
  }
}

afterEach(() => resetSentryForTests())

describe('startSentry', () => {
  it('ne charge pas le SDK sans DSN, ni son module Nest', () => {
    const load = vi.fn(fakeSdk)
    const loadSetup = vi.fn(fakeSetup)
    expect(startSentry({ NODE_ENV: 'production' }, load as never)).toBeNull()
    expect(load).not.toHaveBeenCalled()
    expect(sentryModules(loadSetup as never)).toEqual([])
    expect(loadSetup).not.toHaveBeenCalled()
  })

  it('sans DSN, une erreur ne part nulle part et ne plante pas', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow()
  })

  it('avec un DSN, démarre le SDK, son module Nest et envoie les erreurs', () => {
    const sdk = fakeSdk()
    const setup = fakeSetup()
    const started = startSentry(
      {
        SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
        VERCEL_ENV: 'production',
      },
      () => sdk as never
    )
    expect(started).toBe(sdk)
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@o1.ingest.sentry.io/1',
        environment: 'production',
        integrations: [{ name: 'Prisma' }],
      })
    )
    expect(sentryModules(() => setup as never)).toHaveLength(1)
    expect(setup.SentryModule.forRoot).toHaveBeenCalledTimes(1)
    const error = new Error('boom')
    captureException(error, { tags: { requestId: 'r1' } })
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      tags: { requestId: 'r1' },
    })
  })
})
