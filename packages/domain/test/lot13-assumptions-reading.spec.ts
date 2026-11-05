/**
 * Lot 13, lisibilité de la page Hypothèses : repère de mensualité pour
 * 100 000 € empruntés, taux effectif des frais de notaire sur un prix
 * d'exemple, échelle des décotes de la « Marge de négociation ».
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTARY_SCALE } from '@apart/contracts'
import {
  REFERENCE_LOAN_AMOUNT,
  REFERENCE_NOTARY_PRICE,
  discountScale,
  monthlyPayment,
  notaryEffectiveRate,
  notaryFeesFromScale,
  referenceMonthlyPayment,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS

describe('repère « Pour 100 000 € empruntés »', () => {
  it('mensualité assurance comprise : 3,65 % sur 25 ans, assurance 0,10 % ≈ 517 €/mois', () => {
    const payment = referenceMonthlyPayment({
      interestRate: A.interestRate,
      durationYears: A.durationYears,
      insuranceRate: A.insuranceRate,
    })
    expect(REFERENCE_LOAN_AMOUNT).toBe(100_000)
    expect(payment).toBe(
      monthlyPayment(100_000, A.interestRate, A.durationYears, A.insuranceRate)
    )
    expect(Math.round(payment ?? 0)).toBe(517)
  })

  it('suit la saisie : taux nul, autre capital', () => {
    expect(
      referenceMonthlyPayment({
        interestRate: 0,
        durationYears: 20,
        insuranceRate: 0,
      })
    ).toBeCloseTo(100_000 / 240, 9)
    expect(
      referenceMonthlyPayment(
        { interestRate: 0.032, durationYears: 25, insuranceRate: 0.003 },
        200_000
      )
    ).toBeCloseTo(monthlyPayment(200_000, 0.032, 25, 0.003), 9)
  })

  it('saisie incomplète ou hors bornes : null', () => {
    const ok = { interestRate: 0.03, durationYears: 25, insuranceRate: 0.001 }
    expect(referenceMonthlyPayment({ ...ok, interestRate: null })).toBeNull()
    expect(referenceMonthlyPayment({ ...ok, interestRate: -0.01 })).toBeNull()
    expect(
      referenceMonthlyPayment({ ...ok, interestRate: Number.NaN })
    ).toBeNull()
    expect(referenceMonthlyPayment({ ...ok, insuranceRate: null })).toBeNull()
    expect(referenceMonthlyPayment({ ...ok, insuranceRate: -1 })).toBeNull()
    expect(referenceMonthlyPayment({ ...ok, durationYears: null })).toBeNull()
    expect(referenceMonthlyPayment({ ...ok, durationYears: 0.5 })).toBeNull()
    expect(referenceMonthlyPayment(ok, 0)).toBeNull()
  })
})

describe('taux effectif des frais de notaire', () => {
  it('mode taux : le taux forfaitaire', () => {
    expect(notaryEffectiveRate(A)).toBe(0.075)
  })

  it('mode barème : total du barème Gironde sur 200 000 € ≈ 8,0 %', () => {
    const rate = notaryEffectiveRate({ ...A, notaryMode: 'scale' })
    expect(REFERENCE_NOTARY_PRICE).toBe(200_000)
    const total = notaryFeesFromScale({
      price: 200_000,
      scale: DEFAULT_NOTARY_SCALE,
    }).total
    expect(rate).toBeCloseTo(total / 200_000, 12)
    // Droits 12 637 €, émoluments 1 995,25 € + TVA, CSI 200 €, débours 800 €.
    expect(total).toBeCloseTo(16_031.3, 6)
    expect(rate).toBeCloseTo(0.0801565, 6)
  })

  it('autre prix d’exemple ; prix nul ou illisible : null', () => {
    const scale = { ...A, notaryMode: 'scale' as const }
    expect(notaryEffectiveRate(scale, 100_000)).toBeCloseTo(
      notaryFeesFromScale({ price: 100_000, scale: A.notaryScale }).total /
        100_000,
      12
    )
    expect(notaryEffectiveRate(scale, 0)).toBeNull()
    expect(notaryEffectiveRate(A, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('échelle des décotes', () => {
  it('5 % négociable, 10 % tendu : trois plages égales jusqu’à 15 %', () => {
    const scale = discountScale(0.05, 0.1)
    expect(scale?.max).toBeCloseTo(0.15, 12)
    expect(scale?.segments.map(s => s.kind)).toEqual([
      'negotiable',
      'tight',
      'out_of_reach',
    ])
    expect(scale?.segments.map(s => s.from)).toEqual([0, 0.05, 0.1])
    expect(scale?.segments.map(s => s.to)).toEqual([0.05, 0.1, null])
    for (const segment of scale?.segments ?? []) {
      expect(segment.share).toBeCloseTo(1 / 3, 12)
    }
  })

  it('les plages font toujours 1 ; « hors de portée » reste visible', () => {
    for (const [negotiable, tight] of [
      [0.06, 0.12],
      [0.1, 0.3],
      [0.2, 0.25],
      [0, 0],
      [0, 0.02],
    ] as const) {
      const scale = discountScale(negotiable, tight)
      const shares = scale?.segments.map(s => s.share) ?? []
      expect(shares.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 12)
      expect(shares[2]).toBeGreaterThan(0)
    }
    // Rien de négociable : toute l'échelle est hors de portée.
    expect(discountScale(0, 0)?.segments[2]?.share).toBe(1)
    expect(discountScale(0, 0)?.max).toBe(0.05)
  })

  it('seuil absent, négatif ou tendu sous le négociable : null', () => {
    expect(discountScale(null, 0.1)).toBeNull()
    expect(discountScale(0.05, null)).toBeNull()
    expect(discountScale(-0.01, 0.1)).toBeNull()
    expect(discountScale(0.1, 0.05)).toBeNull()
    expect(discountScale(Number.NaN, 0.1)).toBeNull()
  })
})
