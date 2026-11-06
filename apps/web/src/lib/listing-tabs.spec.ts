import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LISTING_TAB,
  LEGACY_LISTING_TABS,
  LISTING_TABS,
  isListingTab,
  legacyTabRedirect,
  listingTabFromQuery,
  listingTabQuery,
  listingTabQuestion,
  withoutListingTab,
} from './listing-tabs'

describe('onglets de la fiche dans l’URL (lot 9, sept questions au lot 19)', () => {
  it('sept onglets dans l’ordre, chacun avec sa question, la synthèse par défaut', () => {
    expect(LISTING_TABS.map(t => t.id)).toEqual([
      'synthese',
      'bien',
      'budget',
      'negocier',
      'quartier',
      'a-faire',
      'historique',
    ])
    expect(LISTING_TABS.map(t => t.label)).toEqual([
      'Synthèse',
      'Le bien',
      'Budget',
      'Négocier',
      'Quartier',
      'À faire',
      'Historique',
    ])
    expect(listingTabQuestion('synthese')).toBe('Faut-il y aller ?')
    expect(listingTabQuestion('bien')).toBe('Qu’est-ce qu’on achète ?')
    expect(listingTabQuestion('budget')).toBe(
      'Peut-on se le permettre, et après ?'
    )
    expect(listingTabQuestion('negocier')).toBe('Combien proposer ?')
    expect(listingTabQuestion('quartier')).toBe('Comment on y vit ?')
    expect(listingTabQuestion('a-faire')).toBe(
      'Qu’est-ce qu’il reste à faire ?'
    )
    expect(listingTabQuestion('historique')).toBe('Que s’est-il passé ?')
    expect(DEFAULT_LISTING_TAB).toBe('synthese')
    expect(isListingTab('a-faire')).toBe(true)
    expect(isListingTab('suivi')).toBe(false)
    expect(isListingTab(3)).toBe(false)
  })

  it('lit l’onglet dans la requête ; une valeur inconnue ou absente donne la synthèse', () => {
    expect(listingTabFromQuery({ onglet: 'quartier' })).toBe('quartier')
    expect(listingTabFromQuery({ onglet: ['historique', 'bien'] })).toBe(
      'historique'
    )
    expect(listingTabFromQuery({ onglet: 'inconnu' })).toBe('synthese')
    expect(listingTabFromQuery({ status: 'to_visit' })).toBe('synthese')
  })

  it('les anciens identifiants mènent au nouvel onglet et l’URL se réécrit', () => {
    expect(LEGACY_LISTING_TABS).toEqual({
      financer: 'budget',
      suivi: 'a-faire',
      echanges: 'a-faire',
    })
    expect(listingTabFromQuery({ onglet: 'financer' })).toBe('budget')
    expect(listingTabFromQuery({ onglet: 'suivi' })).toBe('a-faire')
    expect(listingTabFromQuery({ onglet: 'echanges' })).toBe('a-faire')
    expect(legacyTabRedirect({ status: 'to_visit', onglet: 'suivi' })).toEqual({
      status: 'to_visit',
      onglet: 'a-faire',
    })
    expect(legacyTabRedirect({ onglet: ['financer'] })).toEqual({
      onglet: 'budget',
    })
    expect(legacyTabRedirect({ onglet: 'negocier' })).toBeNull()
    expect(legacyTabRedirect({})).toBeNull()
  })

  it('met l’onglet de côté pour les filtres et ne l’écrit pas pour la synthèse', () => {
    expect(
      withoutListingTab({ status: 'to_visit', onglet: 'negocier', view: 'map' })
    ).toEqual({ status: 'to_visit', view: 'map' })
    expect(listingTabQuery('synthese')).toEqual({})
    expect(listingTabQuery('budget')).toEqual({ onglet: 'budget' })
  })
})
