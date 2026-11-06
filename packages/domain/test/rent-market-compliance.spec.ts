/**
 * Lot 5 : loyer de marché par comparables (L4), checklist réglementaire
 * datée (L5) et niveau des aléas Géorisques (D6).
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_REGULATORY_RULES } from '@apart/contracts'
import type { GeorisquesReport, RegulatoryRulesTable } from '@apart/contracts'
import {
  complianceInputFromListing,
  complianceReport,
  complianceVerdict,
  georisqueLevel,
  rentMarket,
  rentMarketStats,
} from '../src/index.js'
import type { ComplianceInput, RentComparableLike } from '../src/index.js'

const AT = new Date('2026-11-03T10:00:00Z')

const comparable = (
  rent: number,
  over: Partial<RentComparableLike> = {}
): RentComparableLike => ({
  id: `c-${rent}`,
  rent,
  surface: 40,
  furnished: false,
  observedAt: '2026-10-01',
  ...over,
})

const FIVE = [600, 640, 680, 720, 760].map(r => comparable(r))

describe('loyer de marché (L4)', () => {
  it('médiane et quartiles au m², loyer estimé, position du loyer visé', () => {
    const report = rentMarket(FIVE, {
      listingId: '11111111-1111-4111-8111-111111111111',
      surface: 45,
      furnished: false,
      targetRent: 750,
      rentCap: null,
      at: AT,
    })
    expect(report.enough).toBe(true)
    expect(report.stats).toMatchObject({
      count: 5,
      medianRent: 680,
      medianRentPerM2: 17,
      p25RentPerM2: 16,
      p75RentPerM2: 18,
      minRentPerM2: 15,
      maxRentPerM2: 19,
    })
    expect(report.estimatedRent).toBe(765)
    expect(report.gapToMarket).toBeCloseTo(750 / 765 - 1, 12)
    // 750 / 45 = 16,67 €/m² : au-dessus de 15 et 16.
    expect(report.targetPercentile).toBeCloseTo(0.4, 12)
    expect(report.level).toBe('ok')
    expect(report.messages.join(' ')).toMatch(/en dessous du marché/)
  })

  it('loyer visé au-dessus du marché ou du plafond : attention ; comparables écartés et anciens signalés', () => {
    const report = rentMarket(
      [
        ...FIVE,
        comparable(900, { furnished: true }),
        comparable(500, { observedAt: '2025-01-15' }),
        comparable(0),
      ],
      { surface: 45, furnished: false, targetRent: 900, rentCap: 800, at: AT }
    )
    expect(report.comparables.filter(c => c.included)).toHaveLength(6)
    const furnished = report.comparables.find(c => c.furnished)
    expect(furnished?.reason).toMatch(/louée vide/)
    expect(report.comparables.find(c => c.rent === 0)?.reason).toMatch(
      /manquant/
    )
    expect(report.comparables.find(c => c.rent === 500)?.stale).toBe(true)
    expect(report.level).toBe('warn')
    expect(report.capGapToMarket).not.toBeNull()
    const text = report.messages.join(' ')
    expect(text).toMatch(/au-dessus du marché estimé/)
    expect(text).toMatch(/plafond d’encadrement/)
    expect(text).toMatch(/plus de 12 mois/)
    expect(text).toMatch(/écarté/)
  })

  it('pas assez de comparables, surface inconnue, aucun comparable, meublé', () => {
    const few = rentMarket(FIVE.slice(0, 2), {
      surface: null,
      furnished: false,
      targetRent: 750,
      rentCap: 700,
      at: AT,
    })
    expect(few.enough).toBe(false)
    expect(few.level).toBe('unknown')
    expect(few.estimatedRent).toBeNull()
    expect(few.targetPercentile).toBeNull()
    expect(few.messages.join(' ')).toMatch(/Surface de l’annonce inconnue/)
    expect(few.messages.join(' ')).toMatch(/il en faut au moins 5/)
    const none = rentMarket([], {
      surface: 45,
      furnished: true,
      targetRent: null,
      rentCap: null,
      at: AT,
    })
    expect(none.stats).toBeNull()
    expect(none.gapToMarket).toBeNull()
    expect(none.messages[0]).toMatch(/meublé/)
    expect(none.listingId).toBeNull()
    const furnishedOnly = rentMarket(FIVE, {
      surface: 45,
      furnished: true,
      targetRent: 700,
      rentCap: null,
      at: AT,
    })
    expect(furnishedOnly.comparables.every(c => !c.included)).toBe(true)
    expect(furnishedOnly.comparables[0]?.reason).toMatch(/louée meublée/)
    expect(rentMarketStats([{ rent: 0, surface: 10 }])).toBeNull()
  })
})

const BASE: ComplianceInput = {
  listingId: null,
  title: 'T2',
  dpeClass: 'D',
  dpeDate: '2023-05-10',
  constructionYear: 1965,
  leaseType: 'unfurnished',
  inseeCode: '33522',
  commune: 'Talence',
  surface: 45,
  rentControlled: false,
  targetRent: 750,
  rentCap: null,
  heatingType: 'gaz individuel',
  coOwnershipAllowsRental: 'yes',
  decencyCompliant: 'yes',
  rentalPermitRequired: 'no',
}

const GEO_OK: GeorisquesReport = {
  status: 'ok',
  point: { type: 'Point', coordinates: [-0.59, 44.81] },
  address: 'Allée fictive, 33400 Talence',
  commune: 'Talence',
  inseeCode: '33522',
  reportUrl:
    'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?lon=-0.59&lat=44.81',
  hazards: [
    {
      key: 'retraitGonflementArgile',
      label: 'Retrait gonflement des argiles',
      family: 'natural',
      present: true,
      communeStatus: 'Risque Existant - important',
      addressStatus: 'Risque Existant - modéré',
      level: 'warn',
    },
    {
      key: 'feuForet',
      label: 'Feu de foret',
      family: 'natural',
      present: true,
      communeStatus: 'Risque Existant',
      addressStatus: 'Risque non Connu',
      level: 'unknown',
    },
    {
      key: 'seisme',
      label: 'Séisme',
      family: 'natural',
      present: true,
      communeStatus: 'Risque Existant - faible',
      addressStatus: 'Risque Existant - faible',
      level: 'ok',
    },
    {
      key: 'avalanche',
      label: 'Avalanche',
      family: 'natural',
      present: false,
      communeStatus: null,
      addressStatus: null,
      level: 'ok',
    },
  ],
  fetchedAt: '2026-11-03T15:00:00.000Z',
  message: null,
}

const report = (
  over: Partial<ComplianceInput> = {},
  start = '2028-01-01',
  geo: GeorisquesReport | null = GEO_OK,
  table: RegulatoryRulesTable = DEFAULT_REGULATORY_RULES
) =>
  complianceReport({ ...BASE, ...over }, table, geo, {
    rentalStartDate: start,
    at: AT,
  })

const byKey = (r: ReturnType<typeof report>, key: string) =>
  r.items.find(i => i.key === key)

describe('checklist réglementaire (L5)', () => {
  it('DPE D en 2028 : louable ; validité du DPE ; sources et dates de la table', () => {
    const r = report()
    expect(r.rentalStartDate).toBe('2028-01-01')
    expect(r.evaluatedAt).toBe(AT.toISOString())
    expect(byKey(r, 'dpe_ban')?.level).toBe('ok')
    expect(byKey(r, 'dpe_validity')).toMatchObject({
      level: 'ok',
      date: '2033-05-10',
    })
    expect(r.rules.version).toBe(DEFAULT_REGULATORY_RULES.version)
    expect(
      r.items.every(i => i.provenance !== 'reference' || i.source !== null)
    ).toBe(true)
    expect(r.counts.ok + r.counts.warn + r.counts.bad + r.counts.unknown).toBe(
      r.items.length
    )
  })

  it('calendrier d’interdiction : G bloquant, F attention avant 2028 et bloquant ensuite, gel des loyers', () => {
    const g = report({ dpeClass: 'G' })
    expect(byKey(g, 'dpe_ban')).toMatchObject({
      level: 'bad',
      date: '2025-01-01',
    })
    expect(byKey(g, 'dpe_rent_freeze')?.level).toBe('warn')
    expect(g.verdict).toBe('incompatible')
    const f2027 = report({ dpeClass: 'F' }, '2027-06-01')
    expect(byKey(f2027, 'dpe_ban')).toMatchObject({
      level: 'warn',
      date: '2028-01-01',
    })
    const f2028 = report({ dpeClass: 'F' })
    expect(byKey(f2028, 'dpe_ban')?.level).toBe('bad')
    const e = report({ dpeClass: 'E' })
    expect(byKey(e, 'dpe_ban')?.message).toMatch(
      /1 janvier 2034|1er janvier 2034/
    )
    const unknown = report({ dpeClass: null, dpeDate: null })
    expect(byKey(unknown, 'dpe_ban')?.level).toBe('unknown')
    expect(byKey(unknown, 'dpe_validity')?.level).toBe('unknown')
    expect(byKey(unknown, 'diagnostic_dpe')?.level).toBe('unknown')
  })

  it('DPE ancienne méthode ou expiré à la mise en location', () => {
    expect(
      byKey(report({ dpeDate: '2020-03-01' }), 'dpe_validity')?.level
    ).toBe('bad')
    expect(
      byKey(report({ dpeDate: '2021-09-01' }, '2032-01-01'), 'dpe_validity')
    ).toMatchObject({ level: 'warn', date: '2031-09-01' })
  })

  it('encadrement : hors Bordeaux ; à Bordeaux après la fin de l’expérimentation ; sous et au-dessus du plafond', () => {
    expect(byKey(report(), 'rent_control')?.level).toBe('ok')
    const after = report({
      inseeCode: '33063',
      commune: 'Bordeaux',
      rentControlled: true,
    })
    expect(byKey(after, 'rent_control')).toMatchObject({
      level: 'unknown',
      date: '2026-11-24',
    })
    expect(byKey(after, 'rent_control')?.message).toMatch(/prolongation/i)
    const bordeaux = {
      inseeCode: '33063',
      commune: 'Bordeaux',
      rentControlled: true,
    }
    expect(
      byKey(report({ ...bordeaux, rentCap: 700 }, '2026-11-15'), 'rent_control')
        ?.level
    ).toBe('warn')
    expect(
      byKey(report({ ...bordeaux, rentCap: 800 }, '2026-11-15'), 'rent_control')
        ?.level
    ).toBe('ok')
    expect(
      byKey(
        report({ ...bordeaux, rentCap: null }, '2026-11-15'),
        'rent_control'
      )?.level
    ).toBe('unknown')
    // Commune inconnue mais phase 2 « encadrement : oui ».
    expect(
      byKey(
        report(
          { inseeCode: null, rentControlled: true, rentCap: 800 },
          '2026-11-15'
        ),
        'rent_control'
      )?.level
    ).toBe('ok')
    const forced = report(
      { inseeCode: '33522', rentControlled: true, rentCap: null },
      '2026-11-15'
    )
    expect(byKey(forced, 'rent_control')?.title).toBe('Encadrement des loyers')
  })

  it('permis de louer : exigé, non, à vérifier (Bordeaux ou ailleurs)', () => {
    expect(
      byKey(report({ rentalPermitRequired: 'yes' }), 'rental_permit')?.level
    ).toBe('warn')
    expect(byKey(report(), 'rental_permit')?.level).toBe('ok')
    const bdx = report({
      rentalPermitRequired: 'unknown',
      inseeCode: '33063',
      commune: 'Bordeaux',
    })
    expect(byKey(bdx, 'rental_permit')?.message).toMatch(
      /Une partie de Bordeaux/
    )
    const other = report({ rentalPermitRequired: 'unknown' })
    expect(byKey(other, 'rental_permit')?.message).toMatch(/Certaines communes/)
  })

  it('diagnostics : plomb avant 1949, amiante avant 1997, installations de plus de 15 ans, bruit à Mérignac, surface', () => {
    const old = report({ constructionYear: 1930 })
    expect(byKey(old, 'diagnostic_lead')?.level).toBe('warn')
    expect(byKey(old, 'diagnostic_asbestos')?.message).toMatch(/Exigé/)
    expect(byKey(old, 'diagnostic_electricity')?.message).toMatch(
      /Probablement exigé/
    )
    expect(byKey(old, 'diagnostic_gas')?.message).toMatch(/chauffage au gaz/)
    const recent = report({ constructionYear: 2020, heatingType: null })
    expect(byKey(recent, 'diagnostic_lead')?.message).toMatch(/Non exigé/)
    expect(byKey(recent, 'diagnostic_asbestos')?.message).toMatch(/Non exigé/)
    expect(byKey(recent, 'diagnostic_electricity')?.message).toMatch(
      /seulement si/
    )
    const noYear = report({ constructionYear: null })
    expect(byKey(noYear, 'diagnostic_lead')?.level).toBe('unknown')
    expect(byKey(noYear, 'diagnostic_gas')?.level).toBe('unknown')
    expect(
      byKey(
        report({ inseeCode: '33281', commune: 'Mérignac' }),
        'diagnostic_noise'
      )?.level
    ).toBe('unknown')
    expect(byKey(report(), 'diagnostic_noise')?.level).toBe('ok')

    expect(byKey(report(), 'diagnostic_risks')?.provenance).toBe('open_data')
    expect(
      byKey(report({}, '2028-01-01', null), 'diagnostic_risks')?.level
    ).toBe('unknown')
    const quiet = report({}, '2028-01-01', { ...GEO_OK, hazards: [] })
    expect(byKey(quiet, 'diagnostic_risks')?.message).toMatch(/Aucun aléa/)
  })

  it('décence, copropriété, meublé', () => {
    expect(byKey(report({ surface: 8 }), 'decency_surface')?.level).toBe('bad')
    expect(byKey(report({ surface: null }), 'decency_surface')?.level).toBe(
      'unknown'
    )
    expect(byKey(report({ decencyCompliant: 'no' }), 'decency')?.level).toBe(
      'bad'
    )
    expect(
      byKey(report({ decencyCompliant: 'unknown' }), 'decency')?.level
    ).toBe('unknown')
    expect(
      byKey(report({ coOwnershipAllowsRental: 'no' }), 'co_ownership')?.level
    ).toBe('bad')
    expect(
      byKey(report({ coOwnershipAllowsRental: 'unknown' }), 'co_ownership')
        ?.level
    ).toBe('unknown')
    expect(byKey(report(), 'furnished_inventory')).toBeUndefined()
    expect(
      byKey(report({ leaseType: 'furnished' }), 'furnished_inventory')?.level
    ).toBe('ok')
  })

  it('risques Géorisques : un point par aléa notable, les autres regroupés ; indisponible ou non localisé', () => {
    const r = report()
    expect(byKey(r, 'georisques_retraitGonflementArgile')).toMatchObject({
      level: 'warn',
      category: 'risks',
      provenance: 'open_data',
      date: '2026-11-03',
    })
    expect(byKey(r, 'georisques_feuForet')?.level).toBe('unknown')
    expect(byKey(r, 'georisques_quiet')?.message).toMatch(/Séisme/)
    expect(byKey(r, 'georisques_retraitGonflementArgile')?.source?.url).toMatch(
      /georisques/
    )
    const none = report({}, '2028-01-01', { ...GEO_OK, hazards: [] })
    expect(byKey(none, 'georisques_quiet')?.message).toMatch(/Aucun autre aléa/)
    const down = report({}, '2028-01-01', {
      ...GEO_OK,
      status: 'unavailable',
      reportUrl: null,
      hazards: [],
      fetchedAt: null,
      message: 'Géorisques indisponible (HTTP 503).',
    })
    expect(byKey(down, 'georisques')).toMatchObject({
      level: 'unknown',
      message: 'Géorisques indisponible (HTTP 503).',
      source: null,
    })
    expect(
      byKey(report({}, '2028-01-01', null), 'georisques')?.message
    ).toMatch(/non localisée/)
    expect(r.georisques).toBe(GEO_OK)
  })

  it('niveau d’un aléa d’après ses libellés', () => {
    expect(georisqueLevel(false, null, null)).toBe('ok')
    expect(georisqueLevel(true, null, 'Risque Existant')).toBe('unknown')
    expect(georisqueLevel(true, null, null)).toBe('ok')
    expect(georisqueLevel(true, 'Risque non Concerne', 'Risque Concerne')).toBe(
      'ok'
    )
    expect(georisqueLevel(true, 'Risque non Connu', 'Risque Existant')).toBe(
      'unknown'
    )
    expect(georisqueLevel(true, 'Risque Inconnu', 'Risque Existant')).toBe(
      'unknown'
    )
    expect(georisqueLevel(true, 'Risque Existant - faible', null)).toBe('ok')
    expect(georisqueLevel(true, 'Risque Existant - modéré', null)).toBe('warn')
    expect(georisqueLevel(true, 'Risque Concerne', null)).toBe('warn')
    expect(georisqueLevel(true, 'Autre libellé', null)).toBe('unknown')
  })

  it('verdict : bloquant, attention ou trois inconnues, sinon compatible', () => {
    const ok = {
      key: 'a',
      category: 'decency' as const,
      title: '',
      message: '',
      date: null,
      source: null,
      provenance: 'listing' as const,
    }
    expect(complianceVerdict([{ ...ok, level: 'ok' }])).toBe('compatible')
    expect(complianceVerdict([{ ...ok, level: 'warn' }])).toBe('conditional')
    expect(
      complianceVerdict([
        { ...ok, level: 'unknown' },
        { ...ok, level: 'unknown' },
      ])
    ).toBe('compatible')
    expect(
      complianceVerdict(
        Array.from({ length: 3 }, () => ({ ...ok, level: 'unknown' as const }))
      )
    ).toBe('conditional')
    expect(
      complianceVerdict([
        { ...ok, level: 'bad' },
        { ...ok, level: 'warn' },
      ])
    ).toBe('incompatible')
  })

  it('une table sans règle d’interdiction ni de diagnostic : la classe est louable sans échéance', () => {
    const minimal: RegulatoryRulesTable = {
      ...DEFAULT_REGULATORY_RULES,
      rules: DEFAULT_REGULATORY_RULES.rules.filter(
        r => r.kind === 'rental_permit'
      ),
    }
    const r = report({ dpeClass: 'G' }, '2028-01-01', GEO_OK, minimal)
    expect(byKey(r, 'dpe_ban')).toMatchObject({ level: 'ok', source: null })
    expect(byKey(r, 'decency_surface')).toBeUndefined()
    const unknownDpe = report({ dpeClass: null }, '2028-01-01', GEO_OK, minimal)
    expect(byKey(unknownDpe, 'dpe_ban')?.source).toBeNull()
    const noPermitRule = report(
      { rentalPermitRequired: 'unknown' },
      '2028-01-01',
      GEO_OK,
      {
        ...DEFAULT_REGULATORY_RULES,
        rules: DEFAULT_REGULATORY_RULES.rules.filter(
          r => r.kind !== 'rental_permit'
        ),
      }
    )
    expect(byKey(noPermitRule, 'rental_permit')?.message).toMatch(
      /auprès de la mairie/
    )
  })
})

describe('entrée de la checklist d’après une annonce', () => {
  it('reprend la fiche, les indicateurs et le type de location de l’espace ; valeurs par défaut sans phase 2', async () => {
    const input = complianceInputFromListing(
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'T2',
        dpeClass: 'E',
        dpeDate: '2022-01-01',
        constructionYear: 1930,
        surface: 40,
        heatingType: 'gaz',
        location: { inseeCode: '33063', commune: 'Bordeaux' },
        rentalPlan: {
          targetRent: 800,
          coOwnershipAllowsRental: 'yes',
          decencyCompliant: 'no',
          rentalPermitRequired: 'unknown',
        },
      },
      { rentControlled: true, rentCap: 750 },
      { leaseType: 'furnished' }
    )
    expect(input).toMatchObject({
      listingId: '11111111-1111-4111-8111-111111111111',
      leaseType: 'furnished',
      inseeCode: '33063',
      targetRent: 800,
      rentCap: 750,
      rentControlled: true,
      decencyCompliant: 'no',
    })
    // Lot 19 : le type de location vient des hypothèses, vide par défaut.
    const bare = complianceInputFromListing(
      {},
      { rentControlled: false, rentCap: null },
      {}
    )
    expect(bare).toMatchObject({
      listingId: null,
      title: 'Annonce',
      leaseType: 'unfurnished',
      inseeCode: null,
      coOwnershipAllowsRental: 'unknown',
    })
  })
})
