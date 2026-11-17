import { describe, expect, it } from 'vitest'
import { TOKEN_CACHE_TTL_MS, TokenCache, tokenExpiry } from './token-cache'

/** Un JWT non signé avec ce `exp` (secondes) : seul le champ compte ici. */
function jwt(exp?: number, extra = ''): string {
  const payload = Buffer.from(
    JSON.stringify(exp === undefined ? { sub: extra } : { exp, sub: extra })
  ).toString('base64url')
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`
}

describe('tokenExpiry', () => {
  it('lit `exp` en millisecondes', () => {
    expect(tokenExpiry(jwt(1_800_000_000))).toBe(1_800_000_000_000)
  })

  it('rend null sans champ lisible', () => {
    expect(tokenExpiry('pas-un-jwt')).toBeNull()
    expect(tokenExpiry('a.%%%.c')).toBeNull()
    expect(tokenExpiry(jwt())).toBeNull()
  })
})

describe('TokenCache', () => {
  function clock(start = 1_000_000) {
    let now = start
    return { now: () => now, advance: (ms: number) => (now += ms) }
  }

  it('garde un jeton validé une minute au plus', () => {
    const time = clock()
    const cache = new TokenCache<string>({ now: time.now })
    const token = jwt(Math.floor(time.now() / 1000) + 3600)
    cache.set(token, 'alice')
    expect(cache.get(token)).toBe('alice')
    time.advance(TOKEN_CACHE_TTL_MS - 1)
    expect(cache.get(token)).toBe('alice')
    time.advance(1)
    expect(cache.get(token)).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('ne garde jamais un jeton au-delà de son expiration', () => {
    const time = clock(10_000_000)
    const cache = new TokenCache<string>({ now: time.now })
    const token = jwt(Math.floor(time.now() / 1000) + 10)
    cache.set(token, 'alice')
    time.advance(10_000)
    expect(cache.get(token)).toBeUndefined()
  })

  it('ne garde pas un jeton déjà expiré', () => {
    const time = clock(10_000_000)
    const cache = new TokenCache<string>({ now: time.now })
    cache.set(jwt(Math.floor(time.now() / 1000) - 1), 'alice')
    expect(cache.size).toBe(0)
  })

  it('ne confond pas deux jetons', () => {
    const cache = new TokenCache<string>()
    cache.set(jwt(undefined, 'a'), 'alice')
    expect(cache.get(jwt(undefined, 'b'))).toBeUndefined()
  })

  it('écarte les expirés puis les plus anciens quand il est plein', () => {
    const time = clock()
    const cache = new TokenCache<string>({ now: time.now, maxEntries: 2 })
    cache.set(jwt(undefined, 'a'), 'a')
    time.advance(TOKEN_CACHE_TTL_MS)
    cache.set(jwt(undefined, 'b'), 'b')
    cache.set(jwt(undefined, 'c'), 'c')
    expect(cache.size).toBe(2)
    expect(cache.get(jwt(undefined, 'b'))).toBe('b')
    cache.set(jwt(undefined, 'd'), 'd')
    expect(cache.get(jwt(undefined, 'b'))).toBeUndefined()
    expect(cache.get(jwt(undefined, 'c'))).toBe('c')
    expect(cache.get(jwt(undefined, 'd'))).toBe('d')
  })
})
