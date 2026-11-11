/**
 * Lot 18 : les textes du connecteur pour une annonce sur plusieurs
 * portails (liens, vendeur, lien ajouté), les outils et les prompts
 * (tournée de mise à jour, exploration, analyse). Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type {
  CandidateTriage,
  EvaluatedListing,
  ListingLink,
  ListingLinkWriteResult,
} from '@apart/contracts'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import {
  describeLink,
  describeLinkWrite,
  describeLinksAndSeller,
} from './mcp-links'
import { describeTriageItem, exploreListingsPrompt } from './mcp-exploration'
import { reviewListingsPrompt } from './mcp-checks'
import {
  MCP_PROMPT_NAMES,
  MCP_TOOL_NAMES,
  analyzeListingPrompt,
  describeDuplicates,
  describeListing,
} from './mcp-tools'

const ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-06T10:00:00.000Z')
const n = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ')

const link = (over: Partial<ListingLink> = {}): ListingLink => ({
  id: ID,
  listingId: ID,
  portal: 'leboncoin',
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101',
  normalizedUrl: 'https://leboncoin.fr/ad/ventes_immobilieres/0000000101',
  externalId: '0000000101',
  price: 214_000,
  priceAt: null,
  firstSeenAt: null,
  lastSeenOnlineAt: '2026-11-05T10:00:00.000Z',
  lastCheckedAt: null,
  offlineSince: null,
  online: true,
  primary: true,
  origin: 'original',
  readSellerName: null,
  readReference: null,
  evidence: null,
  addedById: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...over,
})

const links = [
  link(),
  link({
    id: '22222222-2222-4222-8222-222222222222',
    portal: 'seloger',
    url: 'https://www.seloger.com/annonces/0000000202.htm',
    price: 219_000,
    primary: false,
    origin: 'claude',
    readReference: 'EX-2041',
  }),
  link({
    id: '33333333-3333-4333-8333-333333333333',
    portal: 'bienici',
    url: 'https://www.bienici.com/annonce/0000000303',
    price: null,
    primary: false,
    online: false,
    offlineSince: '2026-11-04T10:00:00.000Z',
    origin: 'manual',
  }),
]

const item = {
  listing: {
    id: ID,
    title: '[Exemple] T3 68 m², balcon sud',
    status: 'to_study',
    price: 214_000,
    surface: 68,
    sellerType: 'agency',
    sellerName: '[Exemple] Immobilier des Chartrons',
    sellerReference: 'EX-2041',
    location: {
      precision: 'street',
      point: null,
      placement: null,
      commune: 'Bordeaux',
      district: null,
    },
  },
  evaluation: {
    metrics: { grossYield: 0.05, effort: -100, verdict: 'to_dig' },
    rental: { verdict: 'ok' },
  },
  isNewForMe: false,
  distanceMeters: null,
  criteriaChanges: null,
  criteriaFit: NO_CRITERIA_FIT,
  links,
} as unknown as EvaluatedListing

describe('MCP lot 18 : une annonce, plusieurs portails', () => {
  it('un outil de plus en fin de liste, aucun de suppression, prompts inchangés en nombre', () => {
    // Lot 27 : trois outils de plus à la suite.
    expect(MCP_TOOL_NAMES[38]).toBe('add_listing_link')
    expect(MCP_TOOL_NAMES).toHaveLength(42)
    expect(MCP_TOOL_NAMES.some(name => /delete|remove/.test(name))).toBe(false)
    expect(MCP_PROMPT_NAMES).toHaveLength(5)
  })

  it('décrit les liens et le vendeur', () => {
    expect(n(describeLink(links[1] as ListingLink, links, NOW))).toBe(
      '- SeLoger · 219 000 € · +5 000 € : frais inclus ? · vue hier · rattaché par Claude · réf. lue EX-2041 · https://www.seloger.com/annonces/0000000202.htm [lien 22222222-2222-4222-8222-222222222222]'
    )
    expect(describeLink(links[2] as ListingLink, links, NOW)).toContain(
      'prix à relever · plus en ligne · le 4 nov.'
    )
    const text = n(describeLinksAndSeller(item, NOW))
    expect(text).toContain(
      'Vendeur : agence « [Exemple] Immobilier des Chartrons », réf. EX-2041.'
    )
    expect(text).toContain('Liens (3 liens · 2 en ligne) :')
    expect(text).toContain('- Leboncoin (lien principal) · 214 000 €')
    const unknown = describeLinksAndSeller(
      {
        ...item,
        listing: {
          ...item.listing,
          sellerType: 'unknown',
          sellerName: null,
          sellerReference: null,
        },
        links: [],
      },
      NOW
    )
    expect(unknown).toContain(
      'Vendeur : vendeur inconnu (à relever sur la page, jamais deviné).'
    )
    expect(unknown).toContain('Aucun lien : ajoutez celui de la page')
    expect(n(describeListing(item))).toContain(
      'sur 3 portails (1 plus en ligne) · vendeur : agence « [Exemple] Immobilier des Chartrons », réf. EX-2041'
    )
  })

  it('décrit un lien ajouté et la proposition de prix', () => {
    const result = {
      link: links[1],
      check: null,
      listing: item,
      priceProposal: {
        from: 200_000,
        to: 214_000,
        portal: 'leboncoin',
        text: 'Prix de la fiche saisi à la main : 200 000 €. Le plus bas affiché en ligne est 214 000 € (Leboncoin).',
      },
      summary: 'Lien SeLoger ajouté : 219 000 €',
    } as unknown as ListingLinkWriteResult
    const text = n(describeLinkWrite(result))
    expect(text).toContain(
      'Lien SeLoger ajouté : 219 000 € [lien 22222222-2222-4222-8222-222222222222].'
    )
    expect(text).toContain(
      'Non appliqué : le prix de la fiche a été saisi à la main'
    )
    expect(text).toContain('Annonce : [Exemple] T3 68 m², balcon sud')
    expect(
      describeLinkWrite({ ...result, link: null, priceProposal: null })
    ).not.toContain('Non appliqué')
  })

  it('un doublon certain propose le lien plutôt qu’une création', () => {
    const text = describeDuplicates([
      {
        listingId: ID,
        title: '[Exemple] T3',
        status: 'to_study',
        price: 214_000,
        surface: 68,
        commune: 'Bordeaux',
        url: null,
        score: 1,
        reasons: [{ kind: 'same_reference', score: 1, detail: 'x' }],
        certain: true,
        sellerType: 'agency',
        sellerName: null,
        sellerReference: 'EX-2041',
        linkCount: 1,
      },
    ])
    expect(text).toContain('Même agence, même référence')
    expect(text).toContain('add_listing_link')
  })

  it('une annonce rattachée d’office au tri', () => {
    const triaged = {
      index: 0,
      url: 'https://www.bienici.com/annonce/0000000303',
      normalizedUrl: null,
      portal: 'bienici',
      title: '[Exemple] T3',
      price: 214_000,
      surface: 68,
      rooms: 3,
      commune: 'Bordeaux',
      district: null,
      outcome: 'attached',
      why: 'Même agence et même référence que « [Exemple] T3 » : lien rattaché d’office à sa fiche',
      reasons: [],
      fit: null,
      listing: { id: ID, title: '[Exemple] T3', status: 'to_study' },
      draftId: null,
      alreadyPending: false,
      duplicates: [],
      check: null,
      dismissal: null,
      warnings: [],
    } as CandidateTriage
    expect(describeTriageItem(triaged)).toContain(
      `→ Rattachée d’office : Même agence et même référence que « [Exemple] T3 » : lien rattaché d’office à sa fiche [annonce ${ID}]`
    )
  })

  it('les prompts : lire vendeur et référence, rattacher seulement si même agence et même référence', () => {
    const review = reviewListingsPrompt({})
    expect(review).toContain('linkId')
    expect(review).toContain(
      'Ne rattache une annonce trouvée (add_listing_link'
    )
    expect(review).toContain("que si l'agence ET la référence sont les mêmes")
    expect(review).toContain('record_exploration')
    expect(review).toContain('ne devine pas le vendeur')
    const explore = exploreListingsPrompt({})
    expect(explore).toContain("la référence de l'annonce (reference")
    expect(explore).toContain("rattachée d'office")
    const analyze = analyzeListingPrompt({ pageText: 'x' })
    expect(analyze).toContain('add_listing_link')
    expect(analyze).toContain('vendeur (agence, mandataire ou particulier')
  })
})
