/**
 * Lot 23 : la navigation. Quelle entrée chaque page allume (ordinateur et
 * téléphone), les initiales du membre, le retour d'une page secondaire, et
 * la fermeture d'une fiche ouverte depuis une autre page.
 */
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_LINKS,
  MORE_LINKS,
  PHONE_LINKS,
  backTarget,
  closesBack,
  desktopEntryOf,
  initialsOf,
  phoneEntryOf,
} from './navigation'

describe('les entrées allumées', () => {
  it('ordinateur : chaque page secondaire allume sa page parente', () => {
    expect(desktopEntryOf('criteria-brief')).toBe('criteria')
    expect(desktopEntryOf('exploration')).toBe('criteria')
    expect(desktopEntryOf('compare')).toBe('listings')
    expect(desktopEntryOf('listing')).toBe('listings')
    expect(desktopEntryOf('tasks')).toBe('home')
    // L'espace, ses critères d'avis et les notifications : le menu du compte.
    expect(desktopEntryOf('workspace')).toBe('account')
    expect(desktopEntryOf('opinion-criteria')).toBe('account')
    expect(desktopEntryOf('notifications')).toBe('account')
    // Lot 26 : la page « Claude » est dans le menu du compte (et dans « Plus »).
    expect(desktopEntryOf('claude')).toBe('account')
    expect(phoneEntryOf('claude')).toBe('more')
    expect(desktopEntryOf('login')).toBeNull()
    expect(desktopEntryOf(undefined)).toBeNull()
    expect(desktopEntryOf(Symbol('x'))).toBeNull()
  })

  it('téléphone : ce qui n’est pas dans la barre allume « Plus »', () => {
    expect(phoneEntryOf('home')).toBe('home')
    expect(phoneEntryOf('tasks')).toBe('home')
    expect(phoneEntryOf('listing')).toBe('listings')
    expect(phoneEntryOf('listing-new')).toBe('add')
    expect(phoneEntryOf('notifications')).toBe('notifications')
    for (const name of [
      'criteria',
      'criteria-brief',
      'exploration',
      'assumptions',
      'activity',
      'workspace',
      'opinion-criteria',
      'more',
    ]) {
      expect(phoneEntryOf(name)).toBe('more')
    }
    expect(phoneEntryOf('oauth-consent')).toBeNull()
  })

  it('cinq entrées en bas, cinq en haut sur ordinateur, « Plus » range le reste', () => {
    expect(PHONE_LINKS.map(l => l.label)).toEqual([
      'Accueil',
      'Annonces',
      'Ajouter',
      'Notifications',
      'Plus',
    ])
    expect(DESKTOP_LINKS.map(l => l.label)).toEqual([
      'Accueil',
      'Annonces',
      'Critères',
      'Hypothèses',
      'Activité',
    ])
    expect(MORE_LINKS.map(l => l.to)).toEqual([
      '/criteres',
      '/hypotheses',
      '/claude',
      '/activite',
      '/espace',
      '/espace/criteres-des-avis',
    ])
  })
})

describe('les initiales', () => {
  it('une ou deux lettres, sans ponctuation', () => {
    expect(initialsOf('Richard')).toBe('R')
    expect(initialsOf('marie curie')).toBe('MC')
    expect(initialsOf('Camille (démo)')).toBe('C')
    expect(initialsOf('Élise Anne Durand')).toBe('ÉA')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf(null)).toBe('?')
    expect(initialsOf('(démo)')).toBe('?')
  })
})

describe('le retour', () => {
  it('l’historique si la page d’avant est de l’application, sinon la page parente', () => {
    expect(backTarget('/criteres/abc', '/criteres')).toEqual({
      kind: 'history',
    })
    expect(backTarget(null, '/criteres')).toEqual({
      kind: 'push',
      to: '/criteres',
    })
    expect(backTarget('https://ailleurs.invalid', '/')).toEqual({
      kind: 'push',
      to: '/',
    })
  })

  it('fermer une fiche ouverte depuis l’accueil ou les tâches y revient', () => {
    expect(closesBack('home')).toBe(true)
    expect(closesBack('tasks')).toBe(true)
    expect(closesBack('triage')).toBe(true)
    expect(closesBack('listings')).toBe(false)
    expect(closesBack('listing')).toBe(false)
    expect(closesBack('listing-new')).toBe(false)
    expect(closesBack('login')).toBe(false)
    expect(closesBack('')).toBe(false)
    expect(closesBack(undefined)).toBe(false)
  })
})
