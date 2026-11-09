import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Member, ReceivedInvitation, WorkspaceMe } from '@apart/contracts'
import { MEMBERS } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  members: {
    received: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
  },
}))
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push: routerPush }) }
})

import InvitationBanner from './InvitationBanner.vue'
import { ApiError } from '@/lib/api'

const ME = { ...(MEMBERS[0] as Member), displayName: 'Sam' }
const OWN: WorkspaceMe = {
  me: ME,
  workspace: {
    id: ME.workspaceId,
    name: 'Mon espace',
    createdAt: ME.createdAt,
    members: [ME],
    invitations: [],
    decideTogether: true,
  },
}
const INVITATION: ReceivedInvitation = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace: {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'Appartement Bordeaux',
  },
  displayName: 'Sam',
  invitedByName: 'Richard',
  invitedAt: '2026-11-04T10:00:00.000Z',
  expiresAt: '2026-11-18T10:00:00.000Z',
}

async function mountBanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(InvitationBanner, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return { wrapper, client }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  apiMock.workspace.mockResolvedValue(OWN)
})

describe('InvitationBanner', () => {
  it('ne montre rien sans invitation reçue', async () => {
    apiMock.members.received.mockResolvedValue([])
    const { wrapper } = await mountBanner()
    expect(wrapper.find('[data-testid="invitation-banner"]').exists()).toBe(
      false
    )
  })

  it("propose de rejoindre l'espace qui invite, après confirmation", async () => {
    apiMock.members.received.mockResolvedValue([INVITATION])
    apiMock.members.accept.mockResolvedValue({
      ...OWN,
      workspace: { ...OWN.workspace, name: 'Appartement Bordeaux' },
    })
    const { wrapper } = await mountBanner()
    const banner = wrapper.find('[data-testid="invitation-banner"]')
    expect(banner.text()).toContain('Richard vous invite à rejoindre')
    expect(banner.text()).toContain('« Appartement Bordeaux »')
    await wrapper.find('[data-testid="join"]').trigger('click')
    expect(banner.text()).toContain('Vous quitterez « Mon espace »')
    expect(apiMock.members.accept).not.toHaveBeenCalled()
    apiMock.members.received.mockResolvedValue([])
    await wrapper.find('[data-testid="confirm-join"]').trigger('click')
    await flushPromises()
    expect(apiMock.members.accept).toHaveBeenCalledWith(INVITATION.id)
    expect(routerPush).toHaveBeenCalledWith('/espace')
  })

  it('montre le refus de rejoindre (seul propriétaire)', async () => {
    apiMock.members.received.mockResolvedValue([INVITATION])
    apiMock.members.accept.mockRejectedValue(
      new ApiError(409, 'Vous êtes le seul propriétaire de « Mon espace »…')
    )
    const { wrapper } = await mountBanner()
    await wrapper.find('[data-testid="join"]').trigger('click')
    await wrapper.find('[data-testid="confirm-join"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="banner-error"]').text()).toContain(
      'seul propriétaire'
    )
    expect(routerPush).not.toHaveBeenCalled()
  })

  it("refuse l'invitation et la retire du bandeau", async () => {
    apiMock.members.received.mockResolvedValueOnce([INVITATION])
    apiMock.members.received.mockResolvedValue([])
    apiMock.members.decline.mockResolvedValue(undefined)
    const { wrapper } = await mountBanner()
    await wrapper.find('[data-testid="decline"]').trigger('click')
    await flushPromises()
    expect(apiMock.members.decline).toHaveBeenCalledWith(INVITATION.id)
    expect(wrapper.find('[data-testid="invitation-banner"]').exists()).toBe(
      false
    )
  })

  it('signale un refus qui échoue', async () => {
    apiMock.members.received.mockResolvedValue([INVITATION])
    apiMock.members.decline.mockRejectedValue(new Error('réseau'))
    const { wrapper } = await mountBanner()
    await wrapper.find('[data-testid="decline"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="banner-error"]').text()).toBe(
      "Le refus n'a pas pu être enregistré."
    )
  })
})
