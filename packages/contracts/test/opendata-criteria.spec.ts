import { describe, expect, it } from 'vitest'
import {
  BORDEAUX_INSEE_CODE,
  BORDEAUX_METROPOLE_COMMUNES,
  BboxQuerySchema,
  CriteriaFiltersSchema,
  EvaluatedListingSchema,
  GeocodeLookupSchema,
  GeocodeQuerySchema,
  ListingOpenDataContextSchema,
  MarketContextRequestSchema,
  McpCreateSearchCriteriaInputSchema,
  McpUpdateSearchCriteriaInputSchema,
  PerimeterInputSchema,
  RentReferenceTableSchema,
  SearchCriteriaUpdateSchema,
} from '../src/index.js'

const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-0.6, 44.8],
      [-0.59, 44.8],
      [-0.59, 44.81],
      [-0.6, 44.8],
    ],
  ],
}

describe('critères de recherche (lot 4)', () => {
  it('filtres par défaut : rien de contraint, statuts actifs implicites', () => {
    expect(CriteriaFiltersSchema.parse({})).toEqual({
      communes: [],
      priceMax: null,
      priceMin: null,
      surfaceMin: null,
      roomsMin: null,
      dpeMax: null,
      verdicts: [],
      statuses: [],
      maxTramDistanceMeters: null,
    })
    expect(
      CriteriaFiltersSchema.safeParse({ maxTramDistanceMeters: 10 }).success
    ).toBe(false)
  })

  it('périmètre en entrée : isochrone par point ou adresse, jamais sans les deux', () => {
    expect(
      PerimeterInputSchema.safeParse({
        type: 'isochrone',
        address: '1 place de la Bourse, Bordeaux',
        mode: 'walking',
        durationMinutes: 15,
      }).success
    ).toBe(true)
    expect(
      PerimeterInputSchema.safeParse({
        type: 'isochrone',
        origin: { type: 'Point', coordinates: [-0.57, 44.84] },
        mode: 'cycling',
        durationMinutes: 10,
      }).success
    ).toBe(true)
    const missing = PerimeterInputSchema.safeParse({
      type: 'isochrone',
      mode: 'walking',
      durationMinutes: 15,
    })
    expect(missing.success).toBe(false)
    expect(
      PerimeterInputSchema.safeParse({
        type: 'isochrone',
        address: 'x y z',
        mode: 'transit',
        durationMinutes: 15,
      }).success
    ).toBe(false)
    expect(
      PerimeterInputSchema.safeParse({ type: 'polygon', polygon: SQUARE })
        .success
    ).toBe(true)
  })

  it('création MCP : nom obligatoire, filtres et périmètre facultatifs', () => {
    const created = McpCreateSearchCriteriaInputSchema.parse({
      name: '  Talence à pied  ',
    })
    expect(created.name).toBe('Talence à pied')
    expect(created.perimeter).toBeNull()
    expect(created.filters.statuses).toEqual([])
  })

  it('mise à jour : seuls les champs donnés, filtres sans valeurs par défaut', () => {
    const update = SearchCriteriaUpdateSchema.parse({
      filters: { priceMax: 200_000 },
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(update).toEqual({
      filters: { priceMax: 200_000 },
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    const mcp = McpUpdateSearchCriteriaInputSchema.parse({
      criteriaId: '11111111-1111-4111-8111-111111111111',
      active: false,
    })
    expect(mcp).toEqual({
      criteriaId: '11111111-1111-4111-8111-111111111111',
      active: false,
    })
  })
})

describe('données ouvertes (lot 4)', () => {
  it('les 28 communes de Bordeaux Métropole, codes uniques', () => {
    expect(BORDEAUX_METROPOLE_COMMUNES).toHaveLength(28)
    const codes = BORDEAUX_METROPOLE_COMMUNES.map(c => c.inseeCode)
    expect(new Set(codes).size).toBe(28)
    expect(codes).toContain(BORDEAUX_INSEE_CODE)
    expect(codes.every(code => /^33\d{3}$/.test(code))).toBe(true)
  })

  it('table de loyers de référence : au moins une ligne, dates ISO', () => {
    const base = {
      territory: 'bordeaux',
      inseeCodes: ['33063'],
      housingType: 'apartment',
      decreeDate: '2030-06-01',
      validFrom: '2030-07-01',
      validUntil: null,
      source: {
        url: null,
        file: 'x.xlsx',
        sha256: 'abc',
        importedAt: '2030-07-01T00:00:00.000Z',
      },
      rows: [
        {
          zone: 1,
          rooms: 4,
          epoch: 'after_1990',
          furnished: true,
          referenceRent: 10,
          upperRent: 12,
          lowerRent: 7,
        },
      ],
    }
    expect(RentReferenceTableSchema.parse(base).source.crossCheck).toBeNull()
    expect(
      RentReferenceTableSchema.safeParse({ ...base, rows: [] }).success
    ).toBe(false)
    expect(
      RentReferenceTableSchema.safeParse({
        ...base,
        rows: [{ ...base.rows[0], rooms: 5 }],
      }).success
    ).toBe(false)
  })

  it('contexte de marché : annonce, adresse ou point', () => {
    expect(MarketContextRequestSchema.safeParse({}).success).toBe(false)
    expect(
      MarketContextRequestSchema.safeParse({
        point: { type: 'Point', coordinates: [-0.57, 44.84] },
        surface: 40,
      }).success
    ).toBe(true)
    expect(
      MarketContextRequestSchema.safeParse({ address: 'Bordeaux' }).success
    ).toBe(true)
  })

  it('emprise de carte lue depuis la chaîne de requête', () => {
    expect(BboxQuerySchema.parse({ bbox: '-0.7,44.7,-0.5,44.9' }).bbox).toEqual(
      [-0.7, 44.7, -0.5, 44.9]
    )
    expect(BboxQuerySchema.parse({}).bbox).toBeUndefined()
    expect(BboxQuerySchema.safeParse({ bbox: '1,2,3' }).success).toBe(false)
  })

  it('recherche d’adresse pour recentrer la carte : texte borné, lieu ou rien', () => {
    expect(GeocodeQuerySchema.parse({ q: '  Talence  ' }).q).toBe('Talence')
    expect(GeocodeQuerySchema.safeParse({ q: 'ab' }).success).toBe(false)
    expect(GeocodeQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(
      false
    )
    expect(
      GeocodeLookupSchema.parse({
        query: 'Talence',
        status: 'found',
        result: {
          point: { type: 'Point', coordinates: [-0.59, 44.81] },
          label: 'Talence',
          precision: 'commune',
          commune: 'Talence',
        },
      }).result?.precision
    ).toBe('commune')
    expect(
      GeocodeLookupSchema.safeParse({
        query: 'Nulle part',
        status: 'lost',
        result: null,
      }).success
    ).toBe(false)
  })

  it("instantané d'une annonce : tout facultatif", () => {
    expect(ListingOpenDataContextSchema.parse({})).toEqual({
      market: null,
      dpe: null,
      rentControl: null,
      transit: null,
    })
  })

  it('une annonce vue porte ses critères (vide par défaut)', () => {
    const shape = EvaluatedListingSchema.shape
    expect(shape.criteriaMatches.parse(undefined)).toEqual([])
    expect(shape.criteriaChanges.parse(undefined)).toBeNull()
  })
})
