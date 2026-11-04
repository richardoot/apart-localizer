import { describe, it, expect, vi } from 'vitest'
import { setWorkerUrl } from 'maplibre-gl'

describe('maplibre-worker', () => {
  it('déclare à MapLibre le worker publié par Vite', async () => {
    // Import dans le test : les appels du mock sont remis à zéro avant chacun.
    vi.resetModules()
    const { maplibreWorkerUrl } = await import('./maplibre-worker')
    expect(maplibreWorkerUrl).toMatch(/maplibre-gl-worker/)
    expect(vi.mocked(setWorkerUrl)).toHaveBeenCalledWith(maplibreWorkerUrl)
  })
})
