/**
 * Ce qu'une écriture sur une annonce recalcule : une seule règle pour la
 * fiche, le connecteur, les réponses d'agence, les vérifications, les liens
 * et les fusions.
 */
import { describe, expect, it } from 'vitest'
import {
  DPE_SEARCH_FIELDS,
  ENRICHMENT_FIELDS,
  changedKeys,
  enrichmentNeeds,
} from '../src/index.js'

describe('enrichmentNeeds', () => {
  it('un repère ou une adresse changés relancent tout, DPE compris', () => {
    expect(enrichmentNeeds([], { locationChanged: true })).toEqual({
      enrich: true,
      dpe: true,
    })
  })

  it('pièces, époque et phase 2 relancent l’instantané sans le DPE', () => {
    for (const key of [
      'rooms',
      'constructionYear',
      'constructionPeriod',
      'rentalPlan',
    ]) {
      expect(enrichmentNeeds([key])).toEqual({ enrich: true, dpe: false })
    }
  })

  it('surface, étage et classe déclarée relancent aussi la recherche du DPE', () => {
    for (const key of DPE_SEARCH_FIELDS) {
      expect(enrichmentNeeds([key])).toEqual({ enrich: true, dpe: true })
      expect(ENRICHMENT_FIELDS).toContain(key)
    }
  })

  it('les autres champs ne relancent rien', () => {
    expect(enrichmentNeeds(['title', 'price', 'notes'])).toEqual({
      enrich: false,
      dpe: false,
    })
    expect(enrichmentNeeds(new Set<string>())).toEqual({
      enrich: false,
      dpe: false,
    })
  })
})

describe('changedKeys', () => {
  it('ne garde que les valeurs qui changent', () => {
    expect(
      changedKeys(
        { surface: 50, floor: 2, title: 'A', dpeClass: null },
        { surface: 52, floor: 2, title: 'A', dpeClass: 'D' }
      )
    ).toEqual(['surface', 'dpeClass'])
  })

  it('absent et vide sont pareils', () => {
    expect(changedKeys({}, { floor: null })).toEqual([])
    expect(changedKeys({ floor: null }, { floor: undefined })).toEqual([])
    expect(changedKeys({}, { floor: 0 })).toEqual(['floor'])
  })

  it('compare les objets par valeur, sans tenir compte de l’ordre des clés', () => {
    const before = { rentalPlan: { targetRent: 800, furnished: true } }
    expect(
      changedKeys(before, {
        rentalPlan: { furnished: true, targetRent: 800, extra: undefined },
      })
    ).toEqual([])
    expect(
      changedKeys(before, { rentalPlan: { furnished: true, targetRent: 850 } })
    ).toEqual(['rentalPlan'])
    expect(changedKeys(before, { rentalPlan: null })).toEqual(['rentalPlan'])
    expect(
      changedKeys({ items: [1, 2] }, { items: [1, 2], other: [{ a: 1 }] })
    ).toEqual(['other'])
    expect(changedKeys({ label: 'x' }, { label: { x: 1 } })).toEqual(['label'])
  })
})
