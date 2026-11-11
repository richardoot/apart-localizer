/**
 * Lot 21 : la barre d'étapes, « Ce qui t'attend », les lignes, le repli des
 * hors critères, les raisons d'écarter, les bandeaux de la fiche. Données
 * fictives.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type {
  DecisionProposal,
  WorkflowAgendaItem,
  WorkflowStageCount,
} from '@apart/contracts'
import type { StageRowView } from '@/lib/workflow'
import DecisionBanner from './DecisionBanner.vue'
import DiscardReasons from './DiscardReasons.vue'
import OutOfCriteria from './OutOfCriteria.vue'
import StageBar from './StageBar.vue'
import StageRows from './StageRows.vue'
import WorkflowAgenda from './WorkflowAgenda.vue'

const stages: WorkflowStageCount[] = [
  {
    stage: 'a-valider',
    count: 7,
    outOfCriteria: 2,
    toSort: 4,
    sub: '4 à trier',
  },
  {
    stage: 'a-etudier',
    count: 6,
    outOfCriteria: 1,
    toSort: 2,
    sub: '2 à trier',
  },
  {
    stage: 'a-visiter',
    count: 4,
    outOfCriteria: 0,
    toSort: 0,
    sub: '1 sans date',
  },
  {
    stage: 'visitees',
    count: 3,
    outOfCriteria: 0,
    toSort: 0,
    sub: '1 avis à donner',
  },
  {
    stage: 'offres',
    count: 1,
    outOfCriteria: 0,
    toSort: 0,
    sub: 'Réponse attendue',
  },
  {
    stage: 'archives',
    count: 18,
    outOfCriteria: 0,
    toSort: 0,
    sub: 'Écartées, refusées, vendues',
  },
]

describe('StageBar', () => {
  it('six étapes, comptées ; l’étape courante est marquée ; un clic la change', async () => {
    const wrapper = mount(StageBar, {
      props: { stages, current: 'a-etudier' },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(6)
    expect(buttons[0]?.text()).toContain('À valider')
    expect(buttons[0]?.text()).toContain('7')
    expect(buttons[0]?.text()).toContain('4 à trier')
    expect(buttons[1]?.attributes('aria-current')).toBe('step')
    expect(buttons[0]?.attributes('aria-current')).toBeUndefined()
    await buttons[5]?.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['archives'])
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Étapes du suivi')
  })

  it('lot 23 : l’étape courante est ramenée au milieu de la barre qui défile', async () => {
    const wrapper = mount(StageBar, {
      props: { stages, current: 'a-valider' },
      attachTo: document.body,
    })
    const nav = wrapper.get('nav').element as HTMLElement
    Object.defineProperty(nav, 'scrollWidth', { value: 900 })
    Object.defineProperty(nav, 'clientWidth', { value: 390 })
    nav.getBoundingClientRect = () => ({ left: 0, width: 390 }) as DOMRect
    await wrapper.setProps({ current: 'archives' })
    const pill = wrapper.get('[aria-current="step"]').element as HTMLElement
    pill.getBoundingClientRect = () => ({ left: 700, width: 120 }) as DOMRect
    ;(wrapper.vm as unknown as { reveal: () => void }).reveal()
    // 700 - (390 - 120) / 2 = 565
    expect(nav.scrollLeft).toBe(565)
    wrapper.unmount()
  })

  it('une étape sans compteur reste à zéro', () => {
    const wrapper = mount(StageBar, {
      props: { stages: [], current: 'offres' },
    })
    expect(wrapper.findAll('[data-testid="stage-count"]')[0]?.text()).toBe('0')
  })
})

describe('WorkflowAgenda', () => {
  // Lot 23 : chaque ligne a aussi sa précision et son annonce (null ici).
  const item = (
    value: Omit<WorkflowAgendaItem, 'detail' | 'listingId'>
  ): WorkflowAgendaItem => ({ detail: null, listingId: null, ...value })
  const items: WorkflowAgendaItem[] = [
    item({ key: 'to_sort', count: 6, label: 'à trier', stage: 'a-valider' }),
    item({
      key: 'to_confirm',
      count: 2,
      label: 'à confirmer après Chloé',
      stage: null,
    }),
    item({
      key: 'to_settle',
      count: 2,
      label: 'à trancher ensemble',
      stage: null,
    }),
    item({
      key: 'visits_to_plan',
      count: 1,
      label: 'visite à planifier',
      stage: 'a-visiter',
    }),
    item({
      key: 'opinions_to_give',
      count: 1,
      label: 'avis à donner',
      stage: 'visitees',
    }),
    // Lot 23 : une ligne de l'accueil, absente de la page Annonces.
    item({
      key: 'overdue_tasks',
      count: 3,
      label: 'tâches en retard',
      stage: null,
    }),
  ]

  it('chaque élément ouvre le bon travail', async () => {
    const wrapper = mount(WorkflowAgenda, {
      props: { items },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    })
    expect(wrapper.get('h2').text()).toBe('Ce qui t’attend')
    const toSort = wrapper.get('[data-agenda="to_sort"]')
    expect(toSort.element.tagName).toBe('A')
    expect(JSON.parse(toSort.attributes('data-to') as string)).toEqual({
      name: 'triage',
      query: { etape: 'a-valider' },
    })
    expect(
      JSON.parse(
        wrapper
          .get('[data-agenda="to_confirm"]')
          .attributes('data-to') as string
      )
    ).toEqual({ name: 'triage', query: { mode: 'confirmer' } })
    expect(
      JSON.parse(
        wrapper.get('[data-agenda="to_settle"]').attributes('data-to') as string
      )
    ).toEqual({ name: 'settle' })
    const visits = wrapper.get('[data-agenda="visits_to_plan"]')
    expect(visits.element.tagName).toBe('BUTTON')
    await visits.trigger('click')
    expect(wrapper.emitted('stage')?.[0]).toEqual(['a-visiter'])
    // Lot 23 : les tâches en retard restent sur l'accueil.
    expect(wrapper.find('[data-agenda="overdue_tasks"]').exists()).toBe(false)
  })

  it('lot 23 : seulement des lignes de l’accueil, pas de bandeau', () => {
    const wrapper = mount(WorkflowAgenda, {
      props: { items: items.slice(-1) },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('rien en attente : pas de bandeau', () => {
    const wrapper = mount(WorkflowAgenda, { props: { items: [] } })
    expect(wrapper.find('section').exists()).toBe(false)
  })
})

describe('StageRows', () => {
  const row = (over: Partial<StageRowView> = {}): StageRowView => ({
    id: 'r1',
    kind: 'listing',
    title: '[Exemple] T3',
    meta: 'Bordeaux · 66 m²',
    stats: [{ label: 'Prix', value: '226 000 €' }],
    rowKind: 'to_sort',
    pill: 'À trier',
    pillTone: 'neutral',
    detail: 'Personne n’a encore trié',
    action: { kind: 'sort', label: 'Trier' },
    decision: null,
    nextVisitAt: null,
    archivedAt: null,
    ...over,
  })

  it('une ligne : titre, chiffres, pastille, action', async () => {
    const wrapper = mount(StageRows, { props: { rows: [row()] } })
    expect(wrapper.text()).toContain('226 000 €')
    expect(wrapper.get('[data-testid="row-pill"]').text()).toBe('À trier')
    await wrapper.get('[data-action="sort"]').trigger('click')
    expect(wrapper.emitted('action')?.[0]?.[0]).toMatchObject({ id: 'r1' })
    await wrapper.get('[data-testid="row-title"]').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ id: 'r1' })
  })

  it('un brouillon se déplie sur place', () => {
    const wrapper = mount(StageRows, {
      props: { rows: [row({ kind: 'draft' })], expanded: ['r1'] },
      slots: { expanded: '<p data-testid="details">détails</p>' },
    })
    expect(wrapper.get('[data-testid="details"]').text()).toBe('détails')
    expect(
      wrapper.get('[data-testid="row-title"]').attributes('aria-expanded')
    ).toBe('true')
  })

  it('aucune ligne : rien', () => {
    expect(
      mount(StageRows, { props: { rows: [] } })
        .find('section')
        .exists()
    ).toBe(false)
  })
})

describe('OutOfCriteria', () => {
  const rows = [{ id: 'a', title: '[Exemple] T2', why: 'Trop loin' }]

  it('replié par défaut, se déplie', async () => {
    const wrapper = mount(OutOfCriteria, {
      props: { label: 'Voir 1 annonce hors critères', rows },
    })
    expect(wrapper.find('[data-testid="out-row"]').exists()).toBe(false)
    await wrapper.get('[data-testid="out-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="out-row"]').text()).toContain('Trop loin')
    await wrapper.get('[data-testid="out-row"] button').trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual(['a'])
  })

  it('ouvert d’office (ancien lien) ; vide : rien', () => {
    expect(
      mount(OutOfCriteria, {
        props: { label: 'x', rows, defaultOpen: true },
      })
        .find('[data-testid="out-row"]')
        .exists()
    ).toBe(true)
    expect(
      mount(OutOfCriteria, { props: { label: 'x', rows: [] } })
        .find('button')
        .exists()
    ).toBe(false)
  })
})

describe('DiscardReasons', () => {
  it('une raison en un clic', async () => {
    const wrapper = mount(DiscardReasons)
    await wrapper.get('[data-action="reason"]').trigger('click')
    expect(wrapper.emitted('pick')?.[0]).toEqual(['Trop cher'])
  })

  it('« Autre » : un texte libre, jamais vide', async () => {
    const wrapper = mount(DiscardReasons)
    await wrapper.get('[data-action="reason-other"]').trigger('click')
    const input = wrapper.get('[data-testid="reason-text"]')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('pick')).toBeUndefined()
    await input.setValue('Rez-de-chaussée sur rue')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('pick')?.[0]).toEqual(['Rez-de-chaussée sur rue'])
  })

  it('revenir', async () => {
    const wrapper = mount(DiscardReasons)
    await wrapper.get('[data-action="reason-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

describe('DecisionBanner', () => {
  const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const decision = (
    over: Partial<DecisionProposal> = {}
  ): DecisionProposal => ({
    id: '11111111-1111-4111-8111-111111111111',
    target: 'listing',
    listingId: '22222222-2222-4222-8222-222222222222',
    draftId: null,
    title: '[Exemple] T3',
    choice: 'to_visit',
    choiceLabel: 'À visiter',
    reason: 'Prix correct, à voir sur place.',
    state: 'open',
    resolution: null,
    appliedChoice: null,
    fromStatus: 'to_study',
    fromStage: 'a-etudier',
    author: { id: RICHARD, displayName: 'Richard' },
    channel: 'web',
    sessionId: null,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    closedAt: null,
    closedBy: null,
    responses: [],
    waitingFor: [{ id: CHLOE, displayName: 'Chloé' }],
    settleOptions: [],
    viewer: {
      isAuthor: true,
      hasResponded: false,
      canRespond: false,
      canWithdraw: true,
      canDecideNow: true,
      canSettle: false,
      nobodyLeft: false,
    },
    ...over,
  })
  const asOther = (over: Partial<DecisionProposal> = {}) =>
    decision({
      viewer: {
        isAuthor: false,
        hasResponded: false,
        canRespond: true,
        canWithdraw: false,
        canDecideNow: false,
        canSettle: false,
        nobodyLeft: false,
      },
      ...over,
    })

  it('« Tu proposes… » : retirer, décider sans attendre', async () => {
    const wrapper = mount(DecisionBanner, { props: { decision: decision() } })
    expect(wrapper.text()).toContain('Tu proposes de la passer À visiter.')
    expect(wrapper.text()).toContain(
      'En attente de Chloé, depuis hier. L’annonce reste À étudier d’ici là.'
    )
    await wrapper.get('[data-action="withdraw"]').trigger('click')
    await wrapper.get('[data-action="decide-now"]').trigger('click')
    expect(wrapper.emitted('withdraw')).toHaveLength(1)
    expect(wrapper.emitted('decideNow')).toHaveLength(1)
  })

  it('« Chloé propose… » : d’accord, pas d’accord', async () => {
    const wrapper = mount(DecisionBanner, {
      props: {
        decision: asOther({ author: { id: CHLOE, displayName: 'Chloé' } }),
      },
    })
    expect(wrapper.text()).toContain('Chloé propose de la passer À visiter.')
    expect(wrapper.text()).toContain('« Prix correct, à voir sur place. »')
    await wrapper.get('[data-action="agree"]').trigger('click')
    expect(wrapper.emitted('agree')).toHaveLength(1)
  })

  it('pas d’accord : écarter demande une raison', async () => {
    const wrapper = mount(DecisionBanner, { props: { decision: asOther() } })
    await wrapper.get('[data-action="disagree"]').trigger('click')
    expect(wrapper.emitted('disagree')).toBeUndefined()
    await wrapper.get('[data-action="reason"]').trigger('click')
    expect(wrapper.emitted('disagree')?.[0]).toEqual(['discard', 'Trop cher'])
  })

  it('pas d’accord pour écarter : on la garde, sans raison à donner', async () => {
    const wrapper = mount(DecisionBanner, {
      props: {
        decision: asOther({ choice: 'discard', choiceLabel: 'Écarter' }),
      },
    })
    await wrapper.get('[data-action="disagree"]').trigger('click')
    expect(wrapper.emitted('disagree')?.[0]).toEqual(['to_visit', null])
  })

  it('à trancher : un lien vers « À trancher ensemble »', () => {
    const wrapper = mount(DecisionBanner, {
      props: { decision: decision({ state: 'to_settle' }) },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.text()).toContain('Les choix diffèrent')
    expect(wrapper.get('[data-action="go-settle"]').text()).toBe(
      'À trancher ensemble'
    )
  })
})
