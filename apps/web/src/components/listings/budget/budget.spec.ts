/**
 * Lot 19 : l'onglet « Budget : peut-on se le permettre, et après ? ». Le
 * bandeau des hypothèses de l'espace, « À l'achat » (barre et légende), la
 * phase 1, la phase 2 lue puis modifiée sur place (même mise à jour que
 * l'ancien formulaire pour ses champs), le plafond d'encadrement et les
 * contrôles, le rendement par scénario et la projection repliée. Annonces et
 * comparables fictifs, évalués par le vrai paquet `domain` ; API simulée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_REGULATORY_RULES,
} from '@apart/contracts'
import type { Assumptions, EvaluatedListing, Scenario } from '@apart/contracts'
import {
  complianceReport,
  compute,
  financialsFromListing,
  rentMarket,
} from '@apart/domain'
import { readingOf } from '@/composables/useListingReading'
import {
  LISTING_EDITOR,
  createListingEditor,
} from '@/composables/useListingEditor'
import { useLivePreview } from '@/composables/useLivePreview'
import { formFromListing } from '@/lib/listing-form'
import { sectionPatch } from '@/lib/listing-sections'
import { fakeContext } from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  listings: { context: vi.fn() },
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

import BudgetTab from '../tabs/BudgetTab.vue'
import CostSummary from '../CostSummary.vue'
import ProfitabilitySummary from '../ProfitabilitySummary.vue'

enableAutoUnmount(afterEach)

/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

const A = AssumptionsSchema.parse({
  ...DEFAULT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  currentRent: 850,
})
const AT = new Date('2026-11-03T10:00:00Z')
/** L'exemple du modèle de calcul § 8 : 200 000 €, 45 m², 750 €, mobilier 5 000 €. */
const example = fakeEvaluated({ renovation: null, annualCharges: null })
const reading = readingOf(example.evaluation, example.evaluation.targetPrice, A)

const comparables = [600, 640, 680, 720, 760].map((rent, i) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  listingId: example.listing.id,
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
  listingId: example.listing.id,
  surface: 45,
  furnished: false,
  targetRent: 750,
  rentCap: null,
  at: AT,
})

const saved: Scenario = {
  id: '99999999-9999-4999-8999-999999999999',
  workspaceId: example.listing.workspaceId,
  listingId: null,
  name: '[Exemple] Taux 3 %',
  overrides: { assumptions: { interestRate: 0.03 } },
  notes: null,
  createdById: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
}

function mountTab(
  options: {
    item?: EvaluatedListing
    assumptions?: Assumptions
    live?: boolean
  } = {}
) {
  const item = options.item ?? example
  const assumptions = options.assumptions ?? A
  const submit = vi.fn(() => Promise.resolve())
  const editor = createListingEditor({
    listing: ref(item.listing),
    changedFields: computed(() => []),
    preview: draft => useLivePreview(draft, ref(assumptions)),
    submit,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(BudgetTab, {
    props: {
      item,
      evaluation: item.evaluation,
      targetPrice: item.evaluation.targetPrice,
      assumptions,
      live: options.live ?? false,
    },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      provide: { [LISTING_EDITOR as symbol]: editor },
    },
  })
  return { wrapper, editor, submit }
}

describe('onglet Budget (lot 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.study.comparables.mockResolvedValue({ items: comparables, market })
    apiMock.scenarios.list.mockResolvedValue([saved])
    apiMock.study.compliance.mockResolvedValue(
      complianceReport(
        {
          dpeClass: 'D',
          dpeDate: '2023-01-01',
          constructionYear: 1975,
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

  it('bandeau : calculé avec les hypothèses de l’espace, lien vers la page Hypothèses', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    const banner = n(wrapper.get('[data-testid="budget-assumptions"]').text())
    expect(banner).toContain(
      'Calculé avec les hypothèses de l’espace : apport 40 000 €, 3,65 % sur 25 ans, frais de notaire au taux de 7,5 %, mise en location en 2028, location vide.'
    )
    expect(wrapper.find('[data-testid="edit-assumptions"]').exists()).toBe(true)
    const scale = AssumptionsSchema.parse({
      ...A,
      notaryMode: 'scale',
      rentalYear: 2030,
      leaseType: 'shared',
    })
    const other = mountTab({ assumptions: scale })
    await flushPromises()
    expect(
      n(other.wrapper.get('[data-testid="budget-assumptions"]').text())
    ).toContain(
      'frais de notaire au barème, mise en location en 2030, colocation'
    )
    // L'année de la phase 2 suit : « la louer en 2028 ».
    expect(wrapper.get('[data-testid="rental-phase"]').text()).toContain(
      'Phase 2 : la louer en 2028'
    )
  })

  it('« À l’achat » : coût tout compris, barre de répartition, légende, emprunt et mensualité', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    const block = wrapper.get('[data-testid="block-cost"]')
    expect(block.text()).toContain('À l’achat')
    expect(n(block.get('[data-testid="total-cost"]').text())).toBe('220 000 €')
    const bar = block.get('[data-testid="cost-bar"]')
    expect(bar.attributes('aria-hidden')).toBe('true')
    expect(
      bar.findAll('[data-share]').map(s => s.attributes('data-share'))
    ).toEqual(['price', 'notary', 'furniture'])
    expect(n(block.get('[data-row="notary"]').text())).toMatch(
      /Frais de notaire \(7,5 %\).*≈ 15 000 €/
    )
    expect(n(block.get('[data-row="furniture"]').text())).toContain('5 000 €')
    expect(n(block.get('[data-testid="loan-amount"]').text())).toBe('180 000 €')
    expect(n(block.get('[data-testid="monthly-payment"]').text())).toBe(
      '931 €/mois'
    )
    expect(n(block.get('[data-testid="payment-split"]').text())).toBe(
      '916 € de crédit + 15 € d’assurance'
    )
    await block.get('[data-testid="works-detail"]').trigger('click')
    expect(wrapper.emitted('go')).toEqual([['bien']])
  })

  it('phase 1 : le coût d’occupation en grand, son détail et la bascule', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    const phase1 = wrapper.get('[data-testid="phase1"]')
    expect(phase1.text()).toContain('Phase 1 : y habiter')
    expect(phase1.text()).toContain("Coût d'occupation")
    expect(phase1.text()).toContain('de plus que le loyer actuel')
    expect(phase1.text()).toContain('Taxe foncière')
    expect(phase1.get('[data-testid="switch"]').text()).toContain(
      '1 janv. 2028'
    )
  })

  it('phase 2 lue : loyer visé, marché des comparables, plafond, jauge, contrôles ; encadrement détaillé', async () => {
    const capped = fakeEvaluated({
      renovation: null,
      rentalPlan: {
        rentControl: 'yes',
        referenceRentPerM2: 17.5,
        targetRent: 750,
        marketRent: null,
        demand: 'strong',
        coOwnershipAllowsRental: 'yes',
        decencyCompliant: 'unknown',
        rentalPermitRequired: 'no',
        notes: null,
      },
    })
    const { wrapper } = mountTab({ item: capped })
    await flushPromises()
    const phase = wrapper.get('[data-testid="rental-phase"]')
    expect(n(phase.get('[data-testid="target-rent"]').text())).toBe(
      '750 €/mois'
    )
    // Les comparables : 15 à 17 €/m² environ × 45 m².
    const refs = n(phase.get('[data-testid="rent-references"]').text())
    expect(refs).toMatch(/marché \d[\d ]* € à \d[\d ]* € \(5 comparables\)/)
    expect(refs).toContain('plafond 788 €')
    const gauge = phase.get('[data-testid="rent-gauge"]')
    expect(gauge.attributes('aria-hidden')).toBe('true')
    expect(gauge.find('[data-marker="cap"]').exists()).toBe(true)
    expect(gauge.find('[data-marker="market"]').exists()).toBe(true)
    const checks = phase.get('[data-testid="rental-checks"]')
    expect(checks.find('[data-check="dpe_ban"]').exists()).toBe(true)
    expect(
      checks.get('[data-check="rent_control"]').attributes('data-level')
    ).toBe('ok')
    // Le bloc « Encadrement des loyers » venu du Quartier.
    const rent = phase.get('[data-testid="rent-control"]').text()
    expect(rent).toContain('Calculé')
    expect(rent).toContain('17,5 €/m²')
    expect(rent).toContain('zone 2')
    expect(rent).toContain('vide')
    expect(rent).toContain('Arrêté fictif.')
    expect(phase.text()).toContain('Demande locative')
    // Loyers comparables et conformité, repliés.
    expect(phase.text()).toContain('Loyers comparables')
    expect(phase.text()).toContain('Conformité réglementaire')
  })

  it('phase 2 modifiée sur place : loyer visé d’abord, sans année ni type, même mise à jour que l’ancien formulaire', async () => {
    const { wrapper, submit } = mountTab()
    await flushPromises()
    await wrapper.get('[data-testid="edit-rental"]').trigger('click')
    const form = wrapper.get('form[aria-label^="Modifier"]')
    const first = form.find('input, select')
    expect(first.attributes('id')).toBe('f-rent')
    expect(form.find('#f-p2-year').exists()).toBe(false)
    expect(form.find('#f-p2-lease').exists()).toBe(false)
    expect(form.text()).toContain('L’année et le type de location se règlent')
    await form.get('#f-rent').setValue('800')
    await form.get('#f-p2-coown').setValue('yes')
    await form.get('#f-furniture').setValue('4000')
    // L'aperçu en direct suit la saisie.
    expect(form.get('[data-testid="section-preview"]').text()).toContain(
      'coût tout compris'
    )
    await form.trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(1)
    const expected = formFromListing(example.listing)
    expected.rentalPlan.targetRent = '800'
    expected.rentalPlan.coOwnershipAllowsRental = 'yes'
    expected.furnitureValue = '4000'
    expect(submit).toHaveBeenCalledWith(
      'rental',
      sectionPatch('rental', expected)
    )
    const patch = (submit.mock.calls[0] as unknown[])[1] as {
      rentalPlan: Record<string, unknown>
    }
    expect(patch.rentalPlan).not.toHaveProperty('year')
    expect(patch.rentalPlan).not.toHaveProperty('leaseType')
  })

  it('rendement : scénarios en sélecteur, chiffres qui changent, projection et éditeur repliés, mention fiscale', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    const section = wrapper.get('[data-testid="yield-section"]')
    expect(section.text()).toContain('Rendement et projection sur 15 ans')
    const picker = section.get('[data-testid="scenario-picker"]')
    const base = picker.get('[data-scenario="base"]')
    const other = picker.get(`[data-scenario="${saved.id}"]`)
    expect(base.attributes('aria-pressed')).toBe('true')
    expect(other.attributes('aria-pressed')).toBe('false')
    expect(n(section.get('[data-testid="value-gross_yield"]').text())).toBe(
      '4,09 %'
    )
    const effortBase = n(section.get('[data-testid="value-effort"]').text())
    expect(effortBase).toBe('−362 €/mois')
    expect(section.get('[data-testid="irr"]').text()).toContain(
      'TRI avant impôts à 15 ans'
    )
    expect(section.get('[data-testid="scenario-text"]').text()).toContain(
      'Estimation, pas un conseil fiscal.'
    )
    await other.trigger('click')
    expect(other.attributes('aria-pressed')).toBe('true')
    expect(base.attributes('aria-pressed')).toBe('false')
    // Taux 3 % : même brut, effort moins lourd.
    expect(n(section.get('[data-testid="value-gross_yield"]').text())).toBe(
      '4,09 %'
    )
    expect(n(section.get('[data-testid="value-effort"]').text())).not.toBe(
      effortBase
    )
    expect(n(section.get('[data-testid="scenario-text"]').text())).toContain(
      '« [Exemple] Taux 3 % » : taux 3 %.'
    )
    const projection = section.get('[data-testid="projection-details"]')
    expect((projection.element as HTMLDetailsElement).open).toBe(false)
    expect(projection.find('[data-testid="projection"]').exists()).toBe(true)
    const editor = section.get('[data-testid="scenarios-details"]')
    expect((editor.element as HTMLDetailsElement).open).toBe(false)
    expect(editor.find('[data-testid="scenarios"]').exists()).toBe(true)
  })

  it('pendant une modification, la phase 1 suit l’aperçu en direct', async () => {
    const { wrapper, editor } = mountTab({ live: true })
    await flushPromises()
    const before = wrapper.get('[data-testid="occupancy-total"]').text()
    editor.start('works')
    editor.draft.value.price = '150000'
    await flushPromises()
    expect(wrapper.get('[data-testid="occupancy-total"]').text()).not.toBe(
      before
    )
  })

  it('sans évaluation ni hypothèses : des invitations, rien de calculé', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const editor = createListingEditor({
      listing: ref(example.listing),
      changedFields: computed(() => []),
      preview: draft => useLivePreview(draft, ref(null)),
      submit: () => Promise.resolve(),
    })
    const wrapper = mount(BudgetTab, {
      props: {
        item: example,
        evaluation: null,
        targetPrice: null,
        assumptions: null,
      },
      global: {
        plugins: [[VueQueryPlugin, { queryClient: client }]],
        provide: { [LISTING_EDITOR as symbol]: editor },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Chargement des hypothèses')
    expect(wrapper.text()).toContain('Saisissez un prix et un loyer visé')
    expect(wrapper.find('[data-testid="block-cost"]').exists()).toBe(false)
  })
})

describe('À l’achat (ex « Combien ça coûte ? »)', () => {
  it('mode barème : « Frais de notaire (barème) » ; rien emprunté, pas de détail de mensualité ; honoraires compris', () => {
    const scale = AssumptionsSchema.parse({
      ...A,
      notaryMode: 'scale',
      downPayment: 400_000,
    })
    const metrics = compute(financialsFromListing(example.listing), scale)
    const wrapper = mount(CostSummary, {
      props: {
        metrics,
        assumptions: scale,
        payment:
          readingOf({ ...example.evaluation, metrics }, null, scale)?.payment ??
          null,
        feesAmount: 8000,
      },
    })
    expect(wrapper.get('[data-row="notary"]').text()).toContain('(barème)')
    expect(wrapper.find('[data-testid="payment-split"]').exists()).toBe(false)
    expect(n(wrapper.get('[data-testid="fees-included"]').text())).toBe(
      'dont 8 000 € d’honoraires'
    )
    const bare = mount(CostSummary, {
      props: {
        metrics: example.evaluation.metrics,
        assumptions: null,
        payment: null,
      },
    })
    expect(bare.get('[data-row="notary"]').text()).toContain('(taux)')
    expect(bare.text()).not.toContain('apport')
    expect(bare.find('[data-testid="loan-terms"]').exists()).toBe(false)
    expect(bare.find('[data-testid="fees-included"]').exists()).toBe(false)
  })
})

describe('rendement (ex « Est-ce rentable ? »)', () => {
  it('loyer retenu, brut et effort en échec avec leur seuil, net non retenu, verdict et raisons', () => {
    const wrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: example.evaluation.metrics,
        checks: reading?.checks ?? null,
      },
    })
    expect(n(wrapper.get('[data-testid="retained-rent"]').text())).toBe(
      '750 €/mois'
    )
    const items = wrapper.findAll('[data-indicator]')
    expect(items.map(i => i.attributes('data-indicator'))).toEqual([
      'gross_yield',
      'net_yield',
      'effort',
    ])
    const gross = wrapper.get('[data-indicator="gross_yield"]')
    expect(gross.attributes('data-status')).toBe('fail')
    expect(gross.classes()).toContain('bg-bad-soft')
    expect(gross.text()).toContain('12 × loyer ÷ coût tout compris')
    expect(wrapper.get('[data-testid="value-gross_yield"]').text()).toBe(
      '4,09 %'
    )
    expect(wrapper.get('[data-testid="status-gross_yield"]').text()).toMatch(
      /✗.*seuil ≥ 5,5 %/
    )
    expect(n(wrapper.get('[data-testid="value-effort"]').text())).toBe(
      '−362 €/mois'
    )
    expect(n(wrapper.get('[data-testid="status-effort"]').text())).toContain(
      'effort ≤ 150 €/mois'
    )
    expect(wrapper.get('[data-testid="value-net_yield"]').text()).toBe(
      '≈ 3,1 %'
    )
    expect(wrapper.get('[data-testid="status-net_yield"]').text()).toBe(
      'non retenu'
    )
    const verdict = wrapper.get('[data-testid="summary-verdict"]')
    expect(verdict.text()).toContain('Hors cible')
    expect(verdict.text()).toContain('en échec : rendement brut, effort.')
    expect(wrapper.find('[data-testid="rent-cap"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="irr"]').exists()).toBe(false)
  })

  it('« de peu », plafond d’encadrement, net retenu, loyer manquant, TRI après impôts', async () => {
    const capped = fakeEvaluated({
      price: 165_000,
      renovation: null,
      annualCharges: null,
      propertyTax: 700,
      rentalPlan: {
        rentControl: 'yes',
        referenceRentPerM2: 15,
        targetRent: 750,
        marketRent: null,
        demand: 'strong',
        coOwnershipAllowsRental: 'unknown',
        decencyCompliant: 'unknown',
        rentalPermitRequired: 'unknown',
        notes: null,
      },
    })
    const withNet = AssumptionsSchema.parse({
      ...A,
      netYieldThreshold: 0.03,
      targetCriteria: ['gross_yield', 'effort', 'net_yield'],
    })
    const wrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: capped.evaluation.metrics,
        checks:
          readingOf(capped.evaluation, capped.evaluation.targetPrice, withNet)
            ?.checks ?? null,
        irr: { value: 0.051, afterTax: true },
        horizonYears: 15,
        scenarioLabel: 'base',
      },
    })
    expect(n(wrapper.get('[data-testid="rent-cap"]').text())).toMatch(
      /Loyer visé 750 €\/mois, plafond d’encadrement 675 €\/mois/
    )
    expect(wrapper.get('[data-testid="status-net_yield"]').text()).toContain(
      'seuil ≥ 3,0 %'
    )
    const irr = wrapper.get('[data-testid="irr"]')
    expect(irr.text()).toContain('TRI après impôts à 15 ans · base')
    expect(wrapper.get('[data-testid="value-irr"]').text()).toBe('5,1 %')
    expect(wrapper.get('[data-testid="value-irr"]').classes()).toContain(
      'text-accent'
    )
    // Un TRI négatif se lit en rouge, pas en vert.
    await wrapper.setProps({ irr: { value: -0.009, afterTax: true } })
    expect(wrapper.get('[data-testid="value-irr"]').classes()).toContain(
      'text-bad'
    )
    const near = fakeEvaluated({
      price: 165_000,
      renovation: null,
      annualCharges: null,
    })
    const nearWrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: near.evaluation.metrics,
        checks: readingOf(near.evaluation, null, A)?.checks ?? null,
        irr: { value: null, afterTax: false },
      },
    })
    expect(
      nearWrapper
        .get('[data-indicator="gross_yield"]')
        .attributes('data-status')
    ).toBe('near')
    expect(
      nearWrapper.get('[data-testid="status-gross_yield"]').text()
    ).toContain('(de peu)')
    expect(nearWrapper.get('[data-testid="value-irr"]').text()).toBe('—')
    expect(nearWrapper.get('[data-testid="irr"]').text()).toContain(
      'TMI à renseigner'
    )
    const noRent = fakeEvaluated({ rentalPlan: null })
    const empty = mount(ProfitabilitySummary, {
      props: { metrics: noRent.evaluation.metrics, checks: null },
    })
    expect(empty.text()).toContain('Loyer visé non renseigné')
    expect(empty.find('[data-indicator]').exists()).toBe(false)
  })

  it('verdict « à creuser » : les critères manqués de peu sont nommés', () => {
    const unknownDpe = fakeEvaluated({
      price: 120_000,
      dpeClass: null,
      renovation: null,
    })
    const wrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: unknownDpe.evaluation.metrics,
        checks: readingOf(unknownDpe.evaluation, null, A)?.checks ?? null,
      },
    })
    expect(wrapper.get('[data-testid="summary-verdict"]').text()).toContain(
      'de peu : DPE inconnu.'
    )
  })
})
