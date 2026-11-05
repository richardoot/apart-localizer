import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_LABELS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_STALE_DAYS,
  EvaluatedListingSchema,
  ExportListingSchema,
  LISTING_CHECK_OUTCOME_LABELS,
  LISTING_CHECK_TOLERANCES,
  ListingCheckInputSchema,
  ListingCheckPreviewRequestSchema,
  ListingCheckSchema,
  ListingFiltersSchema,
  ListingListQuerySchema,
  ListingObservedSchema,
  ListingSchema,
  McpApplyListingCheckInputSchema,
  McpCheckListingInputSchema,
  McpReviewListingsPromptArgsSchema,
  NOTIFICATION_TYPE_LABELS,
  NegotiationBriefSchema,
  WHATS_NEW_KIND_LABELS,
  activityKindOf,
  listingFiltersFromQuery,
  listingFiltersToQuery,
  resolveNotificationPreferences,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'

describe('Lot 15 : suivi des mises à jour des annonces', () => {
  it('constantes : 7 jours, tolérances, libellés des résultats', () => {
    expect(DEFAULT_STALE_DAYS).toBe(7)
    expect(LISTING_CHECK_TOLERANCES.price).toBe(1)
    expect(LISTING_CHECK_OUTCOME_LABELS.inaccessible).toBe(
      'Non vérifiée : page inaccessible'
    )
  })

  it('valeurs observées : seules celles fournies, clés inconnues refusées, dates souples', () => {
    expect(ListingObservedSchema.parse({})).toEqual({})
    expect(
      ListingObservedSchema.parse({
        online: true,
        price: 205_000,
        publishedAt: '2026-10-12',
        sourceUpdatedAt: '2026-11-04T10:00:00+01:00',
      })
    ).toMatchObject({ price: 205_000, publishedAt: '2026-10-12' })
    expect(ListingObservedSchema.safeParse({ charges: 100 }).success).toBe(
      false
    )
    expect(
      ListingObservedSchema.safeParse({ publishedAt: 'hier' }).success
    ).toBe(false)
    expect(ListingObservedSchema.safeParse({ price: -1 }).success).toBe(false)
  })

  it('vérification à enregistrer : garde-fou obligatoire, observed vide par défaut', () => {
    expect(ListingCheckInputSchema.safeParse({}).success).toBe(false)
    const parsed = ListingCheckInputSchema.parse({
      expectedUpdatedAt: '2026-11-05T10:00:00.000Z',
    })
    expect(parsed.observed).toEqual({})
    const mcp = McpApplyListingCheckInputSchema.parse({
      listingId: ID,
      expectedUpdatedAt: '2026-11-05T10:00:00.000Z',
      outcome: 'inaccessible',
    })
    expect(mcp.outcome).toBe('inaccessible')
  })

  it('vérification à blanc : observed ou texte de la page', () => {
    expect(ListingCheckPreviewRequestSchema.safeParse({}).success).toBe(false)
    expect(
      ListingCheckPreviewRequestSchema.safeParse({ pageText: '  ' }).success
    ).toBe(false)
    expect(
      ListingCheckPreviewRequestSchema.parse({ pageText: 'Prix 205 000 €' })
        .quality
    ).toBe('fast')
    expect(
      ListingCheckPreviewRequestSchema.safeParse({ observed: {} }).success
    ).toBe(true)
    expect(
      McpCheckListingInputSchema.safeParse({ listingId: ID }).success
    ).toBe(false)
    expect(
      McpCheckListingInputSchema.safeParse({
        listingId: ID,
        images: [{ mediaType: 'image/png', data: 'aGVsbG8=' }],
      }).success
    ).toBe(true)
    expect(McpReviewListingsPromptArgsSchema.parse({})).toEqual({})
  })

  it('annonce : dates de vérification et republication, null par défaut', () => {
    const shape = ListingSchema.shape
    expect(shape.lastCheckedAt.parse(undefined)).toBeNull()
    expect(shape.lastSeenOnlineAt.parse(undefined)).toBeNull()
    expect(shape.republishedFromId.parse(undefined)).toBeNull()
    const view = EvaluatedListingSchema.shape
    expect(view.lastCheck.parse(undefined)).toBeNull()
    expect(view.republication.parse(undefined)).toEqual({
      from: null,
      to: null,
    })
    expect(
      NegotiationBriefSchema.shape.republication.parse(undefined)
    ).toBeNull()
  })

  it('filtre « à revérifier » et tri par dernière vérification, dans les deux sens', () => {
    const filters = listingFiltersFromQuery(
      ListingListQuerySchema.parse({
        staleDays: '7',
        sort: 'lastCheckedAt',
        order: 'asc',
      })
    )
    expect(filters.staleDays).toBe(7)
    expect(filters.sort).toBe('lastCheckedAt')
    expect(listingFiltersToQuery(filters)).toMatchObject({
      staleDays: '7',
      sort: 'lastCheckedAt',
      order: 'asc',
    })
    expect(ListingFiltersSchema.safeParse({ staleDays: 0 }).success).toBe(false)
    expect(ListingListQuerySchema.safeParse({ staleDays: '400' }).success).toBe(
      false
    )
  })

  it('journal, nouveautés, notifications : la vérification a sa sorte, son libellé, ses préférences', () => {
    expect(activityKindOf('listing.checked')).toBe('check')
    expect(activityKindOf('listing.updated')).toBe('listing')
    expect(ACTIVITY_KIND_LABELS.check).toBe('Vérification')
    expect(WHATS_NEW_KIND_LABELS.listing_check).toBe("Mises à jour d'annonces")
    expect(NOTIFICATION_TYPE_LABELS.listing_checked).toContain('vérification')
    expect(DEFAULT_NOTIFICATION_PREFERENCES.listing_checked).toEqual({
      in_app: true,
      push: true,
      email: false,
    })
    // Des préférences enregistrées avant le lot 15 prennent le défaut.
    expect(resolveNotificationPreferences({}).listing_checked.in_app).toBe(true)
  })

  it('export : les vérifications, absentes d’un export antérieur', () => {
    const check = ListingCheckSchema.parse({
      id: ID,
      listingId: ID,
      checkedAt: '2026-11-05T10:00:00.000Z',
      authorId: null,
      channel: 'mcp',
      outcome: 'changed',
      changes: [
        {
          field: 'price',
          label: 'Prix',
          before: 215_000,
          after: 205_000,
          disposition: 'applied',
          text: 'Prix 215 000 € → 205 000 €',
        },
      ],
      summary: 'Prix 215 000 € → 205 000 €',
      evidence: 'Prix : 205 000 €',
      checkedUrl: 'https://annonces.exemple.invalid/1',
      linkedListing: null,
      suggestedStatus: null,
    })
    expect(check.changes[0]?.disposition).toBe('applied')
    expect(ExportListingSchema.shape.checks.parse(undefined)).toEqual([])
    expect(
      ListingCheckSchema.safeParse({ ...check, evidence: 'x'.repeat(501) })
        .success
    ).toBe(false)
  })
})
