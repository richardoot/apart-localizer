import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type {
  Invitation,
  InvitationWriteResult,
  Member,
  WorkspaceMe,
} from '@apart/contracts'
import { MEMBERS } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  members: {
    rename: vi.fn(),
    invite: vi.fn(),
    cancel: vi.fn(),
    changeRole: vi.fn(),
    remove: vi.fn(),
    leave: vi.fn(),
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

import WorkspacePage from './WorkspacePage.vue'
import { ApiError } from '@/lib/api'

const RICHARD = MEMBERS[0] as Member
const CHLOE = MEMBERS[1] as Member
const WS = RICHARD.workspaceId
const AT = '2026-11-04T10:00:00.000Z'

const PENDING: Invitation = {
  id: '33333333-3333-4333-8333-333333333333',
  workspaceId: WS,
  email: 'lea@exemple.invalid',
  displayName: 'Léa',
  state: 'pending',
  invitedAt: AT,
  expiresAt: '2026-11-18T10:00:00.000Z',
  invitedBy: { id: RICHARD.id, displayName: 'Richard' },
  closedAt: null,
}
const EXPIRED: Invitation = {
  ...PENDING,
  id: '44444444-4444-4444-8444-444444444444',
  email: 'sam@exemple.invalid',
  displayName: 'Sam',
  state: 'expired',
}
const FORMER: Member = {
  ...CHLOE,
  id: '55555555-5555-4555-8555-555555555555',
  handle: 'paul',
  displayName: 'Paul',
  status: 'removed',
  removedAt: '2026-11-02T10:00:00.000Z',
}

function workspaceFor(
  me: Member,
  over: Partial<WorkspaceMe['workspace']> = {}
): WorkspaceMe {
  return {
    me,
    workspace: {
      id: WS,
      name: 'Appartement',
      createdAt: AT,
      members: [RICHARD, CHLOE, FORMER],
      invitations: [PENDING, EXPIRED],
      ...over,
    },
  }
}

function result(
  email: InvitationWriteResult['delivery']['email']
): InvitationWriteResult {
  return {
    invitation: {
      ...PENDING,
      email: 'max@exemple.invalid',
      displayName: 'Max',
    },
    renewed: false,
    delivery: { email, link: 'https://apart.exemple.invalid/login' },
  }
}

async function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(WorkspacePage, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  apiMock.workspace.mockResolvedValue(workspaceFor(RICHARD))
})

describe('WorkspacePage (propriétaire)', () => {
  it('liste les membres actifs, les anciens membres et les invitations', async () => {
    const wrapper = await mountPage()
    const members = wrapper.find('[data-testid="members"]')
    expect(members.findAll('li')).toHaveLength(2)
    expect(members.text()).toContain('Richard (vous)')
    expect(members.text()).toContain('pas encore connecté')
    expect(wrapper.find('[data-testid="former-members"]').text()).toContain(
      'Paul'
    )
    const invitations = wrapper.find('[data-testid="invitations"]')
    expect(invitations.text()).toContain('En attente')
    expect(invitations.text()).toContain('Expirée')
    expect(invitations.text()).toContain('par Richard')
  })

  it("valide l'adresse avant d'inviter, puis montre le lien à transmettre", async () => {
    const wrapper = await mountPage()
    await wrapper
      .find('[data-testid="invite-email"]')
      .setValue('pas-une-adresse')
    await wrapper.find('[data-testid="invite-name"]').setValue('Max')
    await wrapper.find('[data-testid="invite-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="invite-error"]').text()).toBe(
      'Adresse e-mail invalide'
    )
    expect(apiMock.members.invite).not.toHaveBeenCalled()

    apiMock.members.invite.mockResolvedValue(result('disabled'))
    await wrapper
      .find('[data-testid="invite-email"]')
      .setValue(' Max@Exemple.invalid ')
    await wrapper.find('[data-testid="invite-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.members.invite).toHaveBeenCalledWith({
      email: 'max@exemple.invalid',
      displayName: 'Max',
    })
    const sent = wrapper.find('[data-testid="invite-result"]')
    expect(sent.text()).toContain('Transmettez ce lien à Max')
    expect(
      (wrapper.find('[data-testid="invite-link"]').element as HTMLInputElement)
        .value
    ).toBe('https://apart.exemple.invalid/login')
    expect(
      (wrapper.find('[data-testid="invite-email"]').element as HTMLInputElement)
        .value
    ).toBe('')
    // Le lien se copie.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    await sent.find('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(
      'https://apart.exemple.invalid/login'
    )
    expect(sent.find('button').text()).toBe('Copié')
  })

  it("annonce l'e-mail envoyé, ou son échec, et le refus de l'API", async () => {
    const wrapper = await mountPage()
    apiMock.members.invite.mockResolvedValueOnce(result('sent'))
    await wrapper
      .find('[data-testid="invite-email"]')
      .setValue('max@exemple.invalid')
    await wrapper.find('[data-testid="invite-name"]').setValue('Max')
    await wrapper.find('[data-testid="invite-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="invite-result"]').text()).toContain(
      "E-mail d'invitation envoyé à max@exemple.invalid"
    )
    apiMock.members.invite.mockResolvedValueOnce(result('failed'))
    await wrapper
      .find('[data-testid="invite-email"]')
      .setValue('max@exemple.invalid')
    await wrapper.find('[data-testid="invite-name"]').setValue('Max')
    await wrapper.find('[data-testid="invite-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="invite-result"]').text()).toContain(
      "L'e-mail n'a pas pu partir."
    )
    apiMock.members.invite.mockRejectedValueOnce(
      new ApiError(
        409,
        'Une invitation est déjà en attente pour cette adresse.'
      )
    )
    await wrapper
      .find('[data-testid="invite-email"]')
      .setValue('lea@exemple.invalid')
    await wrapper.find('[data-testid="invite-name"]').setValue('Léa')
    await wrapper.find('[data-testid="invite-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="invite-error"]').text()).toBe(
      'Une invitation est déjà en attente pour cette adresse.'
    )
    expect(wrapper.find('[data-testid="invite-result"]').exists()).toBe(false)
  })

  it('annule, renouvelle, nomme propriétaire et retire après confirmation', async () => {
    apiMock.members.cancel.mockResolvedValue({ ...PENDING, state: 'canceled' })
    apiMock.members.invite.mockResolvedValue({
      ...result('disabled'),
      renewed: true,
    })
    apiMock.members.changeRole.mockResolvedValue({ ...CHLOE, role: 'owner' })
    apiMock.members.remove.mockResolvedValue({ ...CHLOE, status: 'removed' })
    const wrapper = await mountPage()

    await wrapper.find(`[data-cancel="${PENDING.email}"]`).trigger('click')
    await flushPromises()
    expect(apiMock.members.cancel).toHaveBeenCalledWith(PENDING.id)

    await wrapper.find(`[data-renew="${EXPIRED.email}"]`).trigger('click')
    await flushPromises()
    expect(apiMock.members.invite).toHaveBeenCalledWith({
      email: EXPIRED.email,
      displayName: 'Sam',
    })
    expect(wrapper.find('[data-testid="invite-result"]').text()).toContain(
      'Invitation renouvelée'
    )

    const chloe = wrapper.find('[data-member="chloe"]')
    await chloe
      .findAll('button')
      .find(b => b.text() === 'Nommer propriétaire')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.members.changeRole).toHaveBeenCalledWith(CHLOE.id, 'owner')

    await wrapper.find('[data-remove="chloe"]').trigger('click')
    expect(wrapper.find('[data-member="chloe"]').text()).toContain(
      "Chloé perdra l'accès tout de suite"
    )
    await wrapper.find('[data-testid="confirm-remove"]').trigger('click')
    await flushPromises()
    expect(apiMock.members.remove).toHaveBeenCalledWith(CHLOE.id)
    expect(wrapper.text()).toContain('son historique reste à son nom')
  })

  it("renomme l'espace et affiche le refus du dernier propriétaire", async () => {
    apiMock.members.rename.mockResolvedValue({
      ...workspaceFor(RICHARD),
      workspace: { ...workspaceFor(RICHARD).workspace, name: 'Notre appart' },
    })
    const wrapper = await mountPage()
    await wrapper
      .find('[data-testid="workspace-name"]')
      .setValue('Notre appart')
    await wrapper.find('[data-testid="rename-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.members.rename).toHaveBeenCalledWith({
      name: 'Notre appart',
    })
    expect(wrapper.text()).toContain('Espace renommé.')
    // Seul propriétaire : pas de bouton pour partir.
    expect(wrapper.find('[data-testid="leave"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Vous êtes le dernier propriétaire')
  })
})

describe('WorkspacePage (membre)', () => {
  beforeEach(() => {
    apiMock.workspace.mockResolvedValue(workspaceFor(CHLOE))
  })

  it("ne propose ni d'inviter, ni de retirer, ni de changer un rôle", async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(
      "Seul un propriétaire de l'espace peut inviter."
    )
    expect(wrapper.find('[data-remove="richard"]').exists()).toBe(false)
    expect(wrapper.find(`[data-cancel="${PENDING.email}"]`).exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="rename-form"]').exists()).toBe(false)
  })

  it("quitte l'espace après confirmation, ou montre le refus", async () => {
    apiMock.members.leave.mockRejectedValueOnce(
      new ApiError(409, 'Refusé pour la démonstration.')
    )
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="leave"]').trigger('click')
    await wrapper.find('[data-testid="confirm-leave"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="workspace-error"]').text()).toBe(
      'Refusé pour la démonstration.'
    )
    expect(routerPush).not.toHaveBeenCalled()

    apiMock.members.leave.mockResolvedValueOnce(undefined)
    await wrapper.find('[data-testid="leave"]').trigger('click')
    await wrapper.find('[data-testid="confirm-leave"]').trigger('click')
    await flushPromises()
    expect(apiMock.members.leave).toHaveBeenCalledTimes(2)
    expect(routerPush).toHaveBeenCalledWith('/')
  })
})
