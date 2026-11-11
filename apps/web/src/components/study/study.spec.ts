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
import { useFeedbackStore } from '@/stores/feedback'

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

import CompliancePanel from './CompliancePanel.vue'
import OccupancyPanel from './OccupancyPanel.vue'
import ProjectionChart from './ProjectionChart.vue'
import ProjectionPanel from './ProjectionPanel.vue'
import RentMarketPanel from './RentMarketPanel.vue'
import ScenariosPanel from './ScenariosPanel.vue'

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

/**
 * Lot 19 : les panneaux de l'étude vivent dans l'onglet Budget (phase 1,
 * projection et scénarios repliés, loyers comparables et conformité sous la
 * phase 2) ; ils se testent ici un par un, avec l'entrée de l'étude calculée
 * comme dans la fiche (hypothèses de l'espace).
 */
const input = studyInputFromListing(item.listing, A)

type Panel = 'phase1' | 'scenarios' | 'projection' | 'market' | 'compliance'

function mountPanel(panel: Panel) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const options = {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] as never },
  }
  const common = { listingId: item.listing.id }
  const study = { ...common, title: item.listing.title, input, assumptions: A }
  switch (panel) {
    case 'phase1':
      return mount(OccupancyPanel, {
        ...options,
        props: { ...common, input, assumptions: A },
      })
    case 'scenarios':
      return mount(ScenariosPanel, { ...options, props: study })
    case 'projection':
      return mount(ProjectionPanel, { ...options, props: study })
    case 'market':
      return mount(RentMarketPanel, {
        ...options,
        props: { ...common, furnished: false, currentMarketRent: null },
      })
    default:
      return mount(CompliancePanel, { ...options, props: common })
  }
}

describe('panneaux de l’étude (lot 5, onglet Budget au lot 19)', () => {
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

  it('phase 1 : calculée sans appel réseau', async () => {
    const wrapper = mountPanel('phase1')
    await flushPromises()
    const occupancy = wrapper.get('[data-testid="occupancy"]').text()
    expect(occupancy).toContain("Coût d'occupation")
    expect(occupancy).toContain('de plus que le loyer actuel')
    expect(occupancy).toContain('de capital remboursé')
    expect(wrapper.get('[data-testid="switch"]').text()).toContain(
      '1 janv. 2028'
    )
    expect(apiMock.study.compliance).not.toHaveBeenCalled()
    expect(apiMock.scenarios.list).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('scénarios : comparaison en direct, enregistrement, scénario enregistré appliqué ou supprimé', async () => {
    const wrapper = mountPanel('scenarios')
    await flushPromises()
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
    // Lot 22 : la réussite va à la zone de messages commune.
    expect(useFeedbackStore().messages.map(m => m.text)).toContain(
      'Scénario « Prix négocié » enregistré.'
    )
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
    // Lot 22 : supprimer se confirme sur place.
    const removeButton = () =>
      wrapper.findAll('button').find(b => b.text() === 'Supprimer')
    await removeButton()?.trigger('click')
    expect(apiMock.scenarios.remove).not.toHaveBeenCalled()
    await removeButton()?.trigger('click')
    await flushPromises()
    expect(apiMock.scenarios.remove).toHaveBeenCalledWith(saved.id)
    // Un nombre illisible est refusé à son champ, rien n'est enregistré.
    apiMock.scenarios.create.mockClear()
    await wrapper.get('#sc-price').setValue('abc')
    expect(wrapper.get('#sc-price').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('« abc » n’est pas un nombre')
    await wrapper.get('[data-action="save-scenario"]').trigger('click')
    expect(apiMock.scenarios.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('scénario : enregistrer sans nom est refusé, une erreur serveur est affichée', async () => {
    const wrapper = mountPanel('scenarios')
    await flushPromises()
    await wrapper.get('#sc-rent').setValue('800')
    await wrapper.get('[data-action="save-scenario"]').trigger('click')
    expect(wrapper.text()).toContain('Donne un nom')
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
    const wrapper = mountPanel('projection')
    await flushPromises()
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
    const wrapper = mountPanel('market')
    await flushPromises()
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
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Supprimer')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.study.removeComparable).toHaveBeenCalledWith(
      item.listing.id,
      comparables[0]?.id
    )
    await wrapper.get('[data-action="retain-market-rent"]').trigger('click')
    expect(wrapper.emitted('retain')?.[0]).toEqual([765])
    await wrapper.get('#rc-rent').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Le loyer est nécessaire.')
    // Lot 22 : « 42 m² » n'est pas lu comme vide, il est refusé au champ.
    apiMock.study.addComparable.mockClear()
    await wrapper.get('#rc-rent').setValue('700')
    await wrapper.get('#rc-surface').setValue('42 m²')
    await wrapper.get('form').trigger('submit')
    expect(apiMock.study.addComparable).not.toHaveBeenCalled()
    expect(wrapper.get('#rc-surface').attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })

  it('conformité : points datés et sourcés par catégorie, verdict', async () => {
    const wrapper = mountPanel('compliance')
    await flushPromises()
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

  it('lot 9 : les seuls risques à l’adresse (onglet Quartier), sans verdict ni checklist', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = mount(CompliancePanel, {
      props: { listingId: item.listing.id, risksOnly: true },
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    })
    await flushPromises()
    const panel = wrapper.get('[data-testid="compliance"]')
    expect(panel.text()).not.toContain('Incompatible')
    expect(panel.text()).not.toContain('Performance énergétique')
    expect(panel.find('[data-key="dpe_ban"]').exists()).toBe(false)
    expect(
      panel.find('[aria-label="Risques (Géorisques)"]').exists() ||
        panel.find('[data-testid="no-risks"]').exists()
    ).toBe(true)
    expect(panel.find('[data-testid="georisques"]').exists()).toBe(true)
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
  it('l’annonce et les hypothèses de l’espace, comme côté serveur (lot 19 : plus de surcharge par annonce)', async () => {
    const { useStudyInput } = await import('@/composables/useStudy')
    const { ref } = await import('vue')
    const furnished = AssumptionsSchema.parse({ ...A, leaseType: 'furnished' })
    const study = useStudyInput(ref(item.listing), ref(furnished))
    expect(study.value?.input).toEqual(
      studyInputFromListing(item.listing, furnished)
    )
    expect(study.value?.input.leaseType).toBe('furnished')
    expect(study.value?.assumptions).toEqual(furnished)
    expect(study.value?.assumptions.interestRate).toBe(A.interestRate)
    expect(useStudyInput(ref(null), ref(A)).value).toBeNull()
  })
})
