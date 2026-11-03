import { describe, expect, it } from 'vitest'
import { effectiveScopes, hasScope, scopesFromToken } from './mcp-scopes'

/** Un JWT non signé, juste pour la charge utile. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`
}

describe('scopesFromToken', () => {
  it('lit la revendication scope, en chaîne ou en tableau', () => {
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scope: 'listings:read openid' }))
    ).toEqual(['listings:read', 'openid'])
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scopes: ['listings:write'] }))
    ).toEqual(['listings:write'])
    expect(scopesFromToken(fakeJwt({ sub: 'u', scp: 'a,b' }))).toEqual([
      'a',
      'b',
    ])
  })

  it('rend null pour un jeton sans portée ou qui n’est pas un JWT', () => {
    expect(scopesFromToken(fakeJwt({ sub: 'u' }))).toBeNull()
    expect(scopesFromToken('e2e-token-richard')).toBeNull()
    expect(scopesFromToken('a.b.c')).toBeNull()
    expect(scopesFromToken('')).toBeNull()
  })
})

describe('hasScope / effectiveScopes', () => {
  it('un jeton muet a toutes les portées ; un jeton explicite seulement les siennes', () => {
    expect(hasScope(null, 'listings:write')).toBe(true)
    expect(hasScope(['listings:read'], 'listings:write')).toBe(false)
    expect(hasScope(['listings:read'], 'listings:read')).toBe(true)
    expect(effectiveScopes(null)).toEqual(['listings:read', 'listings:write'])
    expect(effectiveScopes(['openid', 'listings:read'])).toEqual([
      'listings:read',
    ])
    expect(effectiveScopes([])).toEqual([])
  })
})
