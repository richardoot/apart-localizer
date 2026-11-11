/**
 * Lot 23 : la mise en route (l'étape Claude reste à faire tant que Claude
 * n'a rien écrit ; lot 26 : elle mène à la page « Claude ») et « Ce qui
 * t'attend ».
 */
import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import type { GettingStarted as GettingStartedData } from '@apart/contracts'
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
  it('en bref : ce qui reste ; Claude : l’étape mène à la page « Claude » (lot 26)', () => {
    const wrapper = mount(GettingStarted, {
      props: { data },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('3 sur 4 faites')
    expect(
      wrapper.findAll('[data-step]').map(s => s.attributes('data-step'))
    ).toEqual(['claude'])
    const link = wrapper.getComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'claude' })
    expect(link.text()).toBe('Brancher Claude')
  })

  it('espace vide : les quatre étapes, chacune avec son lien', () => {
    const wrapper = mount(GettingStarted, {
      props: {
        data: {
          ...data,
          mode: 'full',
          doneCount: 0,
          steps: data.steps.map(s => ({ ...s, done: false })),
        },
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Par où commencer')
    expect(wrapper.findAll('[data-step]')).toHaveLength(4)
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(4)
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
