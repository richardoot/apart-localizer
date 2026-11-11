import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ref } from 'vue'
import type { Visit } from '@apart/contracts'
import { resetOutbox } from '@/composables/useOutbox'
import { memoryOutboxStorage } from '@/lib/outbox-store'
import type { OutboxApi } from '@/lib/outbox-executor'
import { useAuthStore } from '@/stores/auth'
import {
  MEMBERS,
  fakeEvaluated,
  fakeOpinion,
  fakeOpinionSummary,
  fakeTask,
} from '@/test/fixtures'

/**
 * Lot 24 : le mode visite. Les lectures sont factices ; les écritures
 * passent par une vraie file (stockage en mémoire, API factice) : on vérifie
 * ce que l'écran montre tout de suite et ce qui part.
 */

const RICHARD = MEMBERS[0]!
const CHLOE = MEMBERS[1]!
const LISTING = '11111111-1111-4111-8111-111111111111'
const VISIT_ID = '99999999-9999-4999-8999-999999999999'

const state = vi.hoisted(() => ({
  item: null as unknown,
  visits: [] as unknown[],
  query: {} as Record<string, string>,
  setStatus: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { id: LISTING }, query: state.query }),
    useRouter: () => ({ back: state.back, push: state.push }),
  }
})
vi.mock('@/composables/useListings', () => ({
  useListing: () => ({
    data: ref(state.item),
    isError: ref(false),
    isPending: ref(false),
    error: ref(null),
  }),
  useListingMutations: () => ({ setStatus: { mutateAsync: state.setStatus } }),
}))
vi.mock('@/composables/useVisits', () => ({
  useVisits: () => ({
    data: ref(state.visits),
    isError: ref(false),
    isPending: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    me: ref({ id: RICHARD.id }),
    members: ref(MEMBERS),
  }),
}))

import VisitModePage from './VisitModePage.vue'

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: VISIT_ID,
  listingId: LISTING,
  visitedAt: new Date(Date.now() - 60_000).toISOString(),
  status: 'planned',
  participantIds: [RICHARD.id, CHLOE.id],
  report: 'Lumineux.',
  pros: null,
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: RICHARD.id,
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  photoCount: 0,
  photos: [],
  ...over,
})

function fakeApi() {
  return {
    tasks: { update: vi.fn().mockResolvedValue({}) },
    visits: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn().mockResolvedValue({ visit: visit({ id: 'created' }) }),
      update: vi
        .fn()
        .mockResolvedValue({ visit: visit({ updatedAt: 'apres' }) }),
      requestPhotoUpload: vi.fn(),
      completePhoto: vi.fn(),
    },
    opinions: {
      upsertMine: vi.fn().mockResolvedValue({ updatedAt: 'avis' }),
      list: vi.fn().mockResolvedValue([]),
    },
    upload: vi.fn(),
  }
}

let api: ReturnType<typeof fakeApi>

async function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(VisitModePage, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await flushPromises()
}

describe('Lot 24 : le mode visite', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    state.query = {}
    const mine = fakeOpinion({
      memberId: RICHARD.id,
      rating: 0,
      text: 'Bien situé',
      updatedAt: '2026-11-10T09:00:00.000Z',
      scores: [
        {
          key: 'quiet',
          score: 2,
          word: 'bus',
          updatedAt: '2026-11-10T09:00:00.000Z',
        },
      ],
    })
    const other = fakeOpinion({
      memberId: CHLOE.id,
      rating: 5,
      text: 'Secret de Chloé',
    })
    const { summary } = fakeOpinionSummary([mine, other], {
      viewerId: RICHARD.id,
    })
    state.item = fakeEvaluated(
      { id: LISTING, title: '[Exemple] T2 Bastide', status: 'to_visit' },
      {
        tasks: [
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            label: 'Demander la taxe foncière',
            position: 0,
          }),
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000002',
            label: 'Vérifier la cave',
            position: 1,
          }),
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000003',
            label: 'À revoir à la contre-visite : le calme',
            origin: 'opinion',
            position: 2,
          }),
        ],
        opinions: [mine],
        opinionSummary: summary,
      }
    )
    state.visits = [visit()]
    api = fakeApi()
    resetOutbox({
      storage: Promise.resolve(memoryOutboxStorage()),
      api: api as unknown as OutboxApi,
      schedule: () => () => undefined,
    })
    useAuthStore().user = { id: 'sb-richard' } as never
  })

  it('un écran : points à vérifier (contre-visite d’abord), photos, remarque, mes notes, compte rendu', async () => {
    const wrapper = await mountPage()
    expect(wrapper.get('h1').text()).toBe('[Exemple] T2 Bastide')
    expect(
      wrapper.findAll('[data-testid="visit-points"] li').map(li => li.text())
    ).toEqual([
      'À revoir à la contre-visite : le calmeContre-visite',
      'Vérifier la cave',
    ])
    expect(
      wrapper.find('[data-testid="visit-camera"]').attributes('capture')
    ).toBe('environment')
    expect(
      wrapper.find('[data-testid="visit-library"]').attributes('multiple')
    ).toBeDefined()
    expect(
      wrapper.findAll('[data-testid="visit-scores"] li').length
    ).toBeGreaterThan(0)
    // À l'aveugle : rien des autres ici.
    expect(wrapper.text()).not.toContain('Secret de Chloé')
    expect(
      (wrapper.get('#vm-report-text').element as HTMLTextAreaElement).value
    ).toBe('Lumineux.')
    expect(wrapper.get('[data-testid="visit-finish"]').text()).toBe(
      'Terminer la visite'
    )
    wrapper.unmount()
  })

  it('cocher s’affiche tout de suite et part ; la remarque s’ajoute au compte rendu', async () => {
    const wrapper = await mountPage()
    const box = wrapper.get(
      '[data-testid="visit-point-aaaaaaaa-0000-4000-8000-000000000002"]'
    )
    await box.setValue(true)
    await settle()
    expect((box.element as HTMLInputElement).checked).toBe(true)
    expect(api.tasks.update).toHaveBeenCalledWith(
      LISTING,
      'aaaaaaaa-0000-4000-8000-000000000002',
      { done: true }
    )

    await wrapper.get('#vm-remark-text').setValue('cave saine')
    await wrapper.get('[data-testid="visit-remark-add"]').trigger('submit')
    await settle()
    expect(api.visits.update).toHaveBeenCalledWith(
      LISTING,
      VISIT_ID,
      expect.objectContaining({
        remark: expect.objectContaining({ text: 'cave saine' }),
      })
    )
    wrapper.unmount()
  })

  it('une note garde mon mot et ma phrase, avec le garde-fou lu', async () => {
    const wrapper = await mountPage()
    const quiet = wrapper.get('[data-criterion="quiet"]')
    await quiet.findAll('[role="radio"]')[4]!.trigger('click')
    await settle()
    // Regroupées : rien ne part avant la fin du délai ; « Terminer » envoie.
    expect(api.opinions.upsertMine).not.toHaveBeenCalled()
    expect(quiet.find('[role="radio"][aria-checked="true"]').text()).toContain(
      '4'
    )
    await wrapper.get('[data-testid="visit-finish"]').trigger('click')
    await settle()
    expect(api.opinions.upsertMine).toHaveBeenCalledWith(LISTING, {
      rating: 0,
      text: 'Bien situé',
      scores: { quiet: { score: 4, word: 'bus' } },
      expectedUpdatedAt: '2026-11-10T09:00:00.000Z',
    })
    expect(api.visits.update).toHaveBeenCalledWith(
      LISTING,
      VISIT_ID,
      expect.objectContaining({ status: 'done' })
    )
    expect(wrapper.find('[data-testid="visit-finished"]').exists()).toBe(true)
    // « Visité » proposé, appliqué par le changement de statut habituel.
    state.setStatus.mockResolvedValue({ listing: { status: 'visited' } })
    await wrapper.get('[data-testid="visit-status-yes"]').trigger('click')
    await settle()
    expect(state.setStatus).toHaveBeenCalledWith({
      id: LISTING,
      change: { status: 'visited', reason: null, expectedStatus: 'to_visit' },
    })
    wrapper.unmount()
  })

  it('une visite faite d’un autre, sans moi : compte rendu en lecture seule', async () => {
    state.visits = [
      visit({
        status: 'done',
        createdById: CHLOE.id,
        participantIds: [CHLOE.id],
      }),
    ]
    const wrapper = await mountPage()
    expect(wrapper.get('[data-testid="visit-readonly"]').text()).toContain(
      'Seuls l’auteur de la visite et ses participants'
    )
    expect(wrapper.get('#vm-report-text').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-testid="visit-remark-add"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('[data-testid="visit-finish"]').text()).toBe('Fermer')
    wrapper.unmount()
  })

  it('sans visite : la commencer maintenant, même hors ligne', async () => {
    state.visits = []
    api.visits.create.mockRejectedValue(new TypeError('Failed to fetch'))
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="visit-start"]').trigger('click')
    await settle()
    expect(wrapper.find('[data-testid="visit-points"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="visit-sync"]').text()).toContain('1')
    await wrapper.get('[data-testid="visit-sync"]').trigger('click')
    expect(wrapper.get('[data-testid="visit-pending-list"]').text()).toContain(
      'Visite commencée'
    )
    wrapper.unmount()
  })

  it('un refus reste à revoir, avec « Réessayer »', async () => {
    const { ApiError } = await import('@/lib/api')
    api.tasks.update.mockRejectedValueOnce(
      new ApiError(404, 'Tâche introuvable')
    )
    const wrapper = await mountPage()
    await wrapper
      .get('[data-testid="visit-point-aaaaaaaa-0000-4000-8000-000000000002"]')
      .setValue(true)
    await settle()
    const list = wrapper.get('[data-testid="visit-pending-list"]')
    expect(list.text()).toContain('Tâche introuvable')
    expect(list.text()).toContain('refusé')
    await list
      .findAll('button')
      .find(b => b.text() === 'Réessayer')!
      .trigger('click')
    await settle()
    expect(wrapper.find('[data-testid="visit-pending-list"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })
})
