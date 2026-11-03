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
      signOut: vi.fn(() => Promise.resolve({ error: null })),
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
  reset(): void {
    this.maps = []
    this.markers = []
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
  on(type: string, listener: (event: unknown) => void): this {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
    return this
  }
  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
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
