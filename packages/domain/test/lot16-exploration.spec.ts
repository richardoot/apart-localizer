/**
 * Lot 16 : exploration par les critères. Lien d'annonce normalisé, portail
 * d'un lien, brief (seuils élargis de la marge, zones, lignes, liens de
 * recherche fabriqués sans réseau), fiche d'un brouillon, tri d'une annonce
 * lue (déjà suivie, déjà écartée, hors critères, doublon probable,
 * nouvelle), compteurs, phrases et bilan du compte rendu, journal et
 * notifications. Données fictives (« [Exemple] », exemple.invalid).
 */
import { describe, expect, it } from 'vitest'
import {
  CriteriaFiltersSchema,
  DEFAULT_CRITERIA_TOLERANCE,
  PORTAL_SEARCH_TEMPLATES,
  STRICT_CRITERIA_TOLERANCE,
} from '@apart/contracts'
import type {
  BriefCriteriaInput,
  CandidateTriage,
  DuplicateCandidate,
  ExplorationCandidate,
  ExplorationCheck,
  ExplorationLine,
  ExplorationSummary,
  ListingCriteriaFit,
} from '@apart/contracts'
import {
  DRAFTS_INBOX_URL,
  EMPTY_EXPLORATION_COUNTS,
  EXPLORATION_REQUEST,
  EXPLORATION_RULES,
  NO_MEASURES,
  briefCommunes,
  briefCriteria,
  briefLines,
  briefThresholds,
  briefZoneText,
  briefZones,
  candidateEvidence,
  candidateExcerpt,
  candidateObserved,
  candidateTitle,
  candidateTriage,
  candidateWarnings,
  criteriaFit,
  criteriaRequest,
  dedupeCandidates,
  describeActivity,
  dismissalText,
  draftInputFromCandidate,
  explorationCounts,
  explorationHeading,
  explorationLineFilterCounts,
  explorationSummaryText,
  filterExplorationLines,
  fitLineText,
  joinFrench,
  knownLineText,
  lastPortalRuns,
  listingCriteriaFit,
  normalizeListingUrl,
  notificationTypeOf,
  notificationsForActivity,
  outDigest,
  outKeyOf,
  perimeterLabel,
  portalBilan,
  portalFromUrl,
  portalSearch,
  portalSearchUrls,
  searchBrief,
  triageCandidate,
} from '../src/index.js'
import type { CriteriaFitMeasures, TriageFacts } from '../src/index.js'

/** Espaces fines insécables de fr-FR → espaces simples, pour comparer. */
const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value

const CRITERIA_ID = '11111111-1111-4111-8111-111111111111'
const LISTING_ID = '22222222-2222-4222-8222-222222222222'
const DRAFT_ID = '33333333-3333-4333-8333-333333333333'

const filters = CriteriaFiltersSchema.parse({
  priceMax: 220_000,
  surfaceMin: 60,
  roomsMin: 3,
  dpeMax: 'D',
})

const caudéran: BriefCriteriaInput = {
  id: CRITERIA_ID,
  name: '[Exemple] Caudéran et Le Bouscat, T3',
  active: true,
  perimeterType: 'polygon',
  perimeterLabel: 'Polygone dessiné',
  filters,
  tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
  portals: ['leboncoin', 'seloger', 'bienici', 'pap'],
  zones: [
    {
      commune: 'Bordeaux',
      inseeCode: '33063',
      districts: ['Caudéran', 'Saint-Augustin'],
    },
    { commune: 'Le Bouscat', inseeCode: '33069', districts: ['Ermitage'] },
  ],
  listingCount: 7,
}

const candidate = (
  over: Partial<ExplorationCandidate> = {}
): ExplorationCandidate => ({
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2800000001',
  portal: 'leboncoin',
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  commune: 'Bordeaux',
  district: 'Caudéran',
  ...over,
})

/** L'adéquation d'une annonce lue à un critère, mesurée comme au lot 14. */
function fitOf(
  price: number,
  measures: CriteriaFitMeasures = {
    ...NO_MEASURES,
    hasPoint: true,
    precision: 'street',
    pointDistanceMeters: 0,
  }
): ListingCriteriaFit {
  const rule = {
    perimeterType: 'polygon' as const,
    filters,
    tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
  }
  const result = criteriaFit(
    rule,
    {
      price,
      surface: 68,
      rooms: 3,
      dpeClass: 'C',
      commune: 'Bordeaux',
      verdict: null,
    },
    measures
  )
  return listingCriteriaFit({
    entries: [
      {
        criteriaId: CRITERIA_ID,
        name: caudéran.name,
        level: result.level,
        reasons: result.reasons,
        checks: result.checks,
        locationPending: result.locationPending,
        since: '2026-11-05T17:40:00.000Z',
      },
    ],
    since: null,
    status: 'to_study',
    plannedVisits: 0,
  })
}

const NO_FIT: ListingCriteriaFit = listingCriteriaFit({
  entries: [],
  since: null,
  status: 'to_study',
  plannedVisits: 0,
})

const duplicate: DuplicateCandidate = {
  listingId: LISTING_ID,
  title: '[Exemple] T3 66 m², balcon et cave',
  status: 'to_visit',
  price: 215_000,
  surface: 66,
  commune: 'Bordeaux',
  url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/123456789.htm',
  score: 0.8,
  reasons: [
    {
      kind: 'same_commune_price_surface',
      score: 0.8,
      detail: 'Bordeaux : 66 m² contre 66 m², 215 000 € contre 210 000 €',
    },
  ],
  certain: false,
  sellerType: 'unknown',
  sellerName: null,
  sellerReference: null,
  linkCount: 1,
}

const changedCheck: ExplorationCheck = {
  outcome: 'changed',
  summary: 'Prix 219 000 € → 212 000 €',
  changes: [
    {
      field: 'price',
      label: 'Prix',
      before: 219_000,
      after: 212_000,
      disposition: 'applied',
      text: 'Prix 219 000 € → 212 000 €',
    },
  ],
  problem: null,
  checkId: null,
}

const facts = (over: Partial<TriageFacts> = {}): TriageFacts => ({
  index: 0,
  candidate: candidate(),
  normalizedUrl: 'https://leboncoin.fr/ad/ventes_immobilieres/2800000001',
  sameUrl: null,
  check: null,
  duplicates: [],
  lookalikes: [],
  fit: fitOf(214_000),
  ...over,
})

describe('liens', () => {
  it('reconnaît le portail par l’hôte', () => {
    expect(portalFromUrl('https://www.leboncoin.fr/ad/x/123456')).toBe(
      'leboncoin'
    )
    expect(portalFromUrl('https://m.seloger.com/annonces/1.htm')).toBe(
      'seloger'
    )
    expect(portalFromUrl('https://www.bienici.com/annonce/vente/x')).toBe(
      'bienici'
    )
    expect(portalFromUrl('https://bien-ici.com/annonce')).toBe('bienici')
    expect(portalFromUrl('https://www.pap.fr/annonces/appartement-r1')).toBe(
      'pap'
    )
    expect(portalFromUrl('https://www.logic-immo.com/detail-vente-1.htm')).toBe(
      'logicimmo'
    )
    expect(portalFromUrl('https://agence.exemple.invalid/bien/1')).toBe('other')
    expect(portalFromUrl('ftp://leboncoin.fr/x')).toBe('other')
    expect(portalFromUrl('pas un lien')).toBe('other')
    expect(portalFromUrl(null)).toBe('other')
  })

  it('normalise un lien d’annonce : la requête d’un portail ne compte pas, Leboncoin à la forme /ad/', () => {
    expect(
      normalizeListingUrl(
        'http://www.leboncoin.fr/ventes_immobilieres/2800000001.htm?utm_source=x#photos'
      )
    ).toBe('https://leboncoin.fr/ad/ventes_immobilieres/2800000001')
    expect(
      normalizeListingUrl(
        'https://www.leboncoin.fr/ad/ventes_immobilieres/2800000001/'
      )
    ).toBe('https://leboncoin.fr/ad/ventes_immobilieres/2800000001')
    expect(
      normalizeListingUrl(
        'https://www.bienici.com/annonce/vente/bordeaux/appartement/3pieces/ag-1?q=%2Frecherche'
      )
    ).toBe(
      'https://bienici.com/annonce/vente/bordeaux/appartement/3pieces/ag-1'
    )
    expect(
      normalizeListingUrl('https://www.leboncoin.fr/recherche?category=9')
    ).toBe('https://leboncoin.fr/recherche')
  })

  it('ailleurs, garde la requête utile et retire le suivi', () => {
    expect(
      normalizeListingUrl(
        'https://agence.exemple.invalid/bien?id=42&xtor=AL-1&utm_medium=mail&at_campaign=x&mtm_kwd=y&pk_source=z&_gl=1'
      )
    ).toBe('https://agence.exemple.invalid/bien?id=42')
    expect(
      normalizeListingUrl('https://agence.exemple.invalid/bien?xtor=1')
    ).toBe('https://agence.exemple.invalid/bien')
    expect(normalizeListingUrl('mailto:agent@exemple.invalid')).toBeNull()
    expect(normalizeListingUrl(undefined)).toBeNull()
  })
})

describe('brief', () => {
  it('élargit les seuils de la marge', () => {
    expect(briefThresholds(caudéran)).toEqual({
      priceMax: 231_000,
      priceMin: null,
      surfaceMin: 57,
      roomsMin: 3,
      dpeMax: 'E',
      tramMeters: null,
      perimeterMeters: 300,
    })
  })

  it('dit la zone : communes, quartiers, marge', () => {
    expect(n(briefZoneText(caudéran))).toBe(
      'Bordeaux (Caudéran, Saint-Augustin) et Le Bouscat (Ermitage), plus 300 m autour du polygone'
    )
    expect(
      briefZoneText({
        ...caudéran,
        perimeterType: 'point_radius',
        zones: [{ commune: 'Talence', inseeCode: null, districts: [] }],
      })
    ).toBe('Talence, plus 300 m autour du cercle')
    expect(
      briefZoneText({
        ...caudéran,
        perimeterType: 'isochrone',
        tolerance: STRICT_CRITERIA_TOLERANCE,
      })
    ).toContain('(périmètre strict, sans marge)')
    expect(
      n(briefZoneText({ ...caudéran, perimeterType: 'isochrone' }))
    ).toContain('plus 300 m autour du trajet')
    expect(briefZoneText({ ...caudéran, zones: [] })).toContain(
      'contours des quartiers non importés'
    )
    expect(
      briefZoneText({
        ...caudéran,
        perimeterType: null,
        zones: [],
        filters: { ...filters, communes: ['Bordeaux', 'Le Bouscat'] },
      })
    ).toBe('Bordeaux et Le Bouscat (communes du critère, sans périmètre)')
    expect(briefZoneText({ ...caudéran, perimeterType: null, zones: [] })).toBe(
      'Toute la métropole : le critère n’a ni périmètre ni commune'
    )
  })

  it('nomme le périmètre', () => {
    expect(perimeterLabel(null)).toBe('Sans périmètre')
    expect(
      n(
        perimeterLabel({
          type: 'point_radius',
          longitude: -0.6,
          latitude: 44.8,
          radiusMeters: 1200,
        })
      )
    ).toBe('Point et rayon de 1 200 m')
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-0.6, 44.8],
          [-0.59, 44.8],
          [-0.59, 44.81],
          [-0.6, 44.8],
        ] as [number, number][],
      ],
    }
    expect(perimeterLabel({ type: 'polygon', polygon })).toBe(
      'Polygone dessiné'
    )
    const params = {
      origin: {
        type: 'Point' as const,
        coordinates: [-0.6, 44.8] as [number, number],
      },
      originLabel: null,
      mode: 'cycling' as const,
      durationMinutes: 15,
      computedAt: null,
      provider: null,
      approximation: null,
    }
    expect(perimeterLabel({ type: 'isochrone', polygon, params })).toBe(
      'Isochrone 15 min à vélo'
    )
    expect(
      perimeterLabel({
        type: 'isochrone',
        polygon,
        params: { ...params, originLabel: 'gare (adresse fictive)' },
      })
    ).toBe('Isochrone 15 min à vélo depuis gare (adresse fictive)')
  })

  it('joint à la française', () => {
    expect(joinFrench([])).toBe('')
    expect(joinFrench(['A'])).toBe('A')
    expect(joinFrench(['A', 'B', 'C'])).toBe('A, B et C')
    expect(
      briefCommunes({
        ...caudéran,
        zones: [],
        filters: { ...filters, communes: ['Pessac'] },
      })
    ).toEqual(['Pessac'])
  })

  it('écrit les lignes du brief, marges comprises', () => {
    const lines = briefLines(caudéran)
    expect(lines.map(l => l.key)).toEqual(['zone', 'price', 'surface', 'dpe'])
    expect(n(lines[1]?.text)).toBe('jusqu’à 231 000 € (220 000 € + 5 %)')
    expect(n(lines[2]?.text)).toContain(
      '57 m² au moins (60 m² − 5 %), 3 pièces et plus'
    )
    expect(lines[3]?.text).toContain('E au plus (D + marge)')
  })

  it('écrit les lignes d’un critère complet, avec ou sans marge', () => {
    const full: BriefCriteriaInput = {
      ...caudéran,
      filters: CriteriaFiltersSchema.parse({
        priceMax: 220_000,
        priceMin: 150_000,
        surfaceMin: 60,
        roomsMin: 3,
        dpeMax: 'D',
        maxTramDistanceMeters: 500,
        verdicts: ['target'],
        communes: ['Bordeaux'],
      }),
      tolerance: { ...DEFAULT_CRITERIA_TOLERANCE, roomsMin: 1 },
    }
    const lines = briefLines(full)
    expect(lines.map(l => l.key)).toEqual([
      'zone',
      'communes',
      'price',
      'surface',
      'dpe',
      'tram',
      'verdicts',
    ])
    expect(n(lines[2]?.text)).toBe(
      'de 142 500 € (150 000 € − 5 %) à 231 000 € (220 000 € + 5 %)'
    )
    expect(lines[3]?.text).toContain('2 pièces et plus (3 − 1 de marge)')
    expect(n(lines[5]?.text)).toContain('arrêt à 600 m au plus (500 m + 100 m)')
    expect(lines[6]?.text).toContain('cible')
    const strict = briefLines({ ...full, tolerance: STRICT_CRITERIA_TOLERANCE })
    expect(n(strict[2]?.text)).toBe(
      'de 150 000 € (sans marge) à 220 000 € (sans marge)'
    )
    expect(n(strict[3]?.text)).toContain('60 m² au moins, 3 pièces et plus')
    expect(strict[4]?.text).toBe(
      'D au plus ; une annonce sans DPE est lue quand même (« à confirmer »)'
    )
    expect(n(strict[5]?.text)).toContain('arrêt à 500 m au plus ;')
    const minOnly = briefLines({
      ...caudéran,
      filters: CriteriaFiltersSchema.parse({ priceMin: 100_000, roomsMin: 1 }),
    })
    expect(n(minOnly[1]?.text)).toBe('à partir de 95 000 € (100 000 € − 5 %)')
    expect(minOnly[2]?.text).toContain('1 pièce et plus')
  })

  it('un critère sans seuil n’a que sa zone ; une marge large s’écrit en entier', () => {
    const bare = briefLines({
      ...caudéran,
      filters: CriteriaFiltersSchema.parse({}),
    })
    expect(bare.map(l => l.key)).toEqual(['zone'])
    const wide = briefLines({
      ...caudéran,
      filters: CriteriaFiltersSchema.parse({
        priceMax: 200_000,
        surfaceMin: 50,
      }),
      tolerance: { ...DEFAULT_CRITERIA_TOLERANCE, priceMaxShare: 0.15 },
    })
    expect(n(wide[1]?.text)).toBe('jusqu’à 230 000 € (200 000 € + 15 %)')
    expect(n(wide[2]?.text)).toMatch(/^47,5 m² au moins \(50 m² − 5 %\) ;/)
    const one = portalSearch(PORTAL_SEARCH_TEMPLATES.pap, {
      ...caudéran,
      filters: CriteriaFiltersSchema.parse({ roomsMin: 1 }),
    })
    expect(one.toEnter).toContain('1 pièce et plus')
    expect(
      briefZones([
        {
          kind: 'quartier',
          name: 'B',
          commune: 'Bordeaux',
          inseeCode: '33063',
          share: 0.5,
        },
        {
          kind: 'quartier',
          name: 'A',
          commune: 'Bordeaux',
          inseeCode: '33063',
          share: 0.5,
        },
        {
          kind: 'quartier',
          name: 'C',
          commune: 'Bordeaux',
          inseeCode: '33063',
          share: null,
        },
      ])[0]?.districts
    ).toEqual(['A', 'B', 'C'])
  })

  it('fabrique le lien Leboncoin sans réseau, bornes arrondies pour ne rien exclure', () => {
    const search = portalSearch(PORTAL_SEARCH_TEMPLATES.leboncoin, {
      ...caudéran,
      filters: { ...filters, priceMin: 150_000, surfaceMin: 60.5 },
    })
    const url = new URL(search.url)
    expect(url.origin + url.pathname).toBe('https://www.leboncoin.fr/recherche')
    expect(url.searchParams.get('category')).toBe('9')
    expect(url.searchParams.get('real_estate_type')).toBe('2')
    expect(url.searchParams.get('price')).toBe('142500-231000')
    expect(url.searchParams.get('square')).toBe('57-max')
    expect(url.searchParams.get('rooms')).toBe('3-max')
    expect(search.mode).toBe('parameters')
    expect(search.enabled).toBe(true)
    expect(n(search.filtersText)).toBe(
      'Bordeaux et Le Bouscat · appartement · 3 pièces et plus · 142 500 € à 231 000 € · ≥ 57 m² · DPE E au plus'
    )
    expect(search.toEnter).toEqual([
      'zone : Bordeaux et Le Bouscat',
      'DPE E au plus',
    ])
    expect(search.prefilled[0]).toBe('achat · appartement')
  })

  it('un portail sans paramètre sûr ouvre sa page de recherche : filtres à saisir', () => {
    const search = portalSearch(PORTAL_SEARCH_TEMPLATES.logicimmo, caudéran)
    expect(search.url).toBe('https://www.logic-immo.com/')
    expect(search.mode).toBe('manual')
    expect(search.enabled).toBe(false)
    expect(search.prefilled).toEqual([])
    expect(n(search.toEnter.join(' | '))).toBe(
      'Bordeaux et Le Bouscat | achat · appartement | 3 pièces et plus | ≤ 231 000 € | ≥ 57 m² | DPE E au plus'
    )
    const nothing = portalSearch(PORTAL_SEARCH_TEMPLATES.leboncoin, {
      ...caudéran,
      perimeterType: null,
      zones: [],
      filters: CriteriaFiltersSchema.parse({ priceMin: 90_000 }),
    })
    expect(new URL(nothing.url).searchParams.get('price')).toBe('85500-max')
    expect(nothing.filtersText).toContain('Bordeaux Métropole')
    const unmapped = portalSearch(PORTAL_SEARCH_TEMPLATES.leboncoin, {
      ...caudéran,
      zones: [],
      filters: CriteriaFiltersSchema.parse({}),
    })
    expect(unmapped.filtersText).toBe(
      'la zone du critère (voir la carte) · appartement'
    )
  })

  it('les portails d’un critère, avec le dernier passage de chacun', () => {
    const exploration = {
      finishedAt: '2026-11-05T17:46:00.000Z',
      portals: [
        {
          portal: 'logicimmo',
          status: 'blocked',
          count: 0,
          note: 'vérification anti-robot',
          searchUrl: null,
        },
        {
          portal: 'other',
          status: 'read',
          count: 1,
          note: null,
          searchUrl: null,
        },
        {
          portal: 'leboncoin',
          status: 'read',
          count: 9,
          note: null,
          searchUrl: null,
        },
      ],
    } as Pick<ExplorationSummary, 'portals' | 'finishedAt'>
    const older = {
      finishedAt: '2026-10-30T20:10:00.000Z',
      portals: [
        {
          portal: 'leboncoin',
          status: 'blocked',
          count: 0,
          note: null,
          searchUrl: null,
        },
      ],
    } as Pick<ExplorationSummary, 'portals' | 'finishedAt'>
    const runs = lastPortalRuns([older, exploration])
    expect(runs.get('leboncoin')?.status).toBe('read')
    expect(runs.get('logicimmo')?.note).toBe('vérification anti-robot')
    const searches = portalSearchUrls(caudéran, runs)
    expect(searches.map(s => s.portal)).toEqual([
      'leboncoin',
      'seloger',
      'bienici',
      'pap',
      'logicimmo',
    ])
    expect(searches[4]?.lastRun?.status).toBe('blocked')
    expect(searches[1]?.lastRun).toBeNull()
  })

  it('le brief complet : critères, connues, dernières explorations, règles', () => {
    const summary = (id: string, finishedAt: string): ExplorationSummary => ({
      id,
      workspaceId: '44444444-4444-4444-8444-444444444444',
      author: null,
      channel: 'mcp',
      startedAt: finishedAt,
      finishedAt,
      criteria: [],
      portals: [],
      counts: { ...EMPTY_EXPLORATION_COUNTS },
      summary: 'Aucune annonce lue',
      notes: null,
      createdAt: finishedAt,
    })
    const brief = searchBrief({
      criteria: [
        caudéran,
        { ...caudéran, id: DRAFT_ID, name: 'Mérignac, tram A' },
      ],
      known: { tracked: 29, dismissed: 4, pending: 0 },
      explorations: [
        summary(
          '55555555-5555-4555-8555-555555555551',
          '2026-10-30T20:10:00.000Z'
        ),
        summary(
          '55555555-5555-4555-8555-555555555552',
          '2026-11-05T17:46:00.000Z'
        ),
      ],
      now: '2026-11-05T18:00:00.000Z',
    })
    expect(brief.criteria).toHaveLength(2)
    expect(brief.request).toBe(EXPLORATION_REQUEST)
    expect(brief.lastExploration?.id).toBe(
      '55555555-5555-4555-8555-555555555552'
    )
    expect(brief.recentExplorations).toHaveLength(2)
    expect(brief.rules).toEqual([...EXPLORATION_RULES])
    expect(brief.templatesAsOf).toBe('2026-11-05')
    expect(brief.known.dismissed).toBe(4)
    const one = searchBrief({
      criteria: [caudéran],
      known: { tracked: 0, dismissed: 0, pending: 0 },
      explorations: [],
      now: '2026-11-05T18:00:00.000Z',
    })
    expect(one.request).toBe(criteriaRequest(caudéran.name))
    expect(one.lastExploration).toBeNull()
    const criteria = briefCriteria(caudéran)
    expect(criteria.request).toBe(`Explore pour « ${caudéran.name} ».`)
    expect(criteria.listingCount).toBe(7)
    expect(briefCriteria({ ...caudéran, portals: [] }).filtersText).toContain(
      'Bordeaux'
    )
  })

  it('les zones : quartiers officiels d’abord, IRIS sinon, commune entière', () => {
    const zones = briefZones([
      {
        kind: 'iris',
        name: 'Caudéran Centre',
        commune: 'Bordeaux',
        inseeCode: '33063',
        share: 0.9,
      },
      {
        kind: 'quartier',
        name: 'Caudéran',
        commune: 'Bordeaux',
        inseeCode: '33063',
        share: 0.6,
      },
      {
        kind: 'quartier',
        name: 'Saint-Augustin',
        commune: 'Bordeaux',
        inseeCode: '33063',
        share: 0.2,
      },
      {
        kind: 'iris',
        name: 'Ermitage',
        commune: 'Le Bouscat',
        inseeCode: '33069',
        share: null,
      },
      {
        kind: 'iris',
        name: 'Les Écus',
        commune: 'Le Bouscat',
        inseeCode: '33069',
        share: 0.3,
      },
      {
        kind: 'commune',
        name: 'Eysines',
        commune: 'Eysines',
        inseeCode: '33162',
        share: 0.1,
      },
    ])
    expect(zones).toEqual([
      {
        commune: 'Bordeaux',
        inseeCode: '33063',
        districts: ['Caudéran', 'Saint-Augustin'],
      },
      { commune: 'Eysines', inseeCode: '33162', districts: [] },
      {
        commune: 'Le Bouscat',
        inseeCode: '33069',
        districts: ['Les Écus', 'Ermitage'],
      },
    ])
    expect(briefZones([], 2)).toEqual([])
  })
})

describe('une annonce lue', () => {
  it('titre, extrait masqué, valeurs observées, preuve', () => {
    expect(candidateTitle(candidate())).toBe('[Exemple] T3 68 m², balcon sud')
    const { title: _t, ...untitled } = candidate()
    expect(candidateTitle(untitled)).toBe('Annonce Leboncoin, Caudéran')
    expect(candidateTitle({ url: 'https://pap.fr/a', portal: 'pap' })).toBe(
      'Annonce PAP'
    )
    expect(
      candidateExcerpt({
        excerpt: 'Appelez le 06 12 34 56 78 ou agent@exemple.invalid',
      })
    ).toBe('Appelez le [téléphone masqué] ou [e-mail masqué]')
    expect(candidateExcerpt({})).toBeNull()
    expect(candidateObserved(candidate())).toEqual({
      online: true,
      price: 214_000,
      surface: 68,
      rooms: 3,
      dpeClass: 'C',
    })
    expect(
      candidateObserved(
        candidate({
          annualCharges: 1_680,
          propertyTax: 900,
          publishedAt: '2026-11-04',
        })
      )
    ).toMatchObject({
      annualCharges: 1_680,
      propertyTax: 900,
      publishedAt: '2026-11-04',
    })
    expect(
      candidateObserved({ url: 'https://pap.fr/a', portal: 'pap' })
    ).toEqual({ online: true })
    expect(n(candidateEvidence(candidate()))).toBe(
      'Vue sur Leboncoin pendant une exploration : Prix : 214 000 €, 68 m², 3 pièces'
    )
    expect(
      candidateEvidence({ url: 'https://pap.fr/a', portal: 'pap', rooms: 1 })
    ).toBe('Vue sur PAP pendant une exploration : 1 pièce')
    expect(candidateEvidence({ url: 'https://pap.fr/a', portal: 'pap' })).toBe(
      'Vue sur PAP pendant une exploration'
    )
  })

  it('la fiche d’un brouillon : ce qui a été lu, en provenance « annonce »', () => {
    const now = new Date('2026-11-05T17:40:00.000Z')
    const { input, warnings } = draftInputFromCandidate(
      candidate({
        portal: 'logicimmo',
        url: 'https://www.logic-immo.com/detail-vente-1.htm',
        publishedAt: '2026-11-04',
        excerpt: 'Exemple fictif : balcon, tél. 06 12 34 56 78.',
        address: '1 rue de l’Exemple (adresse fictive)',
        inseeCode: '33063',
      }),
      now
    )
    expect(input.source).toBe('autre')
    expect(input.sourceLabel).toBe('Logic-Immo')
    expect(input.price).toBe(214_000)
    expect(input.publishedAt).toBe('2026-11-04T00:00:00.000Z')
    expect(input.description).toBe(
      'Exemple fictif : balcon, tél. [téléphone masqué].'
    )
    expect(input.location).toMatchObject({
      commune: 'Bordeaux',
      district: 'Caudéran',
      inseeCode: '33063',
      addressRaw: '1 rue de l’Exemple (adresse fictive)',
      point: null,
    })
    expect(input.fieldSources.price).toEqual({
      source: 'listing',
      confidence: 0.8,
      evidence: 'Lu sur Logic-Immo par Claude',
      recordedAt: now.toISOString(),
    })
    expect(input.fieldSources.surface).toBeDefined()
    expect(input.fieldSources.annualCharges).toBeUndefined()
    expect(warnings).toEqual([])
    const bare = draftInputFromCandidate({
      url: 'https://www.pap.fr/annonces/r1',
      portal: 'pap',
    })
    expect(bare.input.price).toBe(0)
    expect(bare.input.source).toBe('pap')
    expect(bare.input.title).toBe('Annonce PAP')
    expect(bare.input.publishedAt).toBeNull()
    expect(bare.warnings).toEqual([
      'Prix à compléter.',
      'Surface à demander.',
      'Nombre de pièces à demander.',
      'DPE à demander.',
      'Adresse ou quartier à préciser.',
    ])
    expect(candidateWarnings(candidate())).toEqual([])
  })

  it('un même lien envoyé deux fois n’en fait qu’un', () => {
    const { kept, dropped } = dedupeCandidates([
      candidate(),
      candidate({
        url: 'https://www.leboncoin.fr/ventes_immobilieres/2800000001.htm',
      }),
      candidate({ url: 'pas-un-lien' as string }),
      candidate({ url: 'pas-un-lien' as string }),
    ])
    expect(dropped).toBe(1)
    expect(kept.map(k => k.index)).toEqual([0, 2, 3])
    expect(kept[1]?.normalizedUrl).toBeNull()
  })
})

describe('tri', () => {
  it('une annonce suivie au même lien : déjà suivie, sa vérification s’appliquera', () => {
    const decision = triageCandidate(
      facts({
        sameUrl: {
          kind: 'listing',
          listing: {
            id: LISTING_ID,
            title: '[Exemple] T3 70 m², traversant',
            status: 'to_visit',
            discardReason: null,
            discardedAt: null,
          },
        },
        check: changedCheck,
      })
    )
    expect(decision.outcome).toBe('known')
    expect(n(decision.why)).toBe(
      'Même lien : prix 219 000 € → 212 000 €, à appliquer (vérification)'
    )
    expect(decision.listing?.id).toBe(LISTING_ID)
    expect(n(knownLineText(changedCheck, true))).toBe(
      'Même lien : prix 219 000 € → 212 000 €, appliqué, noté dans l’Historique'
    )
    expect(n(knownLineText(changedCheck, false))).toBe(
      'Même lien : prix 219 000 € → 212 000 €, non appliqué'
    )
    expect(
      knownLineText({ ...changedCheck, outcome: 'unchanged', changes: [] })
    ).toBe('Même lien, rien de changé')
    expect(
      knownLineText({ ...changedCheck, outcome: null, problem: 'garde-fou' })
    ).toBe('Même lien : vérification non enregistrée (garde-fou)')
    expect(
      knownLineText({ ...changedCheck, outcome: null, problem: null })
    ).toBe('Même lien : vérification non enregistrée (entrée incohérente)')
    expect(knownLineText(null)).toBe('Même lien : déjà suivie')
    const item = candidateTriage(
      facts({
        sameUrl: {
          kind: 'listing',
          listing: {
            id: LISTING_ID,
            title: 'x',
            status: 'to_visit',
            discardReason: null,
            discardedAt: null,
          },
        },
        check: changedCheck,
        applied: true,
      })
    )
    expect(item.fit).toBeNull()
    expect(item.check?.outcome).toBe('changed')
    expect(item.why).toContain('appliqué, noté dans')
  })

  it('écartée : jamais reproposée, la raison gardée', () => {
    const listing = triageCandidate(
      facts({
        sameUrl: {
          kind: 'listing',
          listing: {
            id: LISTING_ID,
            title: '[Exemple] T3 58 m², rez-de-chaussée',
            status: 'discarded',
            discardReason: 'rez-de-chaussée sur rue',
            discardedAt: '2026-10-30T10:00:00.000Z',
          },
        },
      })
    )
    expect(listing.outcome).toBe('dismissed')
    expect(listing.why).toBe(
      'Écartée le 30 octobre 2026 : « rez-de-chaussée sur rue »'
    )
    const draft = triageCandidate(
      facts({
        sameUrl: {
          kind: 'draft',
          draftId: DRAFT_ID,
          status: 'dismissed',
          title: 'x',
          reason: null,
          decidedAt: '2026-10-30T10:00:00.000Z',
          decidedBy: 'Chloé',
        },
      })
    )
    expect(draft.outcome).toBe('dismissed')
    expect(draft.draftId).toBe(DRAFT_ID)
    expect(draft.why).toBe('Écartée par Chloé le 30 octobre 2026')
    const lookalike = triageCandidate(
      facts({
        lookalikes: [
          {
            kind: 'draft',
            id: DRAFT_ID,
            title: '[Exemple] T3 rdc',
            match: 'duplicate',
            reason: 'bruit',
            at: null,
            by: null,
          },
        ],
      })
    )
    expect(lookalike.outcome).toBe('dismissed')
    expect(lookalike.draftId).toBe(DRAFT_ID)
    expect(
      dismissalText({
        kind: 'listing',
        id: LISTING_ID,
        title: 'T',
        match: 'duplicate',
        reason: null,
        at: null,
        by: null,
      })
    ).toBe('Probablement « T », écartée')
    const listingLookalike = triageCandidate(
      facts({
        lookalikes: [
          {
            kind: 'listing',
            id: LISTING_ID,
            title: 'T',
            match: 'duplicate',
            reason: null,
            at: null,
            by: null,
          },
        ],
      })
    )
    expect(listingLookalike.draftId).toBeNull()
  })

  it('hors critères même avec la marge : une ligne seulement', () => {
    const out = triageCandidate(facts({ fit: fitOf(289_000) }))
    expect(out.outcome).toBe('out')
    expect(n(out.why)).toBe('Prix +31 % (maximum 220 000 €, marge 5 %)')
  })

  it('doublon probable d’une annonce suivie : brouillon à trancher', () => {
    const decision = triageCandidate(facts({ duplicates: [duplicate] }))
    expect(decision.outcome).toBe('duplicate_probable')
    expect(decision.why).toBe(
      `Dans « ${caudéran.name} » ; doublon probable de « [Exemple] T3 66 m², balcon et cave », à trancher`
    )
    expect(decision.duplicates).toHaveLength(1)
  })

  it('nouvelle : brouillon « À valider », dans, à la marge ou à confirmer', () => {
    expect(triageCandidate(facts()).outcome).toBe('new')
    expect(triageCandidate(facts()).why).toBe(`Dans « ${caudéran.name} »`)
    expect(n(triageCandidate(facts({ fit: fitOf(226_000) })).why)).toBe(
      'À la marge : Prix +2,7 % (maximum 220 000 €, marge 5 %)'
    )
    const confirm = fitOf(214_000, { ...NO_MEASURES })
    expect(triageCandidate(facts({ fit: confirm })).why).toBe(
      'À confirmer : Pas de repère : adresse à préciser'
    )
    expect(triageCandidate(facts({ fit: NO_FIT })).why).toBe(
      'Aucun critère actif : dans les critères par défaut'
    )
    expect(fitLineText({ ...fitOf(214_000), name: null })).toBe(
      'Dans les critères'
    )
    expect(fitLineText({ ...fitOf(289_000), reasons: [] })).toBe(
      'Hors critères'
    )
    expect(fitLineText({ ...confirm, reasons: [] })).toBe('À confirmer')
  })

  it('un brouillon déjà à valider au même lien : pas de nouveau brouillon', () => {
    const sameUrl = {
      kind: 'draft' as const,
      draftId: DRAFT_ID,
      status: 'pending' as const,
      title: 'x',
      reason: null,
      decidedAt: null,
      decidedBy: null,
    }
    const pending = triageCandidate(facts({ sameUrl, fit: fitOf(289_000) }))
    expect(pending.outcome).toBe('new')
    expect(pending.alreadyPending).toBe(true)
    expect(pending.why).toContain('(déjà dans « À valider »)')
    const dup = triageCandidate(facts({ sameUrl, duplicates: [duplicate] }))
    expect(dup.outcome).toBe('duplicate_probable')
    expect(dup.draftId).toBe(DRAFT_ID)
    expect(
      triageCandidate(
        facts({
          sameUrl,
          lookalikes: [
            {
              kind: 'draft',
              id: DRAFT_ID,
              title: 'x',
              match: 'duplicate',
              reason: null,
              at: null,
              by: null,
            },
          ],
        })
      ).outcome
    ).toBe('new')
  })

  it('la forme rendue : raisons, avertissements, champs vides', () => {
    const item = candidateTriage(
      facts({
        candidate: { url: 'https://www.pap.fr/annonces/r1', portal: 'pap' },
        fit: fitOf(214_000),
      })
    )
    expect(item).toMatchObject({
      title: 'Annonce PAP',
      price: null,
      surface: null,
      rooms: null,
      commune: null,
      district: null,
      outcome: 'new',
      check: null,
    })
    expect(item.warnings).toContain('Prix à compléter.')
    const out = candidateTriage(facts({ fit: fitOf(289_000) }))
    expect(out.warnings).toEqual([])
    expect(out.reasons).toHaveLength(1)
  })
})

describe('compte rendu', () => {
  const triaged = (
    outcome: CandidateTriage['outcome'],
    over: Partial<CandidateTriage> = {}
  ) =>
    ({ outcome, alreadyPending: false, check: null, ...over }) as Pick<
      CandidateTriage,
      'outcome' | 'alreadyPending' | 'check'
    >

  it('compte par résultat', () => {
    const counts = explorationCounts(
      [
        triaged('new'),
        triaged('new', { alreadyPending: true }),
        triaged('duplicate_probable'),
        triaged('known', { check: changedCheck }),
        triaged('known', { check: { ...changedCheck, outcome: 'unchanged' } }),
        triaged('dismissed'),
        triaged('out'),
        triaged('out'),
      ],
      [{ status: 'read' }, { status: 'blocked' }]
    )
    expect(counts).toEqual({
      seen: 8,
      toValidate: 3,
      new: 2,
      duplicateProbable: 1,
      known: 2,
      dismissed: 1,
      out: 2,
      attached: 0,
      draftsCreated: 2,
      checksChanged: 1,
      blockedPortals: 1,
    })
    expect(explorationCounts([])).toEqual(EMPTY_EXPLORATION_COUNTS)
  })

  it('résume en une phrase, portails bloqués compris', () => {
    expect(
      explorationSummaryText(
        {
          ...EMPTY_EXPLORATION_COUNTS,
          seen: 23,
          toValidate: 5,
          known: 3,
          dismissed: 1,
          out: 14,
        },
        [
          { portal: 'leboncoin', status: 'read' },
          { portal: 'logicimmo', status: 'blocked' },
        ]
      )
    ).toBe(
      '23 annonces vues : 5 à valider, 3 déjà suivies, 1 déjà écartée, 14 hors critères ; Logic-Immo bloqué'
    )
    expect(
      explorationSummaryText({
        ...EMPTY_EXPLORATION_COUNTS,
        seen: 1,
        known: 1,
        dismissed: 2,
      })
    ).toBe('1 annonce vue : 1 déjà suivie, 2 déjà écartées')
    expect(
      explorationSummaryText(EMPTY_EXPLORATION_COUNTS, [
        { portal: 'pap', status: 'blocked' },
        { portal: 'seloger', status: 'blocked' },
      ])
    ).toBe('Aucune annonce lue ; PAP et SeLoger bloqués')
    expect(
      explorationSummaryText({ ...EMPTY_EXPLORATION_COUNTS, seen: 2 })
    ).toBe('2 annonces vues')
  })

  it('regroupe les raisons des hors critères', () => {
    const rooms = listingCriteriaFit({
      entries: [
        {
          criteriaId: CRITERIA_ID,
          name: 'c',
          level: 'out',
          reasons: ['2 pièces (minimum 3)'],
          checks: [
            {
              key: 'price_max',
              level: 'in',
              label: 'p',
              value: null,
              detail: '',
              reason: null,
              location: false,
            },
            {
              key: 'rooms_min',
              level: 'out',
              label: 'r',
              value: '2',
              detail: '',
              reason: '2 pièces (minimum 3)',
              location: false,
            },
          ],
          locationPending: false,
          since: '2026-11-05T17:40:00.000Z',
        },
      ],
      since: null,
      status: 'to_study',
      plannedVisits: 0,
    })
    expect(outKeyOf(rooms)).toBe('rooms_min')
    expect(outKeyOf(fitOf(214_000))).toBeNull()
    expect(outKeyOf(null)).toBeNull()
    expect(
      outDigest([
        { outcome: 'out', fit: fitOf(289_000) },
        { outcome: 'out', fit: fitOf(300_000) },
        { outcome: 'out', fit: rooms },
        { outcome: 'out', fit: { ...rooms, criteria: [] } },
        { outcome: 'new', fit: fitOf(214_000) },
      ])
    ).toBe('prix au-delà de la marge (2), pas assez de pièces (1)')
    expect(outDigest([{ outcome: 'new', fit: null }])).toBeNull()
  })

  it('le bilan par portail : lues et ce qu’elles ont donné, ou l’arrêt', () => {
    const line = (
      portal: ExplorationLine['portal'],
      outcome: ExplorationLine['outcome'],
      why = ''
    ) => ({ portal, outcome, why })
    const bilan = portalBilan(
      [
        {
          portal: 'leboncoin',
          status: 'read',
          count: 9,
          note: null,
          searchUrl: null,
        },
        {
          portal: 'seloger',
          status: 'read',
          count: 0,
          note: '2 pages',
          searchUrl: null,
        },
        {
          portal: 'pap',
          status: 'read',
          count: 0,
          note: null,
          searchUrl: null,
        },
        {
          portal: 'logicimmo',
          status: 'blocked',
          count: 0,
          note: null,
          searchUrl: null,
        },
        {
          portal: 'bienici',
          status: 'skipped',
          count: 0,
          note: null,
          searchUrl: null,
        },
        {
          portal: 'other',
          status: 'read',
          count: 1,
          note: null,
          searchUrl: null,
        },
      ],
      [
        line('leboncoin', 'new'),
        line('leboncoin', 'new'),
        line('leboncoin', 'known', 'Même lien, rien de changé'),
        line('leboncoin', 'dismissed'),
        line('leboncoin', 'out'),
        line(
          'seloger',
          'known',
          'Même lien : prix, appliqué, noté dans l’Historique'
        ),
        line('seloger', 'duplicate_probable'),
      ]
    )
    expect(bilan[0]).toEqual({
      portal: 'leboncoin',
      label: 'Leboncoin',
      status: 'read',
      count: '9 lues',
      note: '2 à valider · 1 suivie · 1 déjà écartée · 1 hors critères',
      blocked: false,
    })
    expect(bilan[1]?.count).toBe('2 lues')
    expect(bilan[1]?.note).toBe('1 doublon probable · 1 mise à jour — 2 pages')
    expect(bilan[2]).toMatchObject({ count: 'aucune', note: 'Aucune annonce' })
    expect(bilan[3]).toMatchObject({
      count: 'arrêté',
      blocked: true,
      note: 'Portail bloqué : non contourné',
    })
    expect(bilan[4]).toMatchObject({
      count: 'non parcouru',
      note: 'Non parcouru cette fois',
    })
    expect(bilan[5]).toMatchObject({ count: '1 lue', note: 'rien de nouveau' })
    // Une exploration enregistrée avant le lot 19 (« appliqué dans « Mises à
    // jour » ») compte toujours sa mise à jour.
    expect(
      portalBilan(
        [
          {
            portal: 'seloger',
            status: 'read',
            count: 1,
            note: null,
            searchUrl: null,
          },
        ],
        [
          line(
            'seloger',
            'known',
            'Même lien : prix, appliqué dans « Mises à jour »'
          ),
        ]
      )[0]?.note
    ).toBe('1 mise à jour')
    expect(
      portalBilan(
        [
          {
            portal: 'logicimmo',
            status: 'blocked',
            count: 0,
            note: 'Vérification anti-robot : non contournée',
            searchUrl: null,
          },
          {
            portal: 'pap',
            status: 'skipped',
            count: 0,
            note: 'décoché',
            searchUrl: null,
          },
        ],
        []
      ).map(b => b.note)
    ).toEqual(['Vérification anti-robot : non contournée', 'décoché'])
  })

  it('filtre les lignes', () => {
    const lines = [
      { outcome: 'new' as const },
      { outcome: 'duplicate_probable' as const },
      { outcome: 'known' as const },
      { outcome: 'dismissed' as const },
      { outcome: 'out' as const },
      { outcome: 'out' as const },
    ]
    expect(filterExplorationLines(lines, 'todo')).toHaveLength(2)
    expect(filterExplorationLines(lines, 'all')).toHaveLength(6)
    expect(explorationLineFilterCounts(lines)).toEqual({
      all: 6,
      todo: 2,
      known: 1,
      dismissed: 1,
      out: 2,
    })
  })

  it('le titre du bandeau', () => {
    const now = new Date('2026-11-05T19:00:00.000Z')
    expect(
      explorationHeading(
        {
          finishedAt: '2026-11-05T17:40:00.000Z',
          author: { id: LISTING_ID, displayName: 'Richard' },
          channel: 'mcp',
        },
        now
      )
    ).toBe('Exploration de Claude, aujourd’hui à 18:40, pour Richard')
    expect(
      explorationHeading(
        {
          finishedAt: '2026-10-30T20:10:00.000Z',
          author: null,
          channel: 'web',
        },
        now
      )
    ).toBe('Exploration, le 30 octobre à 21:10')
    expect(
      explorationHeading({
        finishedAt: '2026-11-05T17:40:00.000Z',
        author: null,
        channel: 'mcp',
      })
    ).toMatch(/^Exploration de Claude, /)
  })
})

describe('journal et notifications', () => {
  const members = [
    { id: '66666666-6666-4666-8666-666666666661', displayName: 'Richard' },
    { id: '66666666-6666-4666-8666-666666666662', displayName: 'Chloé' },
  ]
  const richardId = members[0]?.id ?? ''

  it('décrit les écritures des brouillons et des explorations', () => {
    const names = new Map(
      members.map(m => [m.id, { ...m, handle: m.displayName.toLowerCase() }])
    )
    const d = (action: string, after: unknown) =>
      describeActivity(
        {
          action,
          channel: 'web',
          actorMemberId: richardId,
          before: null,
          after,
        },
        names
      )
    expect(d('draft.accepted', { origin: 'exploration' }).summary).toBe(
      'a ajouté à la liste une annonce trouvée par Claude'
    )
    expect(d('draft.accepted', { origin: 'email' }).summary).toBe(
      'a ajouté à la liste une annonce reçue par e-mail'
    )
    expect(
      d('draft.dismissed', { origin: 'exploration', reason: 'rez-de-chaussée' })
        .summary
    ).toBe('a écarté une annonce trouvée par Claude : « rez-de-chaussée »')
    expect(d('draft.dismissed', {}).summary).toBe(
      'a écarté une annonce reçue par e-mail'
    )
    expect(d('draft.restored', { origin: 'exploration' }).summary).toBe(
      'a remis « à valider » une annonce trouvée par Claude'
    )
    expect(
      d('draft.merged', {
        origin: 'exploration',
        listingTitle: 'T3',
        summary: 'Prix 215 000 € → 210 000 €',
      }).summary
    ).toBe(
      'a reconnu une annonce déjà suivie dans une annonce trouvée par Claude « T3 » : Prix 215 000 € → 210 000 €'
    )
    expect(d('draft.merged', { origin: 'exploration' }).summary).toBe(
      'a reconnu une annonce déjà suivie dans une annonce trouvée par Claude'
    )
    expect(d('draft.distinct', { origin: 'exploration' }).summary).toBe(
      'a jugé distincte une annonce trouvée par Claude (ce n’est pas un doublon)'
    )
    const recorded = d('exploration.recorded', {
      portals: ['Leboncoin', 'PAP', 3],
      summary: '2 annonces vues',
    })
    expect(recorded.kind).toBe('exploration')
    expect(recorded.summary).toBe(
      'a exploré les portails (Leboncoin, PAP) : 2 annonces vues'
    )
    expect(d('exploration.recorded', null).summary).toBe(
      'a exploré les portails'
    )
  })

  it('une exploration qui dépose des brouillons prévient l’autre membre', () => {
    const event = {
      action: 'exploration.recorded',
      channel: 'mcp' as const,
      actorMemberId: richardId,
      listingId: null,
      before: null,
      after: { draftsCreated: 5, summary: '23 annonces vues : 5 à valider' },
    }
    expect(notificationTypeOf(event)).toBe('drafts_received')
    const drafts = notificationsForActivity(event, {
      members,
      listingTitle: null,
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      recipientId: members[1]?.id,
      type: 'drafts_received',
      title: 'Claude a trouvé 5 annonces à valider',
      url: DRAFTS_INBOX_URL,
    })
    expect(drafts[0]?.body).toBe(
      'Claude (MCP, pour Richard) a exploré les portails (23 annonces vues : 5 à valider). Rien n’est ajouté à la liste sans votre choix.'
    )
    const one = notificationsForActivity(
      { ...event, after: { draftsCreated: 1 } },
      { members, listingTitle: null }
    )
    expect(one[0]?.title).toBe('Claude a trouvé 1 annonce à valider')
    expect(one[0]?.body).toBe(
      'Claude (MCP, pour Richard) a exploré les portails. Rien n’est ajouté à la liste sans votre choix.'
    )
    expect(
      notificationTypeOf({ ...event, after: { draftsCreated: 0 } })
    ).toBeNull()
    expect(notificationTypeOf({ ...event, after: null })).toBeNull()
  })

  it('une alerte e-mail renvoie aussi vers l’onglet « À valider »', () => {
    const drafts = notificationsForActivity(
      {
        action: 'draft.received',
        channel: 'system',
        actorMemberId: null,
        listingId: null,
        before: null,
        after: { created: 2, subject: 'Alerte' },
      },
      { members, listingTitle: null }
    )
    expect(drafts).toHaveLength(2)
    expect(drafts[0]?.url).toBe('/annonces?etape=a-valider')
  })
})

describe('adéquation : verdict inconnu (annonce lue sans loyer visé)', () => {
  it('un filtre de verdict rend « à confirmer », jamais « hors critères »', () => {
    const result = criteriaFit(
      {
        perimeterType: null,
        filters: CriteriaFiltersSchema.parse({ verdicts: ['target'] }),
        tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
      },
      {
        price: 200_000,
        surface: 60,
        rooms: 3,
        dpeClass: 'C',
        commune: 'Bordeaux',
        verdict: null,
      },
      NO_MEASURES
    )
    expect(result.level).toBe('to_confirm')
    expect(result.reasons).toEqual(['verdict inconnu : loyer visé à saisir'])
    expect(result.locationPending).toBe(false)
  })
})

describe('lot 18 : lien rattaché d’office (même agence, même référence)', () => {
  const target = {
    id: LISTING_ID,
    title: '[Exemple] T3 68 m², balcon sud',
    status: 'to_study' as const,
  }

  it('rattaché d’office, avant les écartées et les hors critères', () => {
    const decision = triageCandidate(
      facts({ attachTo: target, fit: fitOf(289_000) })
    )
    expect(decision.outcome).toBe('attached')
    expect(decision.listing).toEqual(target)
    expect(decision.why).toBe(
      'Même agence et même référence que « [Exemple] T3 68 m², balcon sud » : lien rattaché d’office à sa fiche'
    )
    const triaged = candidateTriage(facts({ attachTo: target }))
    expect(triaged.outcome).toBe('attached')
    expect(triaged.warnings).toEqual([])
    expect(triaged.check).toBeNull()
  })

  it('un brouillon déjà à valider au même lien n’est pas rattaché', () => {
    const decision = triageCandidate(
      facts({
        attachTo: target,
        sameUrl: {
          kind: 'draft',
          draftId: DRAFT_ID,
          status: 'pending',
          title: 'x',
          reason: null,
          decidedAt: null,
          decidedBy: null,
        },
      })
    )
    expect(decision.outcome).toBe('new')
    expect(decision.alreadyPending).toBe(true)
  })

  it('compté et résumé dans le compte rendu, rangé avec les déjà suivies', () => {
    const items = [
      { outcome: 'attached' as const, alreadyPending: false, check: null },
      { outcome: 'new' as const, alreadyPending: false, check: null },
    ]
    const counts = explorationCounts(items)
    expect(counts.attached).toBe(1)
    expect(explorationSummaryText(counts)).toBe(
      '2 annonces vues : 1 à valider, 1 rattachée d’office'
    )
    const lines = [
      { portal: 'seloger' as const, outcome: 'attached' as const, why: 'x' },
      { portal: 'seloger' as const, outcome: 'attached' as const, why: 'y' },
    ]
    expect(
      portalBilan(
        [
          {
            portal: 'seloger',
            status: 'read',
            count: 2,
            note: null,
            searchUrl: null,
          },
        ],
        lines
      )[0]?.note
    ).toBe('2 rattachées d’office')
    expect(filterExplorationLines(lines, 'known')).toHaveLength(2)
    expect(explorationLineFilterCounts(lines).todo).toBe(0)
  })

  it('le vendeur lu passe dans la vérification et dans le brouillon', () => {
    const read = candidate({
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      reference: 'Réf. EX-2041',
    })
    expect(candidateObserved(read)).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      reference: 'Réf. EX-2041',
    })
    const { input } = draftInputFromCandidate(read)
    expect(input.sellerType).toBe('agency')
    expect(input.sellerReference).toBe('EX-2041')
    expect(input.fieldSources.sellerReference?.source).toBe('listing')
    const privateSeller = draftInputFromCandidate(
      candidate({ sellerType: 'private', reference: 'EX-1' })
    ).input
    expect(privateSeller.sellerReference).toBeNull()
  })
})
