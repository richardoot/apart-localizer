/**
 * Lot 23 : la barre du bas (téléphone), l'en-tête d'une ligne, le menu du
 * compte qui dit qui est connecté, et l'entrée allumée de chaque page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  notifications: { list: vi.fn() },
  whatsNew: { visit: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
const routeName = vi.hoisted(() => ({ value: 'home' as string }))
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRoute: () => ({ name: routeName.value }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/useWhatsNew', () => ({
  sendVisitHeartbeat: vi.fn(() => Promise.resolve()),
}))

import AppHeader from '../AppHeader.vue'
import BottomNav from './BottomNav.vue'

const linkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function withClient<T>(component: T, props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(component as never, {
    props: props as never,
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: linkStub },
    },
  })
}

describe('la navigation (lot 23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    routeName.value = 'home'
    apiMock.workspace.mockResolvedValue({
      workspace: { id: 'w', name: 'Espace fictif', members: [] },
      me: { id: 'm', displayName: 'Camille (démo)', role: 'owner' },
    })
    apiMock.notifications.list.mockResolvedValue({
      items: [],
      unreadCount: 4,
      total: 0,
    })
  })

  it('la barre du bas : cinq entrées, l’entrée de la page allumée, les non lues comptées', async () => {
    routeName.value = 'criteria-brief'
    const wrapper = withClient(BottomNav)
    await flushPromises()
    const links = wrapper.findAll('a[data-entry]')
    expect(links.map(l => l.text())).toEqual([
      'Accueil',
      'Annonces',
      'Ajouter',
      expect.stringContaining('Notifications'),
      'Plus',
    ])
    expect(links[2]?.attributes('href')).toBe('/annonces/nouvelle')
    expect(wrapper.get('a[aria-current="page"]').attributes('data-entry')).toBe(
      'more'
    )
    expect(wrapper.get('[data-testid="bottom-nav-count"]').text()).toContain(
      '4 non lues'
    )
    wrapper.unmount()
  })

  it('la barre se retire quand le clavier est ouvert', async () => {
    const wrapper = withClient(BottomNav, { hidden: true })
    await flushPromises()
    expect(
      (wrapper.get('[data-testid="bottom-nav"]').element as HTMLElement).style
        .display
    ).toBe('none')
    wrapper.unmount()
  })

  it('l’en-tête : cinq entrées sur ordinateur, la page parente allumée, le membre connecté', async () => {
    routeName.value = 'exploration'
    const wrapper = withClient(AppHeader)
    await flushPromises()
    const nav = wrapper.get('[data-testid="desktop-nav"]')
    expect(nav.findAll('a').map(a => a.text())).toEqual([
      'Accueil',
      'Annonces',
      'Critères',
      'Hypothèses',
      'Activité',
    ])
    expect(nav.get('a[aria-current="page"]').attributes('data-entry')).toBe(
      'criteria'
    )
    // Plus de « Se déconnecter » ni de « Sombre » dans l'en-tête : le menu du compte.
    expect(wrapper.text()).not.toContain('Se déconnecter')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain(
      'Camille (démo)'
    )
    // Au téléphone : le membre, vers « Plus ».
    const who = wrapper.get('[data-testid="phone-who"]')
    expect(who.attributes('href')).toBe('/plus')
    expect(who.text()).toContain('Camille (démo)')
    expect(who.text()).toContain('C')
    wrapper.unmount()
  })

  it('le menu du compte s’allume sur l’espace et les notifications', async () => {
    routeName.value = 'notifications'
    const wrapper = withClient(AppHeader)
    await flushPromises()
    expect(wrapper.get('[data-testid="account-menu"]').classes()).toContain(
      'bg-accent-soft'
    )
    expect(
      wrapper.find('[data-testid="desktop-nav"] a[aria-current]').exists()
    ).toBe(false)
    wrapper.unmount()
  })
})
