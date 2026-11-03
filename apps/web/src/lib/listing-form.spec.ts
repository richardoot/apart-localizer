import { describe, expect, it } from 'vitest'
import {
  emptyForm,
  formFromListing,
  formToPatch,
  formToRawInput,
  validateForm,
} from './listing-form'

import { fakeListing } from '@/test/fixtures'

describe('listing-form', () => {
  it('un formulaire vide ne passe pas : titre et prix obligatoires', () => {
    const { input, errors } = validateForm(emptyForm())
    expect(input).toBeNull()
    expect(errors.title).toMatch(/obligatoire/)
    expect(errors.price).toMatch(/obligatoire/)
  })

  it('aller-retour annonce → formulaire → entrée', () => {
    const listing = fakeListing()
    const form = formFromListing(listing)
    expect(form.price).toBe('200000')
    expect(form.surface).toBe('45')
    expect(form.longitude).toBe('-0.5906')
    expect(form.renovation.items).toHaveLength(2)
    expect(form.renovation.items[0]?.amount).toBe('2500')
    expect(form.rentalPlan.targetRent).toBe('750')
    expect(form.overrides.interestRatePercent).toBe('3.2')
    expect(form.overrides.downPayment).toBe('60000')

    const { input, errors } = validateForm(form)
    expect(errors).toEqual({})
    expect(input?.price).toBe(200_000)
    expect(input?.location.point).toEqual(listing.location.point)
    expect(input?.location.precision).toBe('exact')
    expect(input?.renovation?.items.map(i => i.amount)).toEqual([2500, null])
    expect(input?.rentalPlan?.targetRent).toBe(750)
    expect(input?.rentalPlan?.demand).toBe('strong')
    expect(input?.assumptionsOverride).toEqual({
      downPayment: 60_000,
      interestRate: 0.032,
    })
  })

  it('lit les nombres à la française et laisse null ce qui est vide', () => {
    const form = emptyForm()
    form.title = 'Studio'
    form.price = '150 000'
    form.surface = '22,5'
    form.rentalPlan.targetRent = '520'
    const raw = formToRawInput(form)
    expect(raw.price).toBe(150_000)
    expect(raw.surface).toBe(22.5)
    expect(raw.renovation).toBeNull()
    expect(raw.rentalPlan?.targetRent).toBe(520)
    expect(raw.location?.point).toBeNull()
    expect(raw.assumptionsOverride).toBeNull()
    const { input } = validateForm(form)
    expect(input?.dpeClass).toBeNull()
  })

  it('signale une URL ou des coordonnées invalides sur le bon champ', () => {
    const form = emptyForm()
    form.title = 'x'
    form.price = '1'
    form.url = 'pas une url'
    form.longitude = '500'
    form.latitude = '44'
    const { errors } = validateForm(form)
    expect(errors.url).toMatch(/URL/)
    expect(errors['location.point']).toMatch(/coordonnées/)
  })

  it('produit un patch complet accepté par le schéma de mise à jour', () => {
    const form = formFromListing(fakeListing())
    form.notes = 'Vu'
    const patch = formToPatch(form)
    expect(patch.notes).toBe('Vu')
    expect(patch.title).toBe('T2 fictif')
    expect('fieldSources' in patch).toBe(false)
  })
})
