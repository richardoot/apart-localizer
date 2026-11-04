import { describe, expect, it } from 'vitest'
import {
  ADDRESS_ZOOM,
  COMMUNE_ZOOM,
  DEFAULT_MAP_STYLE_URL,
  DEFAULT_MAP_ZOOM,
  DRAW_MAP_CENTER,
  DRAW_MAP_ZOOM,
  DRAW_MIN_ZOOM,
  RADIUS_STEPS,
  mapStyleUrl,
} from './map-style'

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

  it('dessiner se fait de près : rues nommées et bâtiments visibles', () => {
    // Le plan IGN nomme les rues à partir du niveau 15.
    expect(DRAW_MAP_ZOOM).toBeGreaterThanOrEqual(15)
    expect(DRAW_MIN_ZOOM).toBeGreaterThan(DEFAULT_MAP_ZOOM)
    expect(DRAW_MIN_ZOOM).toBeLessThan(DRAW_MAP_ZOOM)
    expect(ADDRESS_ZOOM).toBeGreaterThan(COMMUNE_ZOOM)
    // Le centre de Bordeaux, dans la métropole.
    const [lng, lat] = DRAW_MAP_CENTER
    expect(lng).toBeGreaterThan(-0.7)
    expect(lng).toBeLessThan(-0.5)
    expect(lat).toBeGreaterThan(44.8)
    expect(lat).toBeLessThan(44.9)
  })
})
