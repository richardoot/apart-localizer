import {
  CriteriaFiltersSchema,
  DEFAULT_CRITERIA_TOLERANCE,
  ListingInputSchema,
  NO_CRITERIA_FIT,
} from '@apart/contracts'
import type {
  ExplorationDetail,
  ExplorationSummary,
  ListingCriteriaFit,
  ListingDraft,
  SearchBrief,
} from '@apart/contracts'
import { EMPTY_EXPLORATION_COUNTS } from '@apart/domain'

/** Lot 16 : des brouillons, une exploration et un brief fictifs, tels que l'API les rend. */

export const CRITERIA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const LISTING_ID = '11111111-1111-4111-8111-111111111111'
export const EXPLORATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const at = '2026-11-05T17:40:00.000Z'

export function fitOf(
  over: Partial<ListingCriteriaFit> = {}
): ListingCriteriaFit {
  return {
    ...NO_CRITERIA_FIT,
    activeCriteria: 1,
    criteriaId: CRITERIA_ID,
    name: '[Exemple] Caudéran et Le Bouscat, T3',
    ...over,
  }
}

export function fakeDraft(over: Partial<ListingDraft> = {}): ListingDraft {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    origin: 'exploration',
    status: 'pending',
    extractedBy: 'claude',
    listing: ListingInputSchema.parse({
      title: '[Exemple] T3 68 m², balcon sud',
      price: 214_000,
      surface: 68,
      rooms: 3,
      dpeClass: 'C',
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2800000001',
      publishedAt: '2026-11-04T00:00:00.000Z',
      location: {
        commune: 'Bordeaux',
        district: 'Caudéran',
        precision: 'street',
      },
    }),
    duplicates: [],
    warnings: [],
    url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2800000001',
    emailSubject: null,
    emailFrom: null,
    receivedAt: at,
    decidedAt: null,
    decidedById: null,
    listingId: null,
    createdAt: at,
    explorationId: EXPLORATION_ID,
    portal: 'leboncoin',
    excerpt: 'Exemple fictif : T3 traversant, balcon de 8 m², cave.',
    dismissReason: null,
    distinct: false,
    merge: null,
    fit: fitOf(),
    ...over,
  }
}

export function fakeExplorationSummary(
  over: Partial<ExplorationSummary> = {}
): ExplorationSummary {
  return {
    id: EXPLORATION_ID,
    workspaceId: '22222222-2222-4222-8222-222222222222',
    author: { id: LISTING_ID, displayName: 'Richard' },
    channel: 'mcp',
    startedAt: '2026-11-05T17:34:00.000Z',
    finishedAt: at,
    criteria: [
      { id: CRITERIA_ID, name: '[Exemple] Caudéran et Le Bouscat, T3' },
    ],
    portals: [
      {
        portal: 'leboncoin',
        status: 'read',
        count: 3,
        note: null,
        searchUrl: null,
      },
      {
        portal: 'logicimmo',
        status: 'blocked',
        count: 0,
        note: 'Vérification anti-robot : non contournée',
        searchUrl: null,
      },
    ],
    counts: {
      ...EMPTY_EXPLORATION_COUNTS,
      seen: 4,
      toValidate: 2,
      new: 1,
      duplicateProbable: 1,
      known: 1,
      out: 1,
      draftsCreated: 2,
      blockedPortals: 1,
    },
    summary:
      '4 annonces vues : 2 à valider, 1 déjà suivie, 1 hors critères ; Logic-Immo bloqué',
    notes: null,
    createdAt: at,
    ...over,
  }
}

export function fakeExplorationDetail(
  over: Partial<ExplorationDetail> = {}
): ExplorationDetail {
  const line = (
    position: number,
    outcome: ExplorationDetail['lines'][number]['outcome'],
    title: string,
    why: string
  ): ExplorationDetail['lines'][number] => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${position}`,
    position,
    url: `https://www.leboncoin.fr/ad/ventes_immobilieres/280000000${position}`,
    portal: 'leboncoin',
    title,
    price: 200_000 + position * 1000,
    surface: 60,
    rooms: 3,
    commune: 'Bordeaux',
    district: 'Caudéran',
    outcome,
    why,
    reasons: [],
    level: outcome === 'known' ? null : 'in',
    listing:
      outcome === 'known'
        ? { id: LISTING_ID, title, status: 'to_visit' }
        : null,
    draftId: null,
    excerpt: null,
  })
  return {
    ...fakeExplorationSummary(),
    lines: [
      line(1, 'new', '[Exemple] T3 68 m², balcon sud', 'Dans « Caudéran »'),
      line(
        2,
        'duplicate_probable',
        '[Exemple] T3 66 m²',
        'Doublon probable, à trancher'
      ),
      line(
        3,
        'known',
        '[Exemple] T3 70 m², traversant',
        'Même lien : prix 219 000 € → 212 000 €, appliqué dans « Mises à jour »'
      ),
      line(
        4,
        'out',
        '[Exemple] T4 94 m²',
        'Prix +31 % (maximum 220 000 €, marge 5 %)'
      ),
    ],
    bilan: [
      {
        portal: 'leboncoin',
        label: 'Leboncoin',
        status: 'read',
        count: '3 lues',
        note: '1 à valider · 1 mise à jour',
        blocked: false,
      },
      {
        portal: 'logicimmo',
        label: 'Logic-Immo',
        status: 'blocked',
        count: 'arrêté',
        note: 'Vérification anti-robot : non contournée',
        blocked: true,
      },
    ],
    outDigest: 'prix au-delà de la marge (1)',
    ...over,
  }
}

export function fakeBrief(over: Partial<SearchBrief> = {}): SearchBrief {
  const filters = CriteriaFiltersSchema.parse({
    priceMax: 220_000,
    surfaceMin: 60,
    roomsMin: 3,
    dpeMax: 'D',
  })
  const portal = (
    id: 'leboncoin' | 'seloger' | 'bienici' | 'pap' | 'logicimmo',
    label: string,
    mode: 'parameters' | 'manual',
    enabled = true
  ) => ({
    portal: id,
    label,
    enabled,
    url:
      mode === 'parameters'
        ? 'https://www.leboncoin.fr/recherche?category=9'
        : `https://www.${id}.example.invalid/`,
    mode,
    filtersText:
      'Bordeaux et Le Bouscat · appartement · 3 pièces et plus · ≤ 231 000 € · ≥ 57 m²',
    prefilled: mode === 'parameters' ? ['achat · appartement'] : [],
    toEnter: ['zone : Bordeaux et Le Bouscat', 'DPE E au plus'],
    note: '',
    lastRun:
      id === 'logicimmo'
        ? { status: 'blocked' as const, at, note: 'vérification anti-robot' }
        : null,
  })
  return {
    generatedAt: at,
    criteria: [
      {
        id: CRITERIA_ID,
        name: '[Exemple] Caudéran et Le Bouscat, T3',
        active: true,
        perimeterType: 'polygon',
        perimeterLabel: 'Polygone dessiné',
        filters,
        tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
        thresholds: {
          priceMax: 231_000,
          priceMin: null,
          surfaceMin: 57,
          roomsMin: 3,
          dpeMax: 'E',
          tramMeters: null,
          perimeterMeters: 300,
        },
        zones: [
          { commune: 'Bordeaux', inseeCode: '33063', districts: ['Caudéran'] },
        ],
        lines: [
          {
            key: 'zone',
            label: 'Zone',
            text: 'Bordeaux (Caudéran), plus 300 m autour du polygone',
          },
          {
            key: 'price',
            label: 'Prix',
            text: 'jusqu’à 231 000 € (220 000 € + 5 %)',
          },
        ],
        filtersText: 'Bordeaux · appartement',
        portals: [
          portal('leboncoin', 'Leboncoin', 'parameters'),
          portal('seloger', 'SeLoger', 'manual'),
          portal('bienici', 'Bien’ici', 'manual'),
          portal('pap', 'PAP', 'manual'),
          portal('logicimmo', 'Logic-Immo', 'manual', false),
        ],
        listingCount: 7,
        request: 'Explore pour « [Exemple] Caudéran et Le Bouscat, T3 ».',
      },
    ],
    known: { tracked: 29, dismissed: 4, pending: 2 },
    lastExploration: fakeExplorationSummary(),
    recentExplorations: [fakeExplorationSummary()],
    request: 'Explore pour « [Exemple] Caudéran et Le Bouscat, T3 ».',
    rules: [],
    templatesAsOf: '2026-11-05',
    ...over,
  }
}
