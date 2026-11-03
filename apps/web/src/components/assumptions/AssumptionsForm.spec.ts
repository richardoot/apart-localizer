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
