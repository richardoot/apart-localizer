/**
 * Frais de notaire par barème (modèle § 2, besoin E5) : tranches des
 * émoluments, droits de mutation, contribution de sécurité immobilière,
 * débours ; mode taux inchangé (parité avec l'artefact).
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTARY_SCALE } from '@apart/contracts'
import type { Assumptions } from '@apart/contracts'
import {
  compute,
  notaryEmoluments,
  notaryFees,
  notaryFeesDetail,
  notaryFeesFromScale,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE, financials } from './helpers.js'

const SCALE: Assumptions = { ...ARTIFACT_ASSUMPTIONS, notaryMode: 'scale' }

describe('émoluments proportionnels par tranches', () => {
  it('reproduit l’exemple de référence : 200 000 € → 1 995,25 € HT', () => {
    // 6 500 × 3,870 % + 10 500 × 1,596 % + 43 000 × 1,064 % + 140 000 × 0,799 %
    expect(
      notaryEmoluments(200_000, DEFAULT_NOTARY_SCALE.emolumentBands)
    ).toBeCloseTo(1995.25, 2)
  })

  it('n’applique que les tranches atteintes', () => {
    expect(
      notaryEmoluments(5000, DEFAULT_NOTARY_SCALE.emolumentBands)
    ).toBeCloseTo(5000 * 0.0387, 9)
    expect(
      notaryEmoluments(10_000, DEFAULT_NOTARY_SCALE.emolumentBands)
    ).toBeCloseTo(6500 * 0.0387 + 3500 * 0.01596, 9)
    expect(notaryEmoluments(0, DEFAULT_NOTARY_SCALE.emolumentBands)).toBe(0)
  })
})

describe('frais de notaire par barème (Gironde par défaut)', () => {
  it('détaille chaque poste pour 200 000 €', () => {
    const fees = notaryFeesFromScale({
      price: 200_000,
      scale: DEFAULT_NOTARY_SCALE,
    })
    expect(fees.mode).toBe('scale')
    expect(fees.base).toBe(200_000)
    // 5 % × (1 + 2,37 %) + 1,2 % = 6,3185 %
    expect(fees.transferTax).toBeCloseTo(200_000 * 0.063185, 6)
    expect(fees.emoluments).toBeCloseTo(1995.25, 2)
    expect(fees.emolumentsVat).toBeCloseTo(399.05, 2)
    expect(fees.securityContribution).toBe(200)
    expect(fees.disbursements).toBe(800)
    expect(fees.total).toBeCloseTo(12_637 + 1995.25 + 399.05 + 200 + 800, 2)
    // De l'ordre de 8 % du prix, cohérent avec les simulateurs publics.
    expect(fees.total / 200_000).toBeGreaterThan(0.078)
    expect(fees.total / 200_000).toBeLessThan(0.082)
    expect(fees.estimated).toBe(true)
  })

  it('exclut le mobilier compris dans la vente de l’assiette', () => {
    const withFurniture = notaryFeesFromScale({
      price: 200_000,
      furniture: 10_000,
      scale: DEFAULT_NOTARY_SCALE,
    })
    expect(withFurniture.base).toBe(190_000)
    expect(withFurniture.total).toBeLessThan(
      notaryFeesFromScale({ price: 200_000, scale: DEFAULT_NOTARY_SCALE }).total
    )
    // Un mobilier négatif ou supérieur au prix ne donne jamais une assiette négative.
    expect(
      notaryFeesFromScale({
        price: 1000,
        furniture: 5000,
        scale: DEFAULT_NOTARY_SCALE,
      }).total
    ).toBe(0)
    expect(
      notaryFeesFromScale({
        price: 1000,
        furniture: -5,
        scale: DEFAULT_NOTARY_SCALE,
      }).base
    ).toBe(1000)
  })

  it('applique le minimum de la contribution de sécurité immobilière', () => {
    const small = notaryFeesFromScale({
      price: 10_000,
      scale: DEFAULT_NOTARY_SCALE,
    })
    expect(small.securityContribution).toBe(15)
  })

  it('une assiette nulle ne coûte rien', () => {
    const none = notaryFeesFromScale({ price: 0, scale: DEFAULT_NOTARY_SCALE })
    expect(none.total).toBe(0)
    expect(none.disbursements).toBe(0)
  })

  it('le barème est configurable', () => {
    const cheaper = notaryFeesFromScale({
      price: 200_000,
      scale: {
        ...DEFAULT_NOTARY_SCALE,
        departmentalRate: 0.045,
        disbursements: 0,
      },
    })
    expect(cheaper.transferTax).toBeCloseTo(
      200_000 * (0.045 * 1.0237 + 0.012),
      6
    )
    expect(cheaper.disbursements).toBe(0)
  })
})

describe('mode des hypothèses', () => {
  it('mode taux (défaut) : total = taux × net vendeur, postes inconnus, résultat de l’artefact inchangé', () => {
    const detail = notaryFeesDetail(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)
    expect(detail.mode).toBe('rate')
    expect(detail.total).toBe(15_000)
    expect(detail.transferTax).toBeNull()
    expect(detail.emoluments).toBeNull()
    expect(detail.estimated).toBe(true)
    expect(notaryFees(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)).toBe(15_000)
    const m = compute(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)
    expect(m.notaryFeesDetail).toEqual(detail)
    expect(m.totalCost).toBe(220_000)
  })

  it('mode barème : le coût total reprend le détail, honoraires acquéreur hors assiette', () => {
    const m = compute(DOC_EXAMPLE, SCALE)
    expect(m.notaryFeesDetail.mode).toBe('scale')
    expect(m.notaryFees).toBeCloseTo(16_031.3, 1)
    expect(m.totalCost).toBeCloseTo(200_000 + 16_031.3 + 5000, 1)
    expect(m.grossYield).toBeLessThan(
      compute(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS).grossYield
    )
    const withFees = compute(financials({ buyerFees: 10_000 }), SCALE)
    expect(withFees.notaryFeesDetail.base).toBe(190_000)
  })

  it('un mode absent (anciennes valeurs enregistrées) vaut le taux', () => {
    const legacy = { ...ARTIFACT_ASSUMPTIONS } as Partial<Assumptions>
    delete legacy.notaryMode
    delete legacy.notaryScale
    expect(notaryFees(DOC_EXAMPLE, legacy as Assumptions)).toBe(15_000)
  })
})
