import { describe, expect, it } from 'vitest'
import { missingListingFields } from '@apart/contracts'
import {
  SAMPLE_LISTING_TEXT,
  emptyExtraction,
  sampleExtraction,
} from '../../test/fixtures/ai-extraction'
import { extractionToListing } from './extraction.mapper'

const now = new Date('2026-11-03T10:00:00.000Z')

describe('extractionToListing', () => {
  it('traduit une lecture complète en annonce du contrat, provenance IA par champ', () => {
    const { listing, warnings } = extractionToListing(sampleExtraction(), {
      url: 'https://agence-fictive.invalid/annonce/AGF-12345',
      sourceText: SAMPLE_LISTING_TEXT,
      now,
    })
    expect(listing.title).toBe('T2 Talence Forum, 3e étage avec balcon')
    expect(listing.price).toBe(189_000)
    expect(listing.surface).toBe(45.2)
    expect(listing.rooms).toBe(2)
    expect(listing.floor).toBe(3)
    expect(listing.floorsTotal).toBe(5)
    expect(listing.elevator).toBe(true)
    expect(listing.dpeClass).toBe('D')
    expect(listing.annualCharges).toBe(1320)
    expect(listing.propertyTax).toBe(780)
    expect(listing.feesPercent).toBe(0.045)
    expect(listing.feesPayer).toBe('buyer')
    expect(listing.sourceLabel).toBe('Agence Fictive Talence')
    expect(listing.externalId).toBe('AGF-12345')
    expect(listing.location.addressRaw).toBe('Rue du Forum, 33400 Talence')
    expect(listing.location.commune).toBe('Talence')
    expect(listing.location.district).toBe('Forum, tram B')
    expect(listing.location.point).toBeNull()
    expect(listing.renovation).toMatchObject({
      active: true,
      level: 'refresh',
      items: [],
      notes: 'Peintures à rafraîchir',
    })
    expect(listing.sourceText).toBe(SAMPLE_LISTING_TEXT)
    // L'URL de l'appelant prime et donne le portail.
    expect(listing.url).toBe('https://agence-fictive.invalid/annonce/AGF-12345')
    expect(listing.source).toBe('agence')
    expect(listing.fieldSources.url).toEqual({
      source: 'listing',
      confidence: 1,
      recordedAt: now.toISOString(),
    })
    expect(listing.fieldSources.price).toEqual({
      source: 'ai',
      confidence: 0.95,
      evidence: '189 000 € FAI',
      recordedAt: now.toISOString(),
    })
    expect(listing.fieldSources.annualCharges?.confidence).toBe(0.85)
    expect(listing.fieldSources.feesPayer?.evidence).toBe(
      'Honoraires inclus à charge acquéreur'
    )
    expect(listing.fieldSources.renovation?.source).toBe('ai')
    expect(listing.fieldSources.addressRaw?.confidence).toBe(0.8)
    expect(warnings).toEqual([
      'Charges indiquées par mois (110 €) : converties en annuel.',
    ])
    expect(missingListingFields(listing).map(m => m.field)).toEqual([
      'rentalPlan.targetRent',
    ])
  })

  it('une réponse vide donne une fiche de repli, à compléter', () => {
    const { listing, warnings } = extractionToListing(emptyExtraction(), {
      url: null,
      sourceText: 'rien',
      now,
    })
    expect(listing.title).toBe('Appartement')
    expect(listing.price).toBe(0)
    expect(listing.source).toBe('autre')
    expect(listing.url).toBeNull()
    expect(listing.renovation).toBeNull()
    expect(listing.fieldSources.title?.confidence).toBe(0.2)
    expect(Object.keys(listing.fieldSources)).toEqual(['title'])
    expect(warnings).toEqual([
      'Titre non trouvé : titre de repli, à compléter.',
      "Prix non trouvé dans l'annonce : à saisir.",
    ])
    expect(missingListingFields(listing)).toHaveLength(8)
  })

  it('écarte les valeurs hors contrat avec une remarque, corrige un pourcentage', () => {
    const { listing, warnings } = extractionToListing(
      sampleExtraction({
        constructionYear: { value: 999, confidence: 0.9, evidence: '999' },
        floor: { value: -9, confidence: 0.9, evidence: '-9' },
        feesPercent: { value: 5, confidence: 0.9, evidence: '5 %' },
        url: {
          value: 'pas une url',
          confidence: 0.5,
          evidence: null,
        },
        publishedAt: { value: '2026-10-28', confidence: 0.9, evidence: null },
        sourceUpdatedAt: { value: 'hier', confidence: 0.3, evidence: null },
      }),
      { url: null, sourceText: null, now }
    )
    expect(listing.constructionYear).toBeNull()
    expect(listing.floor).toBeNull()
    expect(listing.feesPercent).toBe(0.05)
    expect(listing.url).toBeNull()
    expect(listing.source).toBe('agence')
    expect(listing.publishedAt).toBe('2026-10-28T00:00:00.000Z')
    expect(listing.sourceUpdatedAt).toBeNull()
    expect(listing.sourceText).toBeNull()
    expect(
      warnings.some(w =>
        w.startsWith('Année de construction : valeur « 999 » écartée')
      )
    ).toBe(true)
    expect(warnings.some(w => w.startsWith('Étage : valeur « -9 »'))).toBe(true)
    expect(
      warnings.some(w => w.startsWith('Lien : valeur « pas une url »'))
    ).toBe(true)
    expect(missingListingFields(listing).map(m => m.field)).toEqual([
      'floor',
      'constructionYear',
      'rentalPlan.targetRent',
    ])
  })

  it('« honoraires à charge vendeur » sans montant donne feesPayer seller ; pas de travaux si rien n’est évoqué', () => {
    const { listing } = extractionToListing(
      sampleExtraction({
        feesIncluded: {
          value: false,
          confidence: 0.9,
          evidence: 'net vendeur',
        },
        worksMentioned: { value: false, confidence: 0.9, evidence: 'rénové' },
      }),
      { url: null, sourceText: null, now }
    )
    expect(listing.feesPayer).toBe('seller')
    expect(listing.renovation).toBeNull()
    expect(listing.fieldSources.renovation).toBeUndefined()
  })
})
