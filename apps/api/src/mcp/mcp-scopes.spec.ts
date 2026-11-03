import { describe, expect, it } from 'vitest'
import {
  effectiveScopes,
  hasScope,
  isApplicationScope,
  scopesFromToken,
} from './mcp-scopes'

/** Un JWT non signé, juste pour la charge utile. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`
}

describe('scopesFromToken', () => {
  it("lit les portées de l'application, en chaîne ou en tableau", () => {
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scope: 'listings:read openid' }))
    ).toEqual(['listings:read'])
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scopes: ['listings:write'] }))
    ).toEqual(['listings:write'])
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scp: 'listings:read,email' }))
    ).toEqual(['listings:read'])
  })

  it("garde une portée de l'application inconnue : elle ne donne aucun droit", () => {
    expect(
      scopesFromToken(fakeJwt({ sub: 'u', scope: 'listings:admin' }))
    ).toEqual(['listings:admin'])
    expect(
      effectiveScopes(
        scopesFromToken(fakeJwt({ sub: 'u', scope: 'listings:admin' }))
      )
    ).toEqual([])
  })

  it('rend null pour un jeton sans portée ou qui n’est pas un JWT', () => {
    expect(scopesFromToken(fakeJwt({ sub: 'u' }))).toBeNull()
    expect(scopesFromToken('e2e-token-richard')).toBeNull()
    expect(scopesFromToken('a.b.c')).toBeNull()
    expect(scopesFromToken('')).toBeNull()
  })

  it('rend null pour un jeton OAuth de GoTrue, qui ne porte que des portées OpenID', () => {
    // Charge utile réelle d'un jeton émis par le serveur OAuth 2.1 de
    // Supabase (CLI 3.0, GoTrue 2.197) : `email` par défaut, ou ce que le
    // client a demandé parmi les portées OpenID.
    for (const scope of ['email', 'openid email profile', 'offline_access']) {
      const token = fakeJwt({
        sub: 'u',
        role: 'authenticated',
        client_id: 'c',
        scope,
      })
      expect(scopesFromToken(token)).toBeNull()
      expect(effectiveScopes(scopesFromToken(token))).toEqual([
        'listings:read',
        'listings:write',
      ])
    }
  })
})

describe('isApplicationScope', () => {
  it('reconnaît le préfixe listings:', () => {
    expect(isApplicationScope('listings:read')).toBe(true)
    expect(isApplicationScope('listings:anything')).toBe(true)
    expect(isApplicationScope('email')).toBe(false)
    expect(isApplicationScope('openid')).toBe(false)
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
