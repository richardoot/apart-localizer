import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { AssumptionsImpact } from '@apart/contracts'
import { draftFromForm, formFromValues } from './assumptions-form'
import type { AssumptionsDraft } from './assumptions-form'
import {
  changedCountLabel,
  impactLine,
  impactSummary,
  pendingChangesLabel,
  savedMessage,
  sectionSummaries,
  taxationPills,
} from './assumptions-summary'

const nbsp = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')
const nth = <T>(list: readonly T[], i: number): T => {
  const item = list[i]
  if (item === undefined) throw new Error(`élément ${i} absent`)
  return item
}
const base = (): AssumptionsDraft =>
  draftFromForm(formFromValues(DEFAULT_ASSUMPTIONS))
const DEFAULT_READINGS = { notaryRate: 0.0801565, scaleIsDefault: true }

describe('résumés des sections', () => {
  it('une ligne par section, d’après la saisie', () => {
    const summaries = sectionSummaries(base(), DEFAULT_READINGS)
    expect(nbsp(summaries.financement)).toBe('40 000 € · 3,65 % · 25 ans')
    expect(summaries.criteres).toBe('brut ≥ 5,5 % · effort ≤ 150 €/mois')
    expect(summaries.calendrier).toBe(
      'location janv. 2028 · 0,5 mois de vacance'
    )
    expect(summaries.notaire).toBe('taux forfaitaire 7,5 %')
    expect(summaries.fiscalite).toBe(
      'TMI non renseignée · horizon 15 ans · estimations'
    )
  })

  it('suit les choix : dates, net, barème, TMI', () => {
    const draft: AssumptionsDraft = {
      ...base(),
      purchaseDate: '2026-12-15',
      rentalStartDate: '2028-09-01',
      vacancyMonths: 1,
      netYieldThreshold: 0.035,
      notaryMode: 'scale',
      marginalTaxRate: 0.3,
    }
    const summaries = sectionSummaries(draft, DEFAULT_READINGS)
    expect(summaries.calendrier).toBe(
      'achat déc. 2026 · location sept. 2028 · 1 mois de vacance'
    )
    expect(summaries.criteres).toContain('net ≥ 3,5 %')
    expect(nbsp(summaries.notaire)).toBe(
      'barème officiel · ≈ 8,0 % à 200 000 €'
    )
    expect(summaries.fiscalite).toBe('TMI 30 % · horizon 15 ans · estimations')
    expect(
      sectionSummaries(draft, { notaryRate: null, scaleIsDefault: false })
        .notaire
    ).toBe('barème personnalisé')
  })

  it('saisie vide ou illisible : un tiret, jamais de valeur inventée', () => {
    const draft: AssumptionsDraft = {
      ...base(),
      downPayment: null,
      interestRate: null,
      durationYears: null,
      grossYieldThreshold: null,
      maxMonthlyEffort: null,
      rentalYear: null,
      vacancyMonths: null,
      notaryRate: null,
      horizonYears: null,
    }
    const summaries = sectionSummaries(draft, DEFAULT_READINGS)
    expect(summaries.financement).toBe('— · — · — ans')
    expect(summaries.criteres).toBe('brut ≥ — · effort ≤ —')
    expect(summaries.calendrier).toBe('location janv. —')
    expect(summaries.notaire).toBe('taux forfaitaire —')
    expect(
      sectionSummaries({ ...base(), vacancyMonths: 0 }, DEFAULT_READINGS)
        .calendrier
    ).toBe('location janv. 2028 · sans vacance')
  })

  it('pastilles de la fiscalité repliée', () => {
    expect(taxationPills(base())).toEqual([
      'TMI non renseignée',
      'régime selon le bail',
      'horizon 15 ans',
      'bien à valeur constante',
      'loyers +1,57 %/an',
    ])
    expect(
      taxationPills({
        ...base(),
        marginalTaxRate: 0.41,
        taxRegime: 'lmnp_reel',
        appreciationRate: -0.005,
        rentIndexationRate: null,
        horizonYears: null,
      })
    ).toEqual([
      'TMI 41 %',
      'LMNP réel',
      'horizon — ans',
      'bien −0,5 %/an',
      'loyers —/an',
    ])
  })
})

describe('phrases de la barre d’enregistrement et de l’impact', () => {
  it('compte les modifications', () => {
    expect(pendingChangesLabel(0)).toBe('Aucune modification non enregistrée')
    expect(pendingChangesLabel(1)).toBe('1 modification non enregistrée')
    expect(pendingChangesLabel(3)).toBe('3 modifications non enregistrées')
    expect(changedCountLabel(1)).toBe('● 1 modifié')
    expect(changedCountLabel(2)).toBe('● 2 modifiés')
  })

  const impact: AssumptionsImpact = {
    total: 29,
    changedVerdicts: 2,
    changes: [
      {
        listingId: '11111111-1111-4111-8111-111111111111',
        title: 'T2 fictif',
        before: 'to_dig',
        after: 'target',
        targetPriceBefore: 180_000,
        targetPriceAfter: 189_000,
      },
      {
        listingId: '22222222-2222-4222-8222-222222222222',
        title: 'T3 fictif',
        before: 'target',
        after: 'off_target',
        targetPriceBefore: 150_000,
        targetPriceAfter: null,
      },
    ],
    byVerdictBefore: { target: 6, to_dig: 9, off_target: 14 },
    byVerdictAfter: { target: 6, to_dig: 8, off_target: 15 },
  }

  it('résume l’impact et chaque changement de verdict', () => {
    expect(impactSummary(impact)).toEqual({
      headline:
        'Avec ces changements : 2 annonces changent de verdict, 27 inchangées.',
      distribution: 'Cible 6 → 6 · À creuser 9 → 8 · Hors cible 14 → 15',
    })
    expect(
      impactSummary({ ...impact, total: 2, changedVerdicts: 1 }).headline
    ).toBe('Avec ces changements : 1 annonce change de verdict, 1 inchangée.')
    expect(
      impactSummary({ ...impact, changedVerdicts: 0, changes: [], total: 1 })
        .headline
    ).toBe(
      'Avec ces changements : aucun verdict ne change sur 1 annonce active.'
    )
    expect(nbsp(impactLine(nth(impact.changes, 0)))).toBe(
      'T2 fictif : À creuser → Cible · prix cible 189 000 €'
    )
    expect(impactLine(nth(impact.changes, 1))).toBe(
      'T3 fictif : Cible → Hors cible'
    )
  })

  it('le message après l’enregistrement', () => {
    expect(savedMessage(impact)).toBe(
      'Hypothèses enregistrées : 2 annonces sur 29 changent de verdict.'
    )
    expect(savedMessage({ ...impact, changedVerdicts: 1 })).toBe(
      'Hypothèses enregistrées : 1 annonce sur 29 change de verdict.'
    )
    expect(savedMessage({ ...impact, changedVerdicts: 0 })).toBe(
      'Hypothèses enregistrées : aucun verdict ne change sur 29 annonces actives.'
    )
  })
})
