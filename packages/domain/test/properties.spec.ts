/**
 * Propriétés du modèle (§ 5) vérifiées par génération aléatoire : monotonie
 * du prix, `rdtBrut(P_b) = s_b` au centime, `effort(P_e) = −E`, invariants
 * du capital restant dû.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTARY_SCALE } from '@apart/contracts'
import type { Assumptions, ListingFinancials } from '@apart/contracts'
import {
  compute,
  maxPriceForEffort,
  maxPriceForGrossYield,
  maxPriceForNetYield,
  maxPriceForRule220,
  remainingPrincipal,
  targetPrice,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE, financials } from './helpers.js'

/**
 * Grandeurs générées en entiers (centimes, dix-millièmes) : les flottants
 * dénormalisés que fast-check produit sinon n'ont aucun sens métier et ne
 * testent que l'arithmétique IEEE 754.
 */
const money = (max: number) =>
  fc.integer({ min: 0, max: max * 100 }).map(c => c / 100)
const rate = (min: number, max: number) =>
  fc
    .integer({ min: Math.round(min * 10_000), max: Math.round(max * 10_000) })
    .map(x => x / 10_000)

const arbFinancials: fc.Arbitrary<ListingFinancials> = fc
  .record({
    price: fc.integer({ min: 20_000, max: 1_500_000 }),
    feesRatio: rate(0, 0.08),
    surface: fc.integer({ min: 90, max: 2500 }).map(x => x / 10),
    targetRent: fc.integer({ min: 200, max: 5000 }),
    rentControlled: fc.boolean(),
    referenceRentPerM2: fc.option(
      fc.integer({ min: 50, max: 400 }).map(x => x / 10),
      {
        nil: null,
      }
    ),
    furnitureValue: money(20_000),
    renovationTotal: money(100_000),
    propertyTax: fc.option(money(5000), { nil: null }),
    annualCharges: fc.option(money(10_000), { nil: null }),
    nonRecoverableChargesMonthly: fc.option(money(300), { nil: null }),
    dpeClass: fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', null),
  })
  .map(({ feesRatio, ...f }) => ({
    ...f,
    buyerFees: Math.round(f.price * feesRatio),
  }))

/** Un barème varié : droit départemental 4,5 % ou 5 %, forfaits de 0 à 2 000 €. */
const arbNotaryScale = fc.record({
  departmentalRate: fc.constantFrom(0.045, 0.05),
  communalRate: fc.constant(DEFAULT_NOTARY_SCALE.communalRate),
  collectionFeeRate: fc.constant(DEFAULT_NOTARY_SCALE.collectionFeeRate),
  emolumentBands: fc.constant(DEFAULT_NOTARY_SCALE.emolumentBands),
  emolumentVatRate: fc.constant(0.2),
  securityContributionRate: fc.constant(0.001),
  securityContributionMinimum: fc.constantFrom(0, 15),
  disbursements: fc.integer({ min: 0, max: 2000 }),
  label: fc.constant(''),
})

const arbAssumptionsWith = (
  notaryMode: fc.Arbitrary<Assumptions['notaryMode']>
): fc.Arbitrary<Assumptions> =>
  fc.record({
    downPayment: money(300_000),
    interestRate: rate(0, 0.08),
    durationYears: fc.integer({ min: 5, max: 30 }),
    insuranceRate: rate(0, 0.006),
    notaryRate: rate(0.02, 0.09),
    notaryMode,
    notaryScale: arbNotaryScale,
    vacancyMonths: fc.integer({ min: 0, max: 20 }).map(x => x / 10),
    fixedCostsAnnual: money(3000),
    grossYieldThreshold: rate(0.03, 0.09),
    netYieldThreshold: fc.option(rate(0.01, 0.06), { nil: null }),
    maxMonthlyEffort: money(600),
    grossYieldMargin: fc.constant(0.007),
    effortMargin: fc.constant(80),
    negotiableDiscount: fc.constant(0.05),
    tightDiscount: fc.constant(0.1),
    targetCriteria: fc.constant([
      'gross_yield',
      'effort',
    ] as Assumptions['targetCriteria']),
    rentalYear: fc.constant(2028),
    currentRent: fc.constant(null),
    maintenanceAnnual: fc.constant(null),
  })

/** Mode taux : la forme fermée de l'artefact. */
const arbAssumptions = arbAssumptionsWith(fc.constant('rate'))
/** Mode barème : résolution numérique. */
const arbScaleAssumptions = arbAssumptionsWith(fc.constant('scale'))
/** L'un ou l'autre, pour les propriétés indépendantes du mode. */
const arbAnyAssumptions = arbAssumptionsWith(fc.constantFrom('rate', 'scale'))

/** Égalité relative, pour des grandeurs de magnitudes très différentes. */
const close = (a: number, b: number, rel = 1e-9): boolean =>
  Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b))

/** Au centime, avec la tolérance flottante d'une chaîne d'opérations sur des centaines de milliers d'euros. */
const withinCent = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 0.01 + 1e-9 * Math.max(Math.abs(a), Math.abs(b))

describe('propriétés de compute', () => {
  it('un prix plus haut donne un rendement plus bas et un effort plus lourd', () => {
    fc.assert(
      fc.property(
        arbFinancials,
        arbAnyAssumptions,
        fc.integer({ min: 1000, max: 200_000 }),
        (f, a, more) => {
          const low = compute(f, a)
          const high = compute({ ...f, price: f.price + more }, a)
          expect(high.grossYield).toBeLessThanOrEqual(low.grossYield + 1e-12)
          // Un résultat net négatif divisé par un coût plus grand se rapproche
          // de zéro : la monotonie du net ne vaut que pour un net positif.
          if (low.netOperating >= 0) {
            expect(high.netYield).toBeLessThanOrEqual(low.netYield + 1e-12)
          }
          expect(high.effort).toBeLessThanOrEqual(low.effort + 1e-9)
          expect(high.totalCost).toBeGreaterThan(low.totalCost)
        }
      )
    )
  })

  it('le résultat net ne dépend pas du prix', () => {
    fc.assert(
      fc.property(arbFinancials, arbAnyAssumptions, (f, a) => {
        const one = compute(f, a)
        const two = compute({ ...f, price: f.price * 2 }, a)
        expect(close(one.netOperating, two.netOperating)).toBe(true)
      })
    )
  })

  it('le loyer retenu ne dépasse jamais le plafond', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const m = compute(f, a)
        if (m.rentCap !== null) expect(m.rent).toBeLessThanOrEqual(m.rentCap)
        expect(m.rent).toBeLessThanOrEqual(f.targetRent)
      })
    )
  })

  it('le score ordonne cible > à creuser > hors cible (tant que le brut reste sous 100 %)', () => {
    fc.assert(
      fc.property(arbFinancials, arbFinancials, arbAssumptions, (f1, f2, a) => {
        const m1 = compute(f1, a)
        const m2 = compute(f2, a)
        // Le palier vaut 1000 points, le brut compte brut × 1000 : au-delà
        // d'un rendement de 100 % (bien quasi gratuit), le brut peut dépasser
        // le palier. Ce cas n'existe pas sur le marché ; on l'écarte.
        fc.pre(m1.grossYield < 1 && m2.grossYield < 1)
        const rank = { target: 2, to_dig: 1, off_target: 0 }
        if (rank[m1.verdict] > rank[m2.verdict]) {
          expect(m1.score).toBeGreaterThan(m2.score)
        }
      })
    )
  })
})

describe('propriétés du prix cible', () => {
  it('rdtBrut(P_b) = s_b au centime', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const pb = maxPriceForGrossYield(f, a)
        if (pb === null || pb <= 0) return
        const m = compute({ ...f, price: pb }, a)
        expect(close(m.grossYield, a.grossYieldThreshold, 1e-8)).toBe(true)
        // Au centime : le coût total reconstruit est 12 L / s_b.
        expect(
          withinCent(m.totalCost, (12 * m.rent) / a.grossYieldThreshold)
        ).toBe(true)
      })
    )
  })

  it('effort(P_e) = −E au centime', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const pe = maxPriceForEffort(f, a)
        if (pe === null || pe <= 0) return
        const m = compute({ ...f, price: pe }, a)
        if (m.loanAmount <= 0) {
          // Rien emprunté : l'effort vaut net / 12, indépendant du prix.
          expect(m.effort).toBeGreaterThanOrEqual(-a.maxMonthlyEffort - 1e-6)
          return
        }
        expect(withinCent(m.effort, -a.maxMonthlyEffort)).toBe(true)
      })
    )
  })

  it('rdtNet(P_n) = s_n', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const pn = maxPriceForNetYield(f, a)
        if (pn === null || pn <= 0 || a.netYieldThreshold === null) return
        const m = compute({ ...f, price: pn }, a)
        expect(close(m.netYield, a.netYieldThreshold, 1e-8)).toBe(true)
      })
    )
  })

  it('coût(P_220) = 220 × L', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const p = maxPriceForRule220(f, a)
        if (p === null) return
        const m = compute({ ...f, price: p }, a)
        expect(withinCent(m.totalCost, 220 * m.rent)).toBe(true)
      })
    )
  })

  it('le prix cible est le minimum des critères actifs et son critère liant le réalise', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const t = targetPrice(f, a)
        const active = t.criteria.filter(c => c.active && c.maxPrice !== null)
        if (active.length === 0) {
          expect(t.targetPrice).toBeNull()
          expect(t.bindingCriterion).toBeNull()
          return
        }
        const min = Math.min(...active.map(c => c.maxPrice as number))
        expect(t.targetPrice).toBe(min)
        expect(
          active.find(c => c.criterion === t.bindingCriterion)?.maxPrice
        ).toBe(min)
      })
    )
  })

  it('au prix cible, chaque critère actif qui admet un prix est satisfait', () => {
    fc.assert(
      fc.property(arbFinancials, arbAssumptions, (f, a) => {
        const t = targetPrice(f, a)
        if (t.targetPrice === null) return
        const m = compute({ ...f, price: t.targetPrice }, a)
        const by = Object.fromEntries(
          t.criteria.map(c => [c.criterion, c.maxPrice])
        )
        if (by.gross_yield !== null)
          expect(m.failures).not.toContain('gross_yield')
        if (by.effort !== null) expect(m.failures).not.toContain('effort')
      })
    )
  })
})

describe('propriétés du prix cible en mode barème (recherche numérique)', () => {
  /** À un euro près, comme le demande la feuille de route ; au-dessus des honoraires acquéreur, où le coût est continu. */
  const withinEuro = (a: number, b: number): boolean => Math.abs(a - b) <= 1

  it('rdtBrut(P_b) = s_b : coût(P_b) = 12 L / s_b à 1 € près', () => {
    fc.assert(
      fc.property(arbFinancials, arbScaleAssumptions, (f, a) => {
        const pb = maxPriceForGrossYield(f, a)
        if (pb === null) return
        const m = compute({ ...f, price: pb }, a)
        const wanted = (12 * m.rent) / a.grossYieldThreshold
        // Jamais au-dessus du coût visé : le critère est toujours satisfait.
        expect(m.totalCost).toBeLessThanOrEqual(wanted + 1)
        expect(m.grossYield).toBeGreaterThanOrEqual(
          a.grossYieldThreshold - 1e-9
        )
        if (pb > f.buyerFees + 1) {
          expect(withinEuro(m.totalCost, wanted)).toBe(true)
          expect(close(m.grossYield, a.grossYieldThreshold, 1e-5)).toBe(true)
        }
      })
    )
  })

  it('effort(P_e) = −E à 1 € près', () => {
    fc.assert(
      fc.property(arbFinancials, arbScaleAssumptions, (f, a) => {
        const pe = maxPriceForEffort(f, a)
        if (pe === null) return
        const m = compute({ ...f, price: pe }, a)
        expect(m.effort).toBeGreaterThanOrEqual(-a.maxMonthlyEffort - 0.01)
        if (m.loanAmount > 0 && pe > f.buyerFees + 1) {
          expect(Math.abs(m.effort + a.maxMonthlyEffort)).toBeLessThanOrEqual(
            0.01
          )
        }
      })
    )
  })

  it('rdtNet(P_n) = s_n et coût(P_220) = 220 L à 1 € près', () => {
    fc.assert(
      fc.property(arbFinancials, arbScaleAssumptions, (f, a) => {
        const pn = maxPriceForNetYield(f, a)
        if (
          pn !== null &&
          a.netYieldThreshold !== null &&
          pn > f.buyerFees + 1
        ) {
          const m = compute({ ...f, price: pn }, a)
          expect(
            withinEuro(m.totalCost, m.netOperating / a.netYieldThreshold)
          ).toBe(true)
        }
        const p220 = maxPriceForRule220(f, a)
        if (p220 !== null && p220 > f.buyerFees + 1) {
          const m = compute({ ...f, price: p220 }, a)
          expect(withinEuro(m.totalCost, 220 * m.rent)).toBe(true)
        }
      })
    )
  })

  it('le prix cible reste le minimum des critères actifs et les satisfait tous', () => {
    fc.assert(
      fc.property(arbFinancials, arbScaleAssumptions, (f, a) => {
        const t = targetPrice(f, a)
        const active = t.criteria.filter(c => c.active && c.maxPrice !== null)
        if (active.length === 0) {
          expect(t.targetPrice).toBeNull()
          return
        }
        expect(t.targetPrice).toBe(
          Math.min(...active.map(c => c.maxPrice as number))
        )
        const m = compute({ ...f, price: t.targetPrice as number }, a)
        const by = Object.fromEntries(
          t.criteria.map(c => [c.criterion, c.maxPrice])
        )
        if (by.gross_yield !== null)
          expect(m.failures).not.toContain('gross_yield')
        if (by.effort !== null) expect(m.failures).not.toContain('effort')
        for (const c of t.criteria) {
          if (c.maxPrice === null) expect(c.discount).toBeNull()
          else
            expect(c.discount).toBeCloseTo((f.price - c.maxPrice) / f.price, 9)
        }
      })
    )
  })

  it('exemple § 8 : des frais de notaire plus élevés donnent un prix cible plus bas', () => {
    const rate = targetPrice(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)
    const scale = targetPrice(DOC_EXAMPLE, {
      ...ARTIFACT_ASSUMPTIONS,
      notaryMode: 'scale',
    })
    expect(scale.targetPrice as number).toBeLessThan(rate.targetPrice as number)
    expect(scale.bindingCriterion).toBe('gross_yield')
    const m = compute(
      { ...DOC_EXAMPLE, price: scale.targetPrice as number },
      { ...ARTIFACT_ASSUMPTIONS, notaryMode: 'scale' }
    )
    expect(m.grossYield).toBeCloseTo(0.055, 6)
    // Un coût visé inférieur aux travaux et au mobilier : aucun prix positif.
    expect(
      maxPriceForRule220(
        { ...DOC_EXAMPLE, targetRent: 10, furnitureValue: 50_000 },
        { ...ARTIFACT_ASSUMPTIONS, notaryMode: 'scale' }
      )
    ).toBeNull()
  })
})

describe('capital restant dû', () => {
  it('vaut le capital au départ, zéro à la fin, et décroît', () => {
    fc.assert(
      fc.property(
        money(500_000),
        rate(0, 0.08),
        fc.integer({ min: 1, max: 30 }),
        (loan, r, years) => {
          const n = years * 12
          expect(close(remainingPrincipal(loan, r, years, 0), loan)).toBe(true)
          expect(Math.abs(remainingPrincipal(loan, r, years, n))).toBeLessThan(
            1e-6
          )
          let previous = loan
          for (let m = 1; m <= n; m += Math.max(1, Math.floor(n / 10))) {
            const current = remainingPrincipal(loan, r, years, m)
            expect(current).toBeLessThanOrEqual(previous + 1e-9)
            previous = current
          }
        }
      )
    )
  })
})

describe('exemple de référence', () => {
  it("la monotonie tient autour de l'exemple § 8", () => {
    const base = compute(financials(), ARTIFACT_ASSUMPTIONS)
    const cheaper = compute(
      financials({ price: 150_000 }),
      ARTIFACT_ASSUMPTIONS
    )
    expect(cheaper.grossYield).toBeGreaterThan(base.grossYield)
    expect(cheaper.effort).toBeGreaterThan(base.effort)
  })
})
