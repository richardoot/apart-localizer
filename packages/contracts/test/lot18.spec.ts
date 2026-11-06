/**
 * Lot 18 : une annonce, plusieurs portails. Portail d'un lien, origine,
 * vendeur, lien à ajouter et à modifier, valeurs lues (vendeur compris,
 * clés inconnues refusées), filtres de la liste (vendeur, plusieurs
 * portails, référence), doublons (référence), export de version 1 et MCP.
 * Données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_LABELS,
  CERTAIN_DUPLICATE_REASONS,
  DUPLICATE_REASON_LABELS,
  DeclaredCheckOutcomeSchema,
  DuplicateCandidateSchema,
  DuplicateProbeSchema,
  EXPLORATION_LINK_PORTAL,
  EXPLORATION_OUTCOME_LABELS,
  ExplorationCandidateSchema,
  ExplorationCountsSchema,
  ExportListingSchema,
  InboundEmailResultSchema,
  LISTING_CHECK_OUTCOME_LABELS,
  LISTING_LINK_ORIGIN_LABELS,
  LISTING_PORTAL_LABELS,
  LISTING_PORTAL_SHORT_LABELS,
  LISTING_PORTAL_SOURCE,
  ListingCheckSchema,
  ListingDraftSchema,
  ListingFiltersSchema,
  ListingInputSchema,
  ListingLinkInputSchema,
  ListingLinkPatchSchema,
  ListingListQuerySchema,
  ListingObservedSchema,
  ListingPortalSchema,
  ListingSchema,
  McpAddListingLinkInputSchema,
  SELLER_TYPE_LABELS,
  activityKindOf,
  listingFiltersFromQuery,
  listingFiltersToQuery,
  listingSourceFromUrl,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-11-06T10:00:00.000Z'

describe('lot 18 : portails, origines, vendeur', () => {
  it('un portail par lien, Logic-Immo compris, recopié en source « autre »', () => {
    expect(ListingPortalSchema.options).toEqual([
      'leboncoin',
      'seloger',
      'bienici',
      'pap',
      'logicimmo',
      'agence',
      'autre',
    ])
    expect(LISTING_PORTAL_LABELS.logicimmo).toBe('Logic-Immo')
    expect(LISTING_PORTAL_SHORT_LABELS.leboncoin).toBe('LBC')
    expect(LISTING_PORTAL_SOURCE.logicimmo).toEqual({
      source: 'autre',
      sourceLabel: 'Logic-Immo',
    })
    expect(EXPLORATION_LINK_PORTAL.other).toBe('autre')
    expect(listingSourceFromUrl('https://www.logic-immo.com/d/1')).toBe('autre')
    expect(LISTING_LINK_ORIGIN_LABELS.original).toBe('lien d’origine')
    expect(SELLER_TYPE_LABELS.mandatary).toBe('Mandataire')
    expect(ACTIVITY_KIND_LABELS.link).toBe('Liens des portails')
    expect(activityKindOf('listing_link.added')).toBe('link')
    expect(activityKindOf('listing.checked')).toBe('check')
  })

  it('le vendeur d’une annonce : inconnu par défaut, jamais deviné', () => {
    const input = ListingInputSchema.parse({ title: 'T3 fictif', price: 1 })
    expect(input).toMatchObject({
      sellerType: 'unknown',
      sellerName: null,
      sellerReference: null,
    })
    // Une annonce d'un export antérieur au lot 18 se relit.
    const stored = ListingSchema.parse({
      ...input,
      id: ID,
      workspaceId: ID,
      location: {},
      renovation: null,
      rentalPlan: null,
      discardedAt: null,
      createdById: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(stored.sellerReferenceKey).toBeNull()
    expect(() =>
      ListingInputSchema.parse({ title: 'x', price: 1, sellerType: 'notaire' })
    ).toThrow()
  })
})

describe('lot 18 : liens', () => {
  it('un lien à ajouter : une URL, ce qui a été lu, l’origine', () => {
    expect(
      ListingLinkInputSchema.parse({
        url: ' https://www.pap.fr/annonces/r0000000404 ',
      })
    ).toEqual({
      url: 'https://www.pap.fr/annonces/r0000000404',
      origin: 'manual',
    })
    expect(() => ListingLinkInputSchema.parse({ url: 'pas un lien' })).toThrow()
    expect(() =>
      ListingLinkInputSchema.parse({
        url: 'https://www.pap.fr/a',
        origin: 'claude',
      })
    ).toThrow()
    expect(
      ListingLinkInputSchema.parse({
        url: 'https://www.pap.fr/a',
        price: 214_000,
        online: true,
        sellerType: 'private',
      })
    ).toMatchObject({ price: 214_000, sellerType: 'private' })
  })

  it('un lien modifié : au moins un champ', () => {
    expect(ListingLinkPatchSchema.parse({ online: false })).toEqual({
      online: false,
    })
    expect(ListingLinkPatchSchema.parse({ externalId: null })).toEqual({
      externalId: null,
    })
    expect(() => ListingLinkPatchSchema.parse({})).toThrow()
  })

  it('les valeurs lues portent le vendeur ; une faute de frappe est refusée', () => {
    expect(
      ListingObservedSchema.parse({
        sellerType: 'agency',
        sellerName: '[Exemple] Agence',
        reference: 'EX-2041',
      })
    ).toEqual({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence',
      reference: 'EX-2041',
    })
    expect(() =>
      ListingObservedSchema.parse({ sellerType: 'unknown' })
    ).toThrow()
    expect(() => ListingObservedSchema.parse({ referense: 'EX' })).toThrow()
    expect(
      ExplorationCandidateSchema.parse({
        url: 'https://www.bienici.com/annonce/0000000303',
        portal: 'bienici',
        reference: 'EX-2041',
      }).reference
    ).toBe('EX-2041')
  })

  it('une vérification porte sur un lien ; « lien ajouté » ne se déclare pas', () => {
    expect(LISTING_CHECK_OUTCOME_LABELS.link_added).toBe('Lien ajouté')
    expect(DeclaredCheckOutcomeSchema.options).not.toContain('link_added')
    const check = ListingCheckSchema.parse({
      id: ID,
      listingId: ID,
      checkedAt: NOW,
      authorId: null,
      channel: 'system',
      outcome: 'link_added',
      changes: [],
      summary: 'Lien PAP ajouté',
      evidence: null,
      checkedUrl: null,
      linkedListing: null,
      suggestedStatus: null,
    })
    expect(check.link).toBeNull()
  })
})

describe('lot 18 : filtres, doublons, export, MCP', () => {
  it('les filtres de la liste : vendeur, plusieurs portails, référence', () => {
    const query = ListingListQuerySchema.parse({
      sellerType: 'agency,mandatary',
      multiPortal: 'true',
      reference: 'EX 2041',
    })
    const filters = listingFiltersFromQuery(query)
    expect(filters).toMatchObject({
      sellerType: ['agency', 'mandatary'],
      multiPortal: true,
      reference: 'EX 2041',
    })
    expect(listingFiltersToQuery(filters)).toMatchObject({
      sellerType: 'agency,mandatary',
      multiPortal: 'true',
      reference: 'EX 2041',
    })
    expect(
      listingFiltersToQuery(ListingFiltersSchema.parse({ multiPortal: false }))
    ).not.toHaveProperty('multiPortal')
  })

  it('les doublons : la référence suffit à chercher ; certain par lien ou agence et référence', () => {
    expect(DuplicateProbeSchema.parse({ reference: 'EX-2041' })).toEqual({
      reference: 'EX-2041',
    })
    expect(CERTAIN_DUPLICATE_REASONS).toEqual(['same_url', 'same_reference'])
    expect(DUPLICATE_REASON_LABELS.same_reference_other_agency).toBe(
      'Même référence, autre agence'
    )
    // Un doublon enregistré avant le lot 18 se relit.
    expect(
      DuplicateCandidateSchema.parse({
        listingId: ID,
        title: 'x',
        status: 'to_study',
        price: 1,
        surface: null,
        commune: null,
        url: null,
        score: 0.8,
        reasons: [{ kind: 'same_address', score: 0.9, detail: 'x' }],
      })
    ).toMatchObject({ certain: false, sellerType: 'unknown', linkCount: 0 })
  })

  it('exploration et brouillons : rattachée d’office, compteurs relus', () => {
    expect(EXPLORATION_OUTCOME_LABELS.attached).toBe('Rattachée d’office')
    expect(
      ExplorationCountsSchema.parse({
        seen: 1,
        toValidate: 1,
        new: 1,
        duplicateProbable: 0,
        known: 0,
        dismissed: 0,
        out: 0,
        draftsCreated: 1,
        checksChanged: 0,
        blockedPortals: 0,
      }).attached
    ).toBe(0)
    expect(
      InboundEmailResultSchema.parse({
        candidates: 1,
        created: 1,
        skipped: 0,
        draftIds: [],
        extractedBy: 'parser',
      }).attached
    ).toBe(0)
    const draft = ListingDraftSchema.parse({
      id: ID,
      workspaceId: ID,
      origin: 'exploration',
      status: 'merged',
      extractedBy: 'claude',
      listing: { title: 'x', price: 1 },
      duplicates: [],
      warnings: [],
      url: null,
      emailSubject: null,
      emailFrom: null,
      receivedAt: NOW,
      decidedAt: null,
      decidedById: null,
      listingId: null,
      createdAt: NOW,
    })
    expect(draft.attachment).toBeNull()
    expect(draft.detachedAt).toBeNull()
  })

  it('export de version 1 : liens absents d’un export antérieur = []', () => {
    const shape = ExportListingSchema.shape.links
    expect(shape.parse(undefined)).toEqual([])
  })

  it('add_listing_link : lien, garde-fou obligatoires ; en ligne par défaut', () => {
    const input = McpAddListingLinkInputSchema.parse({
      listingId: ID,
      url: 'https://www.seloger.com/annonces/0000000202.htm',
      reference: 'Réf. EX-2041',
      expectedUpdatedAt: NOW,
    })
    expect(input.online).toBe(true)
    expect(() =>
      McpAddListingLinkInputSchema.parse({
        listingId: ID,
        url: 'https://www.seloger.com/a',
      })
    ).toThrow()
  })
})
