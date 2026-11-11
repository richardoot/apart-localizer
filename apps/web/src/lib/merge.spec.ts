/**
 * Lot 27 : les textes de « Déjà vue » et de la fusion, côté interface.
 * Données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  alreadySeenLabel,
  mergeSideFacts,
  mergeSideHistory,
  similarFacts,
  similarLevelText,
  similarSeller,
  similarStatus,
  similarTone,
} from './merge'
import { conflictText } from './listing-links'

/** Espaces fines et insécables des montants ramenées à des espaces. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')

describe('lot 27 : textes de « Déjà vue »', () => {
  it('une teinte et un libellé par niveau de ressemblance', () => {
    expect(similarTone('certain')).toBe('good')
    expect(similarTone('very_close')).toBe('accent')
    expect(similarTone('close')).toBe('info')
    expect(similarTone('far')).toBe('neutral')
    expect(similarLevelText({ level: 'very_close', score: 0.874 })).toBe(
      'Très proche · 87 %'
    )
    expect(similarLevelText({ level: 'far', score: 0.4 })).toBe(
      'Peu ressemblante · 40 %'
    )
    // La même annonce : pas de pourcentage à lire.
    expect(similarLevelText({ level: 'certain', score: 1 })).toBe(
      'La même annonce'
    )
  })

  it('les faits d’une annonce ressemblante, ce qui manque omis', () => {
    expect(
      n(
        similarFacts({
          price: 209_000,
          surface: 68,
          rooms: 3,
          commune: 'Bordeaux',
          district: 'Caudéran',
        })
      )
    ).toBe('209 000 € · 68 m² · 3 pièces · Bordeaux · Caudéran')
    expect(
      n(
        similarFacts({
          price: 150_000,
          surface: null,
          rooms: 1,
          commune: null,
          district: null,
        })
      )
    ).toBe('150 000 € · 1 pièce')
  })

  it('dit l’étape, et si l’annonce est aux archives', () => {
    expect(similarStatus({ status: 'to_visit' })).toEqual({
      label: 'À visiter',
      archived: false,
    })
    expect(similarStatus({ status: 'discarded' }).archived).toBe(true)
    expect(similarStatus({ status: 'sold_or_withdrawn' }).archived).toBe(true)
  })

  it('le vendeur de l’annonce ressemblante', () => {
    expect(
      similarSeller({ sellerName: 'Agence X', sellerReference: 'EX-1' })
    ).toBe('Agence X · réf. EX-1')
    expect(similarSeller({ sellerName: null, sellerReference: 'EX-1' })).toBe(
      'réf. EX-1'
    )
    expect(
      similarSeller({ sellerName: null, sellerReference: null })
    ).toBeNull()
  })
})

describe('lot 27 : textes de la fusion', () => {
  it('les deux fiches, en faits et en suivi', () => {
    expect(
      n(mergeSideFacts({ price: 214_000, surface: 68, commune: 'Bordeaux' }))
    ).toBe('214 000 € · 68 m² · Bordeaux')
    expect(
      n(mergeSideFacts({ price: 214_000, surface: null, commune: null }))
    ).toBe('214 000 €')
    expect(
      mergeSideHistory({
        links: 2,
        visits: 1,
        offers: 1,
        opinions: 2,
        tasks: 3,
      })
    ).toBe('2 liens · 1 visite · 1 offre · 2 avis · 3 tâches')
    expect(
      mergeSideHistory({
        links: 0,
        visits: 0,
        offers: 0,
        opinions: 0,
        tasks: 0,
      })
    ).toBe('Aucun suivi')
  })

  it('le choix du tri au bilan', () => {
    expect(alreadySeenLabel('T3 Caudéran')).toBe('Déjà vue : « T3 Caudéran »')
  })

  it('un refus de l’API se lit sans nom d’outil du connecteur', () => {
    expect(
      conflictText(
        'Cette agence et cette référence sont déjà celles de l’annonce « T3 » [id 11111111-1111-4111-8111-111111111111] : c’est sans doute le même bien. Fusionne les deux fiches (merge_listings, ou « Fusionner avec une autre fiche ») plutôt que d’ajouter l’agence ici.'
      )
    ).toBe(
      'Cette agence et cette référence sont déjà celles de l’annonce « T3 » : c’est sans doute le même bien. Fusionne les deux fiches (« Fusionner avec une autre fiche ») plutôt que d’ajouter l’agence ici.'
    )
  })
})
