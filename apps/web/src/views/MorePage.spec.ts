/**
 * Lot 23 : « Plus » au téléphone : qui est connecté, les autres pages, le
 * thème et la déconnexion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const apiMock = vi.hoisted(() => ({ workspace: vi.fn() }))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
const push = vi.fn()
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRouter: () => ({ push }),
}))

import MorePage from './MorePage.vue'

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(MorePage, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
      },
    },
  })
}

describe('MorePage (lot 23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    apiMock.workspace.mockResolvedValue({
      workspace: { id: 'w', name: 'Démo', members: [] },
      me: { id: 'm', displayName: 'Sacha (démo)', role: 'member' },
    })
  })

  it('dit qui est connecté et range les autres pages', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="more-who"]').text()).toContain(
      'Connecté : Sacha (démo)'
    )
    expect(wrapper.get('[data-testid="more-who"]').text()).toContain(
      'Espace « Démo »'
    )
    expect(
      wrapper.findAll('a[data-entry]').map(a => a.attributes('href'))
    ).toEqual([
      '/criteres',
      '/hypotheses',
      '/activite',
      '/espace',
      '/espace/criteres-des-avis',
    ])
    wrapper.unmount()
  })

  it('le thème se choisit ; « Se déconnecter » mène à la connexion', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const theme = useThemeStore()
    const buttons = wrapper.get('[data-testid="more-theme"]').findAll('button')
    await buttons[1]?.trigger('click')
    expect(theme.mode).toBe('dark')
    const auth = useAuthStore()
    const signOut = vi.spyOn(auth, 'signOut').mockResolvedValue()
    await wrapper.get('[data-testid="more-sign-out"]').trigger('click')
    await flushPromises()
    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'login' })
    wrapper.unmount()
  })
})
