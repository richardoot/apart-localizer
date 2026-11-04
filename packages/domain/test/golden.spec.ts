/**
 * Jeux « golden » : les valeurs attendues ont été produites par les fonctions
 * originales de l'artefact (compute, phase2, travauxTotal, isEncadre).
 *
 * - artifact-synthetic-golden.json : cas inventés, commité, toujours exécuté ;
 * - data/private/golden/artifact-golden.json : les 29 annonces réelles,
 *   jamais commité ; exécuté quand le fichier est présent (poste de Richard).
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compute, rentalChecks } from '../src/index.js'
import { expectClose, loadGolden, repoRoot } from './helpers.js'
import type { GoldenCase, GoldenFile } from './helpers.js'
import type { Assumptions } from '@apart/contracts'

const NUMERIC_FIELDS = [
  'price',
  'surface',
  'targetRent',
  'rent',
  'notaryFees',
  'renovationTotal',
  'totalCost',
  'loanAmount',
  'monthlyPayment',
  'propertyTax',
  'nonRecoverableChargesMonthly',
  'netOperating',
  'grossYield',
  'netYield',
  'effort',
  'pricePerM2',
  'rentPerM2',
  'maxCostRule220',
  'score',
] as const

function checkCase(c: GoldenCase, assumptions: Assumptions): void {
  const metrics = compute(c.financials, assumptions)
  const expected = c.expected.metrics
  for (const field of NUMERIC_FIELDS) {
    expectClose(metrics[field], expected[field], `${c.id}.${field}`)
  }
  expect(metrics.rentControlled, `${c.id}.rentControlled`).toBe(
    expected.rentControlled
  )
  if (expected.rentCap === null) {
    expect(metrics.rentCap, `${c.id}.rentCap`).toBeNull()
  } else {
    expectClose(
      metrics.rentCap ?? Number.NaN,
      expected.rentCap,
      `${c.id}.rentCap`
    )
  }
  expect(metrics.propertyTaxEstimated, `${c.id}.propertyTaxEstimated`).toBe(
    expected.propertyTaxEstimated
  )
  expect(
    metrics.nonRecoverableChargesEstimated,
    `${c.id}.nonRecoverableChargesEstimated`
  ).toBe(expected.nonRecoverableChargesEstimated)
  expect(metrics.annualCharges, `${c.id}.annualCharges`).toBe(
    expected.annualCharges
  )
  expect(metrics.verdict, `${c.id}.verdict`).toBe(expected.verdict)

  const rental = rentalChecks(c.rental, metrics, assumptions)
  const want = c.expected.rental
  expect(rental.year, `${c.id}.rental.year`).toBe(want.year)
  expect(rental.verdict, `${c.id}.rental.verdict`).toBe(want.verdict)
  expect(rental.rank, `${c.id}.rental.rank`).toBe(want.rank)
  expect(rental.unknownCount, `${c.id}.rental.unknownCount`).toBe(
    want.unknownCount
  )
  // L'artefact n'émettait aucun contrôle pour « permis de louer : non » ; le
  // domaine en émet un « ok » informatif. On compare donc les contrôles
  // attendus un à un, dans l'ordre, en ignorant ce seul ajout.
  const actual = rental.checks.filter(
    x => !(x.key === 'rental_permit' && x.level === 'ok')
  )
  expect(
    actual.map(x => ({ level: x.level, message: x.message })),
    `${c.id}.rental.checks`
  ).toEqual(want.checks)
}

function describeGolden(name: string, golden: GoldenFile | null): void {
  // Sans le fichier (jeu privé absent : CI, clone frais, worktree), la suite
  // est sautée ; son corps ne doit pas lire `golden` pendant la collecte.
  if (golden === null) {
    describe.skip(name, () => {
      it('fichier absent : rien à reproduire', () => undefined)
    })
    return
  }
  describe(name, () => {
    const file = golden
    it('a des cas', () => {
      expect(file.cases.length).toBeGreaterThan(0)
    })
    for (const c of file.cases) {
      it(`reproduit ${c.id}`, () => checkCase(c, file.assumptions))
    }
    if (file.zeroRate) {
      for (const c of file.zeroRate.cases) {
        it(`reproduit ${c.id} à taux nul`, () =>
          checkCase(
            c,
            (file.zeroRate as NonNullable<GoldenFile['zeroRate']>).assumptions
          ))
      }
    }
  })
}

describeGolden(
  'golden synthétique (artefact original sur des cas inventés)',
  loadGolden(
    path.join(
      repoRoot,
      'packages/domain/test/fixtures/artifact-synthetic-golden.json'
    )
  )
)

describeGolden(
  'golden privé (les 29 annonces réelles exportées)',
  loadGolden(path.join(repoRoot, 'data/private/golden/artifact-golden.json'))
)
