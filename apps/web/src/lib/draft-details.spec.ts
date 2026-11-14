/**
 * Lot 32 (ADR 0047) : la fiche pré-remplie d'un brouillon lue par thème ;
 * les faits recherchés manquants sont « non indiqué ». Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ListingInputSchema } from '@apart/contracts'
import { draftFactGroups, floorText, missingDraftFacts } from './draft-details'

const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? null

describe('draftFactGroups', () => {
  it('une fiche presque vide : les faits recherchés, dits manquants', () => {
    const listing = ListingInputSchema.parse({ title: 'T2 fictif', price: 0 })
    const groups = draftFactGroups(listing)
    expect(groups.map(g => g.key)).toEqual(['property', 'energy', 'copro'])
    expect(groups.flatMap(g => g.facts.map(f => f.key))).toEqual([
      'surface',
      'rooms',
      'floor',
      'dpeClass',
      'annualCharges',
      'propertyTax',
    ])
    expect(missingDraftFacts(listing)).toEqual([
      'surface carrez',
      'pièces',
      'étage',
      'dpe',
      'charges de copropriété',
      'taxe foncière',
    ])
  })

  it('les valeurs lues, avec leurs unités', () => {
    const listing = ListingInputSchema.parse({
      title: 'T3 fictif',
      price: 210_000,
      surface: 64.5,
      rooms: 3,
      floor: 0,
      cellar: true,
      constructionYear: 1975,
      dpeClass: 'D',
      dpeConsumption: 210,
      heatingCollective: false,
      annualCharges: 1800,
      propertyTax: 950,
      nonRecoverableChargesMonthly: 40,
      feesPercent: 0.05,
      feesPayer: 'buyer',
    })
    const facts = Object.fromEntries(
      draftFactGroups(listing)
        .flatMap(g => g.facts)
        .map(f => [f.key, n(f.value)])
    )
    expect(facts).toMatchObject({
      surface: '64,5 m²',
      floor: 'rez-de-chaussée',
      cellar: 'oui',
      constructionYear: '1975',
      dpeConsumption: '210 kWh/m²/an',
      heatingCollective: 'non',
      annualCharges: '1 800 € par an',
      propertyTax: '950 € par an',
      nonRecoverableChargesMonthly: '40 € par mois',
      price: '210 000 €',
      feesPercent: '5 %',
    })
    expect(missingDraftFacts(listing)).toEqual([])
  })
})

describe('floorText', () => {
  it('le texte lu d’abord, sinon l’étage et le nombre d’étages', () => {
    expect(
      floorText({
        floor: 2,
        floorsTotal: 4,
        floorLabel: ' 2e, sans ascenseur ',
      })
    ).toBe('2e, sans ascenseur')
    expect(floorText({ floor: 1, floorsTotal: null, floorLabel: null })).toBe(
      '1er'
    )
    expect(floorText({ floor: -1, floorsTotal: null, floorLabel: null })).toBe(
      'sous-sol 1'
    )
    expect(floorText({ floor: 4, floorsTotal: 6, floorLabel: null })).toBe(
      '4e sur 6'
    )
    expect(
      floorText({ floor: null, floorsTotal: 6, floorLabel: null })
    ).toBeNull()
  })
})
