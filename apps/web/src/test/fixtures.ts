import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type {
  EvaluatedListing,
  Listing,
  Member,
  Opinion,
  Task,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  rentalChecks,
  targetPrice,
} from '@apart/domain'

const now = '2026-11-03T10:00:00.000Z'

export const MEMBERS: Member[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    handle: 'richard',
    displayName: 'Richard',
    email: 'richard@e2e.invalid',
    authUserId: 'sb-richard',
    role: 'owner',
    createdAt: now,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    handle: 'chloe',
    displayName: 'Chloé',
    email: 'chloe@e2e.invalid',
    authUserId: null,
    role: 'member',
    createdAt: now,
  },
]

/** Une annonce fictive complète, telle que l'API la renvoie (aucune donnée réelle). */
export function fakeListing(over: Partial<Listing> = {}): Listing {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    source: 'leboncoin',
    sourceLabel: null,
    url: 'https://exemple.invalid/annonce/1',
    externalId: null,
    title: 'T2 fictif',
    publishedAt: null,
    sourceUpdatedAt: null,
    description: null,
    notes: 'PV à demander',
    price: 200_000,
    feesAmount: null,
    feesPercent: null,
    feesPayer: null,
    surface: 45,
    surfaceTotal: null,
    rooms: 2,
    bedrooms: 1,
    floor: null,
    floorsTotal: null,
    floorLabel: '3e avec ascenseur',
    elevator: true,
    constructionYear: 1975,
    constructionPeriod: null,
    dpeClass: 'D',
    dpeConsumption: null,
    gesClass: null,
    dpeDate: null,
    heatingType: null,
    heatingCollective: null,
    outdoor: null,
    parking: null,
    cellar: null,
    orientation: null,
    condition: null,
    annualCharges: 1200,
    nonRecoverableChargesMonthly: null,
    lotsCount: null,
    proceedings: null,
    votedWorks: null,
    syndic: null,
    propertyTax: null,
    furnitureValue: 5000,
    location: {
      addressRaw: '1 rue Fictive',
      addressNormalized: null,
      banId: null,
      commune: 'Talence',
      inseeCode: null,
      district: 'Forum',
      point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      precision: 'exact',
    },
    status: 'to_study',
    discardReason: null,
    discardedAt: null,
    renovation: {
      active: true,
      level: 'refresh',
      durationMonths: 1,
      notes: null,
      items: [
        { id: 'i1', label: 'Peinture', amount: 2500, position: 0 },
        { id: 'i2', label: 'Sols', amount: null, position: 1 },
      ],
    },
    rentalPlan: {
      year: null,
      leaseType: 'unfurnished',
      rentControl: 'auto',
      referenceRentPerM2: null,
      targetRent: 750,
      marketRent: null,
      comparables: [],
      demand: 'strong',
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
      notes: null,
    },
    assumptionsOverride: { downPayment: 60_000, interestRate: 0.032 },
    fieldSources: {},
    createdById: null,
    createdAt: now,
    updatedAt: now,
    views: [],
    ...over,
  }
}

export function fakeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    listingId: '11111111-1111-4111-8111-111111111111',
    label: 'Demander la taxe foncière',
    done: false,
    doneAt: null,
    assigneeId: null,
    origin: 'default',
    position: 0,
    createdAt: now,
    ...over,
  }
}

export function fakeOpinion(over: Partial<Opinion> = {}): Opinion {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    listingId: '11111111-1111-4111-8111-111111111111',
    memberId: MEMBERS[1]?.id ?? '',
    rating: 4,
    text: 'Lumineux',
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

/** Une annonce vue, évaluée par le vrai paquet `domain` avec les hypothèses par défaut. */
export function fakeEvaluated(
  listingOver: Partial<Listing> = {},
  over: Partial<Omit<EvaluatedListing, 'listing' | 'evaluation'>> = {}
): EvaluatedListing {
  const listing = fakeListing(listingOver)
  const assumptions = DEFAULT_ASSUMPTIONS
  const financials = financialsFromListing(listing)
  const metrics = compute(financials, assumptions)
  return {
    listing,
    evaluation: {
      metrics,
      rental: rentalChecks(
        {
          dpeClass: listing.dpeClass,
          year: listing.rentalPlan?.year ?? null,
          marketRent: listing.rentalPlan?.marketRent ?? null,
          demand: listing.rentalPlan?.demand ?? null,
          coOwnershipAllowsRental:
            listing.rentalPlan?.coOwnershipAllowsRental ?? 'unknown',
          decencyCompliant: listing.rentalPlan?.decencyCompliant ?? 'unknown',
          rentalPermitRequired:
            listing.rentalPlan?.rentalPermitRequired ?? 'unknown',
        },
        metrics,
        assumptions
      ),
      targetPrice: targetPrice(financials, assumptions),
    },
    distanceMeters: null,
    isNewForMe: false,
    opinions: [],
    tasks: [fakeTask()],
    priceEvents: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        listingId: listing.id,
        occurredAt: now,
        oldPrice: null,
        newPrice: listing.price,
        source: 'user',
      },
    ],
    ...over,
  }
}
