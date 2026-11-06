import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ACTIVE_LISTING_STATUSES,
  AssumptionsOverrideSchema,
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_NOTARY_SCALE,
  DEFAULT_TASKS,
  LinearRingSchema,
  ListingFiltersSchema,
  ListingInputSchema,
  ListingListQuerySchema,
  ListingStatusChangeSchema,
  ListingUpdateSchema,
  NotaryScaleSchema,
  PerimeterSchema,
  PointRadiusSchema,
  PointSchema,
  PolygonSchema,
  RenovationInputSchema,
  RentalPlanInputSchema,
  SearchCriteriaInputSchema,
  listingFiltersFromQuery,
  sourced,
  LISTING_STATUS_LABELS,
} from '../src/index.js'

describe('GeoJSON strict', () => {
  it("accepte un point [lng, lat] et refuse l'ordre inverse hors bornes", () => {
    expect(
      PointSchema.parse({ type: 'Point', coordinates: [-0.58, 44.84] })
    ).toEqual({
      type: 'Point',
      coordinates: [-0.58, 44.84],
    })
    expect(
      PointSchema.safeParse({ type: 'Point', coordinates: [44.84, 200] })
        .success
    ).toBe(false)
    expect(
      PointSchema.safeParse({ type: 'Point', coordinates: [-0.58] }).success
    ).toBe(false)
    // strictObject : pas de clé inconnue
    expect(
      PointSchema.safeParse({ type: 'Point', coordinates: [0, 0], extra: 1 })
        .success
    ).toBe(false)
  })

  it('un anneau a quatre positions et se ferme', () => {
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]
    expect(LinearRingSchema.safeParse(ring).success).toBe(true)
    expect(LinearRingSchema.safeParse(ring.slice(0, 3)).success).toBe(false)
    expect(
      LinearRingSchema.safeParse([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]).success
    ).toBe(false)
  })

  it('un polygone a au moins un anneau', () => {
    expect(
      PolygonSchema.safeParse({ type: 'Polygon', coordinates: [] }).success
    ).toBe(false)
    expect(
      PolygonSchema.safeParse({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }).success
    ).toBe(true)
  })

  it('point et rayon : rayon entier entre 1 et 50 km', () => {
    expect(
      PointRadiusSchema.safeParse({
        longitude: 0,
        latitude: 0,
        radiusMeters: 500,
      }).success
    ).toBe(true)
    expect(
      PointRadiusSchema.safeParse({
        longitude: 0,
        latitude: 0,
        radiusMeters: 0,
      }).success
    ).toBe(false)
    expect(
      PointRadiusSchema.safeParse({
        longitude: 0,
        latitude: 0,
        radiusMeters: 10.5,
      }).success
    ).toBe(false)
    expect(
      PointRadiusSchema.safeParse({
        longitude: 0,
        latitude: 0,
        radiusMeters: 60_000,
      }).success
    ).toBe(false)
  })
})

describe('hypothèses', () => {
  const minimal = {
    downPayment: 40_000,
    interestRate: 0.0365,
    durationYears: 25,
    insuranceRate: 0.001,
    notaryRate: 0.075,
    vacancyMonths: 0.5,
    fixedCostsAnnual: 1050,
    grossYieldThreshold: 0.055,
    maxMonthlyEffort: 150,
  }

  it('applique les marges et seuils par défaut', () => {
    const a = AssumptionsSchema.parse(minimal)
    expect(a.grossYieldMargin).toBe(0.007)
    expect(a.effortMargin).toBe(80)
    expect(a.negotiableDiscount).toBe(0.05)
    expect(a.tightDiscount).toBe(0.1)
    expect(a.targetCriteria).toEqual(['gross_yield', 'effort'])
    expect(a.rentalYear).toBe(2028)
    expect(a.netYieldThreshold).toBeNull()
  })

  it('refuse un taux en pourcentage (hors de [0, 1]) et une durée nulle', () => {
    expect(
      AssumptionsSchema.safeParse({ ...minimal, interestRate: 3.65 }).success
    ).toBe(false)
    expect(
      AssumptionsSchema.safeParse({ ...minimal, durationYears: 0 }).success
    ).toBe(false)
    expect(
      AssumptionsSchema.safeParse({ ...minimal, vacancyMonths: 13 }).success
    ).toBe(false)
  })

  it('la surcharge est partielle', () => {
    expect(AssumptionsOverrideSchema.parse({ downPayment: 1 })).toEqual({
      downPayment: 1,
    })
    expect(
      AssumptionsOverrideSchema.safeParse({ downPayment: -1 }).success
    ).toBe(false)
  })

  it('chaque champ porte une description, avec son unité quand il est numérique', () => {
    const unwrap = (schema: z.ZodType): z.ZodType => {
      let inner: z.ZodType = schema
      for (;;) {
        if (inner instanceof z.ZodDefault)
          inner = inner.removeDefault() as z.ZodType
        else if (
          inner instanceof z.ZodNullable ||
          inner instanceof z.ZodOptional
        )
          inner = inner.unwrap() as z.ZodType
        else return inner
      }
    }
    for (const [key, schema] of Object.entries(AssumptionsSchema.shape)) {
      const description = (schema as z.ZodType).description ?? ''
      expect(description, key).not.toBe('')
      if (unwrap(schema as z.ZodType) instanceof z.ZodNumber) {
        expect(/euros|fraction|années|mois|année/i.test(description), key).toBe(
          true
        )
      }
    }
    // Le barème lui-même : chaque poste numérique est décrit avec son unité.
    for (const [key, schema] of Object.entries(NotaryScaleSchema.shape)) {
      const description = (schema as z.ZodType).description ?? ''
      expect(description, key).not.toBe('')
      if (unwrap(schema as z.ZodType) instanceof z.ZodNumber) {
        expect(/euros|fraction/i.test(description), key).toBe(true)
      }
    }
    expect(DEFAULT_NOTARY_SCALE.departmentalRate).toBe(0.05)
    expect(AssumptionsSchema.parse(DEFAULT_ASSUMPTIONS).notaryMode).toBe('rate')
  })
})

describe('annonce', () => {
  it('une entrée minimale reçoit des valeurs par défaut cohérentes', () => {
    const listing = ListingInputSchema.parse({
      title: 'T3 Talence',
      price: 199_000,
    })
    expect(listing.source).toBe('autre')
    expect(listing.status).toBe('to_study')
    expect(listing.location.commune).toBeNull()
    expect(listing.location.point).toBeNull()
    expect(listing.renovation).toBeNull()
    expect(listing.rentalPlan).toBeNull()
    expect(listing.fieldSources).toEqual({})
    expect(listing.surface).toBeNull()
  })

  it('refuse un prix négatif, une surface nulle, un DPE inconnu, une URL invalide', () => {
    expect(
      ListingInputSchema.safeParse({ title: 'x', price: -1 }).success
    ).toBe(false)
    expect(
      ListingInputSchema.safeParse({ title: 'x', price: 1, surface: 0 }).success
    ).toBe(false)
    expect(
      ListingInputSchema.safeParse({ title: 'x', price: 1, dpeClass: 'H' })
        .success
    ).toBe(false)
    expect(
      ListingInputSchema.safeParse({ title: 'x', price: 1, url: 'pas une url' })
        .success
    ).toBe(false)
    expect(ListingInputSchema.safeParse({ title: '', price: 1 }).success).toBe(
      false
    )
  })

  it('accepte travaux, phase 2, provenance et point', () => {
    const listing = ListingInputSchema.parse({
      title: 'T3',
      price: 199_000,
      location: {
        commune: 'Bordeaux',
        point: { type: 'Point', coordinates: [-0.58, 44.84] },
        precision: 'exact',
      },
      renovation: {
        active: true,
        level: 'renovation',
        items: [{ label: 'Peinture', amount: 2500 }, { label: 'Cuisine' }],
      },
      rentalPlan: {
        targetRent: 850,
        demand: 'strong',
        coOwnershipAllowsRental: 'yes',
      },
      fieldSources: {
        price: { source: 'listing' },
        propertyTax: { source: 'estimated' },
      },
    })
    expect(listing.renovation?.items[1]?.amount).toBeNull()
    expect(listing.rentalPlan?.rentControl).toBe('auto')
    expect(listing.rentalPlan?.decencyCompliant).toBe('unknown')
    expect(listing.location.precision).toBe('exact')
  })

  it('la mise à jour est partielle et le changement de statut porte une raison', () => {
    expect(ListingUpdateSchema.parse({ price: 190_000 })).toEqual({
      price: 190_000,
    })
    const change = ListingStatusChangeSchema.parse({
      status: 'discarded',
      reason: 'Trop cher',
    })
    expect(change.reason).toBe('Trop cher')
    expect(
      ListingStatusChangeSchema.parse({ status: 'to_visit' }).reason
    ).toBeNull()
    expect(
      ListingStatusChangeSchema.safeParse({ status: 'vendu' }).success
    ).toBe(false)
  })

  it('statuts : libellés complets et statuts actifs', () => {
    expect(Object.keys(LISTING_STATUS_LABELS)).toHaveLength(8)
    expect(ACTIVE_LISTING_STATUSES).not.toContain('discarded')
    expect(DEFAULT_TASKS).toHaveLength(9)
  })

  it('travaux et phase 2 seuls', () => {
    expect(RenovationInputSchema.parse({}).active).toBe(false)
    expect(
      RenovationInputSchema.safeParse({ durationMonths: -1 }).success
    ).toBe(false)
    // Les comparables de loyer sont des lignes à part depuis le lot 5.
    expect('comparables' in RentalPlanInputSchema.parse({})).toBe(false)
    // Lot 19 : l'année et le type de location sont réglés pour l'espace ;
    // une entrée qui les envoie encore est acceptée, ces clés sont ignorées.
    const legacy = RentalPlanInputSchema.parse({
      year: 1999,
      leaseType: 'furnished',
      targetRent: 700,
    })
    expect(legacy).not.toHaveProperty('year')
    expect(legacy).not.toHaveProperty('leaseType')
    expect(legacy.targetRent).toBe(700)
  })
})

describe('Sourced<T>', () => {
  it('porte valeur, source, confiance et extrait', () => {
    const schema = sourced(z.number())
    const value = schema.parse({
      value: 62,
      source: 'ai',
      confidence: 0.9,
      evidence: '62 m² Carrez',
    })
    expect(value.value).toBe(62)
    expect(schema.safeParse({ value: 62, source: 'rumeur' }).success).toBe(
      false
    )
    expect(
      schema.safeParse({ value: 62, source: 'ai', confidence: 1.5 }).success
    ).toBe(false)
  })
})

describe('filtres de liste', () => {
  it('tri et ordre par défaut', () => {
    const f = ListingFiltersSchema.parse({})
    expect(f.sort).toBe('score')
    expect(f.order).toBe('desc')
    expect(f.status).toBeUndefined()
  })

  it('depuis une chaîne de requête : listes CSV, booléens, point et rayon', () => {
    const q = ListingListQuerySchema.parse({
      status: 'to_study,to_visit',
      commune: 'Talence',
      dpe: 'C,D',
      newForMe: 'true',
      lng: '-0.58',
      lat: '44.84',
      radius: '800',
      sort: 'grossYield',
      order: 'asc',
    })
    const f = listingFiltersFromQuery(q)
    expect(f.status).toEqual(['to_study', 'to_visit'])
    expect(f.commune).toEqual(['Talence'])
    expect(f.dpe).toEqual(['C', 'D'])
    expect(f.newForMe).toBe(true)
    expect(f.near).toEqual({
      longitude: -0.58,
      latitude: 44.84,
      radiusMeters: 800,
    })
    expect(f.sort).toBe('grossYield')
    expect(f.order).toBe('asc')
  })

  it('ignore un point et rayon incomplet et refuse un statut inconnu', () => {
    const f = listingFiltersFromQuery(
      ListingListQuerySchema.parse({ lng: '1', lat: '2' })
    )
    expect(f.near).toBeUndefined()
    expect(ListingListQuerySchema.safeParse({ status: 'vendu' }).success).toBe(
      false
    )
    expect(ListingListQuerySchema.safeParse({ radius: '0' }).success).toBe(
      false
    )
    expect(ListingListQuerySchema.parse({ status: '' }).status).toBeUndefined()
    expect(ListingListQuerySchema.parse({ newForMe: '0' }).newForMe).toBe(false)
    expect(
      ListingListQuerySchema.parse({ status: ['to_study'] }).status
    ).toEqual(['to_study'])
  })
})

describe('critères de recherche', () => {
  it('périmètre discriminé par type', () => {
    expect(
      PerimeterSchema.safeParse({
        type: 'point_radius',
        longitude: 0,
        latitude: 0,
        radiusMeters: 500,
      }).success
    ).toBe(true)
    const polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    }
    expect(
      PerimeterSchema.safeParse({ type: 'polygon', polygon }).success
    ).toBe(true)
    expect(
      PerimeterSchema.safeParse({
        type: 'isochrone',
        polygon,
        params: {
          origin: { type: 'Point', coordinates: [0, 0] },
          mode: 'walking',
          durationMinutes: 15,
        },
      }).success
    ).toBe(true)
    expect(PerimeterSchema.safeParse({ type: 'circle' }).success).toBe(false)
  })

  it('entrée minimale : actif, filtres vides, pas de périmètre', () => {
    const c = SearchCriteriaInputSchema.parse({ name: 'Talence Forum' })
    expect(c.active).toBe(true)
    expect(c.filters.communes).toEqual([])
    expect(c.perimeter).toBeNull()
  })
})
