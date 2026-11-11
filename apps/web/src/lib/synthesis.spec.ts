import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS, NO_CRITERIA_FIT } from '@apart/contracts'
import type { ListingCriteriaFit } from '@apart/contracts'
import { compute, financialsFromListing, targetPrice } from '@apart/domain'
import { fakeListing } from '@/test/fixtures'
import { fitLine, keyFigures } from './synthesis'

const n = (text: string | null | undefined): string =>
  (text ?? '').replace(/[\u202f\u00a0]/g, ' ')

describe('les quatre chiffres de la Synthèse (lot 19)', () => {
  const listing = fakeListing({ renovation: null })
  const financials = financialsFromListing(listing)
  const metrics = compute(financials, DEFAULT_ASSUMPTIONS)
  const target = targetPrice(financials, DEFAULT_ASSUMPTIONS)

  it('prix et écart aux ventes du quartier, coût, mensualité, prix cible', () => {
    const figures = keyFigures({
      metrics,
      targetPrice: target,
      assumptions: DEFAULT_ASSUMPTIONS,
      medianPricePerM2: 4800,
    })
    expect(figures.map(f => [f.key, f.tab, f.accent])).toEqual([
      ['price', 'negocier', false],
      ['total_cost', 'budget', false],
      ['payment', 'budget', false],
      ['target_price', 'negocier', true],
    ])
    expect(n(figures[0]?.value)).toBe('200 000 €')
    // 4 444 €/m² pour 4 800 : 7 % sous.
    expect(figures[0]?.sub).toBe('−7 % sur les ventes du quartier')
    expect(n(figures[1]?.sub)).toBe('dont notaire ≈ 15 000 €, mobilier 5 000 €')
    expect(n(figures[2]?.sub)).toBe('25 ans, apport 40 000 €')
    expect(figures[3]?.sub).toMatch(/^−\d+ % : « Cible » jusqu’à ce prix$/)
  })

  it('sans médiane, au prix du marché, prix cible absent ou déjà atteint', () => {
    const none = keyFigures({
      metrics,
      targetPrice: null,
      assumptions: null,
      medianPricePerM2: null,
    })
    expect(none[0]?.sub).toBe('ventes du quartier inconnues')
    expect(none[2]?.sub).toBeNull()
    expect(none[3]?.value).toBe('—')
    expect(none[3]?.sub).toBe('non calculable : loyer visé à renseigner')
    const at = keyFigures({
      metrics: { ...metrics, renovationTotal: 3000, furnitureValue: 0 },
      targetPrice: { ...target, targetPrice: 250_000, discount: -0.2 },
      assumptions: DEFAULT_ASSUMPTIONS,
      medianPricePerM2: metrics.pricePerM2,
    })
    expect(at[0]?.sub).toBe('au prix des ventes du quartier')
    expect(n(at[1]?.sub)).toBe('dont notaire ≈ 15 000 €, travaux 3 000 €')
    expect(at[3]?.sub).toBe('le prix affiché est déjà dans la cible')
    const estimated = keyFigures({
      metrics: {
        ...metrics,
        notaryFeesDetail: { ...metrics.notaryFeesDetail, estimated: false },
      },
      targetPrice: target,
      assumptions: DEFAULT_ASSUMPTIONS,
      medianPricePerM2: 3000,
    })
    expect(n(estimated[1]?.sub)).toContain('notaire 15 000 €')
    expect(estimated[0]?.sub).toBe('+48 % sur les ventes du quartier')
  })
})

describe('l’adéquation en une ligne', () => {
  const entry = {
    criteriaId: 'aaaaaaaa-0000-4000-8000-0000000000c1',
    name: '[Exemple] Talence T2',
    level: 'in' as const,
    reasons: [],
    checks: [
      {
        key: 'price_max' as const,
        level: 'in' as const,
        label: 'Prix maximal 220 000 €',
        value: '200 000 €',
        detail: 'marge 5 %',
        reason: null,
        location: false,
      },
      {
        key: 'surface_min' as const,
        level: 'in' as const,
        label: 'Surface minimale 40 m²',
        value: '45 m²',
        detail: 'marge 5 %',
        reason: null,
        location: false,
      },
    ],
  }
  const fit: ListingCriteriaFit = {
    ...NO_CRITERIA_FIT,
    activeCriteria: 1,
    level: 'in',
    criteriaId: entry.criteriaId,
    name: entry.name,
    criteria: [entry as never],
  }

  it('sans critère, dans les critères, à la marge, hors critères', () => {
    expect(fitLine(NO_CRITERIA_FIT)).toBe(
      'Aucun critère actif : crées-en un pour la comparer à ce que tu cherches.'
    )
    expect(fitLine(fit)).toBe(
      '« [Exemple] Talence T2 » : prix maximal 220 000 € (200 000 €), surface minimale 40 m² (45 m²).'
    )
    expect(
      fitLine({ ...fit, criteria: [{ ...entry, checks: [] } as never] })
    ).toBe('« [Exemple] Talence T2 » : tous les filtres sont respectés.')
    expect(
      fitLine({
        ...fit,
        level: 'margin',
        reasons: ['prix +3,6 % (maximum 220 000 €, marge 5 %)'],
      })
    ).toBe(
      '« [Exemple] Talence T2 » : Prix +3,6 % (maximum 220 000 €, marge 5 %).'
    )
    expect(fitLine({ ...fit, level: 'out', name: null, reasons: [] })).toBe(
      'Le meilleur critère.'
    )
  })
})
