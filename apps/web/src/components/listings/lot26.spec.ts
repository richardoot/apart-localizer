/**
 * Lot 26 : trouver, comparer. Les puces des filtres, la barre « Comparer »,
 * le tableau dans le choix de la vue, les jugements d'une ligne (à confirmer
 * omis, formes courtes au téléphone), les vrais liens et les cases des
 * lignes et des cartes, le retour de la comparaison. Données fictives.
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { activeFilterChips, listingJudgements } from '@apart/domain'
import { fakeEvaluated } from '@/test/fixtures'
import { listingRow } from '@/lib/workflow'
import CompareBar from './CompareBar.vue'
import FilterChips from './FilterChips.vue'
import JudgementPills from './JudgementPills.vue'
import ListingCards from './ListingCards.vue'
import ViewSwitch from './ViewSwitch.vue'
import StageRows from '@/components/workflow/StageRows.vue'

vi.mock('@/composables/useListings', () => ({
  useCompare: () => ({
    data: ref(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useWorkspace', () => ({
  useWorkspace: () => ({ me: ref(null) }),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const stubs = { RouterLink: RouterLinkStub }

describe('Lot 26 : les puces des filtres', () => {
  it('une puce chacune, qui se retire ; « Tout effacer » ; le résumé', async () => {
    const chips = activeFilterChips({ commune: ['Bègles'], dpe: ['A'] })
    const wrapper = mount(FilterChips, {
      props: { chips, summary: '1 sur 4 annonces, avec les filtres' },
    })
    const buttons = wrapper.findAll('[data-chip]')
    expect(buttons.map(b => b.text())).toEqual(['Commune : Bègles', 'DPE A'])
    expect(buttons[0]!.attributes('aria-label')).toBe(
      'Retirer le filtre Commune : Bègles'
    )
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ key: 'dpe' })
    await wrapper.get('[data-testid="filter-chips-clear"]').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.get('[data-testid="filter-chips-summary"]').text()).toBe(
      '1 sur 4 annonces, avec les filtres'
    )
    const none = mount(FilterChips, { props: { chips: [] } })
    expect(none.find('[data-testid="filter-chips"]').exists()).toBe(false)
  })
})

describe('Lot 26 : la barre « Comparer (n) »', () => {
  it('cachée sans sélection ; désactivée à une ; dit la limite', async () => {
    expect(
      mount(CompareBar, { props: { count: 0 } })
        .find('[data-testid="compare-bar"]')
        .exists()
    ).toBe(false)
    const one = mount(CompareBar, { props: { count: 1 } })
    expect(one.text()).toContain('1 annonce cochée')
    expect(one.text()).toContain('(6 au plus)')
    expect(
      one.get('[data-testid="compare-go"]').attributes('disabled')
    ).toBeDefined()
    const three = mount(CompareBar, { props: { count: 3 } })
    await three.get('[data-testid="compare-go"]').trigger('click')
    await three.get('[data-testid="compare-clear"]').trigger('click')
    expect(three.emitted('compare')).toHaveLength(1)
    expect(three.emitted('clear')).toHaveLength(1)
    expect(three.text()).toContain('Comparer (3)')
  })
})

describe('Lot 26 : le tableau dans le choix de la vue', () => {
  it('« Tableau » sur ordinateur, pas au téléphone', () => {
    const desk = mount(ViewSwitch, { props: { modelValue: 'table' } })
    expect(desk.text()).toContain('Tableau')
    const phone = mount(ViewSwitch, {
      props: { modelValue: 'list', withTable: false },
    })
    expect(phone.text()).not.toContain('Tableau')
  })
})

describe('Lot 26 : les jugements d’une ligne', () => {
  it('forme mini : symbole et forme courte, la valeur pour le lecteur d’écran', () => {
    const judgements = listingJudgements({
      verdict: 'off_target',
      fit: null,
      rental: 'conditional',
    })
    const wrapper = mount(JudgementPills, {
      props: { judgements, mini: true, pending: 'Recherche à confirmer' },
    })
    const first = wrapper.get('[data-judgement="profitability"]')
    expect(first.text()).toContain('Renta.')
    expect(first.get('.sr-only').text()).toBe('Rentabilité : Hors cible')
    expect(first.attributes('title')).toBe('Rentabilité : Hors cible')
    expect(wrapper.get('[data-testid="judgements-pending"]').text()).toBe(
      'Recherche à confirmer'
    )
  })

  it('une ligne omet les jugements à confirmer ; le titre est un lien, la case coche', async () => {
    const item = fakeEvaluated({ id: ID, title: '[Exemple] Ligne' })
    const row = listingRow('a-etudier', item, { members: [], meId: null })
    const wrapper = mount(StageRows, {
      props: {
        rows: [
          {
            ...row,
            judgements: listingJudgements({
              verdict: null,
              fit: null,
              rental: 'compatible',
            }),
          },
        ],
        linkOf: () => `/annonces/${ID}?etape=a-etudier`,
        selected: [],
      },
      global: { stubs },
    })
    expect(
      wrapper
        .findAll('[data-judgement]')
        .map(j => j.attributes('data-judgement'))
    ).toEqual(['rental'])
    expect(wrapper.get('[data-testid="judgements-pending"]').text()).toBe(
      'Rentabilité à confirmer'
    )
    const link = wrapper.getComponent(RouterLinkStub)
    expect(link.props('to')).toBe(`/annonces/${ID}?etape=a-etudier`)
    expect(link.text()).toBe('[Exemple] Ligne')
    await wrapper.get('[data-testid="row-compare"]').setValue(true)
    expect(wrapper.emitted('select')).toEqual([[ID, true]])
    // Sans `selected` : pas de case.
    await wrapper.setProps({ selected: null })
    expect(wrapper.find('[data-testid="row-compare"]').exists()).toBe(false)
  })
})

describe('Lot 26 : les cartes', () => {
  it('le titre est un lien étiré sur la carte ; une case pour comparer ; plus de tabindex', async () => {
    const a = fakeEvaluated({ id: ID, title: '[Exemple] A' })
    const b = fakeEvaluated({ id: OTHER, title: '[Exemple] B' })
    const wrapper = mount(ListingCards, {
      props: {
        items: [a, b],
        linkOf: (id: string) => `/annonces/${id}`,
        selected: [OTHER],
        selectionFull: true,
      },
      global: { stubs },
    })
    expect(wrapper.find('article[tabindex]').exists()).toBe(false)
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map(l => l.props('to'))).toEqual([
      `/annonces/${ID}`,
      `/annonces/${OTHER}`,
    ])
    expect(links[0]!.classes().join(' ')).toContain('after:inset-0')
    const boxes = wrapper.findAll('[data-testid="card-compare"]')
    expect(boxes[0]!.attributes('disabled')).toBeDefined()
    expect((boxes[1]!.element as HTMLInputElement).checked).toBe(true)
    await boxes[1]!.setValue(false)
    expect(wrapper.emitted('select')).toEqual([[OTHER, false]])
  })
})

describe('Lot 26 : la page Comparer', () => {
  it('le retour ramène à l’étape et à la vue, la sélection cochée', async () => {
    const Empty = { render: () => null }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/annonces', name: 'listings', component: Empty },
        { path: '/annonces/:id', name: 'listing', component: Empty },
        { path: '/comparer', name: 'compare', component: Empty },
      ],
    })
    await router.push(`/comparer?ids=${ID},${OTHER}&etape=a-visiter&view=cards`)
    await router.isReady()
    const ComparePage = (await import('@/views/ComparePage.vue')).default
    const wrapper = mount(ComparePage, {
      global: { plugins: [router], stubs },
    })
    await flushPromises()
    const back = wrapper
      .findAllComponents(RouterLinkStub)
      .find(l => l.attributes('data-testid') === 'compare-back')!
    expect(back.props('to')).toEqual({
      name: 'listings',
      query: { etape: 'a-visiter', view: 'cards', comparer: `${ID},${OTHER}` },
    })
  })
})
