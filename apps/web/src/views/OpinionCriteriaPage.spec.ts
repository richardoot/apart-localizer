/**
 * Lot 20 : la page « Critères des avis » (réglage de l'espace). Un
 * propriétaire renomme, masque, réordonne (boutons), ajoute jusqu'à dix,
 * retire un critère ajouté jamais noté, règle l'avis à l'aveugle ; un membre
 * lit sans pouvoir changer. API simulée ; données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { OpinionSettings } from '@apart/contracts'
import { DEFAULT_OPINION_CRITERIA } from '@apart/contracts'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  opinionSettings: {
    get: vi.fn(),
    update: vi.fn(),
    addCriterion: vi.fn(),
    updateCriterion: vi.fn(),
    reorder: vi.fn(),
    removeCriterion: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import OpinionCriteriaPage from './OpinionCriteriaPage.vue'
import { ApiError } from '@/lib/api'

enableAutoUnmount(afterEach)

function settings(over: Partial<OpinionSettings> = {}): OpinionSettings {
  return {
    blind: true,
    criteria: DEFAULT_OPINION_CRITERIA.map((c, position) => ({
      key: c.key,
      label: c.label,
      hint: c.hint,
      position,
      hidden: false,
      origin: 'default',
      scoreCount: position === 3 ? 4 : 0,
      removable: false,
    })),
    max: 10,
    disagreementGap: 2,
    canEdit: true,
    ...over,
  }
}

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(OpinionCriteriaPage, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.workspace.mockResolvedValue({
    workspace: { name: '[Exemple] Bordeaux', members: [], invitations: [] },
    me: null,
  })
})

describe('Critères des avis (maquette « Réglages de l’espace »)', () => {
  it('liste ordonnée : monter, descendre, renommer, masquer, compteur', async () => {
    const current = settings()
    apiMock.opinionSettings.get.mockResolvedValue(current)
    apiMock.opinionSettings.reorder.mockResolvedValue(current)
    apiMock.opinionSettings.updateCriterion.mockResolvedValue(current)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('← Espace « [Exemple] Bordeaux »')
    const items = wrapper.findAll('[data-criterion]')
    expect(items).toHaveLength(8)
    expect(wrapper.get('[data-testid="criteria-count"]').text()).toBe(
      '8 affichés · 8 sur 10 au plus'
    )
    const quiet = wrapper.get('[data-criterion="quiet"]')
    expect(
      quiet.get('[data-testid="criterion-up"]').attributes('aria-label')
    ).toBe('Monter Calme')
    expect(
      items[0]?.get('[data-testid="criterion-up"]').attributes('disabled')
    ).toBeDefined()
    expect(
      items[7]?.get('[data-testid="criterion-down"]').attributes('disabled')
    ).toBeDefined()
    await quiet.get('[data-testid="criterion-up"]').trigger('click')
    await flushPromises()
    expect(apiMock.opinionSettings.reorder).toHaveBeenCalledWith({
      keys: [
        'luminosity',
        'layout',
        'quiet',
        'condition',
        'outdoor',
        'building',
        'street',
        'feel',
      ],
    })
    await quiet.get('[data-testid="criterion-down"]').trigger('click')
    await flushPromises()
    expect(apiMock.opinionSettings.reorder).toHaveBeenLastCalledWith({
      keys: [
        'luminosity',
        'layout',
        'condition',
        'outdoor',
        'quiet',
        'building',
        'street',
        'feel',
      ],
    })
    const input = quiet.get('[data-testid="criterion-label"]')
    expect(input.attributes('aria-label')).toBe('Nom du critère 4')
    await input.setValue('Calme et bruit')
    await input.trigger('blur')
    await flushPromises()
    expect(apiMock.opinionSettings.updateCriterion).toHaveBeenCalledWith(
      'quiet',
      { label: 'Calme et bruit' }
    )
    // Un libellé vidé ou inchangé n'envoie rien.
    await input.setValue('  ')
    await input.trigger('blur')
    expect(apiMock.opinionSettings.updateCriterion).toHaveBeenCalledTimes(1)
    const toggle = quiet.get('[data-testid="criterion-toggle"]')
    expect(toggle.text()).toBe('Masquer')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(apiMock.opinionSettings.updateCriterion).toHaveBeenLastCalledWith(
      'quiet',
      { hidden: true }
    )
    expect(wrapper.get('[data-testid="criteria-notice"]').text()).toBe(
      '« Calme » masqué : ses notes restent.'
    )
  })

  it('ajouter jusqu’à dix ; retirer un critère ajouté jamais noté ; aveugle', async () => {
    const base = settings()
    const nine = settings({
      criteria: [
        ...base.criteria,
        {
          key: 'custom_cuisine',
          label: 'Cuisine',
          hint: '',
          position: 8,
          hidden: true,
          origin: 'custom',
          scoreCount: 0,
          removable: true,
        },
      ],
    })
    apiMock.opinionSettings.get.mockResolvedValue(nine)
    apiMock.opinionSettings.addCriterion.mockResolvedValue(nine)
    apiMock.opinionSettings.removeCriterion.mockResolvedValue(base)
    apiMock.opinionSettings.update.mockResolvedValue({ ...nine, blind: false })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="criteria-count"]').text()).toBe(
      '8 affichés · 9 sur 10 au plus'
    )
    const cuisine = wrapper.get('[data-criterion="custom_cuisine"]')
    expect(cuisine.text()).toContain('ajouté par l’espace · masqué')
    expect(cuisine.get('[data-testid="criterion-toggle"]').text()).toBe(
      'Afficher'
    )
    await cuisine.get('[data-testid="criterion-remove"]').trigger('click')
    expect(apiMock.opinionSettings.removeCriterion).not.toHaveBeenCalled()
    await cuisine.get('[data-testid="criterion-remove-yes"]').trigger('click')
    await flushPromises()
    expect(apiMock.opinionSettings.removeCriterion).toHaveBeenCalledWith(
      'custom_cuisine'
    )
    expect(
      wrapper
        .get('[data-criterion="quiet"]')
        .find('[data-testid="criterion-remove"]')
        .exists()
    ).toBe(false)

    apiMock.opinionSettings.addCriterion.mockRejectedValueOnce(
      new ApiError(409, 'Un critère s’appelle déjà « Cuisine ».')
    )
    await wrapper.get('[data-testid="criterion-new"]').setValue('Cuisine')
    await wrapper.get('form[aria-label="Ajouter un critère"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Un critère s’appelle déjà « Cuisine ».'
    )
    await wrapper
      .get('[data-testid="criterion-new"]')
      .setValue(' Proximité de l’école ')
    await wrapper.get('form[aria-label="Ajouter un critère"]').trigger('submit')
    await flushPromises()
    expect(apiMock.opinionSettings.addCriterion).toHaveBeenLastCalledWith({
      label: 'Proximité de l’école',
      hint: '',
    })

    const blind = wrapper.get('[data-testid="criteria-blind"]')
    expect((blind.element as HTMLInputElement).checked).toBe(true)
    await blind.setValue(false)
    await flushPromises()
    expect(apiMock.opinionSettings.update).toHaveBeenCalledWith({
      blind: false,
    })
    expect(wrapper.text()).toContain(
      'Échelle : 1 rédhibitoire, 2 bof, 3 correct, 4 bien, 5 excellent.'
    )
  })

  it('à dix critères, l’ajout est bloqué ; un membre lit en lecture seule', async () => {
    const base = settings()
    const ten = settings({
      canEdit: false,
      criteria: [
        ...base.criteria,
        ...['custom_a', 'custom_b'].map((key, i) => ({
          key,
          label: `Critère ${i}`,
          hint: '',
          position: 8 + i,
          hidden: false,
          origin: 'custom' as const,
          scoreCount: 0,
          removable: true,
        })),
      ],
    })
    apiMock.opinionSettings.get.mockResolvedValue(ten)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="read-only"]').text()).toContain(
      'Seuls les propriétaires de l’espace changent ces réglages'
    )
    const add = wrapper.get('[data-testid="criterion-add"]')
    expect(add.text()).toBe('10 critères au plus')
    expect(add.attributes('disabled')).toBeDefined()
    expect(
      wrapper
        .findAll('[data-testid="criterion-label"]')
        .every(i => i.attributes('disabled') !== undefined)
    ).toBe(true)
    expect(
      wrapper
        .findAll('[data-testid="criterion-toggle"]')
        .every(b => b.attributes('disabled') !== undefined)
    ).toBe(true)
    expect(wrapper.find('[data-testid="criterion-remove"]').exists()).toBe(
      false
    )
    expect(
      wrapper.get('[data-testid="criteria-blind"]').attributes('disabled')
    ).toBeDefined()
  })
})
