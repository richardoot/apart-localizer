import { describe, expect, it } from 'vitest'
import { INDICATOR_GLOSSARY, glossaryEntry } from '../src/index.js'

describe('Lot 13 : glossaire de la page Hypothèses', () => {
  it('les champs obscurs ont une définition et une phrase courte', () => {
    for (const key of [
      'loan_insurance',
      'vacancy',
      'fixed_costs',
      'rental_phases',
      'marginal_tax_rate',
      'rent_indexation',
      // Déjà au glossaire, désormais montrées par un bouton « ? » de la page.
      'occupancy_cost',
      'tax_regimes',
      'npv',
    ]) {
      const entry = glossaryEntry(key)
      expect(entry?.definition.length, key).toBeGreaterThan(60)
      const short = entry?.short ?? ''
      expect(short.length, key).toBeGreaterThan(20)
      // Une seule phrase : un seul point final.
      expect(short.replace(/\.$/, '').includes('. '), key).toBe(false)
    }
    const keys = INDICATOR_GLOSSARY.map(e => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('la vacance et l’IRL suivent le modèle de calcul', () => {
    expect(glossaryEntry('vacancy')?.definition).toContain('12 − vacance')
    expect(glossaryEntry('rent_indexation')?.definition).toContain('1,57 %')
  })
})
