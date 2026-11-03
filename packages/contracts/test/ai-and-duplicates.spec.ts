import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  AI_MAX_IMAGE_BYTES,
  AiListingExtractionSchema,
  DuplicateProbeSchema,
  ExtractionImageSchema,
  ExtractionRequestSchema,
  ListingCreateResultSchema,
  ListingCreateSchema,
  ListingInputSchema,
  ListingMetricsSchema,
  McpCreateListingInputSchema,
  REQUIRED_LISTING_FIELDS,
  base64Bytes,
  listingSourceFromUrl,
  missingListingFields,
  normalizeAddress,
  normalizeCommune,
  normalizeUrl,
  splitListingCreate,
  withinPercent,
} from '../src/index.js'

describe('normalisations pour les doublons', () => {
  it('réduit une URL à ce qui identifie la page', () => {
    expect(
      normalizeUrl(
        'http://WWW.Exemple.invalid/annonce/123/?utm_source=mail&b=2&a=1#photos'
      )
    ).toBe('https://exemple.invalid/annonce/123?a=1&b=2')
    expect(normalizeUrl('https://exemple.invalid/')).toBe(
      'https://exemple.invalid/'
    )
    expect(normalizeUrl('ftp://exemple.invalid/x')).toBeNull()
    expect(normalizeUrl('pas une url')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
  })

  it('déduit le portail du nom d’hôte', () => {
    expect(listingSourceFromUrl('https://www.leboncoin.fr/ad/1')).toBe(
      'leboncoin'
    )
    expect(listingSourceFromUrl('https://www.seloger.com/x')).toBe('seloger')
    expect(listingSourceFromUrl('https://www.bienici.com/x')).toBe('bienici')
    expect(listingSourceFromUrl('https://www.pap.fr/x')).toBe('pap')
    expect(listingSourceFromUrl('https://agence-fictive.invalid/x')).toBe(
      'agence'
    )
    expect(listingSourceFromUrl(null)).toBe('autre')
    expect(listingSourceFromUrl('nope')).toBe('autre')
  })

  it('rend deux écritures d’une même adresse identiques', () => {
    expect(normalizeAddress('12 Rue du Forum, 33400 Talence')).toBe(
      normalizeAddress('Talence – 12 r. du Forum')
    )
    expect(normalizeAddress('5 bis Av. de la Libération')).toBe(
      normalizeAddress('5 avenue Libération')
    )
    expect(normalizeAddress('   ')).toBeNull()
    expect(normalizeAddress(null)).toBeNull()
    expect(normalizeAddress('33400')).toBeNull()
  })

  it('compare les communes sans accents ni tirets', () => {
    expect(normalizeCommune("Villenave-d'Ornon")).toBe('villenave d ornon')
    expect(normalizeCommune('St-Médard')).toBe('saint medard')
    expect(normalizeCommune('BÈGLES')).toBe('begles')
    expect(normalizeCommune('')).toBeNull()
  })

  it('tolérance en pourcentage', () => {
    expect(withinPercent(100, 103, 0.03)).toBe(true)
    expect(withinPercent(100, 104, 0.03)).toBe(false)
    expect(withinPercent(null, 100, 0.05)).toBe(false)
    expect(withinPercent(0, 100, 0.05)).toBe(false)
  })

  it('un critère au moins pour chercher des doublons', () => {
    expect(DuplicateProbeSchema.safeParse({}).success).toBe(false)
    expect(
      DuplicateProbeSchema.safeParse({ commune: 'Talence', price: 1 }).success
    ).toBe(false)
    expect(
      DuplicateProbeSchema.safeParse({
        commune: 'Talence',
        price: 200_000,
        surface: 45,
      }).success
    ).toBe(true)
    expect(
      DuplicateProbeSchema.safeParse({ url: 'https://exemple.invalid/a' })
        .success
    ).toBe(true)
  })
})

describe('indicateurs indéfinis', () => {
  it('un prix au m² ou un rendement NaN passe le schéma des indicateurs', () => {
    const shape = ListingMetricsSchema.shape
    expect(shape.pricePerM2.safeParse(Number.NaN).success).toBe(true)
    expect(shape.grossYield.safeParse(Number.NaN).success).toBe(true)
    expect(shape.totalCost.safeParse(Number.NaN).success).toBe(false)
  })
})

describe('demande d’extraction', () => {
  const png = Buffer.from('fake-png-bytes').toString('base64')

  it('exige un texte ou une capture, et des valeurs par défaut', () => {
    expect(ExtractionRequestSchema.safeParse({}).success).toBe(false)
    expect(ExtractionRequestSchema.safeParse({ text: '   ' }).success).toBe(
      false
    )
    const parsed = ExtractionRequestSchema.parse({ text: 'T2 Talence' })
    expect(parsed.quality).toBe('precise')
    expect(parsed.images).toEqual([])
    expect(parsed.url).toBeNull()
    const withImage = ExtractionRequestSchema.parse({
      images: [{ mediaType: 'image/png', data: png }],
    })
    expect(withImage.images).toHaveLength(1)
  })

  it('refuse une image trop grande, un base64 invalide ou un type inconnu', () => {
    expect(base64Bytes(png)).toBe(14)
    expect(base64Bytes('QQ==')).toBe(1)
    const tooBig = 'A'.repeat(Math.ceil((AI_MAX_IMAGE_BYTES + 3) / 3) * 4)
    expect(
      ExtractionImageSchema.safeParse({ mediaType: 'image/png', data: tooBig })
        .success
    ).toBe(false)
    expect(
      ExtractionImageSchema.safeParse({
        mediaType: 'image/png',
        data: 'data:image/png;base64,QQ==',
      }).success
    ).toBe(false)
    expect(
      ExtractionImageSchema.safeParse({ mediaType: 'image/bmp', data: png })
        .success
    ).toBe(false)
  })
})

describe('sortie structurée du modèle', () => {
  it('ne contient que des clés obligatoires et des valeurs nullables', () => {
    const json = z.toJSONSchema(AiListingExtractionSchema) as {
      properties: Record<string, { properties?: Record<string, unknown> }>
      required: string[]
    }
    const keys = Object.keys(json.properties)
    expect(json.required.sort()).toEqual(keys.sort())
    for (const key of keys) {
      if (key === 'remarks') continue
      const field = json.properties[key]
      expect(Object.keys(field?.properties ?? {}).sort()).toEqual([
        'confidence',
        'evidence',
        'value',
      ])
    }
  })

  it('accepte une réponse où tout est null', () => {
    const empty = Object.fromEntries(
      Object.keys(AiListingExtractionSchema.shape)
        .filter(key => key !== 'remarks')
        .map(key => [key, { value: null, confidence: 0, evidence: null }])
    )
    const parsed = AiListingExtractionSchema.safeParse({
      ...empty,
      remarks: [],
    })
    expect(parsed.success).toBe(true)
  })
})

describe('champs manquants', () => {
  const base = ListingInputSchema.parse({
    title: 'T2 fictif',
    price: 200_000,
    surface: 45,
    dpeClass: 'D',
    floor: 2,
    constructionYear: 1975,
    annualCharges: 1200,
    propertyTax: 800,
    location: { addressRaw: '1 rue Fictive', commune: 'Talence' },
    rentalPlan: { targetRent: 750 },
  })

  it('rien ne manque quand tout est là', () => {
    expect(missingListingFields(base)).toEqual([])
  })

  it('liste les absents dans l’ordre des champs indispensables', () => {
    const input = ListingInputSchema.parse({ title: 'T2', price: 1 })
    const missing = missingListingFields(input)
    expect(missing.map(m => m.field)).toEqual(
      REQUIRED_LISTING_FIELDS.map(f => f.field)
    )
    expect(missing[0]).toMatchObject({
      reason: 'missing',
      taskLabel: "Demander l'adresse exacte du bien",
    })
  })

  it('une valeur IA peu sûre est douteuse, une valeur sûre ou saisie non', () => {
    const fieldSources = {
      surface: { source: 'ai' as const, confidence: 0.3 },
      dpeClass: { source: 'ai' as const, confidence: 0.95 },
      floor: { source: 'user' as const, confidence: 0.1 },
    }
    const missing = missingListingFields(base, fieldSources)
    expect(missing).toEqual([
      {
        field: 'surface',
        label: 'Surface Carrez',
        reason: 'doubtful',
        confidence: 0.3,
        taskLabel: 'Demander la surface loi Carrez',
      },
    ])
    expect(missingListingFields(base, fieldSources, 0.2)).toEqual([])
  })
})

describe('création avec doublons', () => {
  it('sépare ignoreDuplicates de l’annonce et le journalise par défaut à faux', () => {
    const body = ListingCreateSchema.parse({ title: 'T2', price: 1 })
    expect(body.ignoreDuplicates).toBe(false)
    const { input, ignoreDuplicates } = splitListingCreate({
      ...body,
      ignoreDuplicates: true,
    })
    expect(ignoreDuplicates).toBe(true)
    expect('ignoreDuplicates' in input).toBe(false)
    expect(ListingInputSchema.safeParse(input).success).toBe(true)
  })

  it('le MCP create_listing accepte la même forme', () => {
    const parsed = McpCreateListingInputSchema.parse({
      listing: { title: 'T2', price: 1, ignoreDuplicates: true },
    })
    expect(parsed.listing.ignoreDuplicates).toBe(true)
    expect(parsed.provenance).toBe('ai')
  })

  it('la réponse de création porte doublons et tâches, vides par défaut', () => {
    const shape = ListingCreateResultSchema.shape
    expect(shape.duplicates).toBeDefined()
    expect(shape.createdTasks).toBeDefined()
  })
})
