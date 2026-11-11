/**
 * Lot 27 (ADR 0037) au connecteur : les textes des outils
 * find_similar_listings, merge_listings et add_listing_seller, et ce que
 * get_listing dit des autres agences et des fusions. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import type {
  EvaluatedListing,
  ListingMergeRecord,
  ListingSeller,
  SimilarListing,
} from '@apart/contracts'
import {
  describeMerge,
  describeSellerWrite,
  describeSellersAndMerges,
  describeSimilar,
  describeSimilarResult,
} from './mcp-merge'
import { MCP_TOOL_NAMES, analyzeListingPrompt } from './mcp-tools'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const AT = '2026-11-11T10:00:00.000Z'
const n = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ')

const seller = (over: Partial<ListingSeller> = {}): ListingSeller => ({
  id: ID2,
  listingId: ID,
  sellerType: 'agency',
  sellerName: '[Exemple] Cabinet Bastide',
  sellerReference: 'CB-77',
  sellerReferenceKey: 'CB77',
  origin: 'merge',
  addedById: null,
  createdAt: AT,
  ...over,
})

const merge = (over: Partial<ListingMergeRecord> = {}): ListingMergeRecord => ({
  id: ID2,
  keptId: ID,
  keptTitle: '[Exemple] T3 68 m²',
  absorbedId: ID2,
  absorbedTitle: '[Exemple] Doublon',
  mergedAt: AT,
  mergedById: null,
  channel: 'mcp',
  summary: 'Fusionnée avec « [Exemple] Doublon » : 1 lien',
  counts: {
    links: 1,
    sellers: 0,
    visits: 0,
    offers: 0,
    opinions: 0,
    tasks: 0,
    agencyRequests: 0,
    fields: 0,
    notes: false,
  },
  ...over,
})

const item = (over: Partial<EvaluatedListing> = {}): EvaluatedListing =>
  ({
    listing: {
      id: ID,
      title: '[Exemple] T3 68 m²',
      status: 'to_study',
      price: 214_000,
      surface: 68,
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      location: { commune: 'Bordeaux', point: null, precision: null },
    },
    evaluation: {
      metrics: { grossYield: 0.05, effort: -100, verdict: 'to_dig' },
      rental: { verdict: 'ok' },
    },
    isNewForMe: false,
    distanceMeters: null,
    criteriaChanges: null,
    criteriaFit: NO_CRITERIA_FIT,
    links: [],
    sellers: [],
    absorbed: [],
    mergedInto: null,
    ...over,
  }) as unknown as EvaluatedListing

const similar = (over: Partial<SimilarListing> = {}): SimilarListing => ({
  listingId: ID2,
  title: '[Exemple] Doublon',
  status: 'discarded',
  price: 209_000,
  surface: 68,
  rooms: 3,
  commune: 'Bordeaux',
  district: 'Caudéran',
  url: null,
  sellerName: null,
  sellerReference: null,
  linkCount: 1,
  updatedAt: AT,
  score: 0.92,
  level: 'very_close',
  matches: [
    { kind: 'commune', text: 'Même commune (Bordeaux)' },
    { kind: 'surface', text: 'Même surface (68 m²)' },
  ],
  differences: [{ kind: 'floor', text: 'Au 3e étage, pas au 2e étage' }],
  ...over,
})

describe('MCP lot 27 : fusion des doublons, autres agences, annonces ressemblantes', () => {
  it('trois outils de plus, aucun de suppression ni d’annulation', () => {
    expect(MCP_TOOL_NAMES.slice(-3)).toEqual([
      'find_similar_listings',
      'merge_listings',
      'add_listing_seller',
    ])
    expect(MCP_TOOL_NAMES).toHaveLength(42)
    expect(
      MCP_TOOL_NAMES.some(name => /delete|remove|undo|unmerge/.test(name))
    ).toBe(false)
  })

  it('get_listing ne dit rien d’une fiche sans autre agence ni fusion', () => {
    expect(describeSellersAndMerges(item())).toBeNull()
  })

  it('get_listing dit les autres agences, les doublons fusionnés et une fiche fusionnée', () => {
    const text = describeSellersAndMerges(
      item({
        sellers: [
          seller(),
          seller({ sellerType: 'private', origin: 'claude' }),
        ],
        absorbed: [merge()],
      })
    )
    expect(text).toContain('Vendue par 2 agences et en direct')
    expect(text).toContain(
      '- « [Exemple] Cabinet Bastide », réf. CB-77 (reprise d’une fiche fusionnée)'
    )
    expect(text).toContain('- Particulier (vente directe) (ajoutée par Claude)')
    expect(text).toContain(`- « [Exemple] Doublon » [id ${ID2}]`)
    expect(text).toContain('annulables dans l’application')
    const absorbed = describeSellersAndMerges(
      item({
        mergedInto: {
          mergeId: ID2,
          id: ID2,
          title: '[Exemple] Gardée',
          mergedAt: AT,
        },
      })
    )
    expect(absorbed).toContain(
      `FICHE FUSIONNÉE : doublon de « [Exemple] Gardée » [id ${ID2}]`
    )
  })

  it('décrit une annonce ressemblante : niveau, note, ce qui concorde, ce qui diffère', () => {
    expect(n(describeSimilar(similar()))).toBe(
      [
        `- Très proche (92 %) : « [Exemple] Doublon » (209 000 €, 68 m², Bordeaux, Écarté) [id ${ID2}]`,
        '  Concorde : Même commune (Bordeaux) ; Même surface (68 m²)',
        '  Diffère : Au 3e étage, pas au 2e étage',
      ].join('\n')
    )
    expect(
      describeSimilar(
        similar({
          surface: null,
          commune: null,
          level: 'far',
          score: 0.4,
          matches: [],
          differences: [],
        })
      ).split('\n')
    ).toHaveLength(1)
  })

  it('résume la recherche et rappelle qu’une ressemblance n’est pas une preuve', () => {
    const text = describeSimilarResult({
      items: [similar()],
      compared: 12,
      summary: '1 annonce ressemblante, dont 1 très proche',
    })
    expect(text).toContain(
      '1 annonce ressemblante, dont 1 très proche (12 comparées).'
    )
    expect(text).toContain('montrez les deux fiches au membre')
    const empty = describeSimilarResult({
      items: [],
      compared: 1,
      summary: 'Aucune annonce suivie ne lui ressemble',
    })
    expect(empty).toBe('Aucune annonce suivie ne lui ressemble (1 comparée).')
  })

  it('décrit une fusion : rien de supprimé, annulable dans l’application', () => {
    const text = describeMerge({
      merge: merge(),
      listing: item({ sellers: [seller()] }),
      summary: 'Fusionnée avec « [Exemple] Doublon » : 1 lien',
    })
    expect(text).toContain('Fusionnée avec « [Exemple] Doublon » : 1 lien.')
    expect(text).toContain('gardée mais cachée des listes')
    expect(text).toContain('s’annule dans l’application')
    expect(text).toContain('Fiche gardée : [Exemple] T3 68 m²')
    expect(text).toContain('« [Exemple] Cabinet Bastide », réf. CB-77')
  })

  it('décrit une agence ajoutée', () => {
    const text = describeSellerWrite({
      seller: seller({ origin: 'claude' }),
      listing: item({ sellers: [seller({ origin: 'claude' })] }),
      summary:
        'Autre agence enregistrée : « [Exemple] Cabinet Bastide », réf. CB-77',
    })
    expect(text).toContain('Autre agence enregistrée')
    expect(text).toContain('Vendue par 2 agences')
    expect(text).toContain('sera reconnue comme la même')
  })

  it('le prompt d’analyse renvoie vers add_listing_seller et find_similar_listings', () => {
    const prompt = analyzeListingPrompt({ pageText: 'Annonce' })
    expect(prompt).toContain('add_listing_seller')
    expect(prompt).toContain('find_similar_listings')
  })
})
