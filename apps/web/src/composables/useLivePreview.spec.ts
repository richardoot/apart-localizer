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

  it('applique les travaux avec les hypothèses de l’espace, et réagit aux frappes (lot 19 : plus de surcharge par annonce)', async () => {
    const form = ref(emptyForm())
    form.value.price = '200000'
    form.value.surface = '45'
    form.value.rentalPlan.targetRent = '750'
    form.value.renovation.active = true
    form.value.renovation.items = [
      { key: 'a', label: 'Peinture', amount: '2500' },
      { key: 'b', label: 'Sols', amount: '2 500' },
    ]
    const assumptions = ref(DEFAULT_ASSUMPTIONS)
    const preview = useLivePreview(form, assumptions)
    expect(preview.value.evaluation?.metrics.renovationTotal).toBe(5000)
    expect(preview.value.evaluation?.metrics.loanAmount).toBe(
      200_000 + 15_000 + 5000 - 40_000
    )
    expect(preview.value.assumptions).toEqual(DEFAULT_ASSUMPTIONS)
    expect(form.value).not.toHaveProperty('overrides')
    const first = form.value.renovation.items[0]
    if (first) first.amount = '4500'
    await nextTick()
    expect(preview.value.evaluation?.metrics.renovationTotal).toBe(7000)
    // L'année de la phase 2 est celle de l'espace.
    assumptions.value = { ...DEFAULT_ASSUMPTIONS, rentalYear: 2031 }
    await nextTick()
    expect(preview.value.evaluation?.rental.year).toBe(2031)
  })

  it('le critère « marché » lit la médiane DVF enregistrée sur l’annonce (lot 4)', () => {
    const form = emptyForm()
    form.price = '200000'
    form.surface = '45'
    form.rentalPlan.targetRent = '750'
    const without = previewFromForm(form, DEFAULT_ASSUMPTIONS)
    const market = (p: ReturnType<typeof previewFromForm>) =>
      p.evaluation?.targetPrice.criteria.find(c => c.criterion === 'market')
    expect(market(without)?.maxPrice).toBeNull()
    const context = {
      market: {
        medianPricePerM2: 4000,
        count: 6,
        radiusMeters: 500,
        computedAt: '2026-11-03T10:00:00.000Z',
      },
      dpe: null,
      surroundings: null,
      rentControl: null,
      transit: null,
    }
    const withMarket = previewFromForm(form, DEFAULT_ASSUMPTIONS, context)
    expect(market(withMarket)?.maxPrice).toBe(180_000)
    expect(market(withMarket)?.discount).toBeCloseTo(0.1, 10)
    // Moins de cinq ventes : pas d'ancrage marché.
    const few = previewFromForm(form, DEFAULT_ASSUMPTIONS, {
      ...context,
      market: { ...context.market, count: 4 },
    })
    expect(market(few)?.maxPrice).toBeNull()
    const reactive = useLivePreview(
      ref(form),
      ref(DEFAULT_ASSUMPTIONS),
      ref(context)
    )
    expect(market(reactive.value)?.maxPrice).toBe(180_000)
  })

  it('un plafond posé d’office d’après un arrêté expiré ne plafonne plus, comme côté serveur', () => {
    const form = emptyForm()
    form.price = '200000'
    form.surface = '40'
    form.commune = 'Bordeaux'
    form.rentalPlan.targetRent = '900'
    form.rentalPlan.referenceRentPerM2 = '15'
    const context = {
      market: null,
      dpe: null,
      surroundings: null,
      transit: null,
      rentControl: {
        status: 'ok' as const,
        zone: 1,
        referenceRentPerM2: 15,
        decreeDate: '2030-06-01',
        validUntil: '2030-06-30',
        reasons: [],
        computedAt: '2030-06-01T10:00:00.000Z',
      },
    }
    const sources = {
      'rentalPlan.referenceRentPerM2': {
        source: 'open_data' as const,
        confidence: 1,
        recordedAt: '2030-06-01T10:00:00.000Z',
      },
    }
    const during = previewFromForm(
      form,
      DEFAULT_ASSUMPTIONS,
      context,
      sources,
      new Date('2030-06-15')
    )
    expect(during.evaluation?.metrics.rentCap).toBe(600)
    const after = previewFromForm(
      form,
      DEFAULT_ASSUMPTIONS,
      context,
      sources,
      new Date('2030-07-15')
    )
    expect(after.evaluation?.metrics.rentCap).toBeNull()
    // Sans provenance (valeur retapée), la saisie compte.
    expect(
      previewFromForm(form, DEFAULT_ASSUMPTIONS, context, null).evaluation
        ?.metrics.rentCap
    ).toBe(600)
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
