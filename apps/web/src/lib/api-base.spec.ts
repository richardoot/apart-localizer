import { describe, expect, it } from 'vitest'
import { apiProxyPath, apiPublicUrl, apiRequestBase } from './api-base'

describe('api-base (ADR 0048)', () => {
  it("prend l'API publique sans barre finale, localhost par défaut", () => {
    expect(apiPublicUrl({ VITE_API_URL: 'https://api.example.test/' })).toBe(
      'https://api.example.test'
    )
    expect(apiPublicUrl({})).toBe('http://localhost:3000')
    expect(apiPublicUrl({ VITE_API_URL: '  ' })).toBe('http://localhost:3000')
  })

  it('normalise le chemin de la réécriture', () => {
    expect(apiProxyPath({ VITE_API_PROXY_PATH: '/api' })).toBe('/api')
    expect(apiProxyPath({ VITE_API_PROXY_PATH: 'api/' })).toBe('/api')
    expect(apiProxyPath({ VITE_API_PROXY_PATH: '' })).toBeNull()
    expect(apiProxyPath({ VITE_API_PROXY_PATH: '/' })).toBeNull()
    expect(apiProxyPath({})).toBeNull()
  })

  it("refuse une adresse d'une autre origine comme chemin", () => {
    expect(
      apiProxyPath({ VITE_API_PROXY_PATH: 'https://api.example.test' })
    ).toBeNull()
    expect(
      apiProxyPath({ VITE_API_PROXY_PATH: '//api.example.test' })
    ).toBeNull()
  })

  it('fait passer les requêtes par la réécriture quand elle est donnée', () => {
    const env = {
      VITE_API_URL: 'https://api.example.test',
      VITE_API_PROXY_PATH: '/api',
    }
    expect(apiRequestBase(env)).toBe('/api')
    expect(apiPublicUrl(env)).toBe('https://api.example.test')
    expect(apiRequestBase({ VITE_API_URL: 'https://api.example.test' })).toBe(
      'https://api.example.test'
    )
  })
})
