import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS, ListingInputSchema } from '@apart/contracts'
import { assumptionsImpact } from './impact'
import type { ImpactListing } from './impact'

const listing = (
  id: string,
  price: number,
  override: ImpactListing['assumptionsOverride'] = null
): ImpactListing => ({
  ...ListingInputSchema.parse({
    title: `Annonce ${id}`,
    price,
    surface: 45,
    dpeClass: 'D',
    rentalPlan: { targetRent: 750 },
  }),
  id: `00000000-0000-4000-8000-00000000000${id}`,
  title: `Annonce ${id}`,
  assumptionsOverride: override,
})

describe('assumptionsImpact', () => {
  it('compte les annonces dont le verdict change, avec la surcharge par annonce conservée', () => {
    const listings = [
      listing('1', 200_000),
      listing('2', 130_000),
      // Surcharge : apport énorme, l'effort ne pèse plus ; le brut décide seul.
      listing('3', 150_000, { downPayment: 500_000 }),
    ]
    // L'exemple § 8 (brut 4,09 %, effort −362 €) passe dans la cible avec un
    // seuil à 4 % et un effort admis de 400 € ; les deux autres y sont déjà.
    const relaxed = {
      ...DEFAULT_ASSUMPTIONS,
      grossYieldThreshold: 0.04,
      maxMonthlyEffort: 400,
    }
    const impact = assumptionsImpact(listings, DEFAULT_ASSUMPTIONS, relaxed)
    expect(impact.total).toBe(3)
    expect(impact.byVerdictBefore).toEqual({
      target: 2,
      to_dig: 0,
      off_target: 1,
    })
    expect(impact.byVerdictAfter).toEqual({
      target: 3,
      to_dig: 0,
      off_target: 0,
    })
    expect(impact.changedVerdicts).toBe(1)
    expect(impact.changes).toHaveLength(1)
    expect(impact.changes[0]).toMatchObject({
      listingId: listings[0]?.id,
      title: 'Annonce 1',
      before: 'off_target',
      after: 'target',
    })
    expect(impact.changes[0]?.targetPriceAfter).toBeGreaterThan(
      impact.changes[0]?.targetPriceBefore ?? 0
    )
    const sum = (c: Record<string, number>) =>
      Object.values(c).reduce((a, b) => a + b, 0)
    expect(sum(impact.byVerdictBefore)).toBe(3)
    expect(sum(impact.byVerdictAfter)).toBe(3)
  })

  it('aucun changement : rien ne bouge', () => {
    const impact = assumptionsImpact(
      [listing('1', 200_000)],
      DEFAULT_ASSUMPTIONS,
      DEFAULT_ASSUMPTIONS
    )
    expect(impact.changedVerdicts).toBe(0)
    expect(impact.changes).toEqual([])
    expect(impact.byVerdictBefore).toEqual(impact.byVerdictAfter)
    expect(
      assumptionsImpact([], DEFAULT_ASSUMPTIONS, DEFAULT_ASSUMPTIONS).total
    ).toBe(0)
  })
})
