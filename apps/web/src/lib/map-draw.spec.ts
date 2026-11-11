import { describe, expect, it } from 'vitest'
import {
  activeLayerCount,
  criteriaDrawHint,
  layersButtonLabel,
  placingHint,
  roundCoordinate,
} from './map-draw'

describe('lot 26 : textes et règles des cartes', () => {
  it('« Touche » au doigt, « Clique » à la souris', () => {
    expect(criteriaDrawHint('polygon', true)).toBe(
      'Touche pour poser les sommets, puis touche le premier ou le dernier pour fermer le polygone ; fais glisser un sommet pour le modifier.'
    )
    expect(criteriaDrawHint('polygon', false)).toMatch(/^Clique pour poser/)
    expect(criteriaDrawHint('circle', true)).toBe(
      'Touche au centre, puis à la distance voulue.'
    )
    expect(criteriaDrawHint('pick', false)).toBe(
      'Clique la carte pour placer le point, ou cherche une adresse et choisis « Placer le point ici ».'
    )
    expect(criteriaDrawHint(null, false)).toBe('Le périmètre du critère.')
    expect(criteriaDrawHint(null, true)).toContain('Deux doigts')
    expect(placingHint(true)).toBe('Touche la carte à l’endroit voulu.')
    expect(placingHint(false)).toBe('Clique la carte à l’endroit voulu.')
  })

  it('coordonnées, couches allumées, libellé du bouton', () => {
    expect(roundCoordinate(-0.5955123456)).toBe(-0.595512)
    expect(activeLayerCount({ tram: true, bus: false, dvf: true })).toBe(2)
    expect(layersButtonLabel(0)).toBe('Couches et légende')
    expect(layersButtonLabel(2)).toBe('Couches et légende (2)')
  })
})
