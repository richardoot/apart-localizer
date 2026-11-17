import { describe, expect, it } from 'vitest'
import config from '../../vercel.json'

describe('vercel.json (ADR 0048)', () => {
  it("réécrit /api vers l'API avant le repli de l'application", () => {
    const rewrites: Array<{ source: string; destination: string }> =
      config.rewrites
    const api = rewrites.findIndex(r => r.source === '/api/:path*')
    const spa = rewrites.findIndex(r => r.source === '/(.*)')
    expect(api).toBeGreaterThanOrEqual(0)
    expect(api).toBeLessThan(spa)
    const destination = new URL(
      rewrites[api]?.destination.replace(':path*', 'listings') ?? ''
    )
    expect(destination.protocol).toBe('https:')
    expect(destination.pathname).toBe('/listings')
  })
})
