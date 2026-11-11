import { describe, expect, it } from 'vitest'
import {
  EvaluatedListingSchema,
  LISTING_SELLERS_MAX,
  ListingCheckFieldSchema,
  ListingMergeInputSchema,
  ListingMergePreviewQuerySchema,
  ListingSellerInputSchema,
  McpAddListingSellerInputSchema,
  McpFindSimilarListingsInputSchema,
  McpMergeListingsInputSchema,
  SIMILARITY_LEVEL_LABELS,
  SIMILARITY_THRESHOLDS,
  SIMILAR_LISTINGS_DEFAULT,
  SIMILAR_LISTINGS_MAX,
  SimilarListingsQuerySchema,
} from '../src/index.js'

/**
 * Lot 27 (ADR 0037) : les contrats de la fusion de deux fiches, des agences
 * multiples et de la recherche « Déjà vue ». Données fictives.
 */
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const AT = '2026-11-11T10:00:00.000Z'

describe('Lot 27 : agences multiples', () => {
  it('une autre agence demande un nom ou une référence ; un particulier ni l’un ni l’autre', () => {
    expect(
      ListingSellerInputSchema.parse({ sellerName: ' [Exemple] Agence B ' })
    ).toEqual({ sellerType: 'agency', sellerName: '[Exemple] Agence B' })
    expect(
      ListingSellerInputSchema.parse({ sellerReference: 'EX-77' }).sellerType
    ).toBe('agency')
    expect(ListingSellerInputSchema.safeParse({}).success).toBe(false)
    expect(
      ListingSellerInputSchema.safeParse({ sellerType: 'private' }).success
    ).toBe(true)
    expect(
      ListingSellerInputSchema.safeParse({ sellerType: 'unknown' }).success
    ).toBe(false)
    expect(LISTING_SELLERS_MAX).toBeGreaterThanOrEqual(3)
  })

  it('une vérification peut dire qu’une autre agence a été enregistrée', () => {
    expect(ListingCheckFieldSchema.options).toContain('otherSeller')
  })
})

describe('Lot 27 : annonces ressemblantes', () => {
  it('la recherche demande une annonce, un brouillon ou un texte', () => {
    expect(SimilarListingsQuerySchema.safeParse({}).success).toBe(false)
    expect(SimilarListingsQuerySchema.safeParse({ q: '  ' }).success).toBe(
      false
    )
    expect(SimilarListingsQuerySchema.parse({ draftId: ID_A })).toEqual({
      draftId: ID_A,
      limit: SIMILAR_LISTINGS_DEFAULT,
    })
    expect(
      SimilarListingsQuerySchema.parse({ q: 'chartrons', limit: '5' }).limit
    ).toBe(5)
    expect(
      SimilarListingsQuerySchema.safeParse({
        listingId: ID_A,
        limit: SIMILAR_LISTINGS_MAX + 1,
      }).success
    ).toBe(false)
  })

  it('les seuils vont du plus exigeant au moins exigeant et chaque niveau a son libellé', () => {
    expect(SIMILARITY_THRESHOLDS.veryClose).toBeGreaterThan(
      SIMILARITY_THRESHOLDS.close
    )
    expect(SIMILARITY_THRESHOLDS.close).toBeGreaterThan(
      SIMILARITY_THRESHOLDS.floor
    )
    expect(Object.keys(SIMILARITY_LEVEL_LABELS)).toEqual([
      'certain',
      'very_close',
      'close',
      'far',
    ])
  })
})

describe('Lot 27 : fusion', () => {
  it('la fusion désigne la fiche absorbée, garde-fous facultatifs', () => {
    expect(ListingMergeInputSchema.parse({ absorbedId: ID_B })).toEqual({
      absorbedId: ID_B,
    })
    expect(ListingMergeInputSchema.safeParse({}).success).toBe(false)
    expect(ListingMergePreviewQuerySchema.parse({ with: ID_B }).with).toBe(ID_B)
  })

  it('une annonce vue porte ses autres agences et ses fusions, vides par défaut', () => {
    const shape = EvaluatedListingSchema.shape
    expect(shape.sellers.parse(undefined)).toEqual([])
    expect(shape.absorbed.parse(undefined)).toEqual([])
    expect(shape.mergedInto.parse(undefined)).toBeNull()
  })
})

describe('Lot 27 : entrées du connecteur', () => {
  it('merge_listings exige les deux garde-fous et l’accord donné dans la conversation', () => {
    const input = {
      keepId: ID_A,
      mergeId: ID_B,
      confirmedInChat: true,
      expectedKeepUpdatedAt: AT,
      expectedMergeUpdatedAt: AT,
    }
    expect(McpMergeListingsInputSchema.parse(input)).toEqual(input)
    const { confirmedInChat: _c, ...withoutConfirm } = input
    expect(McpMergeListingsInputSchema.safeParse(withoutConfirm).success).toBe(
      false
    )
    const { expectedMergeUpdatedAt: _e, ...withoutGuard } = input
    expect(McpMergeListingsInputSchema.safeParse(withoutGuard).success).toBe(
      false
    )
  })

  it('add_listing_seller demande une agence ou une référence', () => {
    const base = {
      listingId: ID_A,
      confirmedInChat: true,
      expectedUpdatedAt: AT,
    }
    expect(McpAddListingSellerInputSchema.safeParse(base).success).toBe(false)
    expect(
      McpAddListingSellerInputSchema.parse({ ...base, reference: 'EX-77' })
        .sellerType
    ).toBe('agency')
  })

  it('find_similar_listings demande une annonce, un texte ou des caractéristiques', () => {
    expect(McpFindSimilarListingsInputSchema.safeParse({}).success).toBe(false)
    expect(
      McpFindSimilarListingsInputSchema.parse({ commune: 'Bordeaux' }).limit
    ).toBe(SIMILAR_LISTINGS_DEFAULT)
    expect(
      McpFindSimilarListingsInputSchema.safeParse({ listingId: ID_A }).success
    ).toBe(true)
  })
})
