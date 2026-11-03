/** Tableau de sensibilité à deux entrées (lot N3) : axes, pas, cellule courante. */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AXIS_STEPS,
  applyAxisStep,
  compute,
  sensitivityGrid,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS

describe('sensitivityGrid', () => {
  it('prix × loyer par défaut : 4 lignes, 3 colonnes, cellule courante égale à compute', () => {
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    expect(grid.rows.map(r => r.step)).toEqual([...DEFAULT_AXIS_STEPS.price])
    expect(grid.cols.map(c => c.step)).toEqual([...DEFAULT_AXIS_STEPS.rent])
    expect(grid.rows.map(r => r.value)).toEqual([
      170_000, 180_000, 190_000, 200_000,
    ])
    expect(grid.cols.map(c => Math.round(c.value * 1e6) / 1e6)).toEqual([
      675, 750, 825,
    ])
    expect(grid.cells).toHaveLength(4)
    expect(grid.cells[0]).toHaveLength(3)
    expect(grid.current).toEqual({ row: 3, col: 1 })
    const current = grid.cells[3]?.[1]
    const m = compute(DOC_EXAMPLE, A)
    expect(current?.isCurrent).toBe(true)
    expect(current?.grossYield).toBe(m.grossYield)
    expect(current?.effort).toBe(m.effort)
    expect(current?.verdict).toBe(m.verdict)
    expect(grid.cells.flat().filter(c => c.isCurrent)).toHaveLength(1)
    // Moins cher et mieux loué : meilleur brut.
    expect(grid.cells[0]?.[2]?.grossYield).toBeGreaterThan(m.grossYield)
    expect(grid.cells[0]?.[2]?.price).toBe(170_000)
    expect(grid.cells[0]?.[2]?.targetRent).toBeCloseTo(825, 9)
  })

  it('taux × loyer : le taux ne descend jamais sous zéro', () => {
    const grid = sensitivityGrid(
      DOC_EXAMPLE,
      { ...A, interestRate: 0.002 },
      { rowAxis: 'rate', colAxis: 'rent' }
    )
    expect(grid.rows[0]?.value).toBe(0)
    expect(grid.cells[0]?.[1]?.interestRate).toBe(0)
    expect(grid.cells[2]?.[1]?.interestRate).toBeCloseTo(0.007, 12)
    expect(grid.cells[2]?.[1]?.monthlyPayment).toBeGreaterThan(
      grid.cells[0]?.[1]?.monthlyPayment ?? Number.POSITIVE_INFINITY
    )
  })

  it('apport × durée : bornes et entiers, pas personnalisés', () => {
    const grid = sensitivityGrid(
      DOC_EXAMPLE,
      { ...A, downPayment: 10_000, durationYears: 38 },
      {
        rowAxis: 'downPayment',
        colAxis: 'duration',
        rowSteps: [-20_000, 0, 50_000],
        colSteps: [-30, -2.4, 0, 5],
      }
    )
    expect(grid.rows.map(r => r.value)).toEqual([0, 10_000, 60_000])
    expect(grid.cols.map(c => c.value)).toEqual([8, 36, 38, 40])
    expect(grid.current).toEqual({ row: 1, col: 2 })
    const cell = grid.cells[2]?.[3]
    expect(cell?.downPayment).toBe(60_000)
    expect(cell?.durationYears).toBe(40)
    // Plus d'apport et plus long : mensualité plus faible, effort moins lourd.
    expect(cell?.effort).toBeGreaterThan(grid.cells[0]?.[0]?.effort ?? 0)
  })

  it('sans pas neutre, pas de cellule courante ; pas vides = défauts', () => {
    const grid = sensitivityGrid(DOC_EXAMPLE, A, {
      rowAxis: 'price',
      colAxis: 'rate',
      rowSteps: [0.8, 0.9],
      colSteps: [],
    })
    expect(grid.current).toBeNull()
    expect(grid.cols).toHaveLength(3)
    expect(grid.cells.flat().every(c => !c.isCurrent)).toBe(true)
  })

  it('refuse deux axes identiques et un axe inconnu', () => {
    expect(() =>
      sensitivityGrid(DOC_EXAMPLE, A, { rowAxis: 'price', colAxis: 'price' })
    ).toThrow(RangeError)
    expect(() => applyAxisStep('tax' as never, 1, DOC_EXAMPLE, A)).toThrow(
      RangeError
    )
  })
})
