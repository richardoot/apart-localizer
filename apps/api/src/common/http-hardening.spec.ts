import { describe, it, expect } from 'vitest'
import { apiDocsEnabled, helmetOptions } from './http-hardening'

describe('apiDocsEnabled', () => {
  it('serves the docs outside production, never in production unless API_DOCS=1', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(apiDocsEnabled({})).toBe(true)
    expect(apiDocsEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: '1' })).toBe(true)
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(
      false
    )
  })
})

describe('helmetOptions', () => {
  it('relaxes CSP while the docs are served and denies every source otherwise', () => {
    expect(helmetOptions(true).contentSecurityPolicy).toBe(false)
    expect(helmetOptions(false).contentSecurityPolicy).toEqual({
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    })
    expect('frameguard' in helmetOptions(false)).toBe(false)
  })
})
