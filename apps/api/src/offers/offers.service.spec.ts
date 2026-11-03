import { describe, expect, it } from 'vitest'
import { suggestedStatusAfterOffer } from './offers.service'

describe('suggestedStatusAfterOffer', () => {
  it('une offre en attente ou une contre-proposition propose « offre faite » avant toute offre', () => {
    expect(suggestedStatusAfterOffer('to_study', 'pending')).toBe('offer_made')
    expect(suggestedStatusAfterOffer('visited', 'counter_offer')).toBe(
      'offer_made'
    )
    expect(suggestedStatusAfterOffer('offer_made', 'pending')).toBeNull()
    expect(suggestedStatusAfterOffer('offer_accepted', 'pending')).toBeNull()
    // Une nouvelle offre après un refus relance la négociation.
    expect(suggestedStatusAfterOffer('offer_refused', 'pending')).toBe(
      'offer_made'
    )
  })

  it('une acceptation propose « offre acceptée », un refus « offre refusée »', () => {
    expect(suggestedStatusAfterOffer('offer_made', 'accepted')).toBe(
      'offer_accepted'
    )
    expect(suggestedStatusAfterOffer('offer_accepted', 'accepted')).toBeNull()
    expect(suggestedStatusAfterOffer('offer_made', 'refused')).toBe(
      'offer_refused'
    )
    expect(suggestedStatusAfterOffer('offer_refused', 'refused')).toBeNull()
  })

  it('ne propose rien pour une annonce écartée ou retirée', () => {
    expect(suggestedStatusAfterOffer('discarded', 'accepted')).toBeNull()
    expect(suggestedStatusAfterOffer('sold_or_withdrawn', 'pending')).toBeNull()
  })
})
