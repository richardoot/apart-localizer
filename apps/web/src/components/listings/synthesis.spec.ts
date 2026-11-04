/**
 * Lot 9, lisibilité de la fiche : pastilles des deux bases, onglets, les
 * trois blocs de la synthèse, l'encart « Et au prix cible ? ». Les annonces
 * sont fictives et évaluées par le vrai paquet `domain`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { AssumptionsSchema, DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { compute, financialsFromListing, targetPrice } from '@apart/domain'
import { readingOf } from '@/composables/useListingReading'
import { fakeEvaluated, fakeTask, fakeTargetPriceReport } from '@/test/fixtures'
import AtTargetPanel from './AtTargetPanel.vue'
import CostBasisBadge from './CostBasisBadge.vue'
import CostSummary from './CostSummary.vue'
import ListingSynthesis from './ListingSynthesis.vue'
import ListingTabs from './ListingTabs.vue'
import NegotiationSummary from './NegotiationSummary.vue'
import ProfitabilitySummary from './ProfitabilitySummary.vue'

const A = DEFAULT_ASSUMPTIONS
/** L'exemple du modèle de calcul § 8 : 200 000 €, 45 m², 750 €, mobilier 5 000 €. */
const example = fakeEvaluated({
  renovation: null,
  annualCharges: null,
  assumptionsOverride: null,
})
const reading = readingOf(example.evaluation, example.evaluation.targetPrice, A)

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

describe('ListingTabs', () => {
  it('vrai motif d’onglets : tablist, aria-selected, un seul arrêt de tabulation, flèches, Début et Fin', async () => {
    const wrapper = mount(ListingTabs, {
      props: { modelValue: 'synthese', openTasks: 9 },
      attachTo: document.body,
    })
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe(
      'Sections de la fiche'
    )
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(5)
    expect(tabs.map(t => t.attributes('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ])
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    expect(tabs[0]?.attributes('aria-controls')).toBe('listing-panel-synthese')
    expect(tabs[4]?.text()).toContain('· 9 tâches')
    await tabs[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['negocier'])
    await wrapper.setProps({ modelValue: 'negocier' })
    expect(document.activeElement?.id).toBe('listing-tab-negocier')
    await tabs[1]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['synthese'])
    await tabs[1]?.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual(['suivi'])
    await tabs[1]?.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')?.[3]).toEqual(['synthese'])
    await tabs[1]?.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(4)
    await tabs[3]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[4]).toEqual(['quartier'])
    wrapper.unmount()
  })

  it('reboucle aux extrémités ; sur mobile, pastilles de 44 px qui défilent', async () => {
    const wrapper = mount(ListingTabs, { props: { modelValue: 'suivi' } })
    await wrapper.findAll('[role="tab"]')[4]?.trigger('keydown', {
      key: 'ArrowRight',
    })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['synthese'])
    const first = mount(ListingTabs, { props: { modelValue: 'synthese' } })
    await first.findAll('[role="tab"]')[0]?.trigger('keydown', {
      key: 'ArrowLeft',
    })
    expect(first.emitted('update:modelValue')?.[0]).toEqual(['suivi'])
    expect(first.get('[role="tablist"]').classes()).toContain('overflow-x-auto')
    for (const tab of first.findAll('[role="tab"]'))
      expect(tab.classes()).toEqual(
        expect.arrayContaining(['min-h-11', 'rounded-full', 'flex-none'])
      )
    // Aucune tâche ouverte : pas de compteur.
    expect(first.find('[data-testid="open-tasks-count"]').exists()).toBe(false)
  })
})

describe('NegotiationSummary', () => {
  it('« Combien négocier ? » : prix affiché, prix cible, échelle, décote classée, critère liant, offre', () => {
    const wrapper = mount(NegotiationSummary, {
      props: {
        price: 200_000,
        targetPrice: example.evaluation.targetPrice,
        suggestedOffer: 147_000,
        gauge: reading?.gauge ?? null,
      },
    })
    expect(wrapper.text()).toContain('sur le prix')
    expect(wrapper.get('[data-testid="summary-listed-price"]').text()).toMatch(
      /200\s000 €/
    )
    expect(wrapper.get('[data-testid="summary-target-price"]').text()).toMatch(
      /147\s56\d €/
    )
    const gauge = wrapper.get('[data-testid="price-gauge"]')
    expect(gauge.attributes('aria-hidden')).toBe('true')
    expect(gauge.get('[data-marker="target"]').attributes('style')).toMatch(
      /left: 73\.7\d%/
    )
    expect(gauge.get('[data-marker="listed"]').attributes('style')).toMatch(
      /left: 100%/
    )
    const discount = wrapper.get('[data-testid="summary-discount"]')
    expect(discount.attributes('data-discount-class')).toBe('out_of_reach')
    expect(discount.text()).toContain(
      'Décote nécessaire 26,2 % · hors de portée'
    )
    expect(wrapper.text()).toContain(
      'Fixé par le rendement brut (critère liant)'
    )
    expect(wrapper.get('[data-testid="summary-offer"]').text()).toMatch(
      /147\s000 €/
    )
    expect(
      wrapper.findAll('[data-term]').map(b => b.attributes('data-term'))
    ).toEqual([
      'target_price',
      'discount',
      'binding_criterion',
      'suggested_offer',
    ])
  })

  it('déjà dans la cible : une marge, l’échelle va jusqu’au prix cible ; sans prix cible, un message', () => {
    const cheap = fakeEvaluated({
      price: 120_000,
      renovation: null,
      assumptionsOverride: null,
    })
    const r = readingOf(cheap.evaluation, cheap.evaluation.targetPrice, A)
    const wrapper = mount(NegotiationSummary, {
      props: {
        price: 120_000,
        targetPrice: cheap.evaluation.targetPrice,
        suggestedOffer: null,
        gauge: r?.gauge ?? null,
      },
    })
    expect(wrapper.get('[data-testid="summary-discount"]').text()).toContain(
      'Marge'
    )
    expect(wrapper.get('[data-marker="target"]').attributes('style')).toMatch(
      /left: 100%/
    )
    expect(wrapper.find('[data-testid="summary-offer"]').exists()).toBe(false)
    const none = mount(NegotiationSummary, {
      props: {
        price: 200_000,
        targetPrice: null,
        suggestedOffer: null,
        gauge: null,
      },
    })
    expect(none.text()).toContain('Prix cible non calculable')
    expect(none.get('[data-testid="summary-target-price"]').text()).toBe('—')
  })
})

describe('CostSummary', () => {
  it('« Combien ça coûte ? » : prix + notaire (taux) + travaux + mobilier = coût tout compris, puis apport, emprunt, mensualité', () => {
    const wrapper = mount(CostSummary, {
      props: {
        metrics: example.evaluation.metrics,
        assumptions: A,
        payment: reading?.payment ?? null,
      },
    })
    expect(wrapper.text()).toContain('tout compris')
    const table = wrapper.get('[data-testid="cost-breakdown"]')
    expect(table.get('[data-row="notary"]').text()).toMatch(
      /\+ Notaire \(7,5 %\).*≈ 15\s000 €/
    )
    expect(table.get('[data-row="renovation"]').text()).toMatch(/0 €/)
    expect(table.get('[data-row="furniture"]').text()).toMatch(/5\s000 €/)
    expect(wrapper.get('[data-testid="total-cost"]').text()).toMatch(
      /220\s000 €/
    )
    expect(wrapper.text()).toMatch(/Apport\s*− 40\s000 €/)
    expect(wrapper.get('[data-testid="loan-amount"]').text()).toMatch(
      /180\s000 €/
    )
    expect(wrapper.text()).toContain('(25 ans, 3,65 %)')
    expect(wrapper.get('[data-testid="monthly-payment"]').text()).toMatch(
      /931 €\/mois/
    )
    expect(wrapper.get('[data-testid="payment-split"]').text()).toMatch(
      /916 € de crédit \+ 15 € d’assurance/
    )
  })

  it('mode barème : « Notaire (barème) » ; rien emprunté, pas de détail de mensualité', () => {
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
      },
    })
    expect(wrapper.get('[data-row="notary"]').text()).toContain('(barème)')
    expect(wrapper.find('[data-testid="payment-split"]').exists()).toBe(false)
    const bare = mount(CostSummary, {
      props: {
        metrics: example.evaluation.metrics,
        assumptions: null,
        payment: null,
      },
    })
    expect(bare.get('[data-row="notary"]').text()).toContain('(taux)')
    expect(bare.text()).not.toContain('Apport')
  })
})

describe('ProfitabilitySummary', () => {
  it('« Est-ce rentable ? » : loyer retenu, brut et effort en échec avec leur seuil, net non retenu, verdict et raisons', () => {
    const wrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: example.evaluation.metrics,
        checks: reading?.checks ?? null,
      },
    })
    expect(wrapper.get('[data-testid="retained-rent"]').text()).toBe(
      '750 €/mois'
    )
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
    expect(wrapper.get('[data-testid="value-effort"]').text()).toBe(
      '−362 €/mois'
    )
    expect(wrapper.get('[data-testid="status-effort"]').text()).toContain(
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
  })

  it('« de peu », plafond d’encadrement, net retenu, loyer manquant', () => {
    const capped = fakeEvaluated({
      price: 165_000,
      renovation: null,
      assumptionsOverride: null,
      annualCharges: null,
      propertyTax: 700,
      rentalPlan: {
        year: null,
        leaseType: 'unfurnished',
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
      },
    })
    expect(wrapper.get('[data-testid="rent-cap"]').text()).toMatch(
      /Loyer visé 750 €\/mois, plafond d’encadrement 675 €\/mois/
    )
    expect(
      wrapper.get('[data-indicator="net_yield"]').attributes('data-status')
    ).toMatch(/ok|fail/)
    expect(wrapper.get('[data-testid="status-net_yield"]').text()).toContain(
      'seuil ≥ 3,0 %'
    )
    const near = fakeEvaluated({
      price: 165_000,
      renovation: null,
      assumptionsOverride: null,
      annualCharges: null,
    })
    const nearWrapper = mount(ProfitabilitySummary, {
      props: {
        metrics: near.evaluation.metrics,
        checks: readingOf(near.evaluation, null, A)?.checks ?? null,
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
      assumptionsOverride: null,
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

describe('AtTargetPanel', () => {
  it('« Et au prix cible ? » : prix, coût tout compris, brut et effort au prix cible, verdict', async () => {
    const wrapper = mount(AtTargetPanel, {
      props: {
        targetPrice: example.evaluation.targetPrice,
        checks: reading?.atTargetChecks ?? null,
      },
    })
    expect(wrapper.get('[data-testid="at-target-price"]').text()).toMatch(
      /147\s56\d €/
    )
    expect(wrapper.get('[data-testid="at-target-cost"]').text()).toMatch(
      /163\s636 €/
    )
    expect(wrapper.get('[data-testid="at-target-gross"]').text()).toMatch(
      /5,5 %\s*✓/
    )
    expect(wrapper.get('[data-testid="at-target-effort"]').text()).toMatch(
      /−70 €\/mois\s*✓/
    )
    expect(wrapper.get('[data-testid="at-target-verdict"]').text()).toBe(
      'À ce prix, le bien entre dans la cible.'
    )
    expect(wrapper.text()).toContain('sur le prix')
    expect(wrapper.text()).toContain('tout compris')
    await wrapper.get('[data-testid="go-negotiate"]').trigger('click')
    expect(wrapper.emitted('negotiate')).toHaveLength(1)
  })

  it('DPE G : même au prix cible, hors cible ; DPE inconnu : à creuser ; déjà dans la cible ; sans prix cible', () => {
    const g = fakeEvaluated({ dpeClass: 'G', assumptionsOverride: null })
    const off = mount(AtTargetPanel, {
      props: { targetPrice: g.evaluation.targetPrice, checks: null },
    })
    expect(off.get('[data-testid="at-target-verdict"]').text()).toContain(
      'Même à ce prix, le bien reste hors cible (en échec : DPE E, F ou G).'
    )
    const unknown = fakeEvaluated({
      dpeClass: null,
      price: 120_000,
      assumptionsOverride: null,
    })
    const dig = mount(AtTargetPanel, {
      props: {
        targetPrice: unknown.evaluation.targetPrice,
        checks: null,
      },
    })
    const text = dig.get('[data-testid="at-target-verdict"]').text()
    expect(text).toContain('Le prix affiché est déjà sous le prix cible.')
    expect(text).toContain('reste à creuser (de peu : DPE inconnu)')
    const none = mount(AtTargetPanel, {
      props: { targetPrice: null, checks: null },
    })
    expect(none.text()).toContain('Sans prix cible')
  })
})

describe('ListingSynthesis', () => {
  it('bandeau des deux bases, trois blocs empilés puis en trois colonnes, résumés qui mènent aux onglets', async () => {
    const item = fakeEvaluated(
      {
        renovation: null,
        annualCharges: null,
        assumptionsOverride: null,
        openDataContext: {
          market: {
            medianPricePerM2: 4100,
            count: 9,
            radiusMeters: 500,
            computedAt: '2026-11-03T10:00:00.000Z',
          },
          dpe: null,
          rentControl: null,
          transit: {
            nearestTram: {
              name: 'Forum',
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
          fakeTask({ id: 'aaaaaaaa-0000-4000-8000-000000000002', position: 2 }),
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            label: 'Demander le PV d’AG',
            position: 1,
          }),
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000003',
            done: true,
            position: 0,
          }),
        ],
      }
    )
    const report = fakeTargetPriceReport(item)
    const wrapper = mount(ListingSynthesis, {
      props: {
        item,
        evaluation: item.evaluation,
        targetPrice: item.evaluation.targetPrice,
        negotiation: report.negotiation,
        assumptions: A,
        live: true,
      },
    })
    const bases = wrapper.get('[data-testid="cost-bases"]')
    expect(bases.text()).toContain('Deux bases de calcul')
    expect(bases.text()).toContain('sur le prix se compare au prix affiché')
    expect(bases.text()).toContain(
      'tout compris prix + notaire + travaux + mobilier'
    )
    expect(wrapper.find('[data-testid="live-badge"]').exists()).toBe(true)
    // Empilés sur mobile, trois colonnes quand le panneau est assez large.
    const blocks = wrapper.get('[data-testid="block-price"]').element
      .parentElement as HTMLElement
    expect(blocks.className).toContain('@4xl:grid-cols-3')
    expect(blocks.className).not.toMatch(/(^| )grid-cols-3/)
    expect(wrapper.get('[data-testid="summary-follow"]').text()).toContain(
      '2 tâche(s) ouverte(s) · aucun avis'
    )
    expect(wrapper.get('[data-testid="summary-follow"]').text()).toContain(
      'Prochaine : Demander le PV d’AG'
    )
    const area = wrapper.get('[data-testid="summary-area"]').text()
    expect(area).toContain('Tram Forum à 350 m')
    expect(area).toMatch(/marché DVF 4\s100 €\/m²/)
    expect(area).toMatch(/L’annonce : 4\s444 €\/m²/)
    expect(wrapper.get('[data-testid="summary-rental"]').text()).toContain(
      'Louabilité (phase 2)'
    )
    const buttons = wrapper.findAll('button').filter(b => /→/.test(b.text()))
    for (const button of buttons) await button.trigger('click')
    expect(wrapper.emitted('go')).toEqual([
      ['negocier'],
      ['financer'],
      ['suivi'],
      ['quartier'],
    ])
  })

  it('sans évaluation, invite à saisir ; sans données ouvertes, le quartier est à vérifier', () => {
    const item = fakeEvaluated()
    const wrapper = mount(ListingSynthesis, {
      props: {
        item,
        evaluation: null,
        targetPrice: null,
        negotiation: null,
        assumptions: null,
      },
    })
    expect(wrapper.text()).toContain('Saisissez un prix et un loyer visé')
    expect(wrapper.find('[data-testid="block-price"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="summary-area"]').text()).toContain(
      'Tram : à vérifier · marché DVF inconnu'
    )
    expect(wrapper.find('[data-testid="live-badge"]').exists()).toBe(false)
  })

  it('louabilité : compte les points bloquants, d’attention et à vérifier', () => {
    const item = fakeEvaluated({ dpeClass: 'G' })
    const wrapper = mount(ListingSynthesis, {
      props: {
        item,
        evaluation: item.evaluation,
        targetPrice: targetPrice(financialsFromListing(item.listing), A),
        negotiation: null,
        assumptions: A,
      },
    })
    expect(wrapper.get('[data-testid="summary-rental"]').text()).toMatch(
      /[1-9] bloquant\(s\)/
    )
  })
})
