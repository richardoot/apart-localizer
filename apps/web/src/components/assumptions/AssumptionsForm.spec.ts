import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import AssumptionsForm from './AssumptionsForm.vue'

describe('AssumptionsForm', () => {
  it('affiche les taux en pourcentage et les renvoie en fractions', async () => {
    const wrapper = mount(AssumptionsForm, {
      props: { values: DEFAULT_ASSUMPTIONS },
    })
    expect((wrapper.get('#h-rate').element as HTMLInputElement).value).toBe(
      '3.65'
    )
    expect((wrapper.get('#h-notary').element as HTMLInputElement).value).toBe(
      '7.5'
    )
    await wrapper.get('#h-rate').setValue('3,2')
    await wrapper.get('#h-down').setValue('50 000')
    await wrapper.get('#h-label').setValue('Taux négocié')
    await wrapper.get('form').trigger('submit')
    const [update] = wrapper.emitted('save')?.[0] as [
      { label: string | undefined; values: typeof DEFAULT_ASSUMPTIONS },
    ]
    expect(update.label).toBe('Taux négocié')
    expect(update.values.interestRate).toBeCloseTo(0.032, 10)
    expect(update.values.downPayment).toBe(50_000)
    expect(update.values.grossYieldMargin).toBe(0.007)
  })

  it('refuse une valeur hors bornes avec un message', async () => {
    const wrapper = mount(AssumptionsForm, {
      props: { values: DEFAULT_ASSUMPTIONS },
    })
    await wrapper.get('#h-years').setValue('99')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('durationYears')
  })
})

describe('AssumptionsForm : notaire, critères, décote, impact', () => {
  it('passe au barème, édite ses postes et les renvoie en fractions', async () => {
    const wrapper = mount(AssumptionsForm, {
      props: { values: DEFAULT_ASSUMPTIONS },
    })
    expect(wrapper.find('[data-testid="notary-scale"]').exists()).toBe(false)
    await wrapper.get('#h-notary-mode').setValue('scale')
    expect(wrapper.find('#h-notary').exists()).toBe(false)
    expect((wrapper.get('#h-dept').element as HTMLInputElement).value).toBe('5')
    expect(wrapper.text()).toContain('Gironde')
    await wrapper.get('#h-dept').setValue('4,5')
    await wrapper.get('#h-disbursements').setValue('1000')
    await wrapper.get('form').trigger('submit')
    const [update] = wrapper.emitted('save')?.[0] as [
      { values: typeof DEFAULT_ASSUMPTIONS },
    ]
    expect(update.values.notaryMode).toBe('scale')
    expect(update.values.notaryScale.departmentalRate).toBeCloseTo(0.045, 10)
    expect(update.values.notaryScale.disbursements).toBe(1000)
    expect(update.values.notaryScale.emolumentBands).toHaveLength(4)
    expect(update.values.notaryScale.emolumentBands[3]?.upTo).toBeNull()
    expect(update.values.notaryScale.emolumentBands[0]?.rate).toBeCloseTo(
      0.0387,
      10
    )
  })

  it('critères retenus et seuils de décote ; le net demande son seuil, le tendu dépasse le négociable', async () => {
    const wrapper = mount(AssumptionsForm, {
      props: { values: DEFAULT_ASSUMPTIONS },
    })
    const net = wrapper.get('input[aria-label="Rendement net"]')
    await net.setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('netYieldThreshold')
    await wrapper.get('#h-net-yield').setValue('3,5')
    await wrapper.get('#h-tight').setValue('4')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('tightDiscount')
    await wrapper.get('#h-tight').setValue('12')
    await wrapper.get('#h-negotiable').setValue('6')
    await wrapper.get('input[aria-label="Repère 220 × loyer"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    const [update] = wrapper.emitted('save')?.[0] as [
      { values: typeof DEFAULT_ASSUMPTIONS },
    ]
    expect(update.values.targetCriteria.sort()).toEqual(
      ['effort', 'gross_yield', 'net_yield', 'rent_x220'].sort()
    )
    expect(update.values.netYieldThreshold).toBeCloseTo(0.035, 10)
    expect(update.values.negotiableDiscount).toBeCloseTo(0.06, 10)
    expect(update.values.tightDiscount).toBeCloseTo(0.12, 10)
  })

  it('demande l’aperçu de l’impact et l’affiche', async () => {
    const wrapper = mount(AssumptionsForm, {
      props: { values: DEFAULT_ASSUMPTIONS },
    })
    await wrapper.get('#h-yield').setValue('4')
    const previewButton = wrapper
      .findAll('button')
      .find(b => b.text().includes("Voir l'impact"))
    await previewButton?.trigger('click')
    const [values] = wrapper.emitted('preview')?.[0] as [
      typeof DEFAULT_ASSUMPTIONS,
    ]
    expect(values.grossYieldThreshold).toBeCloseTo(0.04, 10)
    await wrapper.setProps({
      impact: {
        total: 3,
        changedVerdicts: 1,
        changes: [
          {
            listingId: '11111111-1111-4111-8111-111111111111',
            title: 'T2 fictif',
            before: 'off_target',
            after: 'target',
            targetPriceBefore: 147_568,
            targetPriceAfter: 199_000,
          },
        ],
        byVerdictBefore: { target: 1, to_dig: 1, off_target: 1 },
        byVerdictAfter: { target: 2, to_dig: 1, off_target: 0 },
      },
    })
    const impact = wrapper.get('[data-testid="impact"]')
    expect(impact.text()).toContain('1 annonce(s) sur 3 changent de verdict')
    expect(impact.text()).toContain('T2 fictif : Hors cible → Cible')
  })
})
