/**
 * Lot 32 (ADR 0047) : ce que Claude relève sur la page d'une annonce, ce
 * qu'il n'a pas relevé, les photos du portail dans le brouillon, la fusion
 * et le journal. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ExplorationCandidateSchema, PORTAL_PHOTOS_MAX } from '@apart/contracts'
import {
  READING_FACTS,
  candidateWarnings,
  connectorReadingInstructions,
  describeReadingGaps,
  draftInputFromCandidate,
  formatActivityValue,
  mergeFieldPlan,
  readingChecklist,
  readingGaps,
} from '../src/index.js'

const photo = (n: number) => `https://img.example.test/annonce/${n}.jpg`
const NOW = new Date('2026-11-14T10:00:00.000Z')

const complete = {
  surface: 62,
  rooms: 3,
  floor: 2,
  dpeClass: 'C' as const,
  annualCharges: 1440,
  propertyTax: 900,
  lotsCount: 30,
  heatingType: 'gaz',
  constructionYear: 1970,
  feesPercent: 0.04,
  location: { addressRaw: '1 rue Fictive', district: null },
  description: 'Appartement fictif.',
  portalPhotos: [photo(1)],
}

describe('readingGaps', () => {
  it('rien ne manque à une fiche complète', () => {
    expect(readingGaps(complete)).toEqual([])
    expect(describeReadingGaps(readingGaps(complete))).toBeNull()
  })

  it('dit les charges, la taxe foncière et les photos manquantes, dans l’ordre', () => {
    const gaps = readingGaps({
      ...complete,
      annualCharges: null,
      propertyTax: null,
      portalPhotos: [],
    })
    expect(gaps.map(g => g.key)).toEqual([
      'annualCharges',
      'propertyTax',
      'portalPhotos',
    ])
    const line = describeReadingGaps(gaps)
    expect(line).toContain(
      'Non relevé : charges de copropriété, taxe foncière et photos.'
    )
    expect(line).toContain('update_listing')
    expect(line).toContain('sans l’estimer')
    expect(describeReadingGaps(gaps, 'update_draft')).toContain('update_draft')
  })

  it('un fait voisin suffit : étage en texte, époque, quartier, honoraires à la charge', () => {
    expect(
      readingGaps({
        ...complete,
        floor: null,
        floorLabel: '2e sur 4',
        constructionYear: null,
        constructionPeriod: '1971-1990',
        feesPercent: null,
        feesPayer: 'seller',
        location: { addressRaw: '  ', district: 'Saint-Fictif' },
      })
    ).toEqual([])
    expect(
      readingGaps({ ...complete, location: null }).map(g => g.key)
    ).toEqual(['place'])
    expect(
      readingGaps({ ...complete, description: '   ' }).map(g => g.key)
    ).toEqual(['description'])
  })

  it('une fiche vide manque de tout', () => {
    expect(readingGaps({})).toHaveLength(READING_FACTS.length)
  })
})

describe('consignes de lecture', () => {
  it('la liste dit où trouver les charges et comment les rendre annuelles', () => {
    const list = readingChecklist()
    expect(list.split('\n')).toHaveLength(READING_FACTS.length)
    expect(list).toContain('« 120 €/mois » → 1 440')
    expect(list).toContain('fieldSources.propertyTax.evidence')
    expect(list).toContain(`${PORTAL_PHOTOS_MAX} au plus`)
  })

  it('les instructions du serveur : ouvrir la page, tout relever, ne rien estimer', () => {
    const text = connectorReadingInstructions()
    expect(text).toContain('ouvre la page de l’annonce')
    expect(text).toContain('N’invente et n’estime rien')
    expect(text).toContain('Non relevé')
    expect(text).toContain(readingChecklist())
  })
})

describe('brouillon né d’une page ouverte', () => {
  const base = {
    url: 'https://www.example.test/annonce/1',
    portal: 'leboncoin' as const,
    title: 'T3 fictif',
    price: 210_000,
  }

  it('reprend la description entière, les photos et les faits de la page', () => {
    const candidate = ExplorationCandidateSchema.parse({
      ...base,
      opened: true,
      excerpt: 'Extrait court.',
      description: 'Description entière, appel au 06 12 34 56 78.',
      photos: [photo(1), photo(2)],
      floor: 3,
      elevator: true,
      heatingType: 'gaz',
      lotsCount: 40,
      feesPercent: 0.04,
      feesPayer: 'buyer',
      annualCharges: 1200,
      propertyTax: 850,
    })
    const { input, warnings } = draftInputFromCandidate(candidate, NOW)
    expect(input.description).toContain('Description entière')
    expect(input.description).not.toContain('06 12 34 56 78')
    expect(input.portalPhotos).toEqual([photo(1), photo(2)])
    expect(input.floor).toBe(3)
    expect(input.elevator).toBe(true)
    expect(input.heatingType).toBe('gaz')
    expect(input.lotsCount).toBe(40)
    expect(input.feesPayer).toBe('buyer')
    expect(input.fieldSources.floor?.source).toBe('listing')
    expect(input.fieldSources.portalPhotos?.source).toBe('listing')
    expect(input.fieldSources.propertyTax?.evidence).toContain('Leboncoin')
    expect(warnings).not.toContain(
      'Charges de copropriété non affichées : à demander.'
    )
  })

  it('sans page ouverte : l’extrait, aucune photo, pas d’alerte sur les charges', () => {
    const candidate = ExplorationCandidateSchema.parse({
      ...base,
      excerpt: 'Extrait court.',
    })
    const { input, warnings } = draftInputFromCandidate(candidate, NOW)
    expect(input.description).toBe('Extrait court.')
    expect(input.portalPhotos).toEqual([])
    expect(input.floor).toBeNull()
    expect(input.fieldSources).not.toHaveProperty('portalPhotos')
    expect(warnings.join(' ')).not.toContain('Charges')
  })

  it('page ouverte sans charges ni taxe foncière : à demander', () => {
    const candidate = ExplorationCandidateSchema.parse({
      ...base,
      opened: true,
    })
    expect(candidateWarnings(candidate)).toEqual(
      expect.arrayContaining([
        'Charges de copropriété non affichées : à demander.',
        'Taxe foncière non affichée : à demander.',
      ])
    )
  })
})

describe('fusion et journal', () => {
  it('les photos de la fiche absorbée complètent une fiche qui n’en a pas', () => {
    const plan = mergeFieldPlan(
      { portalPhotos: [] },
      { portalPhotos: [photo(1), photo(2)] }
    )
    expect(plan.values.portalPhotos).toEqual([photo(1), photo(2)])
    expect(plan.fills[0]).toMatchObject({
      field: 'portalPhotos',
      label: 'Photos du portail',
      other: '2 photos',
    })
  })

  it('la fiche gardée garde ses photos ; une absorbée sans photo n’apporte rien', () => {
    const plan = mergeFieldPlan(
      { portalPhotos: [photo(1)] },
      { portalPhotos: [photo(2), photo(3)] }
    )
    expect(plan.values).not.toHaveProperty('portalPhotos')
    expect(plan.differences[0]).toMatchObject({
      kept: '1 photo',
      other: '2 photos',
    })
    expect(
      mergeFieldPlan({ portalPhotos: [photo(1)] }, { portalPhotos: [] }).fills
    ).toEqual([])
  })

  it('le journal compte les photos, sans leurs liens', () => {
    expect(formatActivityValue('portalPhotos', [photo(1)])).toBe('1 photo')
    expect(formatActivityValue('portalPhotos', [])).toBeNull()
  })
})
