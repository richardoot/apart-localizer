import {
  CriteriaFiltersSchema,
  DEFAULT_CRITERIA_TOLERANCE,
} from '@apart/contracts'
import type {
  ListingContext,
  MarketTrend,
  NearbyAmenity,
  SearchCriteriaSummary,
  Surroundings,
} from '@apart/contracts'
import { marketTrend } from '@apart/domain'

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
    tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
    perimeterType: 'polygon',
    perimeter: { type: 'polygon', polygon: SQUARE },
    portals: ['leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo'],
    createdAt: now,
    updatedAt: now,
    listingCount: 3,
    newCount: 1,
    approximateCount: 1,
    fitCounts: { in: 2, to_confirm: 1, margin: 0, out: 1 },
    fitChanges: null,
    ...over,
  }
}

/** Un équipement fictif proche de l'annonce. */
export function fakeAmenity(over: Partial<NearbyAmenity> = {}): NearbyAmenity {
  return {
    kind: 'supermarket_drive',
    name: 'Drive fictif',
    brand: null,
    brandGroup: 'other',
    drive: 'yes',
    address: null,
    commune: 'Bordeaux',
    distanceMeters: 900,
    point: { type: 'Point', coordinates: [-0.585, 44.845] },
    source: 'osm',
    externalId: 'node/1',
    details: {
      facilityType: null,
      covered: null,
      lengthMeters: null,
      lanes: null,
      surfaceType: null,
      access: [],
      driveEvidence: 'name=Drive fictif',
      sourceUrl: null,
    },
    ...over,
  }
}

/** Quartier et équipements fictifs (lot 11). */
export function fakeSurroundings(
  over: Partial<Surroundings> = {}
): Surroundings {
  return {
    neighbourhood: {
      status: 'ok',
      value: {
        name: 'Quartier fictif',
        kind: 'quartier',
        code: 'Q1',
        parent: 'Grand quartier fictif',
        commune: 'Bordeaux',
        inseeCode: '33063',
        source: 'Source fictive des quartiers',
      },
      reasons: [],
    },
    athleticsTrack: {
      status: 'ok',
      nearest: fakeAmenity({
        kind: 'athletics_track',
        name: 'Stade fictif',
        brandGroup: null,
        drive: null,
        distanceMeters: 1250,
        source: 'res',
        externalId: 'E1',
        point: { type: 'Point', coordinates: [-0.57, 44.835] },
        details: {
          facilityType: 'Anneau d’athlétisme fictif',
          covered: false,
          lengthMeters: 400,
          lanes: 6,
          surfaceType: null,
          access: ['Clubs', 'Scolaires'],
          driveEvidence: null,
          sourceUrl: null,
        },
      }),
      approximate: false,
      reasons: [],
    },
    supermarkets: {
      status: 'ok',
      preferred: {
        carrefour: fakeAmenity({
          name: 'Carrefour Drive fictif',
          brand: 'Carrefour Drive',
          brandGroup: 'carrefour',
          distanceMeters: 1800,
          externalId: 'node/2',
          point: { type: 'Point', coordinates: [-0.59, 44.85] },
        }),
        auchan: null,
        intermarche: fakeAmenity({
          name: 'Intermarché fictif',
          brand: 'Intermarché Super',
          brandGroup: 'intermarche',
          drive: 'to_verify',
          distanceMeters: 2600,
          externalId: 'way/3',
          point: { type: 'Point', coordinates: [-0.6, 44.83] },
          details: {
            facilityType: null,
            covered: null,
            lengthMeters: null,
            lanes: null,
            surfaceType: null,
            access: [],
            driveEvidence: 'drive_through=yes',
            sourceUrl: null,
          },
        }),
      },
      nearest: fakeAmenity(),
      approximate: false,
      reasons: ['Aucun drive Auchan à moins de 20 km à vol d’oiseau.'],
    },
    fitnessPark: {
      status: 'unavailable',
      nearest: null,
      approximate: false,
      reasons: ['Salles Fitness Park : source non importée, non disponible.'],
    },
    searchRadiusMeters: 20_000,
    computedAt: now,
    ...over,
  }
}

/** Médianes fictives d'un secteur : hausse jusqu'en 2022, baisse ensuite ; 2026 s'arrête en juin. */
export const FAKE_TREND_MEDIANS: Record<number, number> = {
  2015: 3000,
  2016: 3150,
  2017: 3500,
  2018: 3900,
  2019: 4100,
  2020: 4200,
  2021: 4500,
  2022: 4800,
  2023: 4600,
  2024: 4400,
  2025: 4200,
  2026: 4150,
}

/** Lot 29 : une tendance fictive, calculée par `domain` (douze ventes par année). */
export function fakeTrend(
  medians: Record<number, number> = FAKE_TREND_MEDIANS,
  radiusMeters = 500
): MarketTrend {
  const years = Object.keys(medians).map(Number)
  const last = Math.max(...years)
  return marketTrend({
    byYear: years.map(year => ({
      year,
      pricesPerM2: Array.from({ length: 12 }, () => medians[year] as number),
    })),
    dataYears: years.map(year => ({
      year,
      lastDate: year === last ? `${year}-06-30` : `${year}-12-30`,
    })),
    radiusMeters,
  })
}

/** Un contexte de fiche fictif : tram, DPE à valider, plafond, comparables. */
export function fakeContext(
  over: Partial<ListingContext> = {}
): ListingContext {
  return {
    listingId: '11111111-1111-4111-8111-111111111111',
    point: { type: 'Point', coordinates: [-0.58, 44.84] },
    precision: 'exact',
    placement: null,
    approximation: { approximate: false, origin: null, note: null },
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
      approximate: false,
      reasons: [],
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
    // Lot 28 : loyers observés fictifs (aucune valeur réelle).
    rentObservatory: {
      status: 'ok',
      zone: { zone: 2, label: 'Zone 2' },
      approximate: false,
      rooms: 2,
      medianPerM2: 15,
      q1PerM2: 13,
      q3PerM2: 17,
      observations: 400,
      monthlyMedian: 675,
      monthlyQ1: 585,
      monthlyQ3: 765,
      targetRent: 750,
      gapToMedian: 750 / 675 - 1,
      position: 'within',
      year: 2030,
      observedAt: '2030-01-01',
      sourceUrl: null,
      attribution: 'Observatoire fictif des loyers',
      reasons: [],
      notes: ['Loyers fictifs : un indicateur, pas un plafond.'],
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
      trend: fakeTrend(),
    },
    surroundings: fakeSurroundings(),
    computedAt: now,
    ...over,
  }
}
