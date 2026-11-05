import {
  DEFAULT_ASSUMPTIONS,
  ListingInputSchema,
  NO_CRITERIA_FIT,
} from '@apart/contracts'
import type {
  DuplicateCandidate,
  EvaluatedListing,
  ExtractionResult,
  Listing,
  Member,
  Offer,
  Opinion,
  TargetPriceReport,
  Task,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  negotiationBrief,
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
    status: 'active',
    createdAt: now,
    joinedAt: now,
    removedAt: null,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    handle: 'chloe',
    displayName: 'Chloé',
    email: 'chloe@e2e.invalid',
    authUserId: null,
    role: 'member',
    status: 'active',
    createdAt: now,
    joinedAt: null,
    removedAt: null,
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
    dpeNumber: null,
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
      placement: null,
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
    openDataContext: null,
    lastCheckedAt: null,
    lastSeenOnlineAt: null,
    republishedFromId: null,
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
    offers: [],
    criteriaMatches: [],
    criteriaFit: { ...NO_CRITERIA_FIT },
    criteriaChanges: null,
    lastCheck: null,
    republication: { from: null, to: null },
    ...over,
  }
}

/** Une offre fictive telle que l'API la renvoie. */
export function fakeOffer(over: Partial<Offer> = {}): Offer {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    listingId: '11111111-1111-4111-8111-111111111111',
    madeAt: '2026-11-02T10:00:00.000Z',
    amount: 150_000,
    channel: 'email',
    response: 'pending',
    counterAmount: null,
    respondedAt: null,
    notes: null,
    createdById: MEMBERS[0]?.id ?? null,
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    ...over,
  }
}

/** Le rapport « à partir de quel prix ? » d'une annonce vue, calculé par `domain`. */
export function fakeTargetPriceReport(
  item: EvaluatedListing = fakeEvaluated(),
  over: Partial<TargetPriceReport> = {}
): TargetPriceReport {
  return {
    listingId: item.listing.id,
    title: item.listing.title,
    status: item.listing.status,
    price: item.listing.price,
    targetPrice: item.evaluation.targetPrice,
    rank: { position: 1, total: 3 },
    negotiation: negotiationBrief(
      {
        price: item.listing.price,
        publishedAt: item.listing.publishedAt,
        createdAt: item.listing.createdAt,
        dpeClass: item.listing.dpeClass,
        renovationTotal: item.evaluation.metrics.renovationTotal,
        annualCharges: item.listing.annualCharges,
        surface: item.listing.surface,
        priceEvents: item.priceEvents,
        offers: item.offers,
      },
      item.evaluation.targetPrice,
      DEFAULT_ASSUMPTIONS,
      { now: new Date('2026-11-03T12:00:00.000Z') }
    ),
    notaryFees: item.evaluation.metrics.notaryFeesDetail,
    assumptions: DEFAULT_ASSUMPTIONS,
    sensitivity: null,
    ...over,
  }
}

/** Une extraction fictive telle que `POST /listings/extract` la rend (annonce inventée). */
export function fakeExtractionResult(
  over: Partial<ExtractionResult> = {}
): ExtractionResult {
  const recordedAt = now
  const ai = (confidence: number, evidence: string) => ({
    source: 'ai' as const,
    confidence,
    evidence,
    recordedAt,
  })
  const listing = ListingInputSchema.parse({
    title: 'T2 Talence Forum, 3e étage avec balcon',
    url: 'https://agence-fictive.invalid/annonce/AGF-12345',
    source: 'agence',
    sourceLabel: 'Agence Fictive Talence',
    externalId: 'AGF-12345',
    price: 189_000,
    feesPercent: 0.045,
    feesPayer: 'buyer',
    surface: 45.2,
    rooms: 2,
    bedrooms: 1,
    floor: 3,
    floorsTotal: 5,
    floorLabel: '3e étage sur 5 avec ascenseur',
    elevator: true,
    constructionYear: 1975,
    dpeClass: 'D',
    gesClass: 'D',
    cellar: true,
    orientation: 'sud',
    annualCharges: 1320,
    propertyTax: 780,
    description: 'T2 de 45,2 m² au 3e étage avec ascenseur.',
    location: {
      addressRaw: 'Rue du Forum, 33400 Talence',
      addressNormalized: 'Rue du Forum 33400 Talence',
      commune: 'Talence',
      inseeCode: '33522',
      district: 'Forum, tram B',
      point: { type: 'Point', coordinates: [-0.5906, 44.8083] },
      precision: 'street',
    },
    renovation: {
      active: true,
      level: 'refresh',
      items: [],
      notes: 'Peintures à rafraîchir',
    },
    sourceText: 'Appartement T2 Talence Forum - 189 000 € FAI …',
    fieldSources: {
      title: ai(0.95, 'Appartement T2 Talence Forum'),
      url: { source: 'listing', confidence: 1, recordedAt },
      source: { source: 'listing', confidence: 1, recordedAt },
      price: ai(0.95, '189 000 € FAI'),
      surface: ai(0.95, '45,2 m² loi Carrez'),
      rooms: ai(0.95, 'T2'),
      floor: ai(0.95, '3e étage sur 5'),
      constructionYear: ai(0.95, 'résidence de 1975'),
      dpeClass: ai(0.95, 'DPE : D'),
      annualCharges: ai(0.5, '110 €/mois × 12'),
      propertyTax: ai(0.95, 'Taxe foncière : 780 €'),
      addressRaw: ai(0.8, 'Rue du Forum'),
      commune: ai(0.95, 'Talence'),
      district: ai(0.7, 'à deux pas du tram B'),
      renovation: ai(0.9, 'Quelques rafraîchissements à prévoir'),
      point: { source: 'open_data', recordedAt },
      precision: { source: 'open_data', recordedAt },
      addressNormalized: { source: 'open_data', recordedAt },
      inseeCode: { source: 'open_data', recordedAt },
    },
  })
  return {
    listing,
    missingFields: [
      {
        field: 'annualCharges',
        label: 'Charges de copropriété annuelles',
        reason: 'doubtful',
        confidence: 0.5,
        taskLabel:
          'Demander le montant des charges de copropriété annuelles (budget prévisionnel)',
      },
      {
        field: 'rentalPlan.targetRent',
        label: 'Loyer visé',
        reason: 'missing',
        confidence: null,
        taskLabel: 'Fixer le loyer visé (phase 2) à partir du marché locatif',
      },
    ],
    duplicates: [],
    warnings: ['Charges indiquées par mois (110 €) : converties en annuel.'],
    geocoded: true,
    usage: {
      model: 'claude-opus-5-5',
      inputTokens: 3200,
      outputTokens: 1400,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 900,
      estimatedCostUsd: 0.0453,
      durationMs: 12_000,
    },
    persisted: false,
    ...over,
  }
}

export function fakeDuplicate(
  over: Partial<DuplicateCandidate> = {}
): DuplicateCandidate {
  return {
    listingId: '11111111-1111-4111-8111-111111111111',
    title: 'T2 fictif',
    status: 'to_visit',
    price: 200_000,
    surface: 45,
    commune: 'Talence',
    url: 'https://exemple.invalid/annonce/1',
    score: 1,
    reasons: [
      {
        kind: 'same_url',
        score: 1,
        detail: 'Même lien : https://exemple.invalid/annonce/1',
      },
      {
        kind: 'same_commune_price_surface',
        score: 0.8,
        detail: 'Talence : 45 m² contre 45,2 m²',
      },
    ],
    ...over,
  }
}
