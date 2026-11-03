/** Ce que le calcul des travaux a besoin de connaître. */
export interface RenovationLike {
  active: boolean
  items: ReadonlyArray<{ amount: number | null }>
}

/**
 * Total des travaux avant emménagement : somme des postes si la section est
 * active, sinon 0. Un poste non chiffré compte pour 0 ; une section active
 * sans poste compte 0 aussi, comme dans l'artefact.
 */
export function renovationTotal(
  renovation: RenovationLike | null | undefined
): number {
  if (!renovation || !renovation.active) return 0
  return renovation.items.reduce((sum, item) => sum + (item.amount ?? 0), 0)
}
