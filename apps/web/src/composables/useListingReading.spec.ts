import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type {
  Assumptions,
  ListingEvaluation,
  TargetPrice,
} from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'
import { readingOf, useListingReading } from './useListingReading'

const item = fakeEvaluated({
  renovation: null,
  annualCharges: null,
})

describe('useListingReading (lot 9)', () => {
  it('lit l’évaluation par `domain` : contrôles, contrôles au prix cible, mensualité, échelle', () => {
    const reading = readingOf(
      item.evaluation,
      item.evaluation.targetPrice,
      DEFAULT_ASSUMPTIONS
    )
    expect(reading?.checks.map(c => c.status)).toEqual([
      'fail',
      'fail',
      'not_retained',
    ])
    expect(reading?.atTargetChecks?.map(c => c.status)).toEqual([
      'ok',
      'ok',
      'not_retained',
    ])
    expect(Math.round(reading?.payment.insurance ?? 0)).toBe(15)
    expect(reading?.gauge?.listedShare).toBe(1)
  })

  it('rien sans évaluation ni hypothèses ; sans prix cible, ni échelle ni contrôles au prix cible', () => {
    expect(readingOf(null, null, DEFAULT_ASSUMPTIONS)).toBeNull()
    expect(readingOf(item.evaluation, null, null)).toBeNull()
    const reading = readingOf(item.evaluation, null, DEFAULT_ASSUMPTIONS)
    expect(reading?.gauge).toBeNull()
    expect(reading?.atTargetChecks).toBeNull()
  })

  it('suit les changements de ses entrées', () => {
    const evaluation = ref<ListingEvaluation | null>(null)
    const target = ref<TargetPrice | null>(null)
    const assumptions = ref<Assumptions | null>(DEFAULT_ASSUMPTIONS)
    const reading = useListingReading(evaluation, target, assumptions)
    expect(reading.value).toBeNull()
    evaluation.value = item.evaluation
    target.value = item.evaluation.targetPrice
    expect(reading.value?.gauge).not.toBeNull()
  })
})
