import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_STYLE_URL, RADIUS_STEPS, mapStyleUrl } from './map-style'

describe('mapStyleUrl', () => {
  it('prend OpenFreeMap sans clé par défaut et respecte la variable', () => {
    expect(mapStyleUrl({})).toBe(DEFAULT_MAP_STYLE_URL)
    expect(mapStyleUrl({ VITE_MAP_STYLE_URL: '  ' })).toBe(
      DEFAULT_MAP_STYLE_URL
    )
    expect(
      mapStyleUrl({
        VITE_MAP_STYLE_URL: 'https://tiles.example.invalid/s.json',
      })
    ).toBe('https://tiles.example.invalid/s.json')
    expect(DEFAULT_MAP_STYLE_URL).not.toMatch(/key=|token=/)
  })

  it('propose des rayons croissants dans les bornes du filtre', () => {
    expect([...RADIUS_STEPS]).toEqual([...RADIUS_STEPS].sort((a, b) => a - b))
    expect(RADIUS_STEPS[0]).toBeGreaterThanOrEqual(1)
    expect(RADIUS_STEPS.at(-1)).toBeLessThanOrEqual(50_000)
  })
})
