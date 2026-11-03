import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mapLibreMock, terraDrawMock } from '@/test/setup'
import { SQUARE, fakeCriteria } from '@/test/criteria-fixtures'

const apiMock = vi.hoisted(() => ({
  searchCriteria: {
    preview: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import CriteriaEditor from './CriteriaEditor.vue'

function mountEditor(
  criteria = null as ReturnType<typeof fakeCriteria> | null
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(CriteriaEditor, {
    props: { criteria },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

describe('CriteriaEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapLibreMock.reset()
    terraDrawMock.reset()
    apiMock.searchCriteria.preview.mockImplementation(
      (request: { perimeter: unknown }) =>
        Promise.resolve({
          perimeter:
            (request.perimeter as { type?: string } | null)?.type ===
            'isochrone'
              ? {
                  type: 'isochrone',
                  polygon: SQUARE,
                  params: {
                    origin: { type: 'Point', coordinates: [-0.58, 44.84] },
                    originLabel: null,
                    mode: 'walking',
                    durationMinutes: 15,
                    computedAt: null,
                    provider: null,
                    approximation: null,
                  },
                }
              : request.perimeter,
          listingCount: 4,
          approximateCount: 1,
          listingIds: [],
        })
    )
    apiMock.searchCriteria.create.mockResolvedValue(fakeCriteria())
    apiMock.searchCriteria.update.mockResolvedValue(fakeCriteria())
  })

  it('dessine un polygone, montre l’aperçu, crée le critère', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    expect(apiMock.searchCriteria.preview).toHaveBeenCalled()
    await wrapper.get('#c-name').setValue('Talence sud')
    await wrapper.get('[data-testid="c-price-max"]').setValue('210000')
    await wrapper.get('[data-kind="polygon"]').trigger('click')
    mapLibreMock.maps[0]?.emit('load')
    terraDrawMock.instances[0]?.finish({
      geometry: SQUARE,
      properties: { mode: 'polygon' },
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      '4 annonce(s)'
    )
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      '1 sous réserve'
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Talence sud',
        filters: expect.objectContaining({ priceMax: 210000 }),
        perimeter: { type: 'polygon', polygon: SQUARE },
      })
    )
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('isochrone par adresse : calculée par le serveur à l’aperçu ; refus sans départ', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('À pied')
    await wrapper.get('[data-kind="isochrone"]').trigger('click')
    await wrapper.get('[data-testid="iso-compute"]').trigger('click')
    expect(wrapper.text()).toContain('Donnez une adresse de départ')
    await wrapper
      .get('[data-testid="iso-address"]')
      .setValue('1 place Fictive, Bordeaux')
    await wrapper.get('[data-testid="iso-compute"]').trigger('click')
    await flushPromises()
    const last = apiMock.searchCriteria.preview.mock.calls.at(-1)?.[0]
    expect(last.perimeter).toEqual({
      type: 'isochrone',
      mode: 'walking',
      durationMinutes: 15,
      address: '1 place Fictive, Bordeaux',
    })
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      'Isochrone 15 min à pied'
    )
    wrapper.unmount()
  })

  it('point et rayon par un clic ; un périmètre non posé bloque l’enregistrement', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('Autour d’un point')
    await wrapper.get('[data-kind="point_radius"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Le périmètre n’est pas encore posé')
    mapLibreMock.maps[0]?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 } })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        perimeter: {
          type: 'point_radius',
          longitude: -0.58,
          latitude: 44.84,
          radiusMeters: 800,
        },
      })
    )
    wrapper.unmount()
  })

  it('modifier sans toucher au périmètre : seuls nom et filtres partent, avec le garde-fou', async () => {
    const criteria = fakeCriteria()
    const wrapper = mountEditor(criteria)
    await flushPromises()
    expect((wrapper.get('#c-name').element as HTMLInputElement).value).toBe(
      'Talence fictif'
    )
    await wrapper.get('[data-testid="c-tram"]').setValue('400')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const call = apiMock.searchCriteria.update.mock.calls[0]
    expect(call?.[0]).toBe(criteria.id)
    expect(call?.[1]).toMatchObject({
      name: 'Talence fictif',
      expectedUpdatedAt: criteria.updatedAt,
      filters: expect.objectContaining({
        maxTramDistanceMeters: 400,
        priceMax: 200000,
      }),
    })
    expect(call?.[1]).not.toHaveProperty('perimeter')
    wrapper.unmount()
  })
})
