import { describe, expect, it } from 'vitest'
import { Prisma } from '../generated/prisma'
import {
  linkStateOf,
  toLastCheck,
  toListingCheckDto,
  toListingDto,
  toListingLinkDtos,
  toRepublication,
  num,
} from './listing.mapper'
import type { ListingRow } from './listing.mapper'
import { evaluateListing } from './evaluate'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'

const now = new Date('2026-11-03T10:00:00.000Z')

function row(over: Partial<ListingRow> = {}): ListingRow {
  return {
    decisionProposals: [],
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    source: 'leboncoin',
    sourceLabel: null,
    url: 'https://www.leboncoin.fr/ad/1',
    externalId: null,
    title: 'T3',
    publishedAt: null,
    sourceUpdatedAt: null,
    description: null,
    notes: null,
    sourceText: null,
    addressRaw: null,
    addressNormalized: null,
    banId: null,
    commune: 'Talence',
    inseeCode: null,
    district: null,
    latitude: 44.8,
    longitude: -0.59,
    locationPrecision: 'commune',
    locationGeoJson: null,
    locationPlacement: null,
    price: new Prisma.Decimal('200000'),
    feesAmount: null,
    feesPercent: null,
    feesPayer: null,
    surface: new Prisma.Decimal('45'),
    surfaceTotal: null,
    rooms: 2,
    bedrooms: null,
    floor: null,
    floorsTotal: null,
    floorLabel: null,
    elevator: null,
    constructionYear: null,
    constructionPeriod: null,
    dpeClass: 'D',
    dpeConsumption: null,
    gesClass: null,
    dpeDate: new Date('2024-05-01T00:00:00.000Z'),
    dpeNumber: null,
    heatingType: null,
    heatingCollective: null,
    outdoor: null,
    parking: null,
    cellar: null,
    orientation: null,
    condition: null,
    annualCharges: null,
    nonRecoverableChargesMonthly: null,
    lotsCount: null,
    proceedings: null,
    votedWorks: null,
    syndic: null,
    propertyTax: null,
    furnitureValue: new Prisma.Decimal('5000'),
    fieldSources: { price: { source: 'listing' } },
    status: 'to_study',
    discardReason: null,
    discardedAt: null,
    assumptionsOverride: null,
    openDataContext: null,
    lastCheckedAt: null,
    lastSeenOnlineAt: null,
    republishedFromId: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    renovation: null,
    rentalPlan: {
      id: '33333333-3333-4333-8333-333333333333',
      listingId: '11111111-1111-4111-8111-111111111111',
      year: null,
      leaseType: 'unfurnished',
      rentControl: 'auto',
      referenceRentPerM2: null,
      targetRent: new Prisma.Decimal('750'),
      marketRent: null,
      comparables: [],
      demand: 'strong',
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
      notes: null,
    },
    views: [],
    opinions: [],
    opinionReveals: [],
    tasks: [],
    priceEvents: [],
    offers: [],
    criteriaMatches: [],
    checks: [],
    republishedFrom: null,
    republishedAs: null,
    visits: [],
    criteriaFitLevel: null,
    criteriaFitChangedAt: null,
    criteriaFitOrigin: null,
    sellerType: 'unknown',
    sellerName: null,
    sellerReference: null,
    sellerReferenceKey: null,
    links: [],
    ...over,
  }
}

const link = (
  over: Partial<ListingRow['links'][number]> = {}
): ListingRow['links'][number] => ({
  id: '66666666-6666-4666-8666-666666666666',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  listingId: '11111111-1111-4111-8111-111111111111',
  portal: 'leboncoin',
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101',
  normalizedUrl: 'https://leboncoin.fr/ad/ventes_immobilieres/0000000101',
  externalId: '0000000101',
  price: new Prisma.Decimal('200000'),
  priceAt: now,
  firstSeenAt: now,
  lastSeenOnlineAt: null,
  lastCheckedAt: null,
  offlineSince: null,
  origin: 'original',
  readSellerName: null,
  readReference: null,
  evidence: null,
  addedById: null,
  createdAt: now,
  updatedAt: now,
  ...over,
})

describe('toListingDto', () => {
  it('converts decimals, dates and rebuilds the point from the mirror columns', () => {
    const dto = toListingDto(row())
    expect(dto.price).toBe(200_000)
    expect(dto.surface).toBe(45)
    expect(dto.dpeDate).toBe('2024-05-01')
    expect(dto.createdAt).toBe('2026-11-03T10:00:00.000Z')
    expect(dto.location.point).toEqual({
      type: 'Point',
      coordinates: [-0.59, 44.8],
    })
    expect(dto.location.precision).toBe('commune')
    expect(dto.rentalPlan?.targetRent).toBe(750)
    expect(dto.renovation).toBeNull()
    expect(dto.fieldSources).toEqual({ price: { source: 'listing' } })
    expect(dto.openDataContext).toBeNull()
  })

  it('reads the open data snapshot, ignoring an unreadable one', () => {
    const snapshot = {
      market: {
        medianPricePerM2: 4200,
        count: 9,
        radiusMeters: 500,
        computedAt: '2026-11-03T10:00:00.000Z',
      },
    }
    const dto = toListingDto(row({ openDataContext: snapshot }))
    expect(dto.openDataContext?.market?.medianPricePerM2).toBe(4200)
    expect(dto.openDataContext?.dpe).toBeNull()
    expect(
      toListingDto(row({ openDataContext: { market: 'broken' } }))
        .openDataContext
    ).toBeNull()
    // Le prix médian enregistré rend le critère « marché » calculable.
    const evaluation = evaluateListing(dto, DEFAULT_ASSUMPTIONS)
    const market = evaluation.targetPrice.criteria.find(
      c => c.criterion === 'market'
    )
    expect(market?.maxPrice).toBe(4200 * 45)
    expect(market?.active).toBe(false)
  })

  it('prefers the stored GeoJSON and handles a listing without a point', () => {
    const geo = { type: 'Point', coordinates: [-0.5906, 44.8083] }
    expect(toListingDto(row({ locationGeoJson: geo })).location.point).toEqual(
      geo
    )
    expect(
      toListingDto(row({ latitude: null, longitude: null })).location.point
    ).toBeNull()
    expect(num(null)).toBeNull()
  })

  it('evaluates with the shared domain: the § 8 example comes out the same', () => {
    const evaluation = evaluateListing(toListingDto(row()), DEFAULT_ASSUMPTIONS)
    expect(evaluation.metrics.totalCost).toBe(220_000)
    expect(evaluation.metrics.verdict).toBe('off_target')
    expect(evaluation.rental.verdict).toBe('conditional')
    expect(evaluation.targetPrice.bindingCriterion).toBe('gross_yield')
    const bare = evaluateListing(
      toListingDto(row({ rentalPlan: null })),
      DEFAULT_ASSUMPTIONS
    )
    expect(bare.metrics.rent).toBe(0)
    expect(bare.rental.checks.find(c => c.key === 'demand')?.level).toBe(
      'unknown'
    )
  })
})

describe('lot 15 : vérifications et republication', () => {
  const check = {
    id: '44444444-4444-4444-8444-444444444444',
    listingId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    checkedAt: now,
    authorId: null,
    channel: 'mcp' as const,
    outcome: 'changed' as const,
    changes: [
      {
        field: 'price',
        label: 'Prix',
        before: 215000,
        after: 205000,
        disposition: 'applied',
        text: 'Prix 215 000 € → 205 000 €',
      },
      { field: 'inconnu' },
    ],
    summary: 'Prix 215 000 € → 205 000 €',
    evidence: null,
    checkedUrl: null,
    linkedListingId: null,
    suggestedStatus: null,
    linkId: null,
  }

  it('dates de vérification, republication et dernier résultat', () => {
    const dto = toListingDto(
      row({
        lastCheckedAt: now,
        lastSeenOnlineAt: now,
        republishedFromId: '55555555-5555-4555-8555-555555555555',
      })
    )
    expect(dto.lastCheckedAt).toBe('2026-11-03T10:00:00.000Z')
    expect(dto.lastSeenOnlineAt).toBe('2026-11-03T10:00:00.000Z')
    expect(dto.republishedFromId).toBe('55555555-5555-4555-8555-555555555555')
    expect(toLastCheck(row())).toBeNull()
    expect(toLastCheck(row({ checks: [check] }))).toEqual({
      id: check.id,
      checkedAt: '2026-11-03T10:00:00.000Z',
      channel: 'mcp',
      authorId: null,
      outcome: 'changed',
      summary: 'Prix 215 000 € → 205 000 €',
    })
    // Lot 18 : le système (alerte e-mail) a son canal.
    expect(
      toLastCheck(row({ checks: [{ ...check, channel: 'system' }] }))?.channel
    ).toBe('system')
    expect(
      toLastCheck(row({ checks: [{ ...check, channel: 'import' }] }))?.channel
    ).toBe('web')
    const linked = {
      id: '55555555-5555-4555-8555-555555555555',
      title: 'T3 (1re publication)',
      status: 'sold_or_withdrawn' as const,
    }
    expect(toRepublication(row({ republishedFrom: linked }))).toEqual({
      from: linked,
      to: null,
    })
  })

  it('une vérification : écarts illisibles omis, annonce liée', () => {
    const dto = toListingCheckDto({ ...check, linkedListing: null })
    expect(dto.changes).toHaveLength(1)
    expect(dto.channel).toBe('mcp')
    expect(dto.linkedListing).toBeNull()
    expect(
      toListingCheckDto({ ...check, changes: null, channel: 'web' }).changes
    ).toEqual([])
    expect(toListingCheckDto({ ...check, channel: 'system' }).channel).toBe(
      'system'
    )
    // Lot 18 : le lien vérifié.
    expect(
      toListingCheckDto({
        ...check,
        link: {
          id: link().id,
          portal: 'seloger',
          url: 'https://www.seloger.com/a/1',
        },
      }).link
    ).toEqual({
      id: link().id,
      portal: 'seloger',
      url: 'https://www.seloger.com/a/1',
    })
  })

  it('lot 18 : vendeur, liens, le principal d’abord', () => {
    const dto = toListingDto(
      row({
        sellerType: 'agency',
        sellerName: '[Exemple] Agence',
        sellerReference: 'EX-1',
        sellerReferenceKey: 'EX1',
      })
    )
    expect(dto).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence',
      sellerReference: 'EX-1',
      sellerReferenceKey: 'EX1',
    })
    const later = new Date('2026-11-04T10:00:00.000Z')
    const offline = link({ offlineSince: later })
    const other = link({
      id: '77777777-7777-4777-8777-777777777777',
      portal: 'seloger',
      url: 'https://www.seloger.com/a/1',
      normalizedUrl: 'https://seloger.com/a/1',
      price: null,
      priceAt: null,
      createdAt: later,
    })
    const dtos = toListingLinkDtos([offline, other])
    expect(dtos.map(l => [l.portal, l.primary, l.online, l.price])).toEqual([
      ['seloger', true, true, null],
      ['leboncoin', false, false, 200_000],
    ])
    expect(linkStateOf(offline)).toMatchObject({
      online: false,
      offlineSince: later.toISOString(),
      price: 200_000,
    })
  })
})
