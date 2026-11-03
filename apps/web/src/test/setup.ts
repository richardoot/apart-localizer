import { config } from '@vue/test-utils'
import { vi } from 'vitest'

config.global.stubs = {
  RouterLink: true,
  RouterView: true,
}

// The real client needs environment variables and a network: every spec
// works with this stub, overriding the methods it cares about.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(),
      signInWithOAuth: vi.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: vi.fn(() =>
        Promise.resolve({
          data: { session: { access_token: 't' }, user: { id: 'u1' } },
          error: null,
        })
      ),
      signUp: vi.fn(() =>
        Promise.resolve({
          data: { session: { access_token: 't' }, user: { id: 'u1' } },
          error: null,
        })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      oauth: {
        getAuthorizationDetails: vi.fn(),
        approveAuthorization: vi.fn(),
        denyAuthorization: vi.fn(),
      },
    },
  },
}))

/**
 * MapLibre never loads a tile in tests: the whole library is replaced by a
 * recorder. Specs read `mapLibreMock` to assert on what the component asked
 * the map to do (markers, sources, listeners).
 */
export const mapLibreMock = {
  maps: [] as MockMap[],
  markers: [] as MockMarker[],
  popups: [] as MockPopup[],
  reset(): void {
    this.maps = []
    this.markers = []
    this.popups = []
  },
}

export class MockMap {
  listeners = new Map<string, Array<(event: unknown) => void>>()
  sources = new Map<string, { data: unknown; setData: (d: unknown) => void }>()
  layers: unknown[] = []
  controls: unknown[] = []
  removed = false
  constructor(public readonly options: Record<string, unknown>) {
    mapLibreMock.maps.push(this)
  }
  center: [number, number] = [-0.59, 44.82]
  on(
    type: string,
    layerOrListener: string | ((event: unknown) => void),
    maybeListener?: (event: unknown) => void
  ): this {
    const key =
      typeof layerOrListener === 'string' ? `${type}:${layerOrListener}` : type
    const listener =
      typeof layerOrListener === 'string' ? maybeListener : layerOrListener
    if (!listener) return this
    const list = this.listeners.get(key) ?? []
    list.push(listener)
    this.listeners.set(key, list)
    return this
  }
  /** Ce que `queryRenderedFeatures` rend sous le clic (filtré par couche). */
  rendered: Array<{ layer: { id: string }; properties: unknown }> = []
  queryRenderedFeatures(
    _point: unknown,
    options?: { layers?: string[] }
  ): Array<{ layer: { id: string }; properties: unknown }> {
    return this.rendered.filter(
      f => !options?.layers || options.layers.includes(f.layer.id)
    )
  }
  getBounds(): { toArray: () => [[number, number], [number, number]] } {
    return {
      toArray: () => [
        [-0.7, 44.75],
        [-0.5, 44.9],
      ],
    }
  }
  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
  jumpTo(options: { center: [number, number] }): this {
    this.center = options.center
    return this
  }
  addControl(control: unknown): this {
    this.controls.push(control)
    return this
  }
  getSource(id: string): unknown {
    return this.sources.get(id)
  }
  addSource(id: string, spec: { data: unknown }): void {
    const source = {
      data: spec.data,
      setData: (data: unknown) => {
        source.data = data
      },
    }
    this.sources.set(id, source)
  }
  addLayer(layer: unknown): void {
    this.layers.push(layer)
  }
  remove(): void {
    this.removed = true
  }
}

export class MockPopup {
  html = ''
  lngLat: unknown = null
  map: MockMap | null = null
  listeners = new Map<string, Array<() => void>>()
  element = document.createElement('div')
  constructor(public readonly options: Record<string, unknown>) {}
  setHTML(html: string): this {
    this.html = html
    this.element.innerHTML = html
    return this
  }
  on(type: string, listener: () => void): this {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
    return this
  }
  open(): void {
    for (const listener of this.listeners.get('open') ?? []) listener()
  }
  setLngLat(lngLat: unknown): this {
    this.lngLat = lngLat
    return this
  }
  addTo(map: MockMap): this {
    this.map = map
    mapLibreMock.popups.push(this)
    return this
  }
  getElement(): HTMLElement {
    return this.element
  }
}

export class MockMarker {
  lngLat: [number, number] | null = null
  popup: MockPopup | null = null
  map: MockMap | null = null
  removed = false
  constructor(public readonly options: { element: HTMLElement }) {
    mapLibreMock.markers.push(this)
  }
  setLngLat(lngLat: [number, number]): this {
    this.lngLat = lngLat
    return this
  }
  setPopup(popup: MockPopup): this {
    this.popup = popup
    return this
  }
  addTo(map: MockMap): this {
    this.map = map
    return this
  }
  remove(): void {
    this.removed = true
  }
}

/**
 * terra-draw ne dessine rien dans les tests : un enregistreur à la place.
 * `terraDrawMock.instances[0].finish(feature)` simule la fin d'un dessin.
 */
export const terraDrawMock = {
  instances: [] as MockTerraDraw[],
  reset(): void {
    this.instances = []
  },
}

export class MockTerraDraw {
  mode = 'static'
  started = false
  stopped = false
  cleared = 0
  features = new Map<string, unknown>()
  listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  constructor(public readonly options: { modes: unknown[] }) {
    terraDrawMock.instances.push(this)
  }
  start(): void {
    this.started = true
  }
  stop(): void {
    this.stopped = true
  }
  setMode(mode: string): void {
    this.mode = mode
  }
  clear(): void {
    this.cleared++
    this.features.clear()
  }
  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? []
    list.push(listener)
    this.listeners.set(event, list)
  }
  getSnapshotFeature(id: string): unknown {
    return this.features.get(id)
  }
  getSnapshot(): Array<{ id: string }> {
    return [...this.features.entries()].map(([id, feature]) => ({
      ...(feature as object),
      id,
    }))
  }
  private nextId = 0
  getFeatureId(): string {
    this.nextId += 1
    return `feature-${this.nextId}`
  }
  addFeatures(features: Array<{ id: string }>): unknown[] {
    for (const feature of features) this.features.set(feature.id, feature)
    return features.map(f => ({ id: f.id, valid: true }))
  }
  removeFeatures(ids: string[]): void {
    for (const id of ids) this.features.delete(id)
  }
  /** Simule la fin d'un tracé (ou d'une retouche, `action: 'edit'`). */
  finish(feature: unknown, id = 'drawn-1', action = 'draw'): void {
    this.features.set(id, feature)
    for (const listener of this.listeners.get('finish') ?? [])
      listener(id, { mode: this.mode, action })
  }
}

vi.mock('terra-draw', () => ({
  TerraDraw: MockTerraDraw,
  TerraDrawPolygonMode: class {
    mode = 'polygon'
    constructor(public readonly options: unknown = {}) {}
  },
  TerraDrawCircleMode: class {
    mode = 'circle'
  },
}))

vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {
    constructor(public readonly options: unknown) {}
  },
}))

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  Marker: MockMarker,
  Popup: MockPopup,
  NavigationControl: class {},
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
