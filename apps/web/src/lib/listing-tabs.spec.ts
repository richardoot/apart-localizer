import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LISTING_TAB,
  LISTING_TABS,
  isListingTab,
  listingTabFromQuery,
  listingTabQuery,
  withoutListingTab,
} from './listing-tabs'

describe('onglets de la fiche dans l’URL (lot 9)', () => {
  it('cinq onglets, la synthèse par défaut', () => {
    expect(LISTING_TABS.map(t => t.id)).toEqual([
      'synthese',
      'negocier',
      'financer',
      'quartier',
      'suivi',
    ])
    expect(DEFAULT_LISTING_TAB).toBe('synthese')
    expect(isListingTab('negocier')).toBe(true)
    expect(isListingTab('fiche')).toBe(false)
    expect(isListingTab(3)).toBe(false)
  })

  it('lit l’onglet dans la requête ; une valeur inconnue ou absente donne la synthèse', () => {
    expect(listingTabFromQuery({ onglet: 'quartier' })).toBe('quartier')
    expect(listingTabFromQuery({ onglet: ['suivi', 'negocier'] })).toBe('suivi')
    expect(listingTabFromQuery({ onglet: 'inconnu' })).toBe('synthese')
    expect(listingTabFromQuery({ status: 'to_visit' })).toBe('synthese')
  })

  it('met l’onglet de côté pour les filtres et ne l’écrit pas pour la synthèse', () => {
    expect(
      withoutListingTab({ status: 'to_visit', onglet: 'negocier', view: 'map' })
    ).toEqual({ status: 'to_visit', view: 'map' })
    expect(listingTabQuery('synthese')).toEqual({})
    expect(listingTabQuery('financer')).toEqual({ onglet: 'financer' })
  })
})
