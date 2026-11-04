import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  BASE_MAP_STORAGE_KEY,
  baseMapStorageKey,
  useBaseMapStore,
} from './base-map'

const RICHARD = '11111111-1111-4111-8111-111111111111'
const CHLOE = '22222222-2222-4222-8222-222222222222'

describe('store du fond de carte', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plan OSM par défaut, sans choix enregistré', () => {
    const store = useBaseMapStore()
    expect(store.current).toBe('osm')
    store.load(RICHARD)
    expect(store.current).toBe('osm')
  })

  it('retient le choix par personne et par appareil', () => {
    const store = useBaseMapStore()
    store.load(RICHARD)
    store.setBaseMap('ign-photo')
    expect(localStorage.getItem(baseMapStorageKey(RICHARD))).toBe('ign-photo')
    expect(baseMapStorageKey(RICHARD)).toBe(
      `${BASE_MAP_STORAGE_KEY}:${RICHARD}`
    )
    // Chloé sur le même navigateur garde son propre fond.
    store.load(CHLOE)
    expect(store.current).toBe('osm')
    store.setBaseMap('ign-plan')
    store.load(RICHARD)
    expect(store.current).toBe('ign-photo')
    // Une nouvelle session (rechargement) retrouve le choix.
    setActivePinia(createPinia())
    const reloaded = useBaseMapStore()
    reloaded.load(CHLOE)
    expect(reloaded.current).toBe('ign-plan')
  })

  it('sans personne connectée, une clé d’appareil ; valeur inconnue ignorée', () => {
    const store = useBaseMapStore()
    expect(baseMapStorageKey(null)).toBe(BASE_MAP_STORAGE_KEY)
    store.load(undefined)
    store.setBaseMap('ign-plan')
    expect(localStorage.getItem(BASE_MAP_STORAGE_KEY)).toBe('ign-plan')
    localStorage.setItem(baseMapStorageKey(RICHARD), 'satellite')
    store.load(RICHARD)
    expect(store.current).toBe('osm')
  })

  it('stockage indisponible : le défaut à la lecture, le choix pour la session', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const store = useBaseMapStore()
    expect(() => store.load(RICHARD)).not.toThrow()
    expect(store.current).toBe('osm')
    expect(() => store.setBaseMap('ign-photo')).not.toThrow()
    expect(store.current).toBe('ign-photo')
  })
})
