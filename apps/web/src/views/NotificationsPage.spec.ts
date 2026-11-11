import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiError } from '@/lib/api'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  notifications: {
    list: vi.fn(),
    settings: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    updatePreferences: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRouter: () => ({ push: vi.fn() }),
}))

import NotificationsPage from './NotificationsPage.vue'

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(NotificationsPage, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

describe('NotificationsPage (lot 22 : états de lecture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    apiMock.workspace.mockReturnValue(new Promise(() => undefined))
    apiMock.notifications.settings.mockReturnValue(new Promise(() => undefined))
  })

  it('pendant le chargement : un squelette, jamais « Aucune notification. »', async () => {
    apiMock.notifications.list.mockReturnValue(new Promise(() => undefined))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Aucune notification.')
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('à l’échec : le message et « Réessayer », qui relit', async () => {
    apiMock.notifications.list.mockRejectedValueOnce(
      new ApiError(503, 'Le serveur est indisponible.')
    )
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Le serveur est indisponible.')
    expect(wrapper.text()).not.toContain('Aucune notification.')
    apiMock.notifications.list.mockResolvedValue({
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 50,
      pageCount: 0,
    })
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(apiMock.notifications.list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Aucune notification.')
    wrapper.unmount()
  })
})

describe('NotificationsPage (lot 26 : le push sur iPhone)', () => {
  const settings = {
    preferences: {},
    push: { enabled: true, publicKey: 'BAAA', subscriptions: 0 },
    email: { enabled: false, address: null },
    inbound: { enabled: false, path: '/inbound/x' },
  }
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    apiMock.workspace.mockReturnValue(new Promise(() => undefined))
    apiMock.notifications.list.mockResolvedValue({
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 50,
      pageCount: 0,
    })
    apiMock.notifications.settings.mockResolvedValue(settings)
  })

  it('dans Safari sur iPhone : dit d’ajouter l’application à l’écran d’accueil', async () => {
    const ua = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
      )
    const wrapper = mountPage()
    await flushPromises()
    const push = wrapper.get('[data-testid="push"]')
    expect(push.get('[data-testid="install-help"]').text()).toContain(
      'ne marchent que dans l’application ouverte depuis l’écran d’accueil'
    )
    expect(push.text()).not.toContain('Ce navigateur ne reçoit pas')
    ua.mockRestore()
    wrapper.unmount()
  })

  it('sur un ordinateur : pas d’aide d’installation', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="push"]').text()).not.toContain(
      'écran d’accueil'
    )
    wrapper.unmount()
  })
})
