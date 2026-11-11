/**
 * Lot 23 : la mise en route (l'adresse du connecteur se copie, l'étape reste
 * à faire tant que Claude n'a rien écrit) et « Ce qui t'attend ».
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { GettingStarted as GettingStartedData } from '@apart/contracts'
import { MCP_URL } from '@/lib/api'
import { useFeedbackStore } from '@/stores/feedback'
import GettingStarted from './GettingStarted.vue'
import HomeAgenda from './HomeAgenda.vue'

const data: GettingStartedData = {
  mode: 'compact',
  doneCount: 3,
  steps: [
    {
      key: 'assumptions',
      done: true,
      title: 'Régler tes hypothèses',
      text: 'Enregistrées.',
    },
    {
      key: 'criteria',
      done: true,
      title: 'Dessiner tes critères de recherche',
      text: '1 critère actif.',
    },
    {
      key: 'listing',
      done: true,
      title: 'Ajouter une première annonce',
      text: '1 annonce suivie.',
    },
    {
      key: 'claude',
      done: false,
      title: 'Connecter Claude',
      text: 'L’application le verra à sa première écriture.',
    },
  ],
}

describe('GettingStarted', () => {
  it('en bref : ce qui reste ; Claude : l’adresse du connecteur se copie', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const wrapper = mount(GettingStarted, { props: { data } })
    expect(wrapper.text()).toContain('3 sur 4 faites')
    expect(
      wrapper.findAll('[data-step]').map(s => s.attributes('data-step'))
    ).toEqual(['claude'])
    await wrapper.get('[data-testid="getting-started-claude"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(MCP_URL)
    expect(wrapper.get('[data-testid="getting-started-mcp-url"]').text()).toBe(
      MCP_URL
    )
    expect(useFeedbackStore().messages.at(-1)?.text).toBe(
      'Adresse du connecteur copiée.'
    )
  })

  it('presse-papiers refusé : l’adresse reste affichée', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('refus')) },
      configurable: true,
    })
    const wrapper = mount(GettingStarted, {
      props: {
        data: {
          ...data,
          mode: 'full',
          doneCount: 0,
          steps: data.steps.map(s => ({ ...s, done: false })),
        },
      },
    })
    expect(wrapper.text()).toContain('Par où commencer')
    expect(wrapper.findAll('[data-step]')).toHaveLength(4)
    await wrapper.get('[data-testid="getting-started-claude"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="getting-started-mcp-url"]').exists()
    ).toBe(true)
    expect(useFeedbackStore().messages.at(-1)?.tone).toBe('info')
  })
})

describe('HomeAgenda', () => {
  it('une ligne : le compte, le libellé, la précision et son verbe', () => {
    const wrapper = mount(HomeAgenda, {
      props: {
        items: [
          {
            key: 'upcoming_visits',
            count: 2,
            label: 'visites à venir',
            stage: 'a-visiter',
            detail: 'prochaine : jeudi 12 novembre, 18 h 30',
            listingId: null,
          },
        ],
      },
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } },
      },
    })
    const line = wrapper.get('[data-agenda="upcoming_visits"]')
    expect(line.text()).toContain('2')
    expect(line.text()).toContain('visites à venir')
    expect(line.get('[data-testid="agenda-detail"]').text()).toBe(
      'prochaine : jeudi 12 novembre, 18 h 30'
    )
    expect(line.text()).toContain('Préparer')
  })
})
