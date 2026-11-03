import { CriteriaFiltersSchema } from '@apart/contracts'
import type { ListingContext, SearchCriteriaSummary } from '@apart/contracts'

const now = '2026-11-03T10:00:00.000Z'

export const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-0.6, 44.8],
      [-0.58, 44.8],
      [-0.58, 44.82],
      [-0.6, 44.82],
      [-0.6, 44.8],
    ] as [number, number][],
  ],
}

/** Un critère fictif tel que l'API le renvoie. */
export function fakeCriteria(
  over: Partial<SearchCriteriaSummary> = {}
): SearchCriteriaSummary {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    createdById: null,
    name: 'Talence fictif',
    active: true,
    filters: CriteriaFiltersSchema.parse({ priceMax: 200_000 }),
    perimeterType: 'polygon',
    perimeter: { type: 'polygon', polygon: SQUARE },
    createdAt: now,
    updatedAt: now,
    listingCount: 3,
    newCount: 1,
    approximateCount: 1,
    ...over,
  }
}

/** Un contexte de fiche fictif : tram, DPE à valider, plafond, comparables. */
export function fakeContext(
  over: Partial<ListingContext> = {}
): ListingContext {
  return {
    listingId: '11111111-1111-4111-8111-111111111111',
    point: { type: 'Point', coordinates: [-0.58, 44.84] },
    precision: 'exact',
    transit: {
      nearestTram: {
        name: 'Arrêt fictif',
        mode: 'tram',
        lines: ['A', 'C'],
        distanceMeters: 240,
        point: { type: 'Point', coordinates: [-0.581, 44.841] },
      },
      nearestStop: {
        name: 'Bus fictif',
        mode: 'bus',
        lines: ['Lianes 1'],
        distanceMeters: 80,
        point: { type: 'Point', coordinates: [-0.5801, 44.8401] },
      },
    },
    rentControl: {
      status: 'ok',
      applicable: true,
      zone: {
        zone: 2,
        label: 'Secteur fictif',
        irisCode: '1',
        inseeCode: '33063',
      },
      rooms: 2,
      epoch: 'before_1946',
      furnished: false,
      row: null,
      referenceRentPerM2: 17.5,
      monthlyCap: 787.5,
      decree: {
        decreeDate: '2030-06-01',
        validFrom: '2030-07-01',
        validUntil: '2031-06-30',
        sourceUrl: null,
      },
      reasons: [],
      notes: ['Arrêté fictif.'],
    },
    dpe: {
      verified: false,
      validity: {
        level: 'unknown',
        messages: ['Date du DPE inconnue.'],
        auditRequired: null,
      },
      search: {
        status: 'multiple',
        method: 'ban_id',
        query: {},
        candidates: [
          {
            number: '2633E0000001X',
            issuedAt: '2025-01-01',
            validUntil: null,
            dpeClass: 'D',
            gesClass: 'B',
            consumption: 200,
            emissions: 10,
            surface: 45,
            floor: 2,
            address: '1 rue Fictive',
            complement: 'porte 3',
            banId: null,
            buildingType: 'appartement',
            matchScore: 0.85,
          },
        ],
        total: 2,
        searchedAt: now,
        message: '2 DPE trouvés à l’adresse : choisissez celui du logement.',
      },
    },
    market: {
      status: 'ok',
      point: { type: 'Point', coordinates: [-0.58, 44.84] },
      radiusMeters: 500,
      surface: 45,
      surfaceRange: [33.75, 56.25],
      period: { from: '2023-11-03', to: '2026-11-03' },
      stats: {
        count: 6,
        medianPricePerM2: 4250,
        p25PricePerM2: 3600,
        p75PricePerM2: 4900,
        minPricePerM2: 3000,
        maxPricePerM2: 5500,
        dispersion: 0.3,
      },
      comparables: [
        {
          id: 's1',
          mutationDate: '2024-06-12',
          price: 190_000,
          surface: 44,
          pricePerM2: 4318,
          rooms: 2,
          address: '3 rue Fictive',
          commune: 'Bordeaux',
          distanceMeters: 120,
          point: { type: 'Point', coordinates: [-0.579, 44.84] },
        },
      ],
      marketPrice: 191_250,
      listingPricePerM2: 4444,
      gapToMarket: 0.046,
      reasons: ["Données DVF disponibles jusqu'en 2024."],
      dataYears: [2024],
    },
    computedAt: now,
    ...over,
  }
}
