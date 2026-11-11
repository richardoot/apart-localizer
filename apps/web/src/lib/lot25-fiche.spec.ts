/**
 * Lot 25 : les règles pures de la fiche pleine page (défilement de la liste,
 * fermeture par l'historique), le conflit d'une section relue sans perdre la
 * saisie, le clavier de l'iPhone et le rafraîchissement des URL signées.
 */
import { describe, expect, it } from 'vitest'
import type { ListingCovers } from '@apart/contracts'
import { coverRefetchDelay } from '@/composables/useCovers'
import { keyboardInset } from '@/composables/useKeyboardOpen'
import { fakeListing } from '@/test/fixtures'
import { formFromListing } from './listing-form'
import { PRICE_FIELD_ID, rebaseSection } from './listing-sections'
import { FICHE_PAGE_QUERY, closeTarget, listingScroll } from './navigation'

describe('Lot 25 : la fiche pleine page et la liste', () => {
  it('un panneau s’ouvre et se ferme sans faire bouger la liste', () => {
    expect(listingScroll('listing', 'listings', false)).toBe(false)
    expect(listingScroll('listings', 'listing', false)).toBe(false)
    expect(listingScroll('listing-new', 'listings', true)).toBe(false)
    expect(listingScroll('listing', 'listing', false)).toBe(false)
  })

  it('la pleine page suit la règle ordinaire (en haut ; un retour reprend sa position)', () => {
    expect(listingScroll('listing', 'listings', true)).toBeNull()
    expect(listingScroll('listings', 'listing', true)).toBeNull()
    expect(listingScroll('home', 'listing', true)).toBeNull()
    expect(listingScroll('home', 'listings', false)).toBeNull()
    expect(FICHE_PAGE_QUERY).toBe('(min-width: 1024px)')
  })

  it('fermer : par l’historique vers l’accueil, les tâches, le tri ou la liste ; sinon la liste', () => {
    expect(closeTarget('home')).toBe('history')
    expect(closeTarget('triage')).toBe('history')
    expect(closeTarget('listings')).toBe('history')
    expect(closeTarget('listing')).toBe('list')
    expect(closeTarget(undefined)).toBe('list')
    expect(closeTarget('login')).toBe('list')
  })
})

describe('Lot 25 : un conflit relu sans perdre la saisie', () => {
  const listing = fakeListing()
  const before = formFromListing(listing)

  it('garde ce qui a été tapé, prend le reste de la fiche relue, nomme les champs changés des deux côtés', () => {
    const typed = { ...before, surface: '52', rooms: '4' }
    const fresh = formFromListing({
      ...listing,
      rooms: 3,
      elevator: false,
      price: 210_000,
    })
    const { draft, overlapping } = rebaseSection(
      'features',
      before,
      typed,
      fresh
    )
    expect(draft.surface).toBe('52')
    expect(draft.rooms).toBe('4')
    expect(draft.elevator).toBe(fresh.elevator)
    // Un champ d'une autre section vient de la fiche relue.
    expect(draft.price).toBe('210000')
    expect(overlapping).toEqual(['rooms'])
  })

  it('« Corriger le prix » vise le champ du prix de la section de l’annonce', () => {
    expect(PRICE_FIELD_ID).toBe('f-price')
  })
})

describe('Lot 25 : au-dessus du clavier de l’iPhone', () => {
  it('la hauteur cachée sous la fenêtre visible', () => {
    expect(keyboardInset(844, null)).toBe(0)
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336)
    expect(keyboardInset(844, { height: 508, offsetTop: 120 })).toBe(216)
    // Un zoom n'est pas un clavier.
    expect(keyboardInset(844, { height: 400, offsetTop: 0, scale: 2 })).toBe(0)
  })
})

describe('Lot 25 : les URL signées des couvertures', () => {
  const at = Date.parse('2026-11-11T10:00:00.000Z')
  const covers = (...ends: Array<string | null>): ListingCovers => ({
    covers: ends.map(end => ({
      listingId: '11111111-1111-4111-8111-111111111111',
      photoId: '22222222-2222-4222-8222-222222222222',
      visitId: '33333333-3333-4333-8333-333333333333',
      thumbnailUrl: end ? 'https://x.invalid/sign/a' : null,
      urlExpiresAt: end,
      chosen: false,
    })),
  })

  it('relues une minute avant la première fin de validité, trente secondes au moins', () => {
    expect(coverRefetchDelay(undefined, at)).toBe(false)
    expect(coverRefetchDelay(covers(null), at)).toBe(false)
    expect(
      coverRefetchDelay(
        covers('2026-11-11T10:10:00.000Z', '2026-11-11T10:05:00.000Z'),
        at
      )
    ).toBe(4 * 60_000)
    expect(coverRefetchDelay(covers('2026-11-11T10:00:20.000Z'), at)).toBe(
      30_000
    )
  })
})
