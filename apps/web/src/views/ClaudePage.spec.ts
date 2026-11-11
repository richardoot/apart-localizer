/**
 * Lot 26 : la page « Claude » : l'adresse et les étapes, l'usage lu dans le
 * journal (jamais vu, un autre membre, moi), les demandes à copier (une
 * seule source avec le serveur MCP), les explorations, ce que Claude a
 * écrit (lien vers l'activité filtrée dans l'URL). Données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { CLAUDE_REQUESTS, MCP_PROMPT_TITLES } from '@apart/contracts'
import type { ClaudeStatus } from '@apart/contracts'
import { MCP_URL } from '@/lib/api'
import { CLAUDE_CONNECT_STEPS, isLocalAddress } from '@/lib/claude'

const state = vi.hoisted(() => ({
  status: null as unknown,
  explorations: [] as unknown[],
  journal: { items: [] as unknown[], total: 0, page: 1, pageCount: 0 },
}))

vi.mock('@/composables/useActivity', () => ({
  useClaudeStatus: () => ({
    data: ref(state.status),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
  }),
  useActivity: () => ({
    data: ref(state.journal),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useExplorations', () => ({
  useExplorationList: () => ({
    data: ref(state.explorations),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
  }),
}))
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

import ClaudePage from './ClaudePage.vue'

const status = (state: 'never' | 'workspace' | 'me'): ClaudeStatus => ({
  usage: {
    state,
    title:
      state === 'me'
        ? 'Claude est branché pour toi'
        : 'Claude n’a encore rien écrit',
    text: '…',
    lastWriteAt: state === 'never' ? null : '2026-11-10T09:00:00.000Z',
    writes: state === 'never' ? 0 : 3,
  },
  members: [],
})

function mountPage() {
  return mount(ClaudePage, {
    global: {
      stubs: { RouterLink: RouterLinkStub, PendingMessages: true },
    },
  })
}

describe('ClaudePage (lot 26)', () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    state.status = status('never')
    state.explorations = []
    state.journal = { items: [], total: 0, page: 1, pageCount: 0 }
  })
  afterEach(() => vi.useRealTimers())

  it('jamais branché : l’adresse, les étapes ouvertes, l’état dit honnêtement', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="claude-usage"]').attributes('data-state')
    ).toBe('never')
    expect(wrapper.get('[data-testid="claude-mcp-url"]').text()).toBe(MCP_URL)
    const steps = wrapper.get('[data-testid="claude-steps"]')
    expect(steps.attributes('open')).toBeDefined()
    expect(steps.findAll('li').map(li => li.text())).toEqual([
      ...CLAUDE_CONNECT_STEPS,
    ])
    // En local, claude.ai ne joint pas l'adresse : la page le dit.
    expect(wrapper.find('[data-testid="claude-local"]').exists()).toBe(
      isLocalAddress(MCP_URL)
    )
    await wrapper.get('[data-testid="claude-copy-url"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(MCP_URL)
    expect(wrapper.get('[data-testid="claude-copy-url"]').text()).toBe('Copiée')
    vi.advanceTimersByTime(2100)
    await flushPromises()
    expect(wrapper.get('[data-testid="claude-copy-url"]').text()).toBe('Copier')
  })

  it('les demandes à copier : celles de contracts, avec le titre de l’invite MCP', async () => {
    const wrapper = mountPage()
    const items = wrapper.findAll('[data-prompt]')
    expect(items.map(i => i.attributes('data-prompt'))).toEqual(
      CLAUDE_REQUESTS.map(r => r.prompt)
    )
    expect(items[0]!.text()).toContain(
      `invite « ${MCP_PROMPT_TITLES[CLAUDE_REQUESTS[0]!.prompt]} »`
    )
    await items[0]!.get('[data-copy]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(CLAUDE_REQUESTS[0]!.request)
    expect(items[0]!.get('[data-copy]').text()).toBe('Copiée')
  })

  it('branché pour moi : les étapes repliées ; le journal mène à l’activité filtrée', async () => {
    state.status = status('me')
    state.explorations = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        author: null,
        channel: 'mcp',
        startedAt: '2026-11-10T09:00:00.000Z',
        finishedAt: '2026-11-10T09:10:00.000Z',
        criteria: [],
        portals: [],
        counts: {},
        summary: '[Exemple] 4 vues, 2 à valider.',
        notes: null,
        createdAt: '2026-11-10T09:10:00.000Z',
      },
    ]
    const wrapper = mountPage()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="claude-steps"]').attributes('open')
    ).toBeUndefined()
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(
      links
        .find(l => l.attributes('data-testid') === 'claude-journal-all')
        ?.props('to')
    ).toEqual({ name: 'activity', query: { canal: 'mcp' } })
    expect(links.map(l => l.props('to'))).toContainEqual({
      name: 'exploration',
      params: { id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(wrapper.text()).toContain('[Exemple] 4 vues, 2 à valider.')
  })

  it('copie refusée : le texte reste à sélectionner', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('refus')) },
      configurable: true,
    })
    const wrapper = mountPage()
    await wrapper.get('[data-testid="claude-copy-url"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Copie impossible')
  })
})

describe('isLocalAddress', () => {
  it('reconnaît une adresse que claude.ai ne joint pas', () => {
    expect(isLocalAddress('http://localhost:3000/mcp')).toBe(true)
    expect(isLocalAddress('http://127.0.0.1:3000/mcp')).toBe(true)
    expect(isLocalAddress('http://apart.local/mcp')).toBe(true)
    expect(isLocalAddress('https://api.example.app/mcp')).toBe(false)
    expect(isLocalAddress('pas une adresse')).toBe(false)
  })
})
