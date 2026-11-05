import { describe, expect, it } from 'vitest'
import {
  CriteriaFiltersSchema,
  DEFAULT_CRITERIA_TOLERANCE,
  STRICT_CRITERIA_TOLERANCE,
} from '@apart/contracts'
import type {
  CriteriaFitEntry,
  CriteriaTolerance,
  ListingCriteriaFit,
} from '@apart/contracts'
import {
  NO_MEASURES,
  bestFit,
  computeWhatsNew,
  countFits,
  criteriaFit,
  criteriaFitHistory,
  describeActivity,
  describeListingFit,
  fitChangeFromListing,
  fitExplanation,
  fitForCriteria,
  fitRank,
  fitReasonsText,
  fitSinceText,
  fitTransition,
  formatFitDistance,
  formatFitShare,
  inMainFitTab,
  isPreciseLocation,
  keptLabel,
  keptOutOfCriteria,
  listingCriteriaFit,
  loggedFitChanges,
  loggedFitOrigin,
  matchesFitFilter,
  notificationTypeOf,
  priceTrigger,
  toleranceSummary,
  toleranceThresholds,
  worstLevel,
  whatsNewKindOf,
} from '../src/index.js'
import type {
  CriteriaFitCandidate,
  CriteriaFitMeasures,
  CriteriaFitRule,
  WhatsNewEvent,
} from '../src/index.js'

/** Lot 14 : adéquation aux critères. Données inventées. */

const NBSP = ' '
const eur = (text: string) => text.replace(/(\d) (\d)/g, `$1${NBSP}$2`)

const candidate: CriteriaFitCandidate = {
  price: 215_000,
  surface: 66,
  rooms: 3,
  dpeClass: 'C',
  commune: 'Bordeaux',
  verdict: 'target',
}

const exact: CriteriaFitMeasures = {
  ...NO_MEASURES,
  hasPoint: true,
  precision: 'exact',
  pointDistanceMeters: 0,
  tramPointDistanceMeters: 350,
}

const district = (
  over: Partial<CriteriaFitMeasures> = {}
): CriteriaFitMeasures => ({
  ...NO_MEASURES,
  hasPoint: true,
  precision: 'district',
  hasArea: true,
  pointDistanceMeters: 900,
  areaCovered: false,
  areaDistanceMeters: 0,
  areaInsideShare: 0.4,
  tramPointDistanceMeters: 1200,
  tramAreaDistanceMeters: 350,
  ...over,
})

function rule(
  filters: Record<string, unknown> = {},
  tolerance: CriteriaTolerance = DEFAULT_CRITERIA_TOLERANCE,
  perimeterType: CriteriaFitRule['perimeterType'] = 'polygon'
): CriteriaFitRule {
  return {
    perimeterType,
    filters: CriteriaFiltersSchema.parse(filters),
    tolerance,
  }
}

const level = (
  r: CriteriaFitRule,
  c: CriteriaFitCandidate,
  m: CriteriaFitMeasures
) => criteriaFit(r, c, m).level

describe('criteriaFit : périmètre', () => {
  it('adresse exacte : dedans, à la marge, hors (avec et sans marge)', () => {
    const r = rule()
    expect(criteriaFit(r, candidate, exact)).toMatchObject({
      level: 'in',
      reasons: [],
      locationPending: false,
    })
    const near = criteriaFit(r, candidate, {
      ...exact,
      pointDistanceMeters: 180,
    })
    expect(near.level).toBe('margin')
    expect(near.reasons).toEqual(['180 m hors du périmètre (marge 300 m)'])
    expect(near.locationPending).toBe(false)
    const far = criteriaFit(r, candidate, {
      ...exact,
      pointDistanceMeters: 2400,
    })
    expect(far.level).toBe('out')
    expect(far.reasons).toEqual(['à 2,4 km du périmètre (marge 300 m)'])
    const strict = criteriaFit(rule({}, STRICT_CRITERIA_TOLERANCE), candidate, {
      ...exact,
      pointDistanceMeters: 180,
    })
    expect(strict.level).toBe('out')
    expect(strict.reasons).toEqual(['à 180 m du périmètre'])
    expect(strict.checks[0]?.detail).toBe('Sans marge.')
    // À la rue : le repère décide aussi.
    expect(
      level(r, candidate, {
        ...exact,
        precision: 'street',
        pointDistanceMeters: 100,
      })
    ).toBe('margin')
    // Distance illisible : à confirmer, jamais hors.
    expect(
      criteriaFit(r, candidate, { ...exact, pointDistanceMeters: null })
    ).toMatchObject({
      level: 'to_confirm',
      reasons: ['distance au périmètre inconnue'],
    })
  })

  it('sans repère : à confirmer, adresse à préciser', () => {
    const fit = criteriaFit(
      rule({ maxTramDistanceMeters: 600 }),
      candidate,
      NO_MEASURES
    )
    expect(fit.level).toBe('to_confirm')
    expect(fit.locationPending).toBe(true)
    expect(fit.reasons).toEqual([
      'pas de repère : adresse à préciser',
      'pas de repère : distance au tram inconnue',
    ])
  })

  it('au quartier : le contour décide, jamais le repère', () => {
    const r = rule()
    // Le repère (centre du quartier) est à 900 m hors du périmètre, mais le
    // contour le chevauche : à confirmer (l'exemple de Richard).
    const straddle = criteriaFit(r, candidate, district())
    expect(straddle.level).toBe('to_confirm')
    expect(straddle.locationPending).toBe(true)
    expect(straddle.reasons).toEqual([
      'quartier à cheval sur le périmètre : adresse à préciser',
    ])
    expect(straddle.checks[0]?.detail).toBe(
      'Le contour du quartier est pour 40 % dans le périmètre ; l’adresse décidera.'
    )
    expect(
      criteriaFit(r, candidate, district({ areaInsideShare: null })).checks[0]
        ?.detail
    ).toContain('à cheval sur le périmètre')
    // Contour entièrement dedans : dans, même avec un repère dehors.
    expect(
      criteriaFit(r, candidate, district({ areaCovered: true }))
    ).toMatchObject({
      level: 'in',
      locationPending: false,
    })
    // Contour dans la marge : à confirmer.
    expect(
      criteriaFit(r, candidate, district({ areaDistanceMeters: 120 })).reasons
    ).toEqual([
      'quartier à 120 m du périmètre (marge 300 m) : adresse à préciser',
    ])
    // Contour au-delà : hors, avec ou sans marge.
    expect(
      criteriaFit(r, candidate, district({ areaDistanceMeters: 3100 }))
    ).toMatchObject({
      level: 'out',
      reasons: ['quartier à 3,1 km du périmètre (marge 300 m)'],
    })
    expect(
      criteriaFit(
        rule({}, STRICT_CRITERIA_TOLERANCE),
        candidate,
        district({ areaDistanceMeters: 120 })
      ).reasons
    ).toEqual(['quartier à 120 m du périmètre'])
    // Une distance absente vaut l'infini : hors.
    expect(level(r, candidate, district({ areaDistanceMeters: null }))).toBe(
      'out'
    )
    // Commune seulement : le mot change.
    expect(
      criteriaFit(
        r,
        candidate,
        district({ precision: 'commune', areaCovered: true })
      ).checks[0]?.value
    ).toBe('commune dedans')
  })

  it('imprécise sans contour : le repère et la marge, au mieux à confirmer', () => {
    const r = rule()
    const base = district({
      hasArea: false,
      areaCovered: null,
      areaDistanceMeters: null,
    })
    expect(
      criteriaFit(r, candidate, { ...base, pointDistanceMeters: 0 }).reasons
    ).toEqual(['repère approché dans le périmètre : adresse à préciser'])
    expect(
      criteriaFit(r, candidate, { ...base, pointDistanceMeters: 150 }).reasons
    ).toEqual([
      'repère approché à 150 m du périmètre (marge 300 m) : adresse à préciser',
    ])
    expect(
      criteriaFit(r, candidate, { ...base, pointDistanceMeters: 2000 })
    ).toMatchObject({
      level: 'out',
      reasons: ['repère approché à 2 km du périmètre (marge 300 m)'],
    })
    expect(
      criteriaFit(rule({}, STRICT_CRITERIA_TOLERANCE), candidate, {
        ...base,
        pointDistanceMeters: 2000,
      }).reasons
    ).toEqual(['repère approché à 2 km du périmètre'])
    expect(
      criteriaFit(r, candidate, { ...base, pointDistanceMeters: null })
    ).toMatchObject({
      level: 'to_confirm',
      reasons: ['distance au périmètre inconnue : adresse à préciser'],
    })
    // Précision inconnue avec un repère : imprécise, sans contour.
    expect(isPreciseLocation({ ...base, precision: null })).toBe(false)
    expect(
      criteriaFit(r, candidate, {
        ...base,
        precision: null,
        pointDistanceMeters: 0,
      }).level
    ).toBe('to_confirm')
  })

  it('sans périmètre : aucune ligne de périmètre', () => {
    const fit = criteriaFit(
      rule({}, DEFAULT_CRITERIA_TOLERANCE, null),
      candidate,
      NO_MEASURES
    )
    expect(fit).toEqual({
      level: 'in',
      checks: [],
      reasons: [],
      locationPending: false,
    })
  })
})

describe('criteriaFit : distance au tram', () => {
  const r = rule(
    { maxTramDistanceMeters: 600 },
    DEFAULT_CRITERIA_TOLERANCE,
    null
  )

  it('adresse exacte : dans, à la marge, hors ; arrêts non importés à confirmer', () => {
    expect(criteriaFit(r, candidate, exact).checks[0]).toMatchObject({
      level: 'in',
      value: '350 m',
      detail: 'Marge jusqu’à 700 m.',
    })
    expect(
      criteriaFit(r, candidate, { ...exact, tramPointDistanceMeters: 680 })
        .reasons
    ).toEqual(['tram à 680 m (maximum 600 m, marge 100 m)'])
    expect(
      criteriaFit(r, candidate, { ...exact, tramPointDistanceMeters: 1200 })
    ).toMatchObject({
      level: 'out',
      reasons: ['tram à 1,2 km (maximum 600 m, marge 100 m)'],
    })
    expect(
      criteriaFit(
        rule({ maxTramDistanceMeters: 600 }, STRICT_CRITERIA_TOLERANCE, null),
        candidate,
        {
          ...exact,
          tramPointDistanceMeters: 650,
        }
      )
    ).toMatchObject({ level: 'out', reasons: ['tram à 650 m (maximum 600 m)'] })
    expect(
      criteriaFit(
        rule({ maxTramDistanceMeters: 600 }, STRICT_CRITERIA_TOLERANCE, null),
        candidate,
        exact
      ).checks[0]?.detail
    ).toBe('Sans marge.')
    const unknown = criteriaFit(r, candidate, {
      ...exact,
      tramPointDistanceMeters: null,
    })
    expect(unknown).toMatchObject({
      level: 'to_confirm',
      reasons: ['distance au tram inconnue (arrêts non importés)'],
      locationPending: false,
    })
  })

  it('au quartier : depuis la partie du contour la plus proche, au mieux à confirmer', () => {
    const near = criteriaFit(r, candidate, district())
    expect(near.level).toBe('to_confirm')
    expect(near.checks[0]).toMatchObject({
      value: '≈ 350 m',
      detail: 'Mesuré depuis la partie du quartier la plus proche d’un arrêt.',
    })
    expect(near.reasons).toEqual([
      'tram à confirmer (≈ 350 m depuis le quartier) : adresse à préciser',
    ])
    expect(
      criteriaFit(r, candidate, district({ tramAreaDistanceMeters: 900 }))
    ).toMatchObject({
      level: 'out',
      reasons: [
        'tram à 900 m du quartier au plus près (maximum 600 m, marge 100 m)',
      ],
    })
    // Sans contour : depuis le repère approché.
    const noArea = district({ hasArea: false, tramAreaDistanceMeters: null })
    expect(
      criteriaFit(r, candidate, { ...noArea, tramPointDistanceMeters: 500 })
        .reasons
    ).toEqual([
      'tram à confirmer (≈ 500 m depuis le repère approché) : adresse à préciser',
    ])
    expect(
      criteriaFit(r, candidate, { ...noArea, tramPointDistanceMeters: 800 })
        .checks[0]
    ).toMatchObject({
      level: 'out',
      detail: 'Mesuré depuis le repère approché.',
    })
    expect(
      criteriaFit(r, candidate, { ...noArea, tramPointDistanceMeters: 800 })
        .reasons
    ).toEqual(['tram à ≈ 800 m (maximum 600 m, marge 100 m)'])
  })
})

describe('criteriaFit : filtres métier et marges', () => {
  const none = rule
  const noPerimeter = (
    filters: Record<string, unknown>,
    t = DEFAULT_CRITERIA_TOLERANCE
  ) => none(filters, t, null)

  it('commune : inconnue à confirmer, absente hors', () => {
    const r = noPerimeter({ communes: ['bordeaux', 'Le Bouscat'] })
    expect(level(r, candidate, exact)).toBe('in')
    expect(criteriaFit(r, { ...candidate, commune: ' ' }, exact)).toMatchObject(
      {
        level: 'to_confirm',
        locationPending: true,
      }
    )
    expect(
      criteriaFit(r, { ...candidate, commune: 'Pessac' }, exact).reasons
    ).toEqual(['commune Pessac (retenues : bordeaux, Le Bouscat)'])
  })

  it('prix maximal : la marge de 5 %, puis hors ; strict', () => {
    const r = noPerimeter({ priceMax: 220_000 })
    expect(criteriaFit(r, candidate, exact).checks[0]).toMatchObject({
      label: eur('Prix maximal 220 000 €'),
      value: eur('215 000 €'),
      detail: eur('Marge jusqu’à 231 000 €.'),
      reason: null,
    })
    expect(
      criteriaFit(r, { ...candidate, price: 228_000 }, exact)
    ).toMatchObject({
      level: 'margin',
      reasons: [eur('Prix +3,6 % (maximum 220 000 €, marge 5 %)')],
    })
    expect(criteriaFit(r, { ...candidate, price: 231_000 }, exact).level).toBe(
      'margin'
    )
    expect(
      criteriaFit(r, { ...candidate, price: 262_000 }, exact)
    ).toMatchObject({
      level: 'out',
      reasons: [eur('Prix +19 % (maximum 220 000 €, marge 5 %)')],
    })
    const strict = noPerimeter({ priceMax: 220_000 }, STRICT_CRITERIA_TOLERANCE)
    expect(
      criteriaFit(strict, { ...candidate, price: 221_000 }, exact)
    ).toMatchObject({
      level: 'out',
      reasons: [eur('Prix +0,5 % (maximum 220 000 €, sans marge)')],
    })
    expect(criteriaFit(strict, candidate, exact).checks[0]?.detail).toBe(
      'Sans marge.'
    )
  })

  it('prix minimal', () => {
    const r = noPerimeter({ priceMin: 220_000 })
    expect(level(r, { ...candidate, price: 220_000 }, exact)).toBe('in')
    expect(criteriaFit(r, candidate, exact)).toMatchObject({
      level: 'margin',
      reasons: [eur('Prix −2,3 % (minimum 220 000 €, marge 5 %)')],
    })
    expect(criteriaFit(r, candidate, exact).checks[0]?.detail).toBe(
      eur('Marge jusqu’à 209 000 €.')
    )
    expect(level(r, { ...candidate, price: 150_000 }, exact)).toBe('out')
    expect(
      criteriaFit(
        noPerimeter({ priceMin: 220_000 }, STRICT_CRITERIA_TOLERANCE),
        candidate,
        exact
      ).checks[0]?.detail
    ).toBe('Sans marge.')
  })

  it('surface : inconnue à confirmer (jamais hors), marge de 5 %', () => {
    const r = noPerimeter({ surfaceMin: 60 })
    expect(
      criteriaFit(r, { ...candidate, surface: null }, exact)
    ).toMatchObject({
      level: 'to_confirm',
      reasons: ['surface inconnue (minimum 60 m²)'],
      locationPending: false,
    })
    expect(criteriaFit(r, candidate, exact).checks[0]?.detail).toBe(
      'Marge jusqu’à 57 m².'
    )
    expect(
      criteriaFit(r, { ...candidate, surface: 58.5 }, exact)
    ).toMatchObject({
      level: 'margin',
      reasons: ['surface 58,5 m² (minimum 60 m², marge 5 %)'],
    })
    expect(level(r, { ...candidate, surface: 45 }, exact)).toBe('out')
    expect(
      criteriaFit(
        noPerimeter({ surfaceMin: 60 }, STRICT_CRITERIA_TOLERANCE),
        candidate,
        exact
      ).checks[0]?.detail
    ).toBe('Sans marge.')
  })

  it('pièces : inconnues à confirmer ; sans marge par défaut ; avec une pièce de marge', () => {
    const r = noPerimeter({ roomsMin: 3 })
    expect(criteriaFit(r, candidate, exact).checks[0]).toMatchObject({
      label: '3 pièces au moins',
      value: '3 pièces',
      detail: 'Sans marge.',
    })
    expect(
      criteriaFit(r, { ...candidate, rooms: null }, exact).reasons
    ).toEqual(['pièces inconnues (minimum 3)'])
    expect(criteriaFit(r, { ...candidate, rooms: 2 }, exact)).toMatchObject({
      level: 'out',
      reasons: ['2 pièces (minimum 3)'],
    })
    const loose = noPerimeter(
      { roomsMin: 2 },
      { ...DEFAULT_CRITERIA_TOLERANCE, roomsMin: 1 }
    )
    expect(criteriaFit(loose, { ...candidate, rooms: 1 }, exact)).toMatchObject(
      {
        level: 'margin',
        reasons: ['1 pièce (minimum 2, marge 1 pièce)'],
      }
    )
    expect(
      criteriaFit(loose, { ...candidate, rooms: 1 }, exact).checks[0]?.detail
    ).toBe('Marge jusqu’à 1 pièce.')
    expect(level(loose, { ...candidate, rooms: 0 }, exact)).toBe('out')
  })

  it('DPE : inconnu à confirmer, une classe de marge, au plus G', () => {
    const r = noPerimeter({ dpeMax: 'D' })
    expect(criteriaFit(r, candidate, exact).checks[0]).toMatchObject({
      level: 'in',
      value: 'C',
      detail: 'Marge jusqu’à E.',
    })
    expect(
      criteriaFit(r, { ...candidate, dpeClass: null }, exact).reasons
    ).toEqual(['DPE inconnu (maximum D)'])
    expect(
      criteriaFit(r, { ...candidate, dpeClass: 'E' }, exact)
    ).toMatchObject({
      level: 'margin',
      reasons: ['DPE E (maximum D, marge une classe)'],
    })
    expect(
      criteriaFit(r, { ...candidate, dpeClass: 'F' }, exact)
    ).toMatchObject({
      level: 'out',
      reasons: ['DPE F (maximum D, marge une classe)'],
    })
    const g = noPerimeter(
      { dpeMax: 'F' },
      { ...DEFAULT_CRITERIA_TOLERANCE, dpeClasses: 3 }
    )
    expect(
      criteriaFit(g, { ...candidate, dpeClass: 'G' }, exact).checks[0]
    ).toMatchObject({
      level: 'margin',
      detail: 'Marge jusqu’à G.',
      reason: 'DPE G (maximum F, marge trois classes)',
    })
    expect(
      criteriaFit(
        noPerimeter({ dpeMax: 'D' }, STRICT_CRITERIA_TOLERANCE),
        { ...candidate, dpeClass: 'E' },
        exact
      )
    ).toMatchObject({
      level: 'out',
      reasons: ['DPE E (maximum D, sans marge)'],
    })
    expect(
      criteriaFit(
        noPerimeter(
          { dpeMax: 'D' },
          { ...DEFAULT_CRITERIA_TOLERANCE, dpeClasses: 2 }
        ),
        { ...candidate, dpeClass: 'F' },
        exact
      ).reasons
    ).toEqual(['DPE F (maximum D, marge deux classes)'])
  })

  it('verdict : sans marge', () => {
    const r = noPerimeter({ verdicts: ['target', 'to_dig'] })
    expect(level(r, candidate, exact)).toBe('in')
    expect(
      criteriaFit(r, { ...candidate, verdict: 'off_target' }, exact).reasons
    ).toEqual(['verdict hors cible (retenus : cible, à creuser)'])
  })

  it('le niveau du critère est le moins bon de ses filtres', () => {
    const r = rule({ priceMax: 220_000, surfaceMin: 60 })
    // Quartier à cheval (à confirmer) et prix +3,6 % (à la marge) : à la marge.
    const fit = criteriaFit(r, { ...candidate, price: 228_000 }, district())
    expect(fit.level).toBe('margin')
    expect(fit.locationPending).toBe(true)
    expect(fit.reasons).toHaveLength(2)
    expect(level(r, { ...candidate, price: 300_000 }, district())).toBe('out')
  })
})

describe('l’annonce : le meilleur des critères actifs', () => {
  const entry = (over: Partial<CriteriaFitEntry>): CriteriaFitEntry => ({
    criteriaId: '00000000-0000-4000-8000-000000000001',
    name: 'Critère A',
    level: 'in',
    reasons: [],
    checks: [],
    locationPending: false,
    since: '2026-11-05T10:00:00.000Z',
    ...over,
  })
  const a = entry({ level: 'out', reasons: ['à 3,1 km du périmètre'] })
  const b = entry({
    criteriaId: '00000000-0000-4000-8000-000000000002',
    name: 'Critère B',
    level: 'to_confirm',
    reasons: ['surface inconnue (minimum 60 m²)'],
    locationPending: true,
  })

  it('rang, moins bon, meilleur ; à égalité le premier', () => {
    expect(fitRank('in')).toBe(0)
    expect(fitRank('out')).toBe(3)
    expect(worstLevel([])).toBe('in')
    expect(worstLevel(['to_confirm', 'margin', 'in'])).toBe('margin')
    expect(bestFit([])).toBeNull()
    expect(bestFit([a, b])?.name).toBe('Critère B')
    expect(bestFit([b, { ...b, name: 'B bis' }])?.name).toBe('Critère B')
  })

  it('aucun critère actif : dans les critères ; hors critères gardée par une offre ou une visite', () => {
    expect(
      listingCriteriaFit({
        entries: [],
        since: null,
        status: 'to_study',
        plannedVisits: 0,
      })
    ).toMatchObject({ level: 'in', activeCriteria: 0, criteria: [] })
    const best = listingCriteriaFit({
      entries: [a, b],
      since: '2026-11-04T10:00:00.000Z',
      status: 'to_study',
      plannedVisits: 0,
    })
    expect(best).toMatchObject({
      level: 'to_confirm',
      activeCriteria: 2,
      name: 'Critère B',
      locationPending: true,
      kept: null,
    })
    const out = listingCriteriaFit({
      entries: [a],
      since: null,
      status: 'offer_made',
      plannedVisits: 0,
    })
    expect(out.kept).toBe('offer')
    expect(out.origin).toBeNull()
    expect(
      listingCriteriaFit({
        entries: [a],
        since: null,
        origin: { cause: 'refresh', trigger: null, criteriaName: null },
        status: 'to_study',
        plannedVisits: 0,
      }).origin
    ).toEqual({ cause: 'refresh', trigger: null, criteriaName: null })
    expect(inMainFitTab(out)).toBe(true)
    expect(keptOutOfCriteria('offer_accepted', 0)).toBe('offer')
    expect(keptOutOfCriteria('to_visit', 1)).toBe('visit')
    expect(keptOutOfCriteria('to_visit', 0)).toBeNull()
    expect(keptLabel('visit')).toBe('Gardée dans la liste : visite prévue')
  })

  it('onglets, filtre et compteurs', () => {
    const fits: Pick<ListingCriteriaFit, 'level' | 'kept'>[] = [
      { level: 'in', kept: null },
      { level: 'to_confirm', kept: null },
      { level: 'margin', kept: null },
      { level: 'out', kept: null },
      { level: 'out', kept: 'visit' },
    ]
    expect(fits.filter(f => matchesFitFilter(f, undefined))).toHaveLength(4)
    expect(fits.filter(f => matchesFitFilter(f, []))).toHaveLength(4)
    expect(fits.filter(f => matchesFitFilter(f, ['out']))).toHaveLength(2)
    expect(fits.filter(f => matchesFitFilter(f, ['margin']))).toHaveLength(1)
    expect(countFits(fits)).toEqual({
      counts: { in: 1, to_confirm: 1, margin: 1, out: 2 },
      kept: 1,
    })
  })

  it('vue d’un seul critère', () => {
    const fit = listingCriteriaFit({
      entries: [a, b],
      since: null,
      status: 'to_visit',
      plannedVisits: 1,
    })
    const forA = fitForCriteria(fit, a.criteriaId, 'to_visit', 1)
    expect(forA).toMatchObject({
      level: 'out',
      name: 'Critère A',
      kept: 'visit',
    })
    expect(fitForCriteria(fit, b.criteriaId, 'to_visit', 1).kept).toBeNull()
    expect(
      fitForCriteria(fit, '00000000-0000-4000-8000-000000000009', 'to_visit', 1)
    ).toMatchObject({ level: 'in', kept: null })
  })

  it('l’explication de la fiche, niveau par niveau', () => {
    const fitOf = (
      entries: CriteriaFitEntry[],
      status: 'to_study' | 'offer_made' = 'to_study'
    ) => listingCriteriaFit({ entries, since: null, status, plannedVisits: 0 })
    expect(fitExplanation(fitOf([]))).toContain('Aucun critère actif')
    expect(fitExplanation(fitOf([entry({})]))).toBe(
      'Elle respecte tous les filtres du critère « Critère A ».'
    )
    expect(fitExplanation(fitOf([b]))).toContain('contour du quartier')
    expect(fitExplanation(fitOf([{ ...b, locationPending: false }]))).toBe(
      'Une information manque (Surface inconnue (minimum 60 m²)) : l’annonce reste dans les critères jusqu’à ce qu’elle soit connue.'
    )
    expect(
      fitExplanation(
        fitOf([entry({ level: 'margin', reasons: ['Prix +3,6 %'] })])
      )
    ).toBe(
      'Elle dépasse un seuil, mais dans la marge de tolérance : Prix +3,6 %.'
    )
    expect(fitExplanation(fitOf([a], 'offer_made'))).toContain(
      'Gardée dans la liste : offre en cours.'
    )
    expect(fitExplanation(fitOf([a]))).not.toContain('Gardée')
    expect(fitExplanation({ ...fitOf([entry({})]), name: null })).toBe(
      'Elle respecte tous les filtres du critère.'
    )
  })

  it('une ligne lisible', () => {
    expect(
      describeListingFit(
        listingCriteriaFit({
          entries: [],
          since: null,
          status: 'to_study',
          plannedVisits: 0,
        })
      )
    ).toBe('Aucun critère actif : dans les critères par défaut')
    expect(
      describeListingFit(
        listingCriteriaFit({
          entries: [a],
          since: null,
          status: 'offer_made',
          plannedVisits: 0,
        })
      )
    ).toBe(
      'Hors critères — « Critère A » : À 3,1 km du périmètre (gardée dans la liste : offre en cours)'
    )
    expect(
      describeListingFit({
        ...listingCriteriaFit({
          entries: [entry({})],
          since: null,
          status: 'to_study',
          plannedVisits: 0,
        }),
        name: null,
      })
    ).toBe('Dans les critères')
  })
})

describe('changements de niveau, « depuis » et historique', () => {
  it('entrées, sorties, changements ; une première comparaison hors critères ne compte pas', () => {
    expect(fitTransition(null, 'out')).toBeNull()
    expect(fitTransition('margin', 'margin')).toBeNull()
    expect(fitTransition(null, 'to_confirm')).toBe('entered')
    expect(fitTransition('out', 'in')).toBe('entered')
    expect(fitTransition('in', 'out')).toBe('left')
    expect(fitTransition('margin', 'in')).toBe('changed')
    expect(priceTrigger(200_000, 210_000)).toBe('price_up')
    expect(priceTrigger(210_000, 200_000)).toBe('price_down')
  })

  it('« depuis » : cause et date', () => {
    const now = new Date('2026-11-05T12:00:00.000Z')
    const since = '2026-11-02T09:00:00.000Z'
    expect(fitSinceText(null, null, now)).toBe('Date inconnue')
    expect(fitSinceText(since, null, now)).toBe('Depuis le 2 novembre')
    expect(
      fitSinceText(since, { cause: 'listing', trigger: 'price_up' }, now)
    ).toBe('Prix remonté le 2 novembre')
    expect(
      fitSinceText(since, { cause: 'listing', trigger: 'created' }, now)
    ).toBe('Dès l’enregistrement')
    expect(fitSinceText(since, { cause: 'listing' }, now)).toBe(
      'Fiche modifiée le 2 novembre'
    )
    expect(
      fitSinceText(since, { cause: 'listing', trigger: 'inconnu' }, now)
    ).toBe('Fiche modifiée le 2 novembre')
    expect(
      fitSinceText(since, { cause: 'criteria', criteriaName: 'Talence' }, now)
    ).toBe('Critère « Talence » modifié le 2 novembre')
    expect(fitSinceText(since, { cause: 'criteria' }, now)).toBe(
      'Critères modifiés le 2 novembre'
    )
    expect(fitSinceText(since, { cause: 'assumptions' }, now)).toBe(
      'Hypothèses modifiées le 2 novembre'
    )
    expect(
      fitSinceText('2025-10-28T09:00:00.000Z', { cause: 'refresh' }, now)
    ).toBe('Recalculée le 28 octobre 2025')
    expect(
      fitSinceText(since, { cause: 'listing', trigger: 'price_up' })
    ).toContain('Prix remonté')
  })

  it('journal lu : critères, cause', () => {
    expect(loggedFitChanges({ before: null, after: null })).toEqual([])
    expect(
      loggedFitChanges({
        before: { criteria: [{ name: 'A', level: 'in' }] },
        after: { cause: 'listing' },
      })
    ).toEqual([{ name: 'A', before: null, level: 'in', reasons: [] }])
    expect(
      loggedFitChanges({
        before: null,
        after: {
          criteria: [
            1,
            { level: 'bizarre', before: 'margin', reasons: ['x', 2] },
          ],
        },
      })
    ).toEqual([
      { name: 'critère', before: 'margin', level: null, reasons: ['x'] },
    ])
    expect(loggedFitOrigin(null)).toBeNull()
    expect(loggedFitOrigin({ cause: 'criteria', criteriaName: 'A' })).toEqual({
      cause: 'criteria',
      trigger: null,
      criteriaName: 'A',
    })
    expect(loggedFitOrigin({ cause: 'listing', trigger: 'dpe' })).toEqual({
      cause: 'listing',
      trigger: 'dpe',
      criteriaName: null,
    })
  })

  it('historique de la fiche, du plus récent au plus ancien', () => {
    const history = criteriaFitHistory([
      {
        action: 'listing.created',
        before: null,
        after: {},
        createdAt: '2026-10-30T09:00:00.000Z',
      },
      {
        action: 'opinion.created',
        before: null,
        after: {},
        createdAt: '2026-10-31T09:00:00.000Z',
      },
      {
        action: 'criteria.matched',
        before: null,
        after: {
          cause: 'criteria',
          criteriaName: 'Caudéran',
          criteria: [{ name: 'Caudéran', level: 'in', reasons: [] }],
        },
        createdAt: '2026-11-01T09:00:00.000Z',
      },
      {
        action: 'criteria.unmatched',
        before: { criteria: [{ name: 'Caudéran', level: 'in' }] },
        after: {
          cause: 'listing',
          trigger: 'price_up',
          criteria: [
            {
              name: 'Caudéran',
              before: 'in',
              level: 'out',
              reasons: ['Prix +19 %'],
            },
          ],
        },
        createdAt: '2026-11-02T09:00:00.000Z',
      },
      {
        action: 'criteria.matched',
        before: null,
        after: {
          cause: 'refresh',
          criteria: [
            {
              name: 'Caudéran',
              before: 'out',
              level: 'to_confirm',
              reasons: ['quartier à cheval'],
            },
          ],
        },
        createdAt: '2026-11-04T09:00:00.000Z',
      },
      {
        action: 'criteria.fit_changed',
        before: null,
        after: {
          cause: 'assumptions',
          criteria: [
            {
              name: 'Caudéran',
              before: 'to_confirm',
              level: 'margin',
              reasons: [],
            },
          ],
        },
        createdAt: '2026-11-05T09:00:00.000Z',
      },
      {
        action: 'criteria.fit_changed',
        before: null,
        after: {
          cause: 'listing',
          criteria: [{ name: 'Mérignac', level: 'in' }],
        },
        createdAt: '2026-11-05T08:00:00.000Z',
      },
    ])
    expect(history.map(h => h.what)).toEqual([
      '« Caudéran » : à confirmer → à la marge',
      '« Mérignac » : dans les critères',
      'Entrée dans « Caudéran », à confirmer',
      'Hors du critère « Caudéran »',
      'Entrée dans « Caudéran »',
      'Enregistrée',
    ])
    expect(history[0]?.why).toBe('(hypothèses modifiées (verdict))')
    expect(history[1]?.why).toBe('')
    expect(history[2]?.why).toBe('Quartier à cheval (recalcul (rattrapage))')
    expect(history[3]?.why).toBe('Prix +19 % (prix remonté)')
    expect(history[4]?.why).toBe('(critère « Caudéran » créé ou modifié)')
    expect(
      criteriaFitHistory([
        {
          action: 'criteria.matched',
          before: null,
          after: {
            cause: 'criteria',
            criteria: [{ name: 'X', level: 'margin' }],
          },
          createdAt: '2026-11-05T09:00:00.000Z',
        },
      ])[0]
    ).toEqual({
      at: '2026-11-05T09:00:00.000Z',
      what: 'Entrée dans « X », à la marge',
      why: '(critère créé ou modifié)',
    })
  })
})

describe('les marges, lues', () => {
  it('seuils réels, marge comprise', () => {
    const filters = CriteriaFiltersSchema.parse({
      priceMax: 220_000,
      priceMin: 100_000,
      surfaceMin: 60,
      roomsMin: 1,
      dpeMax: 'F',
      maxTramDistanceMeters: 600,
    })
    expect(
      toleranceThresholds(filters, {
        ...DEFAULT_CRITERIA_TOLERANCE,
        roomsMin: 2,
        dpeClasses: 3,
      })
    ).toEqual({
      priceMax: 231_000,
      priceMin: 95_000,
      surfaceMin: 57,
      roomsMin: 0,
      dpeMax: 'G',
      tramMeters: 700,
    })
    expect(
      toleranceThresholds(
        CriteriaFiltersSchema.parse({}),
        DEFAULT_CRITERIA_TOLERANCE
      )
    ).toEqual({
      priceMax: null,
      priceMin: null,
      surfaceMin: null,
      roomsMin: null,
      dpeMax: null,
      tramMeters: null,
    })
  })

  it('résumé des marges appliquées', () => {
    const all = rule(
      {
        priceMax: 220_000,
        priceMin: 100_000,
        surfaceMin: 60,
        roomsMin: 3,
        dpeMax: 'D',
        maxTramDistanceMeters: 600,
      },
      { ...DEFAULT_CRITERIA_TOLERANCE, roomsMin: 1 }
    )
    expect(toleranceSummary(all)).toBe(
      'Marges appliquées : périmètre 300 m, prix +5 %, prix minimal −5 %, surface −5 %, 1 pièce de moins, DPE une classe, tram +100 m.'
    )
    expect(
      toleranceSummary(rule({ priceMax: 1 }, STRICT_CRITERIA_TOLERANCE))
    ).toBe('Aucune marge : chaque seuil est strict.')
    expect(
      toleranceSummary(rule({ roomsMin: 2 }, DEFAULT_CRITERIA_TOLERANCE, null))
    ).toBe('Aucune marge ne s’applique aux filtres de ce critère.')
  })

  it('mise en forme', () => {
    expect(formatFitDistance(180.4)).toBe('180 m')
    expect(formatFitDistance(2400)).toBe('2,4 km')
    expect(formatFitShare(0.0364)).toBe('3,6 %')
    expect(formatFitShare(0.1909)).toBe('19 %')
    expect(formatFitShare(0.05)).toBe('5 %')
    expect(fitReasonsText(['à 2,4 km du périmètre', '2 pièces'])).toBe(
      'À 2,4 km du périmètre · 2 pièces'
    )
    expect(fitReasonsText([])).toBe('')
  })
})

describe('journal, « ce qui a changé » et notifications', () => {
  const event = (
    action: string,
    after: unknown,
    before: unknown = null
  ): WhatsNewEvent => ({
    id: 'e1',
    action,
    channel: 'web',
    actorMemberId: 'chloe',
    listingId: 'l1',
    before,
    after,
    createdAt: '2026-11-05T10:00:00.000Z',
  })

  it('phrases du journal', () => {
    expect(
      describeActivity(
        event('criteria.matched', {
          criteria: [
            { name: 'A', level: 'to_confirm' },
            { name: 'B', level: 'in' },
          ],
        })
      ).summary
    ).toBe("l'annonce entre dans le critère « A », « B » (à confirmer)")
    expect(
      describeActivity(event('criteria.matched', { criteria: [{ name: 'A' }] }))
        .summary
    ).toBe("l'annonce entre dans le critère « A »")
    expect(
      describeActivity(
        event('criteria.unmatched', {}, { criteria: [{ name: 'A' }] })
      ).summary
    ).toBe("l'annonce sort du critère « A » (hors critères)")
    expect(
      describeActivity(
        event('criteria.fit_changed', {
          criteria: [
            { name: 'A', before: 'margin', level: 'in' },
            { level: 'x' },
          ],
        })
      ).summary
    ).toBe(
      'adéquation : « A » à la marge → dans les critères, « critère » ? → ?'
    )
    expect(describeActivity(event('criteria.fit_changed', null)).summary).toBe(
      'adéquation : niveau recalculé'
    )
  })

  it('une entrée ou une sortie due à l’annonce compte ; pas celle d’un critère ou des hypothèses', () => {
    expect(fitChangeFromListing(null)).toBe(true)
    expect(fitChangeFromListing({})).toBe(true)
    expect(fitChangeFromListing({ cause: 'listing' })).toBe(true)
    expect(fitChangeFromListing({ cause: 'criteria' })).toBe(false)
    expect(
      whatsNewKindOf(event('criteria.matched', { cause: 'listing' }), 'richard')
    ).toBe('criteria_match')
    expect(
      whatsNewKindOf(
        event('criteria.unmatched', { cause: 'listing' }),
        'richard'
      )
    ).toBe('criteria_exit')
    expect(
      whatsNewKindOf(
        event('criteria.unmatched', { cause: 'assumptions' }),
        'richard'
      )
    ).toBeNull()
    expect(
      whatsNewKindOf(event('criteria.matched', { cause: 'refresh' }), 'richard')
    ).toBeNull()
    expect(
      notificationTypeOf(event('criteria.matched', { cause: 'criteria' }))
    ).toBeNull()
    expect(
      notificationTypeOf(event('criteria.matched', { cause: 'listing' }))
    ).toBe('criteria_matched')
    expect(
      notificationTypeOf(event('criteria.unmatched', { cause: 'listing' }))
    ).toBeNull()
    const report = computeWhatsNew({
      memberId: 'richard',
      since: '2026-11-01T00:00:00.000Z',
      sinceSource: 'previous_visit',
      now: '2026-11-05T12:00:00.000Z',
      events: [
        {
          ...event('listing.created', { price: 1 }),
          id: 'c',
          createdAt: '2026-11-05T09:00:00.000Z',
        },
        event(
          'criteria.unmatched',
          { cause: 'listing' },
          { criteria: [{ name: 'A' }] }
        ),
      ],
      listings: new Map([['l1', { title: 'T3 fictif', seenAt: null }]]),
      members: new Map(),
    })
    expect(report.counts.criteria_exit).toBe(1)
    expect(report.items[0]?.summary).toBe(
      "L'annonce sort du critère « A » (hors critères)"
    )
  })
})
