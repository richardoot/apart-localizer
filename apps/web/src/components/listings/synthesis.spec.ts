/**
 * Lot 9 puis lot 19, lisibilité de la fiche : pastilles des deux bases, les
 * sept onglets, la Synthèse (« Faut-il y aller ? ») : quatre chiffres qui
 * ouvrent leur onglet, l'adéquation en une ligne, ce qui plaît et ce qui est
 * à surveiller, nos avis, les prochaines étapes, la dernière vérification.
 * Les annonces sont fictives et évaluées par le vrai paquet `domain`.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { Visit } from '@apart/contracts'
import {
  MEMBERS,
  fakeAgencyRequest,
  fakeEvaluated,
  fakeOpinion,
  fakeOpinionSummary,
  fakeTargetPriceReport,
  fakeTask,
  mockupOpinions,
} from '@/test/fixtures'
import CostBasisBadge from './CostBasisBadge.vue'
import ListingSynthesis from './ListingSynthesis.vue'
import ListingTabs from './ListingTabs.vue'

const A = DEFAULT_ASSUMPTIONS
const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

describe('CostBasisBadge', () => {
  it('« sur le prix » bordée, « tout compris » pleine ; la version compacte garde le libellé pour les lecteurs d’écran', () => {
    const price = mount(CostBasisBadge, { props: { basis: 'price' } })
    expect(price.text()).toBe('sur le prix')
    expect(price.classes()).toEqual(
      expect.arrayContaining(['border-accent', 'text-accent'])
    )
    expect(price.find('svg').attributes('aria-hidden')).toBe('true')
    const all = mount(CostBasisBadge, { props: { basis: 'all_in' } })
    expect(all.text()).toBe('tout compris')
    expect(all.classes()).toEqual(expect.arrayContaining(['bg-fg', 'text-bg']))
    const compact = mount(CostBasisBadge, {
      props: { basis: 'all_in', compact: true },
    })
    expect(compact.get('span span').classes()).toContain('sr-only')
    expect(compact.attributes('data-basis')).toBe('all_in')
  })
})

describe('ListingTabs (lot 19 : sept questions)', () => {
  it('vrai motif d’onglets : tablist, aria-selected, un seul arrêt de tabulation, flèches, Début et Fin', async () => {
    const wrapper = mount(ListingTabs, {
      props: { modelValue: 'synthese', todoCount: 3 },
      attachTo: document.body,
    })
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe(
      'Sections de la fiche'
    )
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(t => t.text().replace(/\s+/g, ' ').trim())).toEqual([
      'Synthèse',
      'Le bien',
      'Budget',
      'Négocier',
      'Quartier',
      'À faire , 3 à traiter',
      'Historique',
    ])
    expect(tabs.map(t => t.attributes('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
      '-1',
      '-1',
    ])
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    expect(tabs[0]?.attributes('aria-controls')).toBe('listing-panel-synthese')
    expect(wrapper.get('[data-testid="todo-count"]').text()).toContain('3')
    await tabs[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['bien'])
    await wrapper.setProps({ modelValue: 'bien' })
    expect(document.activeElement?.id).toBe('listing-tab-bien')
    await tabs[1]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['synthese'])
    await tabs[1]?.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual(['historique'])
    await tabs[1]?.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')?.[3]).toEqual(['synthese'])
    await tabs[1]?.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(4)
    await tabs[4]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[4]).toEqual(['quartier'])
    wrapper.unmount()
  })

  it('reboucle aux extrémités ; une barre qui défile, des onglets de 44 px ; sans rien à traiter, pas de pastille', async () => {
    const wrapper = mount(ListingTabs, { props: { modelValue: 'historique' } })
    await wrapper.findAll('[role="tab"]')[6]?.trigger('keydown', {
      key: 'ArrowRight',
    })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['synthese'])
    const first = mount(ListingTabs, { props: { modelValue: 'synthese' } })
    await first.findAll('[role="tab"]')[0]?.trigger('keydown', {
      key: 'ArrowLeft',
    })
    expect(first.emitted('update:modelValue')?.[0]).toEqual(['historique'])
    expect(first.get('[role="tablist"]').classes()).toContain('overflow-x-auto')
    for (const tab of first.findAll('[role="tab"]'))
      expect(tab.classes()).toEqual(
        expect.arrayContaining(['min-h-11', 'flex-none', 'whitespace-nowrap'])
      )
    expect(first.find('[data-testid="todo-count"]').exists()).toBe(false)
  })
})

/** Une annonce de l'exemple § 8, avec un instantané de données ouvertes. */
function example() {
  return fakeEvaluated(
    {
      renovation: {
        active: true,
        level: 'refresh',
        durationMonths: 1,
        notes: null,
        items: [{ id: 'i1', label: 'Peinture', amount: 6000, position: 0 }],
      },
      annualCharges: 1200,
      propertyTax: 800,
      votedWorks: 'Ravalement [Exemple] voté en 2025',
      lastCheckedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      openDataContext: {
        market: {
          medianPricePerM2: 4100,
          count: 9,
          radiusMeters: 500,
          computedAt: '2026-11-03T10:00:00.000Z',
        },
        dpe: null,
        surroundings: null,
        rentControl: null,
        transit: {
          nearestTram: {
            name: '[Exemple] Forum',
            mode: 'tram',
            lines: ['B'],
            distanceMeters: 350,
            point: { type: 'Point', coordinates: [-0.59, 44.8] },
          },
          computedAt: '2026-11-03T10:00:00.000Z',
        },
      },
    },
    {
      tasks: [
        fakeTask({
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          label: 'Vérifier la cave',
          origin: 'manual',
          position: 1,
        }),
      ],
      opinions: [fakeOpinion({ memberId: MEMBERS[1]?.id ?? '', rating: 4 })],
      lastCheck: {
        id: 'cccccccc-0000-4000-8000-000000000009',
        checkedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        channel: 'mcp',
        authorId: MEMBERS[0]?.id ?? null,
        outcome: 'unchanged',
        summary: 'Rien n’a changé.',
      },
    }
  )
}

function mountSynthesis(props: Record<string, unknown> = {}) {
  const item = example()
  const report = fakeTargetPriceReport(item)
  return mount(ListingSynthesis, {
    global: { stubs: { CriteriaFitSection: true, RouterLink: true } },
    props: {
      item,
      evaluation: item.evaluation,
      targetPrice: item.evaluation.targetPrice,
      negotiation: report.negotiation,
      assumptions: A,
      members: MEMBERS,
      meId: MEMBERS[0]?.id ?? null,
      ...props,
    },
  })
}

describe('ListingSynthesis (lot 19)', () => {
  it('quatre chiffres qui ouvrent leur onglet : prix et ventes du quartier, coût tout compris, mensualité, prix cible', async () => {
    const wrapper = mountSynthesis({ live: true })
    const figures = wrapper.findAll('[data-figure]')
    expect(figures.map(f => f.attributes('data-figure'))).toEqual([
      'price',
      'total_cost',
      'payment',
      'target_price',
    ])
    const price = n(figures[0]?.text() ?? '')
    expect(price).toContain('Prix affiché')
    expect(price).toContain('200 000 €')
    // 200 000 / 45 = 4 444 €/m² pour une médiane de 4 100 : +8 %.
    expect(price).toContain('+8 % sur les ventes du quartier')
    expect(n(figures[1]?.text() ?? '')).toMatch(
      /Coût tout compris.*dont notaire .*travaux 6 000 €, mobilier 5 000 €/
    )
    expect(n(figures[2]?.text() ?? '')).toContain('25 ans, apport 40 000 €')
    expect(figures[3]?.text()).toContain('Prix cible')
    expect(wrapper.find('[data-testid="live-badge"]').exists()).toBe(true)
    for (const figure of figures) await figure.trigger('click')
    expect(wrapper.emitted('go')?.slice(0, 4)).toEqual([
      ['negocier'],
      ['budget'],
      ['budget'],
      ['negocier'],
    ])
  })

  it('l’adéquation en une ligne, le détail se déplie', async () => {
    const wrapper = mountSynthesis()
    const toggle = wrapper.get('[data-testid="fit-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toBe('Voir le détail')
    expect(wrapper.get('[data-testid="fit-line"]').text()).toContain(
      'Aucun critère actif'
    )
    expect(wrapper.find('#fit-detail').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toBe('Masquer le détail')
    expect(wrapper.find('#fit-detail').exists()).toBe(true)
  })

  it('ce qui plaît, à surveiller : tirés des données, chacun vers son onglet', async () => {
    const wrapper = mountSynthesis()
    const good = wrapper.get('[data-testid="highlights-good"]')
    expect(good.text()).toContain('Tram B à 350 m ([Exemple] Forum)')
    const watch = wrapper.get('[data-testid="highlights-watch"]')
    expect(n(watch.text())).toContain(
      'Travaux avant d’emménager : 6 000 € estimés'
    )
    expect(watch.text()).toContain(
      'Travaux votés : Ravalement [Exemple] voté en 2025'
    )
    expect(watch.findAll('li').length).toBeLessThanOrEqual(3)
    await good.get('[data-highlight="tram"] button').trigger('click')
    await watch.get('[data-highlight="works"] button').trigger('click')
    expect(wrapper.emitted('go')).toEqual([['quartier'], ['bien']])
    expect(
      good.get('[data-highlight="tram"] button').attributes('aria-label')
    ).toContain('voir l’onglet Quartier')
  })

  it('nos avis, les prochaines étapes et la dernière vérification', async () => {
    const visit: Visit = {
      id: 'eeeeeeee-0000-4000-8000-000000000001',
      listingId: '11111111-1111-4111-8111-111111111111',
      visitedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      status: 'planned',
      participantIds: [],
      report: null,
      pros: null,
      cons: null,
      rating: 0,
      prepTaskId: null,
      createdById: null,
      createdAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
      photoCount: 0,
      photos: [],
    }
    const wrapper = mountSynthesis({
      visits: [visit],
      requests: [
        fakeAgencyRequest({
          id: '99999999-0000-4999-8999-000000000001',
          status: 'draft',
          subject: '[Exemple] Quote-part du ravalement',
          sentAt: null,
        }),
      ],
    })
    const opinions = wrapper.get('[data-testid="opinions"]')
    expect(opinions.text()).toContain('Chloé')
    expect(opinions.text()).toContain('4/5')
    expect(opinions.text()).toContain('Lumineux')
    expect(opinions.text()).toContain('Tu n’as pas encore donné ton avis')
    expect(opinions.get('[data-testid="opinion-edit"]').text()).toBe(
      'Donner mon avis'
    )
    const steps = wrapper.get('[data-testid="next-steps"]')
    expect(
      steps.findAll('[data-step]').map(s => s.attributes('data-step'))
    ).toEqual(['visit', 'draft', 'task'])
    // Le message se dit par ses questions (ici, la taxe foncière).
    expect(steps.text()).toContain('Message à valider : la taxe foncière')
    expect(steps.text()).toContain('Vérifier la cave')
    await steps.get('[data-testid="go-todo"]').trigger('click')
    const freshness = wrapper.get('[data-testid="synthesis-freshness"]')
    expect(freshness.text()).toContain(
      'Vérifiée il y a 2 j par Claude (MCP, pour Richard) : Rien n’a changé.'
    )
    await freshness.get('[data-testid="go-history"]').trigger('click')
    expect(wrapper.emitted('go')).toEqual([['a-faire'], ['historique']])
  })

  it('mon avis se donne sur place : note globale 1 à 5 (radiogroup), une phrase, enregistré', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountSynthesis({
      opinionActions: { save, reveal: vi.fn(), addTask: vi.fn() },
    })
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    const notes = wrapper
      .findAll('[aria-label$="sur 5"]')
      .filter(b => b.element.tagName === 'BUTTON')
    expect(notes).toHaveLength(5)
    await notes[3]?.trigger('click')
    expect(notes[3]?.attributes('aria-checked')).toBe('true')
    await wrapper.get('#opinion-text').setValue('  Lumineux, balcon agréable  ')
    await wrapper
      .get('form[aria-labelledby="my-opinion-title"]')
      .trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenCalledWith({
      rating: 4,
      text: 'Lumineux, balcon agréable',
      scores: {},
      expectedUpdatedAt: null,
    })
  })

  it('lot 20 : nos avis nourrissent « Ce qui plaît », « À surveiller » et « À rediscuter »', async () => {
    const { visible, summary } = fakeOpinionSummary(mockupOpinions())
    const item = fakeEvaluated(
      {},
      { opinions: visible, opinionSummary: summary, tasks: [] }
    )
    const scroll = vi.fn()
    const wrapper = mount(ListingSynthesis, {
      attachTo: document.body,
      global: { stubs: { CriteriaFitSection: true, RouterLink: true } },
      props: {
        item,
        evaluation: item.evaluation,
        targetPrice: item.evaluation.targetPrice,
        negotiation: null,
        assumptions: A,
        members: MEMBERS,
        meId: MEMBERS[0]?.id ?? null,
      },
    })
    const target = document.getElementById('nos-avis') as HTMLElement
    target.scrollIntoView = scroll
    const good = wrapper.get('[data-testid="highlights-good"]')
    const liked = good.get('[data-highlight="opinions_liked"]')
    expect(liked.text()).toContain(
      'Plaît à tous les deux : extérieur et vue (5 et 5), luminosité (5 et 4), agencement (4 et 4)'
    )
    const link = liked.get('button')
    expect(link.text()).toBe('Nos avis')
    expect(link.attributes('aria-label')).toContain(': voir nos avis')
    await link.trigger('click')
    expect(scroll).toHaveBeenCalled()
    expect(wrapper.emitted('go')).toBeUndefined()
    const watch = wrapper.get('[data-testid="highlights-watch"]')
    expect(
      watch.get('[data-highlight="opinions_disagreement"]').text()
    ).toContain(
      'Désaccord sur le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2)'
    )
    const discuss = wrapper.get('[data-step="discuss"]')
    // Lot 25 : chaque prochaine étape mène à son bloc.
    expect(discuss.text()).toBe(
      'À rediscuterLe calme et « on s’y voit » : les notes s’écartent de 2 pointsVoir nos avis'
    )
    await discuss.get('[data-testid="step-link"]').trigger('click')
    expect(wrapper.emitted('goTo')?.[0]).toEqual([
      { tab: 'synthese', anchor: 'nos-avis', label: 'Voir nos avis' },
    ])
    wrapper.unmount()
  })

  it('sans évaluation, invite à saisir ; sans données, rien d’inventé', () => {
    const item = fakeEvaluated({
      renovation: null,
      annualCharges: 900,
      propertyTax: 700,
    })
    const wrapper = mount(ListingSynthesis, {
      global: { stubs: { CriteriaFitSection: true, RouterLink: true } },
      props: {
        item,
        evaluation: null,
        targetPrice: null,
        negotiation: null,
        assumptions: null,
      },
    })
    expect(wrapper.text()).toContain('Saisis un prix et un loyer visé')
    expect(wrapper.find('[data-figure]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="highlights-good"]').text()).toContain(
      'Rien à mettre en avant pour l’instant.'
    )
    expect(wrapper.get('[data-testid="next-steps"]').text()).toContain(
      'Demander la taxe foncière'
    )
    expect(wrapper.get('[data-testid="synthesis-freshness"]').text()).toContain(
      'Jamais revérifiée depuis l’ajout'
    )
    expect(wrapper.find('[data-testid="live-badge"]').exists()).toBe(false)
  })
})
