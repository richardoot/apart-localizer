import { describe, expect, it } from 'vitest'
import {
  authorizationServerMetadataUrl,
  authorizationServerUrl,
  protectedResourceMetadata,
  publicOrigin,
  resourceUrl,
  wwwAuthenticate,
} from './discovery'
import type { RequestLike } from './discovery'

const req = (
  host = 'api.example.invalid',
  protocol = 'https'
): RequestLike => ({
  protocol,
  get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined),
})

describe('découverte OAuth', () => {
  it("déduit l'origine de la requête, ou de MCP_PUBLIC_URL quand elle est donnée", () => {
    expect(publicOrigin(req(), {})).toBe('https://api.example.invalid')
    expect(publicOrigin(req('localhost:3000', 'http'), {})).toBe(
      'http://localhost:3000'
    )
    expect(
      publicOrigin(req(), { MCP_PUBLIC_URL: 'https://api.prod.invalid/mcp' })
    ).toBe('https://api.prod.invalid')
    expect(publicOrigin(req(), { MCP_PUBLIC_URL: 'nope' })).toBe(
      'https://api.example.invalid'
    )
    expect(publicOrigin({ protocol: 'http', get: () => undefined }, {})).toBe(
      'http://localhost:3000'
    )
  })

  it("nomme la ressource protégée : l'endpoint /mcp", () => {
    expect(resourceUrl(req(), {})).toBe('https://api.example.invalid/mcp')
    expect(
      resourceUrl(req(), { MCP_PUBLIC_URL: 'https://api.prod.invalid' })
    ).toBe('https://api.prod.invalid/mcp')
    expect(
      resourceUrl(req(), { MCP_PUBLIC_URL: 'https://api.prod.invalid/v2/mcp' })
    ).toBe('https://api.prod.invalid/v2/mcp')
  })

  it("pointe le serveur d'autorisation vers GoTrue à l'URL externe", () => {
    expect(authorizationServerUrl({ SUPABASE_URL: 'http://kong:8000/' })).toBe(
      'http://kong:8000/auth/v1'
    )
    expect(
      authorizationServerUrl({
        SUPABASE_URL: 'http://kong:8000',
        SUPABASE_EXTERNAL_URL: 'https://xyz.supabase.co',
      })
    ).toBe('https://xyz.supabase.co/auth/v1')
    expect(
      authorizationServerMetadataUrl({ SUPABASE_URL: 'https://s.invalid' })
    ).toBe('https://s.invalid/auth/v1/.well-known/oauth-authorization-server')
  })

  it('publie les métadonnées de ressource avec les deux portées', () => {
    const metadata = protectedResourceMetadata(req(), {
      SUPABASE_URL: 'https://xyz.supabase.co',
    })
    expect(metadata).toMatchObject({
      resource: 'https://api.example.invalid/mcp',
      authorization_servers: ['https://xyz.supabase.co/auth/v1'],
      scopes_supported: ['listings:read', 'listings:write'],
      bearer_methods_supported: ['header'],
    })
  })

  it('construit WWW-Authenticate avec le lien de découverte', () => {
    expect(wwwAuthenticate(req(), {})).toBe(
      'Bearer resource_metadata="https://api.example.invalid/.well-known/oauth-protected-resource"'
    )
    expect(wwwAuthenticate(req(), {}, 'invalid_token')).toContain(
      'error="invalid_token"'
    )
  })
})
