import { describe, expect, it } from 'vitest'
import { compareRankings, rankValues } from '../src/index.js'

describe('rangs', () => {
  it('classe par ordre croissant ou décroissant, égalités partagées, null sans rang', () => {
    const items = [
      { id: 'a', value: 0.05 },
      { id: 'b', value: 0.02 },
      { id: 'c', value: null },
      { id: 'd', value: 0.02 },
      { id: 'e', value: Number.NaN },
    ]
    const asc = rankValues(items, 'asc')
    expect(asc.get('b')).toBe(1)
    expect(asc.get('d')).toBe(1)
    expect(asc.get('a')).toBe(3)
    expect(asc.get('c')).toBeNull()
    expect(asc.get('e')).toBeNull()
    const desc = rankValues(items, 'desc')
    expect(desc.get('a')).toBe(1)
    expect(desc.get('b')).toBe(2)
  })

  it('compare des annonces indicateur par indicateur et désigne la meilleure', () => {
    const { ranks, best } = compareRankings([
      {
        id: 'one',
        score: 2060,
        grossYield: 0.06,
        netYield: 0.04,
        effort: -100,
        pricePerM2: 4000,
        discount: 0.02,
      },
      {
        id: 'two',
        score: 1050,
        grossYield: 0.05,
        netYield: 0.045,
        effort: -50,
        pricePerM2: 3500,
        discount: null,
      },
    ])
    expect(ranks.get('one')).toEqual({
      score: 1,
      grossYield: 1,
      netYield: 2,
      effort: 2,
      pricePerM2: 2,
      discount: 1,
    })
    expect(ranks.get('two')?.discount).toBeNull()
    expect(best).toEqual({
      score: 'one',
      grossYield: 'one',
      netYield: 'two',
      effort: 'two',
      pricePerM2: 'two',
      discount: 'one',
    })
    expect(compareRankings([]).best.score).toBeNull()
  })
})
