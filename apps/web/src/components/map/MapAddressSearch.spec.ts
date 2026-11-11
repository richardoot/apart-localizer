import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const apiMock = vi.hoisted(() => ({
  opendata: { geocode: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { ApiError } from '@/lib/api'
import MapAddressSearch from './MapAddressSearch.vue'

const FOUND = {
  point: { type: 'Point' as const, coordinates: [-0.5792, 44.8378] },
  label: '1 Place Fictive 33000 Bordeaux',
  precision: 'exact' as const,
  commune: 'Bordeaux',
}

function mountSearch() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return mount(MapAddressSearch, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

describe('MapAddressSearch (API mockée, aucun appel réseau)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('une adresse trouvée par l’API recentre la carte et le dit', async () => {
    apiMock.opendata.geocode.mockResolvedValue({
      query: '1 place Fictive',
      status: 'found',
      result: FOUND,
    })
    const wrapper = mountSearch()
    expect(wrapper.get('[role="search"]').attributes('aria-label')).toBe(
      'Aller à une adresse'
    )
    const input = wrapper.get('[data-testid="map-address"]')
    expect(wrapper.get(`label[for="${input.attributes('id')}"]`).text()).toBe(
      'Adresse ou commune'
    )
    await input.setValue('  1 place Fictive ')
    await wrapper.get('[data-testid="map-address-go"]').trigger('click')
    await flushPromises()
    expect(apiMock.opendata.geocode).toHaveBeenCalledWith('1 place Fictive')
    expect(wrapper.emitted('found')).toEqual([[FOUND]])
    const message = wrapper.get('[data-testid="map-address-message"]')
    expect(message.attributes('aria-live')).toBe('polite')
    expect(message.text()).toBe('Centré sur : 1 Place Fictive 33000 Bordeaux')
    wrapper.unmount()
  })

  it('Entrée lance la recherche sans soumettre le formulaire du critère', async () => {
    apiMock.opendata.geocode.mockResolvedValue({
      query: 'Talence',
      status: 'found',
      result: { ...FOUND, label: 'Talence', precision: 'commune' },
    })
    const submitted = vi.fn()
    const client = new QueryClient()
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h('form', { onSubmit: submitted }, [h(MapAddressSearch)]),
      }),
      {
        attachTo: document.body,
        global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
      }
    )
    const input = wrapper.get('[data-testid="map-address"]')
    await input.setValue('Talence')
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    input.element.dispatchEvent(enter)
    await flushPromises()
    expect(enter.defaultPrevented).toBe(true)
    expect(submitted).not.toHaveBeenCalled()
    expect(apiMock.opendata.geocode).toHaveBeenCalledWith('Talence')
    expect(wrapper.get('[data-testid="map-address-message"]').text()).toBe(
      'Centré sur la commune : Talence'
    )
    wrapper.unmount()
  })

  it('introuvable, géocodeur en panne, texte trop court, erreur d’API', async () => {
    const wrapper = mountSearch()
    const input = wrapper.get('[data-testid="map-address"]')
    const go = wrapper.get('[data-testid="map-address-go"]')
    const message = () => wrapper.get('[data-testid="map-address-message"]')

    await input.setValue('ab')
    await go.trigger('click')
    expect(apiMock.opendata.geocode).not.toHaveBeenCalled()
    expect(message().text()).toBe('Écris au moins trois caractères.')
    expect(message().classes()).toContain('text-bad')

    apiMock.opendata.geocode.mockResolvedValueOnce({
      query: 'Nulle part',
      status: 'not_found',
      result: null,
    })
    await input.setValue('Nulle part')
    await go.trigger('click')
    await flushPromises()
    expect(message().text()).toBe('Adresse introuvable : précise la commune.')

    apiMock.opendata.geocode.mockResolvedValueOnce({
      query: 'Nulle part',
      status: 'unavailable',
      result: null,
    })
    await go.trigger('click')
    await flushPromises()
    expect(message().text()).toBe(
      'La recherche d’adresse ne répond pas ; réessaie dans un instant.'
    )

    apiMock.opendata.geocode.mockRejectedValueOnce(
      new ApiError(401, 'Session expirée')
    )
    await go.trigger('click')
    await flushPromises()
    expect(message().text()).toBe('Session expirée')

    apiMock.opendata.geocode.mockRejectedValueOnce(new Error('réseau'))
    await go.trigger('click')
    await flushPromises()
    expect(message().text()).toBe('La recherche a échoué.')
    expect(wrapper.emitted('found')).toBeUndefined()
    wrapper.unmount()
  })
})
