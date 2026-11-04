/**
 * Lot 9, lisibilité de la fiche : champs ajoutés sans rupture (une réponse
 * d'avant le lot 9 se lit toujours), option `includeTargetPrice`, libellés
 * « prix affiché » et « coût tout compris », définitions courtes du glossaire.
 */
import { describe, expect, it } from 'vitest'
import {
  INDICATOR_GLOSSARY,
  SENSITIVITY_AXIS_LABELS,
  SensitivityRequestSchema,
  SensitivityStepSchema,
  TargetPriceSchema,
  glossaryEntry,
} from '../src/index.js'

describe('Lot 9 : schémas compatibles', () => {
  it('un prix cible d’avant le lot 9 se lit, sans coût maximal ni évaluation au prix cible', () => {
    const parsed = TargetPriceSchema.parse({
      criteria: [
        {
          criterion: 'gross_yield',
          maxPrice: 147_568,
          active: true,
          discount: 0.26,
        },
      ],
      targetPrice: 147_568,
      bindingCriterion: 'gross_yield',
      discount: 0.26,
      discountClass: 'out_of_reach',
    })
    expect(parsed.atTarget).toBeNull()
    expect(parsed.criteria[0]?.maxTotalCost).toBeNull()
  })

  it('un pas de sensibilité d’avant le lot 9 se lit, sans coût ni repère du prix cible', () => {
    const step = SensitivityStepSchema.parse({
      step: 1,
      value: 200_000,
      isCurrent: true,
    })
    expect(step).toEqual({
      step: 1,
      value: 200_000,
      isCurrent: true,
      isTarget: false,
      totalCost: null,
    })
  })

  it('la ligne du prix cible est demandée explicitement', () => {
    expect(SensitivityRequestSchema.parse({}).includeTargetPrice).toBe(false)
    expect(
      SensitivityRequestSchema.parse({ includeTargetPrice: true })
        .includeTargetPrice
    ).toBe(true)
    expect(
      SensitivityRequestSchema.safeParse({ includeTargetPrice: 'oui' }).success
    ).toBe(false)
  })
})

describe('Lot 9 : vocabulaire', () => {
  it('l’axe du prix s’appelle « Prix affiché »', () => {
    expect(SENSITIVITY_AXIS_LABELS.price).toBe('Prix affiché')
  })

  it('le glossaire parle de coût tout compris et donne une phrase courte aux indicateurs de la fiche', () => {
    expect(glossaryEntry('total_cost')?.term).toBe('Coût tout compris')
    expect(glossaryEntry('inconnu')).toBeUndefined()
    expect(
      INDICATOR_GLOSSARY.some(e => /co[uû]t total/i.test(e.definition))
    ).toBe(false)
    for (const key of [
      'cost_basis',
      'total_cost',
      'notary_fees',
      'monthly_payment',
      'gross_yield',
      'net_yield',
      'effort',
      'rule_220',
      'verdict',
      'target_price',
      'binding_criterion',
      'discount',
      'suggested_offer',
    ]) {
      const short = glossaryEntry(key)?.short ?? ''
      expect(short.length, key).toBeGreaterThan(20)
      // Une seule phrase : un seul point final.
      expect(short.replace(/\.$/, '').includes('. '), key).toBe(false)
    }
    const keys = INDICATOR_GLOSSARY.map(e => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
