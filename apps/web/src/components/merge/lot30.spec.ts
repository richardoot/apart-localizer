/**
 * Lot 30 : la question « même bien ? » en haut de la fiche quand Claude a
 * enregistré l'annonce malgré un doublon probable (oui : l'aperçu de la
 * fusion ; non : la paire n'est plus signalée), et la date jusqu'à laquelle
 * une fusion s'annule. Données fictives ; aucun appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type {
  DuplicateQuestion,
  EvaluatedListing,
  ListingMergeRecord,
} from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  merges: {
    similar: vi.fn(),
    distinct: vi.fn(),
    undo: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
const routerMock = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => routerMock }
})

import { ApiError } from '@/lib/api'
import { useFeedbackStore } from '@/stores/feedback'
import DuplicateQuestions from './DuplicateQuestions.vue'
import MergeSection from './MergeSection.vue'

enableAutoUnmount(afterEach)

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MERGE = '33333333-3333-4333-8333-333333333333'
const DAY_MS = 86_400_000

const question = (
  over: Partial<DuplicateQuestion> = {}
): DuplicateQuestion => ({
  id: '44444444-4444-4444-8444-444444444444',
  otherId: OTHER,
  otherTitle: '[Exemple] T3 61 m², balcon',
  askedAt: '2026-11-12T10:00:00.000Z',
  askedChannel: 'mcp',
  ...over,
})

function fiche(
  over: Partial<Omit<EvaluatedListing, 'listing' | 'evaluation'>> = {}
): EvaluatedListing {
  return fakeEvaluated(
    { id: SELF, title: '[Exemple] Appartement 3 pièces 61 m²' },
    over
  )
}

const record = (undoUntil: string): ListingMergeRecord => ({
  id: MERGE,
  keptId: SELF,
  keptTitle: '[Exemple] Appartement 3 pièces 61 m²',
  absorbedId: OTHER,
  absorbedTitle: '[Exemple] T3 61 m², balcon',
  mergedAt: new Date(Date.parse(undoUntil) - 7 * DAY_MS).toISOString(),
  mergedById: null,
  channel: 'web',
  summary: 'Fusionnée avec « [Exemple] T3 61 m², balcon » : 1 lien',
  undoUntil,
  counts: {
    links: 1,
    sellers: 0,
    visits: 0,
    offers: 0,
    opinions: 0,
    tasks: 0,
    agencyRequests: 0,
    fields: 0,
    notes: false,
  },
})

function plugins() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return [[VueQueryPlugin, { queryClient: client }]] as never
}

const stubs = {
  RouterLink: {
    props: ['to'],
    template: '<a data-router-link :data-to="JSON.stringify(to)"><slot /></a>',
  },
  MergeDialog: {
    props: ['item', 'otherId'],
    emits: ['close', 'merged'],
    template: '<div data-merge-dialog :data-other="otherId" />',
  },
}

function mountQuestions(item: EvaluatedListing) {
  return mount(DuplicateQuestions, {
    props: { item },
    attachTo: document.body,
    global: { plugins: plugins(), stubs },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  apiMock.merges.similar.mockResolvedValue({
    items: [],
    compared: 0,
    summary: 'Aucune annonce suivie ne lui ressemble',
  })
})

describe('lot 30 : la question « même bien ? »', () => {
  it('ne montre rien sans question, ni sur une fiche fusionnée', () => {
    expect(
      mountQuestions(fiche())
        .find('[data-testid="duplicate-questions"]')
        .exists()
    ).toBe(false)
    const merged = mountQuestions(
      fiche({
        duplicateQuestions: [question()],
        mergedInto: {
          mergeId: MERGE,
          id: OTHER,
          title: '[Exemple] T3 61 m², balcon',
          mergedAt: '2026-11-12T10:00:00.000Z',
          undoUntil: '2026-11-19T10:00:00.000Z',
        },
      })
    )
    expect(merged.find('[data-testid="duplicate-questions"]').exists()).toBe(
      false
    )
  })

  it('dit que Claude a enregistré la fiche malgré la ressemblance, et ouvre l’aperçu de la fusion', async () => {
    const wrapper = mountQuestions(fiche({ duplicateQuestions: [question()] }))
    const banner = wrapper.get(`[data-question="${OTHER}"]`)
    expect(banner.text()).toContain(
      'Claude a enregistré cette annonce alors qu’elle ressemble beaucoup à « [Exemple] T3 61 m², balcon ». Est-ce le même bien ?'
    )
    expect(
      banner.get('[data-action="duplicate-open"]').attributes('data-to')
    ).toContain(OTHER)
    expect(wrapper.find('[data-merge-dialog]').exists()).toBe(false)
    await banner.get('[data-action="duplicate-compare"]').trigger('click')
    expect(wrapper.get('[data-merge-dialog]').attributes('data-other')).toBe(
      OTHER
    )
  })

  it('« Non, deux biens différents » enregistre la réponse et le dit', async () => {
    apiMock.merges.distinct.mockResolvedValue(fiche())
    const wrapper = mountQuestions(fiche({ duplicateQuestions: [question()] }))
    await wrapper.get('[data-action="duplicate-distinct"]').trigger('click')
    await flushPromises()
    expect(apiMock.merges.distinct).toHaveBeenCalledWith(SELF, OTHER)
    const feedback = useFeedbackStore()
    expect(feedback.messages.at(-1)?.text).toContain(
      '« [Exemple] T3 61 m², balcon » est un autre bien'
    )
  })

  it('un refus de l’API est dit sur place', async () => {
    apiMock.merges.distinct.mockRejectedValue(
      new ApiError(404, 'Annonce introuvable')
    )
    const wrapper = mountQuestions(fiche({ duplicateQuestions: [question()] }))
    await wrapper.get('[data-action="duplicate-distinct"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Annonce introuvable')
  })
})

describe('lot 30 : une fusion s’annule pendant sept jours', () => {
  function mountSection(item: EvaluatedListing) {
    return mount(MergeSection, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('dit jusqu’à quand, et retire « Annuler la fusion » passé ce délai', async () => {
    const soon = new Date(Date.now() + 2 * DAY_MS).toISOString()
    const recent = mountSection(fiche({ absorbed: [record(soon)] }))
    await flushPromises()
    const list = recent.get('[data-testid="absorbed-list"]')
    expect(list.text()).toContain('Annulable jusqu’au')
    expect(list.find('[data-action="undo-merge"]').exists()).toBe(true)

    const past = new Date(Date.now() - DAY_MS).toISOString()
    const old = mountSection(fiche({ absorbed: [record(past)] }))
    await flushPromises()
    expect(
      old
        .get('[data-testid="absorbed-list"]')
        .find('[data-action="undo-merge"]')
        .exists()
    ).toBe(false)
  })
})
