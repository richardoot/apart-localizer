import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_REGULATORY_RULES,
} from '@apart/contracts'
import type { Scenario } from '@apart/contracts'
import {
  complianceReport,
  rentMarket,
  studyInputFromListing,
} from '@apart/domain'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  study: {
    compliance: vi.fn(),
    comparables: vi.fn(),
    addComparable: vi.fn(),
    updateComparable: vi.fn(),
    removeComparable: vi.fn(),
  },
  scenarios: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import StudySection from './StudySection.vue'
import ProjectionChart from './ProjectionChart.vue'

const A = AssumptionsSchema.parse({
  ...DEFAULT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  rentalStartDate: '2028-01-01',
  currentRent: 850,
})
const item = fakeEvaluated()
const AT = new Date('2026-11-03T10:00:00Z')

const comparables = [600, 640, 680, 720, 760].map((rent, i) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  listingId: item.listing.id,
  rent,
  surface: 40,
  furnished: false,
  rooms: null,
  observedAt: '2026-10-01',
  source: 'leboncoin' as const,
  sourceLabel: null,
  url: null,
  address: null,
  note: null,
  createdById: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
}))
const market = rentMarket(comparables, {
  listingId: item.listing.id,
  surface: 45,
  furnished: false,
  targetRent: 750,
  rentCap: null,
  at: AT,
})

const saved: Scenario = {
  id: '99999999-9999-4999-8999-999999999999',
  workspaceId: item.listing.workspaceId,
  listingId: null,
  name: 'Taux 3 %',
  overrides: { assumptions: { interestRate: 0.03 } },
  notes: null,
  createdById: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
}

function mountSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(StudySection, {
    props: { item, assumptions: A },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

async function openTab(
  wrapper: ReturnType<typeof mountSection>,
  label: string
): Promise<void> {
  const tab = wrapper.findAll('[role="tab"]').find(t => t.text() === label)
  await tab?.trigger('click')
  await flushPromises()
}

describe('StudySection (lot 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.scenarios.list.mockResolvedValue([saved])
    apiMock.scenarios.create.mockImplementation((input: { name: string }) =>
      Promise.resolve({
        ...saved,
        id: '88888888-8888-4888-8888-888888888888',
        name: input.name,
        listingId: item.listing.id,
      })
    )
    apiMock.scenarios.remove.mockResolvedValue(undefined)
    apiMock.study.comparables.mockResolvedValue({ items: comparables, market })
    apiMock.study.addComparable.mockResolvedValue({
      comparable: comparables[0],
      market,
    })
    apiMock.study.removeComparable.mockResolvedValue({
      items: comparables,
      market,
    })
    apiMock.study.compliance.mockResolvedValue(
      complianceReport(
        {
          dpeClass: 'G',
          dpeDate: '2023-01-01',
          constructionYear: 1930,
          leaseType: 'unfurnished',
          inseeCode: '33522',
          commune: 'Talence',
          surface: 45,
          rentControlled: false,
          targetRent: 750,
          rentCap: null,
          heatingType: null,
          coOwnershipAllowsRental: 'unknown',
          decencyCompliant: 'unknown',
          rentalPermitRequired: 'unknown',
        },
        DEFAULT_REGULATORY_RULES,
        null,
        { rentalStartDate: '2028-01-01', at: AT }
      )
    )
  })

  it('onglets accessibles ; phase 1 par défaut, calculée sans appel réseau', async () => {
    const wrapper = mountSection()
    await flushPromises()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(t => t.text())).toEqual([
      'Phase 1',
      'Scénarios',
      'Projection',
      'Loyer de marché',
      'Conformité',
    ])
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    const occupancy = wrapper.get('[data-testid="occupancy"]').text()
    expect(occupancy).toContain("Coût d'occupation")
    expect(occupancy).toContain('de plus que le loyer actuel')
    expect(wrapper.get('[data-testid="switch"]').text()).toContain(
      '1 janv. 2028'
    )
    expect(apiMock.study.compliance).not.toHaveBeenCalled()
    expect(apiMock.scenarios.list).not.toHaveBeenCalled()
    await wrapper
      .get('[role="tablist"]')
      .trigger('keydown', { key: 'ArrowRight' })
    expect(
      wrapper.findAll('[role="tab"]')[1]?.attributes('aria-selected')
    ).toBe('true')
    await wrapper
      .get('[role="tablist"]')
      .trigger('keydown', { key: 'ArrowLeft' })
    await wrapper
      .get('[role="tablist"]')
      .trigger('keydown', { key: 'ArrowLeft' })
    expect(
      wrapper.findAll('[role="tab"]')[4]?.attributes('aria-selected')
    ).toBe('true')
    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'Enter' })
    wrapper.unmount()
  })

  it('scénarios : comparaison en direct, enregistrement, scénario enregistré appliqué ou supprimé', async () => {
    const wrapper = mountSection()
    await openTab(wrapper, 'Scénarios')
    expect(apiMock.scenarios.list).toHaveBeenCalledWith(item.listing.id)
    await wrapper.get('#sc-price').setValue('150000')
    const cost = wrapper.get('[data-key="totalCost"]')
    expect(cost.text()).toContain('−')
    expect(cost.find('.text-good').exists()).toBe(true)
    await wrapper.get('#sc-name').setValue('Prix négocié')
    await wrapper.get('[data-action="save-scenario"]').trigger('click')
    await flushPromises()
    expect(apiMock.scenarios.create).toHaveBeenCalledWith({
      name: 'Prix négocié',
      listingId: item.listing.id,
      overrides: { price: 150_000 },
    })
    expect(wrapper.text()).toContain('Scénario « Prix négocié » enregistré.')
    const applyButton = wrapper
      .findAll('button')
      .find(b => b.text() === 'Appliquer')
    await applyButton?.trigger('click')
    expect((wrapper.get('#sc-rate').element as HTMLInputElement).value).toBe(
      '3'
    )
    expect((wrapper.get('#sc-price').element as HTMLInputElement).value).toBe(
      ''
    )
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Supprimer')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.scenarios.remove).toHaveBeenCalledWith(saved.id)
    await wrapper.get('#sc-price').setValue('abc')
    expect(wrapper.find('[role="alert"]').text()).toMatch(/price/)
    wrapper.unmount()
  })

  it('scénario : enregistrer sans nom est refusé, une erreur serveur est affichée', async () => {
    const wrapper = mountSection()
    await openTab(wrapper, 'Scénarios')
    await wrapper.get('#sc-rent').setValue('800')
    await wrapper.get('[data-action="save-scenario"]').trigger('click')
    expect(wrapper.text()).toContain('Donnez un nom')
    const { ApiError } = await import('@/lib/api')
    apiMock.scenarios.create.mockRejectedValueOnce(
      new ApiError(404, 'Annonce introuvable')
    )
    await wrapper.get('#sc-name').setValue('x')
    await wrapper.get('[data-action="save-scenario"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Annonce introuvable')
    wrapper.unmount()
  })

  it('projection : TRI, régimes, revente, tableau annuel, graphique ; TMI de l’aperçu', async () => {
    const wrapper = mountSection()
    await openTab(wrapper, 'Projection')
    const panel = wrapper.get('[data-testid="projection"]')
    expect(panel.text()).toContain('TRI avant impôt')
    expect(panel.text()).toContain('TMI à renseigner')
    expect(wrapper.get('[data-testid="regimes"]').text()).toContain(
      'Micro-foncier'
    )
    expect(wrapper.get('[data-testid="regimes"]').text()).toContain(
      'Réel foncier'
    )
    expect(wrapper.get('[data-testid="sale"]').text()).toMatch(/Revente le/)
    expect(wrapper.findAll('[data-testid="rows"] tbody tr')).toHaveLength(15)
    expect(
      wrapper.findAll('[data-testid="projection-chart"] rect')
    ).toHaveLength(15)
    expect(wrapper.get('[data-testid="disclaimer"]').text()).toContain(
      'pas un conseil fiscal'
    )
    await wrapper.get('#pj-tmi').setValue('30')
    expect(wrapper.get('[data-testid="regimes"]').text()).toContain('★')
    expect(wrapper.get('[data-testid="first-year"]').text()).toMatch(/€\/mois/)
    await wrapper.get('#pj-horizon').setValue('20')
    expect(wrapper.findAll('[data-testid="rows"] tbody tr')).toHaveLength(20)
    await wrapper.get('#pj-regime').setValue('reel_foncier')
    expect(
      wrapper.find('[data-testid="regimes"] tr.font-semibold').text()
    ).toContain('Réel foncier')
    wrapper.unmount()
  })

  it('loyer de marché : synthèse, ajout, suppression, retenir le loyer estimé', async () => {
    const wrapper = mountSection()
    await openTab(wrapper, 'Loyer de marché')
    expect(apiMock.study.comparables).toHaveBeenCalledWith(item.listing.id)
    const summary = wrapper.get('[data-testid="rent-market-summary"]').text()
    expect(summary).toContain('17 €/m²')
    expect(summary).toContain('765 €/mois')
    await wrapper.get('#rc-rent').setValue('700')
    await wrapper.get('#rc-surface').setValue('42')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.study.addComparable).toHaveBeenCalledWith(item.listing.id, {
      rent: 700,
      surface: 42,
      furnished: false,
      observedAt: null,
      url: null,
      note: null,
    })
    await wrapper
      .get('[aria-label="Supprimer le comparable à 600 €"]')
      .trigger('click')
    await flushPromises()
    expect(apiMock.study.removeComparable).toHaveBeenCalledWith(
      item.listing.id,
      comparables[0]?.id
    )
    await wrapper.get('[data-action="retain-market-rent"]').trigger('click')
    expect(wrapper.emitted('retainMarketRent')?.[0]).toEqual([765])
    await wrapper.get('#rc-rent').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Loyer et surface sont nécessaires.')
    wrapper.unmount()
  })

  it('conformité : points datés et sourcés par catégorie, verdict', async () => {
    const wrapper = mountSection()
    await openTab(wrapper, 'Conformité')
    expect(apiMock.study.compliance).toHaveBeenCalledWith(item.listing.id)
    const panel = wrapper.get('[data-testid="compliance"]')
    expect(panel.text()).toContain('Incompatible')
    const ban = panel.get('[data-key="dpe_ban"]')
    expect(ban.attributes('data-level')).toBe('bad')
    expect(ban.text()).toContain('Loi Climat')
    expect(ban.find('a').attributes('href')).toMatch(/service-public/)
    expect(panel.text()).toContain('Performance énergétique')
    expect(wrapper.get('[data-testid="georisques"]').text()).toBe('')
    wrapper.unmount()
  })

  it('sans hypothèses chargées : l’étude attend', () => {
    const client = new QueryClient()
    const wrapper = mount(StudySection, {
      props: { item, assumptions: null },
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    })
    expect(wrapper.text()).toContain('Chargement des hypothèses')
    wrapper.unmount()
  })
})

describe('ProjectionChart', () => {
  it('une barre par année, une ligne de position, un résumé accessible', () => {
    const series = [
      {
        year: 1,
        cashFlow: -3000,
        afterTax: false,
        cumulativeCashFlow: -3000,
        position: -40_000,
      },
      {
        year: 2,
        cashFlow: 1200,
        afterTax: true,
        cumulativeCashFlow: -1800,
        position: -20_000,
      },
    ]
    const wrapper = mount(ProjectionChart, { props: { series } })
    const rects = wrapper.findAll('rect')
    expect(rects).toHaveLength(2)
    expect(rects[0]?.attributes('fill')).toBe('var(--bad)')
    expect(rects[1]?.attributes('fill')).toBe('var(--good)')
    expect(wrapper.get('svg').attributes('aria-label')).toContain('sur 2 ans')
    expect(
      (wrapper.get('polyline').attributes('points') ?? '').split(' ')
    ).toHaveLength(2)
    const empty = mount(ProjectionChart, { props: { series: [] } })
    expect(empty.get('svg').attributes('aria-label')).toBe('Graphique vide.')
  })
})

describe('entrée de l’étude', () => {
  it('l’annonce et ses hypothèses surchargées, comme côté serveur', async () => {
    const { useStudyInput } = await import('@/composables/useStudy')
    const { ref } = await import('vue')
    const study = useStudyInput(ref(item.listing), ref(A))
    expect(study.value?.input).toEqual(studyInputFromListing(item.listing))
    expect(study.value?.assumptions.interestRate).toBe(0.032)
    expect(useStudyInput(ref(null), ref(A)).value).toBeNull()
  })
})
