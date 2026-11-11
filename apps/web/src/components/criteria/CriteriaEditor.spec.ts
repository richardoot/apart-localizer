import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mapLibreMock, terraDrawMock } from '@/test/setup'
import {
  DEFAULT_CRITERIA_TOLERANCE,
  STRICT_CRITERIA_TOLERANCE,
} from '@apart/contracts'
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
          fitCounts: { in: 2, to_confirm: 1, margin: 1, out: 3 },
          examples: [
            {
              listingId: '11111111-1111-4111-8111-111111111111',
              title: 'T3 fictif',
              level: 'margin',
              reasons: ['Prix +3,6 % (maximum 210 000 €, marge 5 %)'],
            },
          ],
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
    await wrapper.get('[data-value="polygon"]').trigger('click')
    mapLibreMock.maps[0]?.emit('load')
    terraDrawMock.instances[0]?.finish({
      geometry: SQUARE,
      properties: { mode: 'polygon' },
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      '4 annonces gardées'
    )
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      '1 à confirmer faute d’adresse'
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Talence sud',
        filters: expect.objectContaining({ priceMax: 210000 }),
        perimeter: { type: 'polygon', polygon: SQUARE },
        tolerance: DEFAULT_CRITERIA_TOLERANCE,
      })
    )
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('isochrone par adresse : calculée par le serveur à l’aperçu ; refus sans départ', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('À pied')
    await wrapper.get('[data-value="isochrone"]').trigger('click')
    await wrapper.get('[data-testid="iso-compute"]').trigger('click')
    expect(wrapper.text()).toContain('Donne une adresse de départ')
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
    await wrapper.get('[data-value="point_radius"]').trigger('click')
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

  it('lot 26 : « Effacer » retire la forme tracée ; le périmètre est à reposer', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('Talence sud')
    await wrapper.get('[data-value="polygon"]').trigger('click')
    mapLibreMock.maps[0]?.emit('load')
    terraDrawMock.instances[0]?.finish({
      geometry: SQUARE,
      properties: { mode: 'polygon' },
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="preview"]').text()).toContain(
      '4 annonces gardées'
    )
    await wrapper.get('[data-testid="draw-clear"]').trigger('click')
    await flushPromises()
    // Ni l'ancienne forme ni l'aperçu d'avant : « périmètre à poser ».
    expect(wrapper.get('[data-testid="preview"]').text()).toMatch(
      /^Sans périmètre/
    )
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Le périmètre n’est pas encore posé')
    expect(apiMock.searchCriteria.create).not.toHaveBeenCalled()
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

  it('lot 14 : marge de tolérance, seuils réels, aperçu par niveau, marge désactivée', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('[data-testid="c-price-max"]').setValue('220000')
    await flushPromises()
    const tolerance = wrapper.get('[data-testid="tolerance"]')
    expect(tolerance.text()).toContain('Marge de tolérance')
    expect(tolerance.text()).toContain('Annonces sans adresse exacte')
    expect(
      wrapper.get('[data-testid="tol-price-max-threshold"]').text()
    ).toMatch(/soit 231\s000 €/)
    // L'aperçu demande la marge saisie et montre les quatre niveaux.
    expect(
      apiMock.searchCriteria.preview.mock.calls.at(-1)?.[0].tolerance
    ).toEqual(DEFAULT_CRITERIA_TOLERANCE)
    const preview = wrapper.get('[data-testid="fit-preview"]')
    expect(preview.findAll('[data-preview-level]').map(d => d.text())).toEqual([
      '2',
      '1',
      '1',
      '3',
    ])
    expect(wrapper.get('[data-testid="fit-preview-note"]').text()).toContain(
      'prix +3,6 %'
    )
    // Marge désactivée : tout à 0, puis la marge revient.
    const toggle = wrapper.get('[data-testid="tolerance-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.text()).toBe('Marge désactivée')
    expect(
      apiMock.searchCriteria.preview.mock.calls.at(-1)?.[0].tolerance
    ).toEqual(STRICT_CRITERIA_TOLERANCE)
    expect(wrapper.get('[data-testid="fit-preview-note"]').text()).toContain(
      'Marge désactivée'
    )
    await toggle.trigger('click')
    await flushPromises()
    expect(
      apiMock.searchCriteria.preview.mock.calls.at(-1)?.[0].tolerance
    ).toEqual(DEFAULT_CRITERIA_TOLERANCE)
    // Une marge réglée part avec la création.
    await wrapper.get('[data-testid="tol-perimeter"]').setValue('500')
    await wrapper.get('#c-name').setValue('Avec marge')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tolerance: { ...DEFAULT_CRITERIA_TOLERANCE, perimeterMeters: 500 },
      })
    )
    wrapper.unmount()
  })

  it('lot 14 : modifier la marge d’un critère strict la rétablit par défaut', async () => {
    const criteria = fakeCriteria({ tolerance: STRICT_CRITERIA_TOLERANCE })
    const wrapper = mountEditor(criteria)
    await flushPromises()
    const toggle = wrapper.get('[data-testid="tolerance-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.update.mock.calls[0]?.[1]).toMatchObject({
      tolerance: DEFAULT_CRITERIA_TOLERANCE,
    })
    wrapper.unmount()
  })

  it('lot 22 : « 250k » est refusé au champ, jamais « pas de filtre » ; une marge hors bornes est dite, pas ramenée', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('Budget')
    await wrapper.get('[data-testid="c-price-max"]').setValue('250k')
    await wrapper.get('[data-testid="tol-perimeter"]').setValue('5000')
    const calls = apiMock.searchCriteria.preview.mock.calls.length
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).not.toHaveBeenCalled()
    // Une saisie refusée ne part même pas en aperçu.
    expect(apiMock.searchCriteria.preview.mock.calls.length).toBe(calls)
    const price = wrapper.get('[data-testid="c-price-max"]')
    expect(price.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('« 250k » n’est pas un nombre')
    expect(wrapper.text()).toMatch(/Entre 0 et 2\s000 m\./)
    expect(document.activeElement).toBe(price.element)
    await price.setValue('250000')
    await wrapper.get('[data-testid="tol-perimeter"]').setValue('300')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ priceMax: 250000 }),
        tolerance: { ...DEFAULT_CRITERIA_TOLERANCE, perimeterMeters: 300 },
      })
    )
    wrapper.unmount()
  })

  it('lot 22 : isDirty suit la saisie et le périmètre (garde du panneau)', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    const editor = wrapper.vm as unknown as { isDirty: () => boolean }
    expect(editor.isDirty()).toBe(false)
    await wrapper.get('#c-name').setValue('Nouveau')
    expect(editor.isDirty()).toBe(true)
    await wrapper.get('#c-name').setValue('')
    expect(editor.isDirty()).toBe(false)
    await wrapper.get('[data-value="polygon"]').trigger('click')
    expect(editor.isDirty()).toBe(true)
    wrapper.unmount()
  })

  it('lot 22 : le rayon saisi part en nombre', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('#c-name').setValue('Rayon')
    await wrapper.get('[data-value="point_radius"]').trigger('click')
    await wrapper.get('#c-radius').setValue('1200')
    mapLibreMock.maps[0]?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 } })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.searchCriteria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        perimeter: expect.objectContaining({ radiusMeters: 1200 }),
      })
    )
    wrapper.unmount()
  })
})
