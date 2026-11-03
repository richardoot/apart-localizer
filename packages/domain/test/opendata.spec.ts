import { describe, expect, it } from 'vitest'
import { CriteriaFiltersSchema } from '@apart/contracts'
import type {
  DpeCandidate,
  RentControlZone,
  RentReferenceTable,
} from '@apart/contracts'
import {
  comparableSurfaceRange,
  criteriaFilterMatch,
  dpeClassesUpTo,
  dpeMatchScore,
  dpeSearchDecision,
  dpeValidity,
  epochOfPeriod,
  epochOfYear,
  financialsFromListing,
  gapToMarket,
  lookupRentReference,
  marketPrice,
  marketPricePerM2FromContext,
  marketStats,
  marketWindow,
  maxPriceForMarket,
  quantile,
  REFERENCE_RENT_KEY,
  referenceRentInForce,
  rentRoomsBucket,
  rentTableAt,
  targetPrice,
} from '../src/index.js'
import type { RentReferenceQuery } from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS as A, financials } from './helpers.js'

/** Une table fictive : deux zones, valeurs inventées pour le test. */
function table(over: Partial<RentReferenceTable> = {}): RentReferenceTable {
  return {
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: '2030-06-01',
    validFrom: '2030-07-01',
    validUntil: '2031-06-30',
    source: {
      url: 'https://example.invalid/arrete.xlsx',
      file: 'arrete.xlsx',
      sha256: 'abc',
      importedAt: '2030-07-02T00:00:00.000Z',
      crossCheck: null,
    },
    rows: [
      {
        zone: 1,
        rooms: 2,
        epoch: 'before_1946',
        furnished: false,
        referenceRent: 10,
        upperRent: 12,
        lowerRent: 7,
      },
      {
        zone: 1,
        rooms: 2,
        epoch: 'before_1946',
        furnished: true,
        referenceRent: 11,
        upperRent: 13.2,
        lowerRent: 7.7,
      },
    ],
    ...over,
  }
}

const ZONE_1: RentControlZone = {
  zone: 1,
  label: 'Secteur fictif 1',
  irisCode: '330630101',
  inseeCode: '33063',
}

function query(over: Partial<RentReferenceQuery> = {}): RentReferenceQuery {
  return {
    applicable: true,
    zones: [ZONE_1],
    precision: 'exact',
    rooms: 2,
    constructionYear: 1900,
    constructionPeriod: null,
    leaseType: 'unfurnished',
    surface: 40,
    rentalYear: null,
    tables: [table()],
    at: new Date('2030-09-01T12:00:00Z'),
    ...over,
  }
}

describe('encadrement : époque, pièces, arrêté', () => {
  it('époque par année, bornes comprises', () => {
    expect(epochOfYear(1945)).toBe('before_1946')
    expect(epochOfYear(1946)).toBe('1946_1970')
    expect(epochOfYear(1970)).toBe('1946_1970')
    expect(epochOfYear(1971)).toBe('1971_1990')
    expect(epochOfYear(1990)).toBe('1971_1990')
    expect(epochOfYear(1991)).toBe('after_1990')
  })

  it('époque lue dans un texte, null si ambiguë', () => {
    expect(epochOfPeriod('Avant 1946')).toBe('before_1946')
    expect(epochOfPeriod('avant 1970')).toBeNull()
    expect(epochOfPeriod('1971-1990')).toBe('1971_1990')
    expect(epochOfPeriod('1960 - 1975')).toBeNull()
    expect(epochOfPeriod('après 1990')).toBe('after_1990')
    expect(epochOfPeriod('après 1975')).toBeNull()
    expect(epochOfPeriod('années 60')).toBe('1946_1970')
    // Une décennie vaut dix ans : à cheval sur deux tranches, elle est ambiguë.
    expect(epochOfPeriod('années 70')).toBeNull()
    expect(epochOfPeriod('années 1970')).toBeNull()
    expect(epochOfPeriod('années 1940')).toBeNull()
    expect(epochOfPeriod('années 1990')).toBeNull()
    expect(epochOfPeriod('années 1930')).toBe('before_1946')
    expect(epochOfPeriod('années 80')).toBe('1971_1990')
    expect(epochOfPeriod('années 2000')).toBe('after_1990')
    // Une année de travaux ne date pas la construction ; deux repères contraires : null.
    expect(epochOfPeriod('immeuble des années 30, rénové en 2015')).toBe(
      'before_1946'
    )
    expect(epochOfPeriod('construit en 1965, ravalement 2012')).toBe(
      '1946_1970'
    )
    expect(epochOfPeriod('années 30 ou 1985')).toBeNull()
    expect(epochOfPeriod('avant 1946 ou 1960')).toBeNull()
    expect(epochOfPeriod('construit en 1985')).toBe('1971_1990')
    expect(epochOfPeriod('ancien')).toBeNull()
    expect(epochOfPeriod('')).toBeNull()
    expect(epochOfPeriod(null)).toBeNull()
  })

  it('tranches de pièces : 1 à 3, puis « 4 et plus »', () => {
    expect(rentRoomsBucket(0)).toBe(1)
    expect(rentRoomsBucket(1)).toBe(1)
    expect(rentRoomsBucket(3)).toBe(3)
    expect(rentRoomsBucket(6)).toBe(4)
    expect(rentRoomsBucket(null)).toBeNull()
    expect(rentRoomsBucket(Number.NaN)).toBeNull()
  })

  it("l'arrêté en vigueur, sinon le plus récent marqué expiré", () => {
    const older = table({
      decreeDate: '2029-06-01',
      validFrom: '2029-07-01',
      validUntil: '2030-06-30',
    })
    const current = table()
    expect(
      rentTableAt([older, current], new Date('2030-07-01T00:00:00Z'))
    ).toEqual({ table: current, expired: false })
    expect(
      rentTableAt([older, current], new Date('2030-06-30T00:00:00Z'))?.table
    ).toBe(older)
    expect(
      rentTableAt([older, current], new Date('2031-07-01T00:00:00Z'))
    ).toEqual({ table: current, expired: true })
    expect(rentTableAt([current], new Date('2029-01-01T00:00:00Z'))).toBeNull()
    expect(
      rentTableAt(
        [table({ validUntil: null })],
        new Date('2040-01-01T00:00:00Z')
      )?.expired
    ).toBe(false)
  })
})

describe('encadrement : plafond automatique', () => {
  it('cas nominal : majoré × surface, arrêté cité', () => {
    const r = lookupRentReference(query())
    expect(r.status).toBe('ok')
    expect(r.zone).toEqual(ZONE_1)
    expect(r.referenceRentPerM2).toBe(12)
    expect(r.monthlyCap).toBe(480)
    expect(r.decree?.decreeDate).toBe('2030-06-01')
    expect(r.reasons).toEqual([])
    expect(r.notes[0]).toContain('majoré 12 €/m²')
  })

  it('meublé : la colonne meublée ; sans phase 2 : vide supposé', () => {
    expect(
      lookupRentReference(query({ leaseType: 'furnished' })).referenceRentPerM2
    ).toBe(13.2)
    const none = lookupRentReference(query({ leaseType: null }))
    expect(none.status).toBe('ok')
    expect(none.notes).toContain('Location vide supposée (phase 2 non saisie).')
  })

  it('hors Bordeaux : sans objet', () => {
    const r = lookupRentReference(query({ applicable: false }))
    expect(r.status).toBe('not_applicable')
    expect(r.referenceRentPerM2).toBeNull()
  })

  it('sans arrêté importé : indisponible', () => {
    expect(lookupRentReference(query({ tables: [] })).status).toBe(
      'unavailable'
    )
  })

  it('arrêté expiré : à vérifier, valeur indicative conservée', () => {
    const r = lookupRentReference(
      query({ at: new Date('2031-08-01T00:00:00Z') })
    )
    expect(r.status).toBe('to_verify')
    expect(r.referenceRentPerM2).toBe(12)
    expect(r.reasons[0]).toContain("ne s'applique plus depuis le 01/07/2031")
  })

  it('chaque inconnue rend « à vérifier » avec sa raison', () => {
    const imprecise = lookupRentReference(query({ precision: 'district' }))
    expect(imprecise.status).toBe('to_verify')
    expect(imprecise.reasons.join(' ')).toContain('Adresse imprécise')
    const outside = lookupRentReference(query({ zones: [] }))
    expect(outside.reasons.join(' ')).toContain('hors des secteurs')
    expect(outside.referenceRentPerM2).toBeNull()
    const border = lookupRentReference(
      query({ zones: [ZONE_1, { ...ZONE_1, zone: 2, irisCode: 'x' }] })
    )
    expect(border.status).toBe('to_verify')
    expect(border.reasons.join(' ')).toContain('zones 1 et 2')
    expect(lookupRentReference(query({ rooms: null })).reasons).toContain(
      'Nombre de pièces inconnu.'
    )
    const noEpoch = lookupRentReference(query({ constructionYear: null }))
    expect(noEpoch.epoch).toBeNull()
    expect(noEpoch.status).toBe('to_verify')
    const fromText = lookupRentReference(
      query({ constructionYear: null, constructionPeriod: 'avant 1946' })
    )
    expect(fromText.status).toBe('ok')
    const shared = lookupRentReference(query({ leaseType: 'shared' }))
    expect(shared.furnished).toBeNull()
    expect(shared.reasons.join(' ')).toContain('Colocation')
    const missingRow = lookupRentReference(query({ rooms: 3 }))
    expect(missingRow.status).toBe('to_verify')
    expect(missingRow.reasons.join(' ')).toContain('Aucune ligne')
    // Adresse à la rue : zone probable, valeur indicative, rien d'appliqué.
    const street = lookupRentReference(query({ precision: 'street' }))
    expect(street.status).toBe('to_verify')
    expect(street.referenceRentPerM2).toBe(12)
    expect(street.reasons.join(' ')).toContain('zone 1 probable')
    // Point à quelques mètres d'un secteur sans y être.
    const near = lookupRentReference(query({ zoneContainsPoint: false }))
    expect(near.status).toBe('to_verify')
    expect(near.reasons.join(' ')).toContain('hors des secteurs du zonage')
  })

  it('sans surface : pas de plafond mensuel ; mise en location tardive signalée', () => {
    const r = lookupRentReference(query({ surface: null }))
    expect(r.referenceRentPerM2).toBe(12)
    expect(r.monthlyCap).toBeNull()
    expect(r.notes.join(' ')).toContain('Surface inconnue')
    const late = lookupRentReference(query({ rentalYear: 2033 }))
    expect(late.status).toBe('ok')
    expect(late.notes.join(' ')).toContain('Mise en location prévue en 2033')
    // L'arrêté finit en cours d'année (30/06/2031) : signalé aussi.
    const during = lookupRentReference(query({ rentalYear: 2031 }))
    expect(during.notes.join(' ')).toContain('cesse de s')
    expect(during.notes.join(' ')).toContain('30/06/2031')
    const inside = lookupRentReference(query({ rentalYear: 2030 }))
    expect(inside.notes.join(' ')).not.toContain('à revoir')
  })

  it('un plafond posé d’office expire avec son arrêté ; une saisie du membre reste', () => {
    const auto = {
      rentalPlan: { referenceRentPerM2: 13.2 },
      fieldSources: { [REFERENCE_RENT_KEY]: { source: 'open_data' } },
      openDataContext: { rentControl: { validUntil: '2031-06-30' } },
    }
    expect(referenceRentInForce(auto)).toBe(13.2)
    expect(referenceRentInForce(auto, new Date('2031-06-30T12:00:00Z'))).toBe(
      13.2
    )
    expect(
      referenceRentInForce(auto, new Date('2031-07-01T00:00:00Z'))
    ).toBeNull()
    const typed = {
      ...auto,
      fieldSources: { [REFERENCE_RENT_KEY]: { source: 'user' } },
    }
    expect(referenceRentInForce(typed, new Date('2032-01-01'))).toBe(13.2)
    expect(
      referenceRentInForce(
        { ...auto, openDataContext: null },
        new Date('2032-01-01')
      )
    ).toBe(13.2)
    expect(referenceRentInForce({ rentalPlan: null }, new Date())).toBeNull()
    // Dans le calcul : le plafond tombe, le loyer visé n'est plus plafonné.
    const listing = {
      price: 200_000,
      surface: 40,
      location: { commune: 'Bordeaux' },
      rentalPlan: { targetRent: 900, referenceRentPerM2: 13.2 },
      fieldSources: auto.fieldSources,
      openDataContext: auto.openDataContext,
    }
    expect(financialsFromListing(listing).referenceRentPerM2).toBe(13.2)
    expect(
      financialsFromListing(listing, undefined, new Date('2031-08-01'))
        .referenceRentPerM2
    ).toBeNull()
  })
})

describe('marché DVF', () => {
  it('quantiles par interpolation linéaire', () => {
    expect(quantile([], 0.5)).toBeNaN()
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([5], 0.9)).toBe(5)
    expect(quantile([1, 3], 2)).toBe(3)
  })

  it('statistiques : médiane, quartiles, dispersion ; rien sans vente', () => {
    expect(marketStats([])).toBeNull()
    expect(marketStats([Number.NaN, -1])).toBeNull()
    const s = marketStats([4000, 3000, 5000, 4500, 3500])
    expect(s).toEqual({
      count: 5,
      medianPricePerM2: 4000,
      p25PricePerM2: 3500,
      p75PricePerM2: 4500,
      minPricePerM2: 3000,
      maxPricePerM2: 5000,
      dispersion: 0.25,
    })
  })

  it('prix de marché : médiane × surface, à partir de cinq ventes', () => {
    const five = marketStats([4000, 3000, 5000, 4500, 3500])
    expect(marketPrice(40, five)).toBe(160_000)
    expect(marketPrice(40, marketStats([4000, 3000]))).toBeNull()
    expect(marketPrice(null, five)).toBeNull()
    expect(marketPrice(0, five)).toBeNull()
    expect(marketPrice(40, null)).toBeNull()
  })

  it('fenêtre de trois ans, surfaces à ±25 %, écart au marché', () => {
    expect(marketWindow(new Date('2026-11-03T10:00:00Z'))).toEqual({
      from: '2023-11-03',
      to: '2026-11-03',
    })
    expect(comparableSurfaceRange(40)).toEqual([30, 50])
    const s = marketStats([4000, 4000, 4000, 4000, 4000])
    expect(gapToMarket(4400, s)).toBeCloseTo(0.1, 10)
    expect(gapToMarket(null, s)).toBeNull()
    expect(gapToMarket(Number.NaN, s)).toBeNull()
    expect(gapToMarket(4000, null)).toBeNull()
  })

  it("prix médian retenu depuis l'instantané de l'annonce", () => {
    const ctx = (medianPricePerM2: number | null, count: number) => ({
      market: { medianPricePerM2, count },
    })
    expect(marketPricePerM2FromContext(ctx(4200, 8))).toBe(4200)
    expect(marketPricePerM2FromContext(ctx(4200, 4))).toBeNull()
    expect(marketPricePerM2FromContext(ctx(null, 8))).toBeNull()
    expect(marketPricePerM2FromContext({ market: null })).toBeNull()
    expect(marketPricePerM2FromContext(null)).toBeNull()
  })

  it('le critère « marché » du prix cible devient calculable', () => {
    const f = financials({ marketPricePerM2: 4000 })
    expect(maxPriceForMarket(f)).toBe(180_000)
    expect(maxPriceForMarket(financials())).toBeNull()
    expect(
      maxPriceForMarket(financials({ marketPricePerM2: 4000, surface: 0 }))
    ).toBeNull()
    const t = targetPrice(f, { ...A, targetCriteria: ['market'] })
    expect(t.targetPrice).toBe(180_000)
    expect(t.bindingCriterion).toBe('market')
    expect(t.discount).toBeCloseTo(0.1, 10)
    // Inactif par défaut : il est rendu, mais ne pèse pas sur le prix cible.
    const byDefault = targetPrice(f, A)
    expect(
      byDefault.criteria.find(c => c.criterion === 'market')
    ).toMatchObject({
      maxPrice: 180_000,
      active: false,
    })
    expect(byDefault.bindingCriterion).not.toBe('market')
  })
})

describe('filtres des critères de recherche', () => {
  const candidate = {
    price: 180_000,
    surface: 45,
    rooms: 2,
    dpeClass: 'D' as const,
    status: 'to_study' as const,
    commune: 'Talence',
    verdict: 'to_dig' as const,
  }
  const filters = (over: Record<string, unknown> = {}) =>
    CriteriaFiltersSchema.parse(over)

  it('sans filtre : toute annonce active passe', () => {
    expect(criteriaFilterMatch(candidate, filters())).toEqual({
      matches: true,
      failures: [],
    })
    expect(
      criteriaFilterMatch({ ...candidate, status: 'discarded' }, filters())
        .failures
    ).toEqual(['status'])
    expect(
      criteriaFilterMatch(
        { ...candidate, status: 'discarded' },
        filters({ statuses: ['discarded'] })
      ).matches
    ).toBe(true)
  })

  it('chaque filtre, avec les valeurs inconnues', () => {
    const f = filters({
      communes: ['talence', 'Bègles'],
      priceMin: 100_000,
      priceMax: 200_000,
      surfaceMin: 40,
      roomsMin: 2,
      dpeMax: 'D',
      verdicts: ['target', 'to_dig'],
    })
    expect(criteriaFilterMatch(candidate, f).matches).toBe(true)
    expect(
      criteriaFilterMatch(
        {
          ...candidate,
          commune: 'Pessac',
          price: 250_000,
          surface: null,
          rooms: null,
          dpeClass: 'F',
          verdict: 'off_target',
        },
        f
      ).failures
    ).toEqual([
      'commune',
      'price_max',
      'surface_min',
      'rooms_min',
      'dpe_max',
      'verdict',
    ])
    expect(
      criteriaFilterMatch({ ...candidate, price: 50_000 }, f).failures
    ).toEqual(['price_min'])
    // Un DPE inconnu est retenu (à vérifier), une commune inconnue non.
    expect(
      criteriaFilterMatch({ ...candidate, dpeClass: null }, f).matches
    ).toBe(true)
    expect(
      criteriaFilterMatch({ ...candidate, commune: null }, f).failures
    ).toEqual(['commune'])
  })

  it('classes DPE acceptées', () => {
    expect(dpeClassesUpTo('A')).toEqual(['A'])
    expect(dpeClassesUpTo('D')).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('DPE vérifié', () => {
  const at = new Date('2026-11-03T12:00:00Z')

  it('validité : méthode 2021, ancienne méthode, expiré, inconnu', () => {
    expect(
      dpeValidity({
        dpeClass: 'D',
        dpeDate: '2023-05-10',
        inCoOwnership: true,
        at,
      })
    ).toEqual({
      level: 'ok',
      messages: [
        'DPE du 10/05/2023, méthode 2021, valable jusqu’au 09/05/2033.',
      ],
      auditRequired: false,
    })
    const old = dpeValidity({
      dpeClass: 'D',
      dpeDate: '2020-03-01',
      inCoOwnership: true,
      at,
    })
    expect(old.level).toBe('bad')
    expect(old.messages[0]).toContain('plus valable depuis le 01/01/2025')
    const older = dpeValidity({
      dpeClass: 'C',
      dpeDate: '2016-03-01',
      inCoOwnership: true,
      at: new Date('2022-06-01T00:00:00Z'),
    })
    expect(older.level).toBe('warn')
    expect(older.messages[0]).toContain('valable jusqu’au 31/12/2022')
    const expired = dpeValidity({
      dpeClass: 'C',
      dpeDate: '2021-08-01',
      inCoOwnership: true,
      at: new Date('2031-08-01T00:00:00Z'),
    })
    expect(expired.level).toBe('bad')
    const unknown = dpeValidity({
      dpeClass: null,
      dpeDate: null,
      inCoOwnership: null,
      at,
    })
    expect(unknown.level).toBe('unknown')
    expect(unknown.auditRequired).toBeNull()
    expect(unknown.messages).toHaveLength(2)
  })

  it('audit énergétique : hors copropriété seulement, selon la classe et la date', () => {
    const v = (
      dpeClass: 'E' | 'F' | 'D',
      inCoOwnership: boolean | null,
      when = at
    ) =>
      dpeValidity({ dpeClass, dpeDate: '2024-01-01', inCoOwnership, at: when })
    expect(v('F', false).auditRequired).toBe(true)
    expect(v('F', false).level).toBe('warn')
    expect(v('F', true).auditRequired).toBe(false)
    expect(v('F', true).messages.join(' ')).toContain('copropriété')
    expect(v('E', null).auditRequired).toBeNull()
    expect(v('E', null).level).toBe('warn')
    expect(v('E', false, new Date('2024-06-01T00:00:00Z')).auditRequired).toBe(
      false
    )
    expect(v('D', false).auditRequired).toBe(false)
  })

  const dpe = (over: Partial<DpeCandidate> = {}): DpeCandidate => ({
    number: '2633E0000000X',
    issuedAt: '2025-01-01',
    validUntil: '2034-12-31',
    dpeClass: 'D',
    gesClass: 'B',
    consumption: 200,
    emissions: 10,
    surface: 45,
    floor: 2,
    address: '1 rue Fictive 33400 Talence',
    complement: null,
    banId: '33522_0000_00001',
    buildingType: 'appartement',
    matchScore: 1,
    ...over,
  })

  it('ressemblance : surface puis étage ; une maison ne ressemble à rien', () => {
    const target = { surface: 45, floor: 2 }
    expect(dpeMatchScore(dpe(), target)).toBe(1)
    expect(dpeMatchScore(dpe({ surface: 47 }), target)).toBe(0.85)
    expect(dpeMatchScore(dpe({ surface: 49 }), target)).toBe(0.6)
    expect(dpeMatchScore(dpe({ surface: 60 }), target)).toBe(0.2)
    expect(dpeMatchScore(dpe({ floor: 3 }), target)).toBe(0.6)
    expect(dpeMatchScore(dpe({ floor: null }), target)).toBe(0.8)
    expect(dpeMatchScore(dpe(), { surface: 45, floor: null })).toBe(0.8)
    expect(dpeMatchScore(dpe({ surface: null }), target)).toBe(0.5)
    expect(dpeMatchScore(dpe({ buildingType: 'maison' }), target)).toBe(0)
  })

  it('application d’office : un seul candidat clair et cohérent', () => {
    expect(dpeSearchDecision([], null)).toEqual({ status: 'none', apply: null })
    const best = dpe()
    expect(dpeSearchDecision([best], null)).toEqual({
      status: 'verified',
      apply: best,
    })
    expect(dpeSearchDecision([best], 'D').status).toBe('verified')
    expect(dpeSearchDecision([best], 'E')).toEqual({
      status: 'single',
      apply: null,
    })
    expect(dpeSearchDecision([dpe({ matchScore: 0.6 })], null).status).toBe(
      'single'
    )
    expect(
      dpeSearchDecision([dpe({ matchScore: 0.7 }), best], null).status
    ).toBe('multiple')
    expect(
      dpeSearchDecision([best, dpe({ matchScore: 0.2 })], null).status
    ).toBe('verified')
  })
})
