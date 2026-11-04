/**
 * Lot 9, lisibilité de la fiche : coût tout compris maximal par critère,
 * évaluation au prix cible, ligne du prix cible dans la sensibilité, coût par
 * ligne de prix, contrôles de rentabilité, mensualité séparée, échelle du
 * prix cible, tolérance d'arrondi du verdict. Exemple chiffré du § 8.
 */
import { describe, expect, it } from 'vitest'
import type { Assumptions } from '@apart/contracts'
import {
  SCENARIO_DELTAS,
  TARGET_STEP_TOLERANCE,
  VERDICT_TOLERANCE,
  compute,
  monthlyPaymentSplit,
  negotiationBrief,
  outcomeAtPrice,
  priceGauge,
  priceStepsWithTarget,
  profitabilityChecks,
  sensitivityGrid,
  targetPrice,
  verdict,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE, financials } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS

describe('prix cible : coût tout compris par critère et évaluation au prix cible', () => {
  it('exemple § 8 : coûts maximaux 163 636 €, 179 013 €, 165 000 €', () => {
    const t = targetPrice(DOC_EXAMPLE, A)
    const by = Object.fromEntries(t.criteria.map(c => [c.criterion, c]))
    expect(by.gross_yield?.maxTotalCost).toBeCloseTo((12 * 750) / 0.055, 6)
    expect(Math.round(by.effort?.maxTotalCost ?? 0)).toBe(179_013)
    expect(by.rent_x220?.maxTotalCost).toBeCloseTo(165_000, 6)
    expect(by.net_yield?.maxTotalCost).toBeNull()
    expect(by.market?.maxTotalCost).toBeNull()
  })

  it('exemple § 8 au prix cible : coût ≈ 163 636 €, brut 5,5 %, effort ≈ −70 €/mois, cible', () => {
    const t = targetPrice(DOC_EXAMPLE, A)
    const at = t.atTarget
    expect(at).not.toBeNull()
    expect(at?.price).toBe(t.targetPrice)
    expect(at?.totalCost).toBeCloseTo(163_636.36, 1)
    expect(at?.grossYield).toBeCloseTo(0.055, 12)
    expect(Math.round(at?.effort ?? 0)).toBe(-70)
    expect(Math.round(at?.monthlyPayment ?? 0)).toBe(639)
    expect(at?.loanAmount).toBeCloseTo(123_636.36, 1)
    // Le brut au seuil à l'arrondi près : dans la cible, pas « de peu ».
    expect(at?.verdict).toBe('target')
    expect(at?.failures).toEqual([])
    expect(at?.nearMisses).toEqual([])
  })

  it('sans loyer : ni prix cible ni évaluation au prix cible', () => {
    const t = targetPrice(financials({ targetRent: 0 }), {
      ...A,
      maxMonthlyEffort: 0,
    })
    expect(t.targetPrice).toBeNull()
    expect(t.atTarget).toBeNull()
  })

  it('DPE G : au prix cible le bien reste hors cible', () => {
    const t = targetPrice(financials({ dpeClass: 'G' }), A)
    expect(t.atTarget?.verdict).toBe('off_target')
    expect(t.atTarget?.failures).toEqual(['dpe'])
  })

  it('outcomeAtPrice au prix affiché reprend compute', () => {
    const m = compute(DOC_EXAMPLE, A)
    const o = outcomeAtPrice(DOC_EXAMPLE, A, DOC_EXAMPLE.price)
    expect(o).toEqual({
      price: 200_000,
      totalCost: m.totalCost,
      loanAmount: m.loanAmount,
      monthlyPayment: m.monthlyPayment,
      grossYield: m.grossYield,
      netYield: m.netYield,
      effort: m.effort,
      verdict: m.verdict,
      failures: m.failures,
      nearMisses: m.nearMisses,
    })
  })
})

describe('verdict : tolérance d’arrondi des seuils', () => {
  it('un brut ou un effort à l’arrondi près du seuil comptent comme atteints', () => {
    const at = (grossYield: number, effort: number) =>
      verdict({ grossYield, effort, dpeClass: 'D' }, A)
    expect(at(0.055 - 1e-12, -150 - 1e-9).verdict).toBe('target')
    expect(at(0.055 - VERDICT_TOLERANCE.yield * 10, -100).nearMisses).toEqual([
      'gross_yield',
    ])
    expect(at(0.06, -150 - VERDICT_TOLERANCE.effort * 10).nearMisses).toEqual([
      'effort',
    ])
  })
})

describe('sensibilité : coût par ligne de prix et ligne du prix cible', () => {
  it('axe du prix affiché : chaque pas porte son coût tout compris ; les autres axes non', () => {
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    expect(grid.rows.map(r => r.totalCost)).toEqual([
      187_750, 198_500, 209_250, 220_000,
    ])
    expect(grid.cols.every(c => c.totalCost === null)).toBe(true)
    expect(grid.rows.some(r => r.isTarget)).toBe(false)
  })

  it('includeTargetPrice : la ligne du prix cible est insérée avant le premier prix plus haut', () => {
    const t = targetPrice(DOC_EXAMPLE, A)
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'price',
      colAxis: 'rent',
      includeTargetPrice: true,
    })
    expect(grid.rows).toHaveLength(5)
    expect(grid.rows.map(r => r.isTarget)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
    expect(grid.rows[0]?.value).toBeCloseTo(t.targetPrice ?? 0, 6)
    expect(grid.rows[0]?.totalCost).toBeCloseTo(t.atTarget?.totalCost ?? 0, 6)
    // La case du prix cible au loyer actuel : brut au seuil, dans la cible.
    expect(grid.cells[0]?.[1]?.grossYield).toBeCloseTo(0.055, 12)
    expect(grid.cells[0]?.[1]?.verdict).toBe('target')
    expect(grid.current).toEqual({ row: 4, col: 1 })
  })

  it('le prix cible en colonne : la colonne est insérée de la même façon', () => {
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'rent',
      colAxis: 'price',
      colSteps: [0.7, 0.8, 1],
      includeTargetPrice: true,
    })
    expect(grid.cols.map(c => c.isTarget)).toEqual([false, true, false, false])
    expect(grid.cols[1]?.totalCost).not.toBeNull()
    expect(grid.cells[0]).toHaveLength(4)
  })

  it('un pas déjà au prix cible est repéré sans ligne de plus ; une marge ajoute la ligne en fin', () => {
    const t = targetPrice(DOC_EXAMPLE, A).targetPrice ?? 0
    const factor = t / DOC_EXAMPLE.price
    const same = priceStepsWithTarget([0.5, factor, 1], DOC_EXAMPLE, A)
    expect(same).toEqual({ steps: [0.5, factor, 1], targetStep: factor })
    const near = priceStepsWithTarget(
      [factor + TARGET_STEP_TOLERANCE / 2 / DOC_EXAMPLE.price, 1],
      DOC_EXAMPLE,
      A
    )
    expect(near.steps).toHaveLength(2)
    // Une annonce déjà dans la cible : le prix cible dépasse le prix affiché.
    const cheap = financials({ price: 100_000 })
    const margin = priceStepsWithTarget([0.9, 1], cheap, A)
    expect(margin.steps).toHaveLength(3)
    expect(margin.steps[2]).toBeGreaterThan(1)
    expect(margin.targetStep).toBe(margin.steps[2])
  })

  it('sans prix cible ou sans prix affiché : les pas sont inchangés', () => {
    expect(
      priceStepsWithTarget([0.9, 1], financials({ targetRent: 0 }), {
        ...A,
        maxMonthlyEffort: 0,
      })
    ).toEqual({ steps: [0.9, 1], targetStep: null })
    expect(priceStepsWithTarget([0.9, 1], financials({ price: 0 }), A)).toEqual(
      { steps: [0.9, 1], targetStep: null }
    )
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'rate',
      colAxis: 'rent',
      includeTargetPrice: true,
    })
    expect(grid.rows.some(r => r.isTarget)).toBe(false)
    expect(grid.rows).toHaveLength(3)
  })
})

describe('profitabilityChecks', () => {
  it('exemple § 8 : brut et effort en échec, net non retenu', () => {
    const checks = profitabilityChecks(compute(DOC_EXAMPLE, A), A)
    expect(checks.map(c => [c.indicator, c.status])).toEqual([
      ['gross_yield', 'fail'],
      ['effort', 'fail'],
      ['net_yield', 'not_retained'],
    ])
    expect(checks[0]?.threshold).toBe(0.055)
    expect(checks[1]?.threshold).toBe(150)
    expect(checks[2]).toMatchObject({ threshold: null, retained: false })
    expect(checks[0]?.value).toBeCloseTo(0.0409, 4)
  })

  it('« de peu » repris du verdict, net retenu atteint ou en échec', () => {
    const near = profitabilityChecks(
      compute(financials({ price: 165_000 }), A),
      A
    )
    expect(near[0]?.status).toBe('near')
    const withNet: Assumptions = {
      ...A,
      netYieldThreshold: 0.03,
      targetCriteria: ['gross_yield', 'effort', 'net_yield'],
    }
    const ok = profitabilityChecks(compute(DOC_EXAMPLE, withNet), withNet)
    expect(ok[2]).toMatchObject({
      retained: true,
      threshold: 0.03,
      status: 'ok',
    })
    const failed = profitabilityChecks(
      compute(DOC_EXAMPLE, { ...withNet, targetCriteria: ['net_yield'] }),
      { ...withNet, netYieldThreshold: 0.05, targetCriteria: ['net_yield'] }
    )
    expect(failed[2]?.status).toBe('fail')
    // Un seuil fixé mais un critère absent du prix cible : non retenu.
    const unused = profitabilityChecks(compute(DOC_EXAMPLE, A), {
      ...A,
      netYieldThreshold: 0.03,
    })
    expect(unused[2]).toMatchObject({ retained: false, status: 'not_retained' })
    // Rendement net non calculable (coût nul) : en échec.
    const nan = profitabilityChecks(
      { ...compute(DOC_EXAMPLE, A), netYield: Number.NaN },
      { ...withNet, targetCriteria: ['net_yield'] }
    )
    expect(nan[2]?.status).toBe('fail')
  })

  it('au prix cible de l’exemple : tout passe', () => {
    const at = targetPrice(DOC_EXAMPLE, A).atTarget
    if (!at) throw new Error('prix cible attendu')
    expect(profitabilityChecks(at, A).map(c => c.status)).toEqual([
      'ok',
      'ok',
      'not_retained',
    ])
  })
})

describe('monthlyPaymentSplit', () => {
  it('exemple § 8 : 931 € = 916 € de crédit + 15 € d’assurance', () => {
    const split = monthlyPaymentSplit(180_000, A)
    expect(split.insurance).toBeCloseTo(15, 9)
    expect(Math.round(split.credit)).toBe(916)
    expect(split.total).toBeCloseTo(compute(DOC_EXAMPLE, A).monthlyPayment, 9)
    expect(split.credit + split.insurance).toBeCloseTo(split.total, 9)
  })

  it('rien emprunté : tout à zéro', () => {
    expect(monthlyPaymentSplit(0, A)).toEqual({
      credit: 0,
      insurance: 0,
      total: 0,
    })
  })
})

describe('priceGauge', () => {
  it('prix cible sous le prix affiché : l’échelle va jusqu’au prix affiché', () => {
    const g = priceGauge(200_000, 147_568)
    expect(g?.max).toBe(200_000)
    expect(g?.listedShare).toBe(1)
    expect(g?.targetShare).toBeCloseTo(0.73784, 5)
  })

  it('déjà dans la cible : l’échelle va jusqu’au prix cible', () => {
    expect(priceGauge(100_000, 125_000)).toEqual({
      max: 125_000,
      listedShare: 0.8,
      targetShare: 1,
    })
  })

  it('sans prix cible ou sans prix : rien à montrer', () => {
    expect(priceGauge(200_000, null)).toBeNull()
    expect(priceGauge(0, 100_000)).toBeNull()
    expect(priceGauge(200_000, 0)).toBeNull()
  })
})

describe('vocabulaire : coût tout compris', () => {
  it('le libellé des scénarios et l’argument des travaux parlent de coût tout compris', () => {
    expect(SCENARIO_DELTAS.find(m => m.key === 'totalCost')?.label).toBe(
      'Coût tout compris'
    )
    const t = targetPrice(financials({ renovationTotal: 10_000 }), A)
    const brief = negotiationBrief(
      {
        price: 200_000,
        publishedAt: null,
        createdAt: null,
        dpeClass: 'D',
        renovationTotal: 10_000,
        annualCharges: null,
        surface: 45,
        priceEvents: [],
        offers: [],
      },
      t,
      A
    )
    expect(
      brief.arguments.find(arg => arg.kind === 'renovation')?.text
    ).toContain('coût tout compris')
  })
})
