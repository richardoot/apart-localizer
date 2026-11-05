import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/with-query'

const collection = (name: string) => ({
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [-0.58, 44.84] as [number, number],
      },
      properties: { name },
    },
  ],
})

const apiMock = vi.hoisted(() => ({
  opendata: {
    transitStops: vi.fn(),
    rentControlZones: vi.fn(),
    dvf: vi.fn(),
    amenities: vi.fn(),
    neighbourhoods: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { DEFAULT_LAYER_TOGGLES, useMapLayers } from './useMapLayers'
import type { MapLayerToggles } from './useMapLayers'

describe('useMapLayers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.opendata.transitStops.mockImplementation((mode: string) =>
      Promise.resolve(collection(mode))
    )
    apiMock.opendata.rentControlZones.mockResolvedValue(collection('zones'))
    apiMock.opendata.dvf.mockResolvedValue(collection('dvf'))
    apiMock.opendata.amenities.mockImplementation((kind: string) =>
      Promise.resolve(collection(kind))
    )
    apiMock.opendata.neighbourhoods.mockResolvedValue(collection('quartiers'))
  })

  it('ne charge une couche que lorsqu’elle est allumée ; DVF suit l’emprise', async () => {
    const toggles = ref<MapLayerToggles>({ ...DEFAULT_LAYER_TOGGLES })
    const bbox = ref<[number, number, number, number] | null>(null)
    const { result, unmount } = withQuery(() => useMapLayers(toggles, bbox))
    await flushPromises()
    expect(DEFAULT_LAYER_TOGGLES).toMatchObject({ criteria: true, tram: false })
    expect(apiMock.opendata.transitStops).not.toHaveBeenCalled()
    expect(apiMock.opendata.rentControlZones).not.toHaveBeenCalled()
    expect(apiMock.opendata.dvf).not.toHaveBeenCalled()
    expect(result.value).toEqual({
      tram: null,
      bus: null,
      rentZones: null,
      dvf: null,
      athletics: null,
      drives: null,
      fitness: null,
      neighbourhoods: null,
    })

    toggles.value = {
      ...toggles.value,
      tram: true,
      bus: true,
      rentZones: true,
      dvf: true,
    }
    await flushPromises()
    expect(apiMock.opendata.transitStops).toHaveBeenCalledWith('tram')
    expect(apiMock.opendata.transitStops).toHaveBeenCalledWith('bus')
    expect(apiMock.opendata.rentControlZones).toHaveBeenCalledTimes(1)
    // Pas d'emprise connue : pas de ventes.
    expect(apiMock.opendata.dvf).not.toHaveBeenCalled()
    expect(result.value.tram?.features[0]?.properties.name).toBe('tram')
    expect(result.value.bus?.features[0]?.properties.name).toBe('bus')

    bbox.value = [-0.7, 44.75, -0.5, 44.9]
    await flushPromises()
    expect(apiMock.opendata.dvf).toHaveBeenCalledWith([-0.7, 44.75, -0.5, 44.9])
    expect(result.value.dvf?.features).toHaveLength(1)
    bbox.value = [-0.6, 44.8, -0.55, 44.85]
    await flushPromises()
    expect(apiMock.opendata.dvf).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('lot 11 : équipements par genre et contours, entiers, une fois chacun', async () => {
    const toggles = ref<Partial<MapLayerToggles>>({ athletics: true })
    const { result, unmount } = withQuery(() => useMapLayers(toggles, null))
    await flushPromises()
    expect(apiMock.opendata.amenities).toHaveBeenCalledWith('athletics_track')
    expect(apiMock.opendata.amenities).toHaveBeenCalledTimes(1)
    expect(apiMock.opendata.neighbourhoods).not.toHaveBeenCalled()
    expect(result.value.athletics?.features[0]?.properties.name).toBe(
      'athletics_track'
    )
    toggles.value = {
      athletics: true,
      drives: true,
      fitness: true,
      neighbourhoods: true,
    }
    await flushPromises()
    expect(apiMock.opendata.amenities).toHaveBeenCalledWith('supermarket_drive')
    expect(apiMock.opendata.amenities).toHaveBeenCalledWith('fitness_park')
    expect(apiMock.opendata.neighbourhoods).toHaveBeenCalledWith()
    expect(result.value.drives?.features[0]?.properties.name).toBe(
      'supermarket_drive'
    )
    expect(result.value.neighbourhoods?.features[0]?.properties.name).toBe(
      'quartiers'
    )
    // Éteindre puis rallumer ne recharge pas (couches gardées en cache).
    toggles.value = { athletics: false }
    await flushPromises()
    toggles.value = { athletics: true }
    await flushPromises()
    expect(apiMock.opendata.amenities).toHaveBeenCalledTimes(3)
    unmount()
  })
})
