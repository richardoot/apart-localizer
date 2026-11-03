import { describe, expect, it } from 'vitest'
import {
  EvaluateRequestSchema,
  HypotheticalListingSchema,
  LISTING_PAGE_DEFAULT,
  ListingFiltersSchema,
  ListingListQuerySchema,
  ListingPatchSchema,
  MCP_SCOPES,
  McpAddTaskInputSchema,
  McpCompleteTaskInputSchema,
  McpCreateListingInputSchema,
  McpUpdateListingInputSchema,
  PriceEventInputSchema,
  TaskUpdateSchema,
  listingFiltersFromQuery,
  listingFiltersToQuery,
  splitListingPatch,
} from '../src/index.js'

describe('Filtres : pagination et bornes', () => {
  it('pagine à 50 par défaut et refuse une page au-delà du maximum', () => {
    const filters = ListingFiltersSchema.parse({})
    expect(filters.page).toBe(1)
    expect(filters.limit).toBe(LISTING_PAGE_DEFAULT)
    expect(ListingFiltersSchema.safeParse({ limit: 500 }).success).toBe(false)
    expect(ListingFiltersSchema.safeParse({ page: 0 }).success).toBe(false)
  })

  it('lit les bornes de prix, surface et pièces depuis une chaîne de requête', () => {
    const query = ListingListQuerySchema.parse({
      priceMin: '150000',
      priceMax: '260000',
      surfaceMin: '40',
      roomsMin: '2',
      page: '2',
      limit: '20',
      sort: 'pricePerM2',
      order: 'asc',
    })
    const filters = listingFiltersFromQuery(query)
    expect(filters.priceMin).toBe(150_000)
    expect(filters.priceMax).toBe(260_000)
    expect(filters.surfaceMin).toBe(40)
    expect(filters.surfaceMax).toBeUndefined()
    expect(filters.roomsMin).toBe(2)
    expect(filters.page).toBe(2)
    expect(filters.limit).toBe(20)
    expect(filters.sort).toBe('pricePerM2')
    expect(filters.order).toBe('asc')
  })

  it('aller-retour filtres → chaîne de requête → filtres, défauts omis', () => {
    const query = listingFiltersToQuery({
      status: ['to_visit', 'visited'],
      commune: ['Talence'],
      near: { longitude: -0.59, latitude: 44.8, radiusMeters: 800 },
      newForMe: true,
      priceMax: 250_000,
      sort: 'effort',
      order: 'asc',
      page: 3,
      limit: 20,
    })
    expect(query).toEqual({
      status: 'to_visit,visited',
      commune: 'Talence',
      lng: '-0.59',
      lat: '44.8',
      radius: '800',
      newForMe: 'true',
      priceMax: '250000',
      sort: 'effort',
      order: 'asc',
      page: '3',
      limit: '20',
    })
    const back = listingFiltersFromQuery(ListingListQuerySchema.parse(query))
    expect(back.status).toEqual(['to_visit', 'visited'])
    expect(back.near).toEqual({
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 800,
    })
    expect(back.page).toBe(3)
    expect(listingFiltersToQuery({})).toEqual({})
    expect(
      listingFiltersToQuery({
        sort: 'score',
        order: 'desc',
        page: 1,
        limit: 50,
      })
    ).toEqual({})
  })
})

describe('Patch et garde-fous', () => {
  it('sépare les garde-fous du patch', () => {
    const patch = ListingPatchSchema.parse({
      price: 190_000,
      expectedPrice: 200_000,
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    const { update, guards } = splitListingPatch(patch)
    expect(update).toEqual({ price: 190_000 })
    expect(guards).toEqual({
      expectedPrice: 200_000,
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(splitListingPatch({ title: 'x' }).guards).toEqual({})
  })

  it('un événement de prix porte un garde-fou facultatif', () => {
    const event = PriceEventInputSchema.parse({ newPrice: 185_000 })
    expect(event.source).toBe('user')
    expect(event.occurredAt).toBeUndefined()
    expect(PriceEventInputSchema.safeParse({ newPrice: -1 }).success).toBe(
      false
    )
  })

  it('une mise à jour de tâche demande au moins un champ', () => {
    expect(TaskUpdateSchema.safeParse({}).success).toBe(false)
    expect(TaskUpdateSchema.parse({ done: true })).toEqual({ done: true })
  })
})

describe('Évaluation', () => {
  it('demande une annonce enregistrée ou une annonce hypothétique', () => {
    expect(EvaluateRequestSchema.safeParse({}).success).toBe(false)
    const hypothetical = EvaluateRequestSchema.parse({
      listing: { price: 200_000, surface: 45 },
      assumptions: { interestRate: 0.032 },
    })
    expect(hypothetical.listing?.title).toBe('Annonce hypothétique')
    expect('status' in (hypothetical.listing ?? {})).toBe(false)
    const existing = EvaluateRequestSchema.parse({
      listingId: '11111111-1111-4111-8111-111111111111',
      overrides: { price: 180_000 },
    })
    expect(existing.overrides).toEqual({ price: 180_000 })
    expect(HypotheticalListingSchema.safeParse({ price: 'cher' }).success).toBe(
      false
    )
  })
})

describe('Entrées MCP', () => {
  it('déclare deux portées et une provenance IA par défaut', () => {
    expect([...MCP_SCOPES]).toEqual(['listings:read', 'listings:write'])
    const created = McpCreateListingInputSchema.parse({
      listing: { title: 'T2 fictif', price: 150_000 },
    })
    expect(created.provenance).toBe('ai')
    expect(created.listing.status).toBe('to_study')
  })

  it('une mise à jour porte un identifiant, un patch partiel et ses garde-fous', () => {
    const input = McpUpdateListingInputSchema.parse({
      listingId: '11111111-1111-4111-8111-111111111111',
      patch: { price: 180_000 },
      expectedPrice: 200_000,
      provenance: 'user',
    })
    expect(input.patch).toEqual({ price: 180_000 })
    expect(input.expectedUpdatedAt).toBeUndefined()
    expect(
      McpUpdateListingInputSchema.safeParse({
        listingId: 'nope',
        patch: {},
      }).success
    ).toBe(false)
  })

  it('tâches : libellé obligatoire, cocher par défaut', () => {
    expect(
      McpAddTaskInputSchema.safeParse({
        listingId: '11111111-1111-4111-8111-111111111111',
        label: '',
      }).success
    ).toBe(false)
    const done = McpCompleteTaskInputSchema.parse({
      listingId: '11111111-1111-4111-8111-111111111111',
      taskId: '22222222-2222-4222-8222-222222222222',
    })
    expect(done.done).toBe(true)
  })
})
