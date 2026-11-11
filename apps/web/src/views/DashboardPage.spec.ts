import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type {
  GettingStarted,
  WorkflowAgendaItem,
  WorkflowOverview,
} from '@apart/contracts'
import { fakeCriteria } from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  gettingStarted: vi.fn(),
  listings: { list: vi.fn() },
  searchCriteria: { list: vi.fn() },
  decisions: { overview: vi.fn() },
  whatsNew: { report: vi.fn() },
  drafts: { list: vi.fn() },
  agency: { pending: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

const push = vi.fn()
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push }) }
})

import DashboardPage from './DashboardPage.vue'

const item = (
  value: Omit<WorkflowAgendaItem, 'detail' | 'listingId'> &
    Partial<WorkflowAgendaItem>
): WorkflowAgendaItem => ({ detail: null, listingId: null, ...value })

const LISTING = '11111111-1111-4111-8111-111111111111'

function overview(over: Partial<WorkflowOverview> = {}): WorkflowOverview {
  return {
    decideTogether: true,
    agreementRequired: true,
    others: [],
    stages: [
      {
        stage: 'a-valider',
        count: 2,
        outOfCriteria: 0,
        toSort: 2,
        sub: '2 à trier',
      },
      {
        stage: 'a-etudier',
        count: 5,
        outOfCriteria: 1,
        toSort: 1,
        sub: '1 à trier',
      },
      {
        stage: 'a-visiter',
        count: 2,
        outOfCriteria: 0,
        toSort: 0,
        sub: '1 sans date',
      },
      {
        stage: 'visitees',
        count: 1,
        outOfCriteria: 0,
        toSort: 0,
        sub: '1 avis à donner',
      },
      {
        stage: 'offres',
        count: 0,
        outOfCriteria: 0,
        toSort: 0,
        sub: 'Aucune en cours',
      },
      {
        stage: 'archives',
        count: 4,
        outOfCriteria: 0,
        toSort: 0,
        sub: 'Écartées, refusées, vendues',
      },
    ],
    agenda: [
      item({ key: 'to_sort', count: 3, label: 'à trier', stage: 'a-valider' }),
      item({
        key: 'to_confirm',
        count: 1,
        label: 'à confirmer après Chloé',
        stage: null,
      }),
      item({
        key: 'upcoming_visits',
        count: 1,
        label: 'visite à venir',
        stage: 'a-visiter',
        detail: 'jeudi 12 novembre, 18 h 30',
        listingId: LISTING,
      }),
      item({
        key: 'messages_to_approve',
        count: 2,
        label: 'messages à valider',
        stage: null,
      }),
      item({
        key: 'overdue_tasks',
        count: 4,
        label: 'tâches en retard',
        stage: null,
        detail: 'ouvertes depuis plus de 14 jours',
      }),
    ],
    proposals: [],
    tasks: { open: 12, overdue: 4, overdueDays: 14 },
    ...over,
  }
}

const started = (mode: GettingStarted['mode']): GettingStarted => ({
  mode,
  doneCount: mode === 'full' ? 0 : 3,
  steps: [
    {
      key: 'assumptions',
      done: mode !== 'full',
      title: 'Régler tes hypothèses',
      text: '…',
    },
    {
      key: 'criteria',
      done: mode !== 'full',
      title: 'Dessiner tes critères de recherche',
      text: '…',
    },
    {
      key: 'listing',
      done: mode !== 'full',
      title: 'Ajouter une première annonce',
      text: '…',
    },
    { key: 'claude', done: false, title: 'Connecter Claude', text: '…' },
  ],
})

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(DashboardPage, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
        },
      },
    },
  })
}

const toOf = (el: { attributes: (name: string) => string | undefined }) =>
  JSON.parse(el.attributes('data-to') as string)

describe('DashboardPage (lot 23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.workspace.mockResolvedValue({
      workspace: { id: 'w', name: 'Espace fictif', members: [] },
      me: null,
    })
    apiMock.listings.list.mockResolvedValue({
      items: [fakeEvaluated({}, { isNewForMe: true })],
      total: 1,
    })
    apiMock.searchCriteria.list.mockResolvedValue([fakeCriteria()])
    apiMock.decisions.overview.mockResolvedValue(overview())
    apiMock.gettingStarted.mockResolvedValue(started('none'))
    apiMock.whatsNew.report.mockResolvedValue({
      total: 0,
      counts: {},
      items: [],
    })
    apiMock.drafts.list.mockResolvedValue([])
    apiMock.agency.pending.mockResolvedValue({
      toApprove: [],
      toSend: [],
      followUpsDue: [],
    })
  })

  it('« Ce qui t’attend » en tête : chaque ligne ouvre le bon travail', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const agenda = wrapper.get('[data-testid="home-agenda"]')
    // Avant tout le reste de la page.
    const sections = wrapper.findAll('section > section, section > div')
    expect(sections[0]?.attributes('data-testid')).toBe('home-agenda')
    const line = (key: string) => agenda.get(`[data-agenda="${key}"]`)
    expect(line('to_sort').text()).toContain('3')
    expect(line('to_sort').text()).toContain('Trier')
    expect(toOf(line('to_sort'))).toEqual({
      name: 'triage',
      query: { etape: 'a-valider' },
    })
    expect(toOf(line('to_confirm'))).toEqual({
      name: 'triage',
      query: { mode: 'confirmer' },
    })
    // Une seule annonce visée : sa fiche, onglet « À faire ».
    expect(line('upcoming_visits').text()).toContain(
      'jeudi 12 novembre, 18 h 30'
    )
    expect(toOf(line('upcoming_visits'))).toEqual({
      name: 'listing',
      params: { id: LISTING },
      query: { onglet: 'a-faire' },
    })
    // Plusieurs annonces : le bloc des messages de l'accueil.
    expect(toOf(line('messages_to_approve'))).toEqual({
      name: 'home',
      hash: '#messages-a-valider',
    })
    expect(toOf(line('overdue_tasks'))).toEqual({
      name: 'tasks',
      query: { retard: '1' },
    })
    wrapper.unmount()
  })

  it('les étapes remplacent « Par statut » ; plus aucun lien `?status=` ; les tâches mènent à leur vue', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const stages = wrapper.get('[data-testid="home-stages"]')
    expect(stages.findAll('[data-stage]')).toHaveLength(6)
    expect(toOf(stages.get('[data-stage="a-etudier"]'))).toEqual({
      name: 'listings',
      query: { etape: 'a-etudier' },
    })
    expect(stages.get('[data-stage="a-etudier"]').text()).toContain('5')
    expect(wrapper.text()).not.toContain('Par statut')
    for (const link of wrapper.findAll('a[data-to]')) {
      expect(link.attributes('data-to')).not.toContain('"status"')
    }
    expect(wrapper.get('[data-testid="open-tasks"]').text()).toBe(
      '12 tâches ouvertes, dont 4 en retard.'
    )
    expect(toOf(wrapper.get('[data-testid="home-tasks-open"]'))).toEqual({
      name: 'tasks',
    })
    wrapper.unmount()
  })

  it('les chiffres généraux en bas, après les annonces', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const html = wrapper.html()
    expect(html.indexOf('home-figures')).toBeGreaterThan(
      html.indexOf('Nouvelles annonces')
    )
    expect(html.indexOf('home-figures')).toBeGreaterThan(
      html.indexOf('home-agenda')
    )
    wrapper.unmount()
  })

  it('compte les annonces de chaque critère actif et les nouvelles pour moi (G6)', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenCalledWith(false)
    // Lot 14 : la synthèse compte toutes les annonces, hors critères comprises.
    expect(apiMock.listings.list).toHaveBeenCalledWith(
      expect.objectContaining({ fit: ['in', 'to_confirm', 'margin', 'out'] })
    )
    const row = wrapper.get(
      '[data-criteria-count="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]'
    )
    expect(row.text()).toContain('Talence fictif')
    expect(row.text()).toContain('3 annonces')
    expect(row.text()).toContain('1 nouvelle')
    expect(row.text()).toContain('dont 1 à confirmer')
    wrapper.unmount()
  })

  it('sans critère, pas de bloc', async () => {
    apiMock.searchCriteria.list.mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[aria-label="Critères de recherche"]').exists()).toBe(
      false
    )
    expect(wrapper.text()).toContain('Nouvelles annonces')
    wrapper.unmount()
  })

  it('rien en attente : le dit, et propose les annonces', async () => {
    apiMock.decisions.overview.mockResolvedValue(overview({ agenda: [] }))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="home-agenda-empty"]').text()).toContain(
      'Rien ne t’attend.'
    )
    wrapper.unmount()
  })

  it('un espace vide : la mise en route à la place des zéros', async () => {
    apiMock.gettingStarted.mockResolvedValue(started('full'))
    apiMock.listings.list.mockResolvedValue({ items: [], total: 0 })
    apiMock.decisions.overview.mockResolvedValue(overview({ agenda: [] }))
    const wrapper = mountPage()
    await flushPromises()
    const start = wrapper.get('[data-testid="getting-started"]')
    expect(start.attributes('data-mode')).toBe('full')
    expect(
      start.findAll('[data-step]').map(s => s.attributes('data-step'))
    ).toEqual(['assumptions', 'criteria', 'listing', 'claude'])
    expect(
      toOf(start.get('[data-testid="getting-started-assumptions"]'))
    ).toEqual({
      name: 'assumptions',
    })
    expect(toOf(start.get('[data-testid="getting-started-listing"]'))).toEqual({
      name: 'listing-new',
    })
    // Ni chiffres à zéro, ni « Meilleures annonces », ni « Ce qui t'attend ».
    expect(wrapper.find('[data-testid="home-figures"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="home-agenda"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Meilleures annonces')
    wrapper.unmount()
  })

  it('une étape restante : en bref, en bas de l’accueil', async () => {
    apiMock.gettingStarted.mockResolvedValue(started('compact'))
    const wrapper = mountPage()
    await flushPromises()
    const start = wrapper.get('[data-testid="getting-started"]')
    expect(start.attributes('data-mode')).toBe('compact')
    expect(
      start.findAll('[data-step]').map(s => s.attributes('data-step'))
    ).toEqual(['claude'])
    expect(start.text()).toContain('Pour finir la mise en route')
    wrapper.unmount()
  })

  it('« Ce qui t’attend » illisible : l’erreur et « Réessayer », le reste de l’accueil reste', async () => {
    apiMock.decisions.overview.mockRejectedValue(new Error('panne'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Réessayer')
    expect(wrapper.text()).toContain('Nouvelles annonces')
    wrapper.unmount()
  })
})
