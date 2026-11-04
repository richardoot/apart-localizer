import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

config.global.stubs = {
  RouterLink: true,
  RouterView: true,
}

// Les cartes lisent le fond choisi dans un store : une Pinia neuve par test,
// remplacée par celle qu'un spec installe lui-même.
beforeEach(() => {
  setActivePinia(createPinia())
})

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
 * the map to do (markers, sources, listeners, style changes, camera).
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

type MockSource = {
  spec: Record<string, unknown>
  data: unknown
  setData: (d: unknown) => void
}

/** Le style qu'un fond « charge » dans les tests : une source et une couche à lui. */
export function mockBaseStyle(url: string): {
  version: 8
  sources: Record<string, Record<string, unknown>>
  layers: Array<Record<string, unknown>>
} {
  return {
    version: 8,
    sources: { base: { type: 'vector', url } },
    layers: [{ id: 'base-background', type: 'background', paint: {} }],
  }
}

export class MockMap {
  listeners = new Map<string, Array<(event: unknown) => void>>()
  sources = new Map<string, MockSource>()
  layers: unknown[] = []
  controls: unknown[] = []
  removed = false
  /** Les `setStyle` demandés (fond changé). */
  styleCalls: Array<{ style: unknown; options: Record<string, unknown> }> = []
  /** Les cadrages et déplacements demandés. */
  camera: Array<{ kind: 'fitBounds' | 'easeTo' | 'flyTo'; args: unknown[] }> =
    []
  zoom: number
  constructor(public readonly options: Record<string, unknown>) {
    mapLibreMock.maps.push(this)
    if (Array.isArray(options.center))
      this.center = options.center as [number, number]
    this.zoom =
      typeof options.zoom === 'number' ? options.zoom : options.bounds ? 14 : 0
  }
  center: [number, number] = [-0.59, 44.82]
  getZoom(): number {
    return this.zoom
  }
  fitBounds(bounds: unknown, options?: unknown): this {
    this.camera.push({ kind: 'fitBounds', args: [bounds, options] })
    this.zoom = 15
    return this
  }
  easeTo(options: { center?: [number, number]; zoom?: number }): this {
    this.camera.push({ kind: 'easeTo', args: [options] })
    if (options.center) this.center = options.center
    if (options.zoom !== undefined) this.zoom = options.zoom
    return this
  }
  flyTo(options: { center?: [number, number]; zoom?: number }): this {
    this.camera.push({ kind: 'flyTo', args: [options] })
    if (options.center) this.center = options.center
    if (options.zoom !== undefined) this.zoom = options.zoom
    return this
  }
  /** Le style courant, sources GeoJSON avec leurs données, comme `serialize()`. */
  getStyle(): {
    version: 8
    sources: Record<string, Record<string, unknown>>
    layers: unknown[]
  } {
    const sources: Record<string, Record<string, unknown>> = {}
    for (const [id, source] of this.sources) {
      sources[id] =
        source.spec.type === 'geojson'
          ? { ...source.spec, data: source.data }
          : source.spec
    }
    return { version: 8, sources, layers: [...this.layers] }
  }
  /**
   * Un changement de fond comme MapLibre le fait : le style du fond passe
   * par `transformStyle` (style précédent, style suivant), puis remplace
   * sources et couches ; `style.load` est émis.
   */
  setStyle(style: unknown, options: Record<string, unknown> = {}): this {
    this.styleCalls.push({ style, options })
    const next = mockBaseStyle(String(style))
    const transform = options.transformStyle as
      | ((
          previous: unknown,
          next: unknown
        ) => {
          sources: Record<string, Record<string, unknown>>
          layers: unknown[]
        })
      | undefined
    const result = transform ? transform(this.getStyle(), next) : next
    this.sources = new Map()
    for (const [id, spec] of Object.entries(result.sources))
      this.addSource(id, spec)
    this.layers = [...result.layers]
    this.emit('style.load')
    this.emit('styledata')
    return this
  }
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
  addSource(id: string, spec: Record<string, unknown>): void {
    const source: MockSource = {
      spec,
      data: spec.data,
      setData: (data: unknown) => {
        source.data = data
      },
    }
    this.sources.set(id, source)
  }
  removeSource(id: string): void {
    this.sources.delete(id)
  }
  addLayer(layer: unknown): void {
    this.layers.push(layer)
  }
  removeLayer(id: string): void {
    this.layers = this.layers.filter(l => (l as { id: string }).id !== id)
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
  constructor(
    public readonly options: {
      modes: unknown[]
      adapter?: { register?: () => void; unregister?: () => void }
    }
  ) {
    terraDrawMock.instances.push(this)
  }
  start(): void {
    this.started = true
    this.options.adapter?.register?.()
  }
  stop(): void {
    this.stopped = true
    this.options.adapter?.unregister?.()
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

/**
 * L'adaptateur pose, comme le vrai, une source et une couche préfixées
 * (`prefixId`, « td » par défaut) quand terra-draw démarre.
 */
vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {
    constructor(
      public readonly options: { map?: MockMap; prefixId?: string }
    ) {}
    private get id(): string {
      return `${this.options.prefixId ?? 'td'}-polygon`
    }
    register(): void {
      this.options.map?.addSource(this.id, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      this.options.map?.addLayer({ id: this.id, type: 'fill', source: this.id })
    }
    unregister(): void {
      this.options.map?.removeLayer(this.id)
      this.options.map?.removeSource(this.id)
    }
  },
}))

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
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
