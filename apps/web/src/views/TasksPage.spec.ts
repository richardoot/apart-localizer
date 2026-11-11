/**
 * Lot 23 : toutes les tâches ouvertes, par annonce et par retard. Cocher
 * comme dans la fiche (même route), « Annuler » la rouvre ; l'erreur sous la
 * tâche ; le filtre « En retard » dans l'URL ; les trois états de lecture.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { OpenTask, OpenTasks } from '@apart/contracts'
import { ApiError } from '@/lib/api'
import { useFeedbackStore } from '@/stores/feedback'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  tasks: { open: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  query: {} as Record<string, string>,
}))
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRoute: () => ({ query: router.query }),
  useRouter: () => router,
}))

import TasksPage from './TasksPage.vue'

const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const task = (over: Partial<OpenTask>): OpenTask => ({
  id: 't1',
  listingId: L1,
  label: 'Demander la taxe foncière',
  assigneeId: null,
  origin: 'default',
  field: null,
  details: null,
  done: false,
  doneAt: null,
  position: 0,
  createdAt: '2026-10-10T08:00:00.000Z',
  requestedAt: null,
  requestId: null,
  answeredAt: null,
  overdue: false,
  openDays: 2,
  ...over,
})
const data: OpenTasks = {
  open: 3,
  overdue: 1,
  overdueDays: 14,
  groups: [
    {
      listing: {
        id: L1,
        title: '[Exemple] T3 Bacalan',
        status: 'visited',
        stage: 'visitees',
        commune: 'Bordeaux',
      },
      overdue: 1,
      tasks: [
        task({
          id: 'a',
          label: 'Demander les PV d’AG',
          overdue: true,
          openDays: 20,
        }),
        task({ id: 'b', label: 'Vérifier la desserte', openDays: 0 }),
      ],
    },
    {
      listing: {
        id: L2,
        title: '[Exemple] T2 Chartrons',
        status: 'to_study',
        stage: 'a-etudier',
        commune: null,
      },
      overdue: 0,
      tasks: [
        task({
          id: 'c',
          listingId: L2,
          label: 'Évaluer les travaux',
          openDays: 1,
        }),
      ],
    },
  ],
}

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(TasksPage, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

describe('TasksPage (lot 23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    router.query = {}
    apiMock.workspace.mockResolvedValue({
      workspace: { id: 'w', name: 'x', members: [] },
      me: null,
    })
    apiMock.tasks.open.mockResolvedValue(data)
    apiMock.tasks.update.mockResolvedValue({})
  })

  it('par annonce, en retard d’abord, avec leur âge', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="tasks-summary"]').text()).toContain(
      'Sur les annonces suivies : 3 tâches ouvertes, dont 1 en retard.'
    )
    const groups = wrapper.findAll('[data-testid="tasks-group"]')
    expect(groups.map(g => g.attributes('data-listing'))).toEqual([L1, L2])
    expect(groups[0]?.text()).toMatch(/Visitées\s+· Bordeaux/)
    expect(groups[0]?.text()).toContain('1 en retard')
    const first = groups[0]?.findAll('[data-testid="tasks-item"]')[0]
    expect(first?.attributes('data-overdue')).toBe('true')
    expect(first?.text()).toContain('ouverte depuis 20 jours')
    expect(groups[0]?.text()).toContain('ouverte aujourd’hui')
    wrapper.unmount()
  })

  it('cocher : la route de l’annonce ; « Annuler » rouvre', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[data-testid="tasks-toggle"]')[0]?.setValue(true)
    await flushPromises()
    expect(apiMock.tasks.update).toHaveBeenCalledWith(L1, 'a', { done: true })
    const feedback = useFeedbackStore()
    const message = feedback.messages.at(-1)
    expect(message?.text).toBe('Tâche cochée : « Demander les PV d’AG ».')
    feedback.act(message?.id ?? -1)
    await flushPromises()
    expect(apiMock.tasks.update).toHaveBeenLastCalledWith(L1, 'a', {
      done: false,
    })
    wrapper.unmount()
  })

  it('un refus du serveur se dit sous la tâche', async () => {
    apiMock.tasks.update.mockRejectedValue(
      new ApiError(404, 'Tâche introuvable')
    )
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[data-testid="tasks-toggle"]')[2]?.setValue(true)
    await flushPromises()
    const item = wrapper.get('[data-task="c"]')
    expect(item.get('[data-testid="tasks-error"]').text()).toBe(
      'Tâche introuvable'
    )
    wrapper.unmount()
  })

  it('« En retard » : seulement les tâches en retard, et le filtre est dans l’URL', async () => {
    router.query = { retard: '1' }
    const wrapper = mountPage()
    await flushPromises()
    expect(
      wrapper
        .findAll('[data-testid="tasks-item"]')
        .map(i => i.attributes('data-task'))
    ).toEqual(['a'])
    const buttons = wrapper
      .get('[data-testid="tasks-filter"]')
      .findAll('button')
    await buttons[0]?.trigger('click')
    expect(router.replace).toHaveBeenCalledWith({ query: {} })
    wrapper.unmount()
  })

  it('le titre ouvre la fiche sur « À faire »', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper
      .findAll('[data-testid="tasks-open-listing"]')[1]
      ?.trigger('click')
    expect(router.push).toHaveBeenCalledWith({
      name: 'listing',
      params: { id: L2 },
      query: { onglet: 'a-faire' },
    })
    wrapper.unmount()
  })

  it('rien d’ouvert : le dit ; à l’échec : « Réessayer »', async () => {
    apiMock.tasks.open.mockResolvedValueOnce({
      open: 0,
      overdue: 0,
      overdueDays: 14,
      groups: [],
    })
    const empty = mountPage()
    await flushPromises()
    expect(empty.text()).toContain('tout est fait')
    empty.unmount()
    apiMock.tasks.open.mockRejectedValueOnce(
      new ApiError(503, 'Le serveur est indisponible.')
    )
    const failed = mountPage()
    await flushPromises()
    expect(failed.text()).toContain('Le serveur est indisponible.')
    expect(failed.find('[data-testid="retry"]').exists()).toBe(true)
    failed.unmount()
  })
})
