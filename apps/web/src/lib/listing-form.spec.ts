import { describe, expect, it } from 'vitest'
import {
  unreadableNumbers,
  emptyForm,
  formFromInput,
  formFromListing,
  formToPatch,
  formToRawInput,
  mergeExtractedInput,
  validateForm,
} from './listing-form'

import { fakeExtractionResult, fakeListing } from '@/test/fixtures'

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
    // Lot 19 : ni surcharge d'hypothèses, ni année ou type de location.
    expect(form).not.toHaveProperty('overrides')
    expect(form.rentalPlan).not.toHaveProperty('year')
    expect(form.rentalPlan).not.toHaveProperty('leaseType')

    const { input, errors } = validateForm(form)
    expect(errors).toEqual({})
    expect(input?.price).toBe(200_000)
    expect(input?.location.point).toEqual(listing.location.point)
    expect(input?.location.precision).toBe('exact')
    expect(input?.renovation?.items.map(i => i.amount)).toEqual([2500, null])
    expect(input?.rentalPlan?.targetRent).toBe(750)
    expect(input?.rentalPlan?.demand).toBe('strong')
    expect(input).not.toHaveProperty('assumptionsOverride')
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
    expect(raw).not.toHaveProperty('assumptionsOverride')
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

describe('fiche extraite par l’IA', () => {
  it('remplit le formulaire depuis une fiche non enregistrée et garde la précision du géocodeur', () => {
    const extracted = fakeExtractionResult().listing
    const form = formFromInput(extracted)
    expect(form.title).toBe('T2 Talence Forum, 3e étage avec balcon')
    expect(form.price).toBe('189000')
    expect(form.surface).toBe('45.2')
    expect(form.addressRaw).toBe('Rue du Forum, 33400 Talence')
    expect(form.longitude).toBe('-0.5906')
    expect(form.precision).toBe('street')
    expect(form.renovation.active).toBe(true)
    expect(form.renovation.level).toBe('refresh')
    expect(form.renovation.items).toEqual([])
    const { input, errors } = validateForm(form)
    expect(errors).toEqual({})
    expect(input?.location.precision).toBe('street')
    expect(input?.location.point).toEqual(extracted.location.point)
  })

  it('fusionne le formulaire validé avec les champs que le formulaire ne montre pas', () => {
    const extracted = fakeExtractionResult().listing
    const form = formFromInput(extracted)
    form.price = '185 000'
    form.rentalPlan.targetRent = '800'
    const merged = mergeExtractedInput(extracted, formToRawInput(form))
    expect(merged.price).toBe(185_000)
    expect(merged.rentalPlan?.targetRent).toBe(800)
    // Hors formulaire : conservés depuis l'extraction.
    expect(merged.floor).toBe(3)
    expect(merged.floorsTotal).toBe(5)
    expect(merged.cellar).toBe(true)
    expect(merged.orientation).toBe('sud')
    expect(merged.externalId).toBe('AGF-12345')
    expect(merged.sourceText).toBe(extracted.sourceText)
    expect(merged.location?.addressNormalized).toBe(
      'Rue du Forum 33400 Talence'
    )
    expect(merged.location?.inseeCode).toBe('33522')
    expect(merged.location?.point).toEqual(extracted.location.point)
    expect('fieldSources' in merged).toBe(false)
  })
})

describe('lot 22 : un nombre illisible est refusé au champ', () => {
  it('« 45 m² » dans la surface bloque l’enregistrement, avec son message', () => {
    const form = formFromListing(fakeListing())
    form.surface = '45 m²'
    form.renovation.items = [{ key: 'k', label: 'Cuisine', amount: '8k' }]
    form.rentalPlan.targetRent = 'beaucoup'
    form.longitude = 'ouest'
    const { input, errors } = validateForm(form)
    expect(input).toBeNull()
    expect(errors.surface).toContain('« 45 m² » n’est pas un nombre')
    expect(errors['renovation.items.0.amount']).toContain('« 8k »')
    expect(errors['rentalPlan.targetRent']).toContain('« beaucoup »')
    expect(errors['location.point']).toContain('« ouest »')
    expect(unreadableNumbers(formFromListing(fakeListing()))).toEqual({})
  })
})
