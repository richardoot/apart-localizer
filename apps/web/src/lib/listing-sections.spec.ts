import { describe, expect, it } from 'vitest'
import { ListingUpdateSchema } from '@apart/contracts'
import { formFromListing, formToPatch } from './listing-form'
import {
  LISTING_SECTIONS,
  LISTING_SECTION_IDS,
  isSectionDirty,
  sectionOfErrorKey,
  sectionPatch,
  validateSection,
} from './listing-sections'
import {
  LEGACY_SAVE_PAYLOAD,
  REMOVED_IN_LOT_19,
  legacyListing,
} from '@/test/legacy-listing-save.fixture'

/** L'ancienne charge utile, passée par le contrat d'aujourd'hui. */
function legacyPatch(): Record<string, unknown> {
  return ListingUpdateSchema.parse(LEGACY_SAVE_PAYLOAD) as Record<
    string,
    unknown
  >
}

describe('édition par section (lot 19)', () => {
  it('une saisie identique envoie, section par section, la même mise à jour qu’avant', () => {
    const form = formFromListing(legacyListing())
    const before = legacyPatch()
    for (const id of LISTING_SECTION_IDS) {
      const patch = sectionPatch(id, form) as Record<string, unknown>
      expect(Object.keys(patch).sort(), id).toEqual(
        [...LISTING_SECTIONS[id].keys].sort()
      )
      for (const key of LISTING_SECTIONS[id].keys) {
        expect(patch[key], `${id}.${key}`).toEqual(before[key])
      }
    }
  })

  it('toutes les clés d’avant sont couvertes, sauf le statut (menu dédié) et les clés retirées', () => {
    const covered = new Set(
      LISTING_SECTION_IDS.flatMap(id => [...LISTING_SECTIONS[id].keys])
    )
    const before = Object.keys(LEGACY_SAVE_PAYLOAD)
    const missing = before.filter(key => !covered.has(key as never))
    expect(missing.sort()).toEqual(['status', ...REMOVED_IN_LOT_19.root].sort())
    // Les clés retirées ne partent plus, même si le contrat les recevait.
    const form = formFromListing(legacyListing())
    const full = formToPatch(form) as Record<string, unknown>
    expect(full).not.toHaveProperty('assumptionsOverride')
    for (const key of REMOVED_IN_LOT_19.rentalPlan) {
      expect(full.rentalPlan).not.toHaveProperty(key)
      expect(LEGACY_SAVE_PAYLOAD.rentalPlan).toHaveProperty(key)
    }
    // Hors clés retirées, le formulaire entier d'aujourd'hui est celui d'avant.
    const before19 = legacyPatch()
    for (const key of Object.keys(full)) {
      expect(full[key], key).toEqual(before19[key])
    }
  })

  it('les sous-objets partent entiers, comme avant (le serveur les remplace)', () => {
    const form = formFromListing(legacyListing())
    const first = form.renovation.items[0]
    if (first) first.amount = '9500'
    const works = sectionPatch('works', form)
    expect(works.renovation?.items).toHaveLength(3)
    expect(works.renovation?.items[0]).toEqual({
      label: 'Salle de bain',
      amount: 9500,
    })
    expect(works.renovation?.notes).toBe('Devis salle de bain demandé.')
    form.rentalPlan.targetRent = '920'
    const rental = sectionPatch('rental', form)
    expect(rental.rentalPlan).toMatchObject({
      targetRent: 920,
      marketRent: 900,
      coOwnershipAllowsRental: 'yes',
      notes: 'Profil étudiant ou jeune actif.',
    })
    expect(rental.furnitureValue).toBe(0)
    form.addressRaw = '1 rue [Exemple]'
    expect(sectionPatch('listing', form).location).toMatchObject({
      addressRaw: '1 rue [Exemple]',
      commune: 'Bordeaux',
      district: 'Caudéran',
    })
  })

  it('valide la fiche entière et rend la mise à jour de la section, ou les erreurs', () => {
    const form = formFromListing(legacyListing())
    form.dpeDate = '15/03/2024'
    const invalid = validateSection('energy', form)
    expect(invalid.patch).toBeNull()
    expect(invalid.errors.dpeDate).toBe(
      'La date du DPE doit être au format AAAA-MM-JJ.'
    )
    form.dpeDate = '2024-03-15'
    form.gesClass = 'D'
    expect(validateSection('energy', form)).toEqual({
      patch: { dpeClass: 'C', gesClass: 'D', dpeDate: '2024-03-15' },
      errors: {},
    })
  })

  it('une modification non enregistrée se voit section par section', () => {
    const pristine = formFromListing(legacyListing())
    const draft = formFromListing(legacyListing())
    for (const id of LISTING_SECTION_IDS) {
      expect(isSectionDirty(id, pristine, draft), id).toBe(false)
    }
    draft.renovation.notes = 'Autre devis'
    expect(isSectionDirty('works', pristine, draft)).toBe(true)
    expect(isSectionDirty('features', pristine, draft)).toBe(false)
    draft.commune = 'Talence'
    expect(isSectionDirty('listing', pristine, draft)).toBe(true)
  })

  it('la section d’une erreur', () => {
    expect(sectionOfErrorKey('location.point')).toBe('listing')
    expect(sectionOfErrorKey('title')).toBe('listing')
    expect(sectionOfErrorKey('renovation.items.0.amount')).toBe('works')
    expect(sectionOfErrorKey('rentalPlan.targetRent')).toBe('rental')
    expect(sectionOfErrorKey('dpeDate')).toBe('energy')
    expect(sectionOfErrorKey('surface')).toBe('features')
    expect(sectionOfErrorKey('propertyTax')).toBe('copro')
    expect(sectionOfErrorKey('notes')).toBe('notes')
    expect(sectionOfErrorKey('status')).toBeNull()
  })
})
