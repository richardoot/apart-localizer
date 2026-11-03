import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { emptyForm } from '@/lib/listing-form'
import { previewFromForm, useLivePreview } from './useLivePreview'

describe('aperçu en direct', () => {
  it("reproduit l'exemple § 8 du modèle de calcul depuis le formulaire", () => {
    const form = emptyForm()
    form.title = 'T2'
    form.price = '200 000'
    form.surface = '45'
    form.furnitureValue = '5000'
    form.dpeClass = 'D'
    form.commune = 'Talence'
    form.rentalPlan.targetRent = '750'
    const preview = previewFromForm(form, DEFAULT_ASSUMPTIONS)
    const m = preview.evaluation?.metrics
    expect(m?.notaryFees).toBe(15_000)
    expect(m?.totalCost).toBe(220_000)
    expect(Math.round(m?.monthlyPayment ?? 0)).toBe(931)
    expect(m?.verdict).toBe('off_target')
    expect(preview.evaluation?.targetPrice.bindingCriterion).toBe('gross_yield')
    // Le brief de négociation est calculé dans le navigateur, sans historique.
    expect(preview.negotiation?.suggestedOffer).toBe(147_000)
    expect(preview.negotiation?.discountClass).toBe('out_of_reach')
    expect(preview.negotiation?.daysOnline).toBeNull()
    expect(preview.negotiation?.arguments).toEqual([])
    expect(m?.notaryFeesDetail.mode).toBe('rate')
  })

  it('suit le mode barème des hypothèses', () => {
    const form = emptyForm()
    form.price = '200000'
    form.surface = '45'
    form.furnitureValue = '5000'
    form.rentalPlan.targetRent = '750'
    const preview = previewFromForm(form, {
      ...DEFAULT_ASSUMPTIONS,
      notaryMode: 'scale',
    })
    expect(preview.evaluation?.metrics.notaryFeesDetail.mode).toBe('scale')
    expect(preview.evaluation?.metrics.notaryFees).toBeGreaterThan(15_000)
    expect(preview.evaluation?.targetPrice.targetPrice).toBeLessThan(147_600)
  })

  it('applique travaux et surcharges d’hypothèses, et réagit aux frappes', async () => {
    const form = ref(emptyForm())
    form.value.price = '200000'
    form.value.surface = '45'
    form.value.rentalPlan.targetRent = '750'
    form.value.renovation.active = true
    form.value.renovation.items = [
      { key: 'a', label: 'Peinture', amount: '2500' },
      { key: 'b', label: 'Sols', amount: '2 500' },
    ]
    form.value.overrides.downPayment = '60000'
    const preview = useLivePreview(form, ref(DEFAULT_ASSUMPTIONS))
    expect(preview.value.evaluation?.metrics.renovationTotal).toBe(5000)
    expect(preview.value.evaluation?.metrics.loanAmount).toBe(
      200_000 + 15_000 + 5000 - 60_000
    )
    expect(preview.value.assumptions?.downPayment).toBe(60_000)
    form.value.overrides.interestRatePercent = '3,2'
    await nextTick()
    expect(preview.value.assumptions?.interestRate).toBeCloseTo(0.032, 10)
  })

  it('calcule même un formulaire incomplet et se tait sans hypothèses', () => {
    const form = emptyForm()
    const partial = previewFromForm(form, DEFAULT_ASSUMPTIONS)
    expect(partial.evaluation?.metrics.price).toBe(0)
    expect(Number.isNaN(partial.evaluation?.metrics.pricePerM2)).toBe(true)
    expect(previewFromForm(form, null).evaluation).toBeNull()
    expect(previewFromForm(form, null).negotiation).toBeNull()
    form.url = 'pas une url'
    expect(previewFromForm(form, DEFAULT_ASSUMPTIONS).evaluation).toBeNull()
  })
})
