import type { CompareRanks, DiscountClass } from '@apart/contracts'

export interface RankedValue {
  id: string
  /** La grandeur à classer ; null ou NaN = sans rang. */
  value: number | null
}

/**
 * Rangs à partir de 1 par valeur croissante (`asc`) ou décroissante
 * (`desc`). Les valeurs égales partagent le même rang ; null et NaN n'en
 * reçoivent pas. Pur, stable.
 */
export function rankValues(
  items: readonly RankedValue[],
  direction: 'asc' | 'desc'
): Map<string, number | null> {
  const ranked = items
    .filter(item => item.value !== null && Number.isFinite(item.value))
    .sort((a, b) =>
      direction === 'asc'
        ? (a.value as number) - (b.value as number)
        : (b.value as number) - (a.value as number)
    )
  const ranks = new Map<string, number | null>(
    items.map(item => [item.id, null])
  )
  let position = 0
  let previous: number | null = null
  ranked.forEach((item, index) => {
    if (previous === null || item.value !== previous) position = index + 1
    previous = item.value
    ranks.set(item.id, position)
  })
  return ranks
}

/** Les indicateurs d'une annonce que la comparaison classe. */
export interface ComparableListing {
  id: string
  score: number
  grossYield: number
  netYield: number
  effort: number
  pricePerM2: number
  discount: number | null
}

export interface CompareRanking {
  ranks: Map<string, CompareRanks>
  best: Record<keyof CompareRanks, string | null>
}

/** Sens de chaque indicateur : le meilleur est le plus haut ou le plus bas. */
const COMPARE_DIRECTIONS: Record<keyof CompareRanks, 'asc' | 'desc'> = {
  score: 'desc',
  grossYield: 'desc',
  netYield: 'desc',
  // L'effort est négatif quand il faut sortir de l'argent : le moins lourd est le plus haut.
  effort: 'desc',
  pricePerM2: 'asc',
  discount: 'asc',
}

/**
 * Rang de chaque annonce pour chaque indicateur (1 = meilleure), et la
 * meilleure annonce par indicateur. Base de `compare_listings`.
 */
export function compareRankings(
  items: readonly ComparableListing[]
): CompareRanking {
  const keys = Object.keys(COMPARE_DIRECTIONS) as (keyof CompareRanks)[]
  const byKey = new Map<keyof CompareRanks, Map<string, number | null>>(
    keys.map(key => [
      key,
      rankValues(
        items.map(item => ({ id: item.id, value: item[key] })),
        COMPARE_DIRECTIONS[key]
      ),
    ])
  )
  const ranks = new Map<string, CompareRanks>()
  for (const item of items) {
    ranks.set(
      item.id,
      Object.fromEntries(
        keys.map(key => [key, byKey.get(key)?.get(item.id) ?? null])
      ) as unknown as CompareRanks
    )
  }
  const best = Object.fromEntries(
    keys.map(key => [
      key,
      items.find(item => byKey.get(key)?.get(item.id) === 1)?.id ?? null,
    ])
  ) as Record<keyof CompareRanks, string | null>
  return { ranks, best }
}

/** Ordre des classes de décote, de la plus favorable à la moins favorable. */
export const DISCOUNT_CLASS_ORDER: readonly DiscountClass[] = [
  'in_target',
  'negotiable',
  'tight',
  'out_of_reach',
]
