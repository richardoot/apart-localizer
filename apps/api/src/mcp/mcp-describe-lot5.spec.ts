import { describe, expect, it } from 'vitest'
import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_REGULATORY_RULES,
} from '@apart/contracts'
import {
  compareScenario,
  complianceReport,
  projection,
  rentMarket,
} from '@apart/domain'
import type { ComplianceInput, StudyInput } from '@apart/domain'
import {
  describeCompliance,
  describeProjection,
  describeRentMarket,
  describeScenario,
  glossaryMarkdown,
} from './mcp-tools'

const AT = new Date('2026-11-03T10:00:00Z')
const A = AssumptionsSchema.parse({
  ...DEFAULT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  rentalStartDate: '2028-01-01',
  marginalTaxRate: 0.3,
  currentRent: 850,
})
const INPUT: StudyInput = {
  financials: {
    price: 200_000,
    buyerFees: 0,
    surface: 45,
    targetRent: 750,
    rentControlled: false,
    referenceRentPerM2: null,
    furnitureValue: 5000,
    renovationTotal: 0,
    propertyTax: null,
    annualCharges: 1200,
    nonRecoverableChargesMonthly: null,
    dpeClass: 'D',
    marketPricePerM2: null,
  },
  rental: {
    dpeClass: 'D',
    year: null,
    marketRent: null,
    demand: 'strong',
    coOwnershipAllowsRental: 'yes',
    decencyCompliant: 'yes',
    rentalPermitRequired: 'unknown',
  },
  leaseType: 'unfurnished',
}

describe('réponses MCP du lot 5', () => {
  it('scénario : verdicts, écarts et sens, mention d’estimation', () => {
    const text = describeScenario(
      compareScenario(
        INPUT,
        A,
        { price: 150_000 },
        {
          at: AT,
          title: 'T2',
          scenario: { id: null, name: 'Prix négocié' },
        }
      )
    )
    expect(text).toContain('Scénario « Prix négocié » sur T2')
    expect(text).toMatch(/Coût total : .* → .*\(mieux\)/)
    expect(text).toContain('pas un conseil fiscal')
    const same = describeScenario(compareScenario(INPUT, A, {}, { at: AT }))
    expect(same).toContain('Aucun indicateur ne change.')
    expect(same).toContain('Scénario sur Annonce')
  })

  it('projection : TRI, VAN, revente, régimes, avertissements', () => {
    const text = describeProjection(
      projection(INPUT, A, { at: AT, title: 'T2' })
    )
    expect(text).toMatch(/Projection de T2 sur 15 ans \(Micro-foncier/)
    expect(text).toMatch(/TRI avant impôt/)
    expect(text).toMatch(/Revente le 2041-01-01/)
    expect(text).toMatch(/Régimes comparés : Micro-foncier/)
    expect(text).toMatch(/le plus favorable/)
    const noTmi = describeProjection(
      projection(INPUT, { ...A, marginalTaxRate: null }, { at: AT })
    )
    expect(noTmi).toContain('TMI à renseigner')
    expect(noTmi).toContain('À noter')
    const early = describeProjection(
      projection(INPUT, A, { at: AT, horizonYears: 1 })
    )
    expect(early).toContain('plus-value exonérée')
  })

  it('conformité : verdict, points datés et sourcés, Géorisques', () => {
    const input: ComplianceInput = {
      dpeClass: 'F',
      dpeDate: '2022-01-01',
      constructionYear: 1930,
      leaseType: 'unfurnished',
      inseeCode: '33522',
      commune: 'Talence',
      surface: 45,
      rentControlled: false,
      targetRent: 750,
      rentCap: null,
      heatingType: null,
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
    }
    const text = describeCompliance(
      complianceReport(input, DEFAULT_REGULATORY_RULES, null, {
        rentalStartDate: '2028-01-01',
        at: AT,
      })
    )
    expect(text).toMatch(
      /Conformité de Annonce pour une mise en location le 2028-01-01 : Incompatible/
    )
    expect(text).toMatch(/\[bloquant\] Performance énergétique/)
    expect(text).toMatch(/source : Loi Climat/)
    expect(text).toMatch(
      /Géorisques : Risques à l’adresse non consultés|Géorisques : non consulté/
    )
    const withGeo = describeCompliance(
      complianceReport(
        input,
        DEFAULT_REGULATORY_RULES,
        {
          status: 'ok',
          point: { type: 'Point', coordinates: [-0.59, 44.8] },
          address: null,
          commune: 'Talence',
          inseeCode: '33522',
          reportUrl: null,
          hazards: [],
          fetchedAt: null,
          message: null,
        },
        { rentalStartDate: '2028-01-01', at: AT }
      )
    )
    expect(withGeo).toMatch(/Géorisques \(adresse, relevé —\) : 0 aléa/)
  })

  it('loyer de marché : médiane, loyer estimé, messages', () => {
    const market = rentMarket(
      [600, 640, 680, 720, 760].map(rent => ({
        rent,
        surface: 40,
        furnished: false,
        observedAt: null,
      })),
      { surface: 45, furnished: false, targetRent: 750, rentCap: null, at: AT }
    )
    const text = describeRentMarket(market)
    expect(text).toMatch(/5 comparable\(s\), 5 retenu\(s\)/)
    expect(text).toMatch(/médiane 17 €\/m²/)
    expect(text).toMatch(/loyer estimé ≈ 765 €\/mois/)
    const empty = describeRentMarket(
      rentMarket([], {
        surface: 45,
        furnished: false,
        targetRent: null,
        rentCap: null,
        at: AT,
      })
    )
    expect(empty).toContain('aucun comparable retenu')
  })

  it('le glossaire définit TRI, VAN, cash-flow net d’impôt et régimes', () => {
    const md = glossaryMarkdown()
    expect(md).toContain('## TRI (taux de rendement interne)')
    expect(md).toContain('## VAN (valeur actuelle nette)')
    expect(md).toContain('## Cash-flow net d’impôt')
    expect(md).toContain('## Régimes fiscaux')
    expect(md).toContain('micro-foncier')
  })
})
