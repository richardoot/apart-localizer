import {
  LOCATION_PRECISION_LABELS,
  PLACEMENT_AREA_LEVEL_LABELS,
} from '@apart/contracts'
import type {
  ListingPlacement,
  LocationApproximation,
  LocationPrecision,
  NeighbourhoodKind,
  PlacementArea,
  PlacementAreaLevel,
  Point,
} from '@apart/contracts'

/**
 * Placement du repère d'une annonce (lot 12, ADR 0022) : les règles pures.
 *
 * Hiérarchie : adresse géocodée au numéro (`exact`) ou à la rue (`street`) ;
 * sinon le quartier reconnu dans le champ « quartier » (`district`) parmi les
 * contours importés de la commune de l'annonce, repère au centre du quartier
 * (précision `district`) ; sinon un lieu-dit OpenStreetMap de la commune ;
 * sinon le centre de la commune (`commune`). Ici : la lecture du texte
 * (normalisation, découpage, mentions parasites), la reconnaissance des noms
 * (secteur de vie, quartier officiel, IRIS, quartier qui regroupe des
 * secteurs), le choix du plus précis cohérent d'après les surfaces et
 * recouvrements calculés par PostGIS (module geo), la règle de
 * remplacement d'un repère existant, et les textes (pastille, réserves
 * « ≈ »). Jamais de quartier inventé : un doute rend « à vérifier ».
 */

// ---------------------------------------------------------------------------
// Lecture du texte
// ---------------------------------------------------------------------------

/** Minuscules, sans accents, ligatures dépliées (œ, æ), tout le reste en espaces. */
export function foldPlaceText(value: string): string {
  return value
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Articles et prépositions ignorés pour comparer deux noms (« Les Aubiers » = « Aubiers »). */
const ARTICLES = new Set([
  'le',
  'la',
  'les',
  'l',
  'de',
  'du',
  'des',
  'd',
  'au',
  'aux',
  'a',
  'en',
  'et',
])

/**
 * Mots trop courants pour reconnaître un quartier à eux seuls (« parc »,
 * « centre », « gare », « nord ») : ils comptent dans un nom, jamais seuls.
 */
const GENERIC = new Set([
  'parc',
  'jardin',
  'jardins',
  'place',
  'rue',
  'avenue',
  'cours',
  'boulevard',
  'quai',
  'quais',
  'gare',
  'centre',
  'ville',
  'bourg',
  'quartier',
  'quartiers',
  'secteur',
  'haut',
  'bas',
  'nord',
  'sud',
  'est',
  'ouest',
  'residence',
  'cite',
  'domaine',
  'zone',
  'lac',
  'port',
  'bois',
  'saint',
  'sainte',
  'st',
  'ste',
  'grand',
  'grande',
  'petit',
  'petite',
  'vieux',
  'nouveau',
  'village',
  'hameau',
  'lotissement',
  'pont',
  'chemin',
  'route',
  'allee',
  'barriere',
  'porte',
  'portes',
  'marche',
  'eglise',
  'mairie',
  'ecole',
  'stade',
  'iris',
])

/** Les mots qui introduisent une mention de transport : « tram B », « bus 9 ». */
const TRANSPORT = new Set([
  'tram',
  'trams',
  'tramway',
  'tramways',
  'bus',
  'liane',
  'lianes',
  'ligne',
  'lignes',
  'citeis',
  'arret',
  'station',
  'batcub',
  'navette',
])
const UNITS = new Set([
  'm',
  'km',
  'min',
  'mn',
  'minute',
  'minutes',
  'metre',
  'metres',
])

/** Les tournures « près de », « face au » : le bien est à côté, pas forcément dedans. */
const NEAR_STARTS: readonly (readonly string[])[] = [
  ['tout', 'pres'],
  ['tres', 'pres'],
  ['pres'],
  ['proche'],
  ['a', 'proximite'],
  ['proximite'],
  ['a', 'cote'],
  ['cote'],
  ['en', 'face'],
  ['face'],
  ['non', 'loin'],
  ['aux', 'portes'],
  ['a', 'la', 'limite'],
  ['limite'],
  ['entre'],
  ['vers'],
]

/** Un morceau du champ « quartier », prêt à comparer. */
export interface DistrictFragment {
  /** Le morceau tel que saisi, sans ses parenthèses (pour les messages). */
  raw: string
  /** Mots normalisés, sans articles ni mentions de transport ou de distance. */
  tokens: string[]
  /** « près de », « face au », « proche » : le bien peut être à côté. */
  near: boolean
}

/** Les mots d'un nom, normalisés, sans articles. */
export function placeTokens(value: string): string[] {
  return foldPlaceText(value)
    .split(' ')
    .filter(token => token && !ARTICLES.has(token))
}

function startsWith(tokens: readonly string[], prefix: readonly string[]) {
  return prefix.every((word, i) => tokens[i] === word)
}

function stripNoise(tokens: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string
    if (TRANSPORT.has(token)) {
      // « tram B », « trams A et B », « bus 9 » : la mention et ses lignes.
      while (i + 1 < tokens.length) {
        const next = tokens[i + 1] as string
        if (
          /^[a-z]$/.test(next) ||
          /^\d{1,2}$/.test(next) ||
          next === 'et' ||
          TRANSPORT.has(next)
        ) {
          i++
        } else break
      }
      continue
    }
    // « à 300 m », « 5 min » : une distance.
    if (/^\d+$/.test(token) && UNITS.has(tokens[i + 1] ?? '')) {
      i++
      continue
    }
    out.push(token)
  }
  return out
}

/**
 * Le champ « quartier » découpé en morceaux comparables : parenthèses
 * retirées (« (tram B) », « (à préciser) »), découpe aux virgules,
 * barres, points-virgules, tirets espacés et « et » ; mentions de transport,
 * de distance et de résidence écartées ; « près de » repéré ; le nom de la
 * commune seul ignoré (« Le Bouscat » n'est pas un quartier du Bouscat).
 */
export function districtFragments(
  text: string | null | undefined,
  commune?: string | null
): DistrictFragment[] {
  if (!text?.trim()) return []
  const communeTokens = commune ? placeTokens(commune) : []
  const withoutParens = text
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\[[^\]]*\]?/g, ' ')
  const pieces = withoutParens.split(/[,;/|+·•]|\s[-–—]\s|\s+et\s+/i)
  const fragments: DistrictFragment[] = []
  for (const piece of pieces) {
    const raw = piece.replace(/\s+/g, ' ').trim()
    let folded = foldPlaceText(raw).split(' ').filter(Boolean)
    let near = false
    const start = NEAR_STARTS.find(prefix => startsWith(folded, prefix))
    if (start) {
      near = true
      folded = folded.slice(start.length)
    }
    const tokens = stripNoise(folded).filter(t => !ARTICLES.has(t))
    // « … et E », « … et 5 » : le reste d'une liste de lignes coupée au « et ».
    if (tokens.every(t => /^[a-z]$/.test(t) || /^\d{1,2}$/.test(t))) continue
    if (tokens[0] === 'residence' || tokens[0] === 'res') continue
    if (
      communeTokens.length > 0 &&
      tokens.length === communeTokens.length &&
      tokens.every((t, i) => t === communeTokens[i])
    ) {
      continue
    }
    fragments.push({ raw, tokens, near })
  }
  return fragments
}

// ---------------------------------------------------------------------------
// Zones candidates : contours importés de la commune
// ---------------------------------------------------------------------------

/** Un contour importé (table `neighbourhoods`), sans sa géométrie. */
export interface NeighbourhoodRef {
  kind: NeighbourhoodKind
  code: string
  name: string
  parent: string | null
  commune: string
  inseeCode: string
  source: string
}

/** Une zone où l'annonce peut être : un contour, ou l'union de plusieurs. */
export interface CandidateArea {
  key: string
  level: Exclude<PlacementAreaLevel, 'commune' | 'place'>
  name: string
  codes: string[]
  commune: string
  inseeCode: string
  source: string
  /** Les noms qui la désignent, normalisés (nom entier et chacun de ses éléments). */
  aliases: string[][]
}

/** Rang de précision : un secteur ou un quartier, puis un IRIS, puis un quartier qui regroupe des secteurs. */
const LEVEL_RANK: Record<CandidateArea['level'], number> = {
  sector: 0,
  quartier: 0,
  iris: 1,
  parent: 2,
}

function aliasesOf(name: string): string[][] {
  const parts = [name, ...name.split(/[,/]/)]
  const seen = new Set<string>()
  const out: string[][] = []
  for (const part of parts) {
    const tokens = placeTokens(part)
    const key = tokens.join(' ')
    if (tokens.length && !seen.has(key)) {
      seen.add(key)
      out.push(tokens)
    }
  }
  return out
}

/** « IRIS Lestonnat-Monséjour 3 » → « Lestonnat-Monséjour » : les IRIS numérotés d'un même nom forment une zone. */
export function irisBaseName(name: string): string {
  return name
    .replace(/^IRIS\s+/i, '')
    .replace(/\s+\d+$/, '')
    .trim()
}

/**
 * Les zones candidates d'une commune : chaque secteur de vie et quartier
 * officiel, chaque quartier qui regroupe des secteurs (« Caudéran » =
 * l'union de ses secteurs), chaque nom d'IRIS (les IRIS numérotés d'un même
 * nom réunis). Une commune entière n'est pas candidate.
 */
export function candidateAreasOf(
  rows: readonly NeighbourhoodRef[]
): CandidateArea[] {
  const areas: CandidateArea[] = []
  const parents = new Map<string, CandidateArea>()
  const iris = new Map<string, CandidateArea>()
  for (const row of rows) {
    if (row.kind === 'quartier') {
      areas.push({
        key: `${row.parent ? 'sector' : 'quartier'}:${row.code}`,
        level: row.parent ? 'sector' : 'quartier',
        name: row.name,
        codes: [row.code],
        commune: row.commune,
        inseeCode: row.inseeCode,
        source: row.source,
        aliases: aliasesOf(row.name),
      })
      if (row.parent) {
        const key = `parent:${row.inseeCode}:${row.parent}`
        const parent = parents.get(key)
        if (parent) parent.codes.push(row.code)
        else
          parents.set(key, {
            key,
            level: 'parent',
            name: row.parent,
            codes: [row.code],
            commune: row.commune,
            inseeCode: row.inseeCode,
            source: row.source,
            aliases: aliasesOf(row.parent),
          })
      }
    } else if (row.kind === 'iris') {
      const base = irisBaseName(row.name)
      const key = `iris:${row.inseeCode}:${base}`
      const group = iris.get(key)
      if (group) group.codes.push(row.code)
      else
        iris.set(key, {
          key,
          level: 'iris',
          name: `IRIS ${base}`,
          codes: [row.code],
          commune: row.commune,
          inseeCode: row.inseeCode,
          source: row.source,
          aliases: aliasesOf(base),
        })
    }
  }
  return [...areas, ...parents.values(), ...iris.values()]
}

// ---------------------------------------------------------------------------
// Reconnaissance des noms
// ---------------------------------------------------------------------------

export type MatchStrength = 'exact' | 'contained' | 'partial'
const STRENGTH_RANK: Record<MatchStrength, number> = {
  exact: 2,
  contained: 1,
  partial: 0,
}

/** Un morceau du texte qui désigne une zone (ou un lieu-dit). */
export interface DistrictMatch {
  fragment: number
  key: string
  strength: MatchStrength
}

function indexOfSequence(
  hay: readonly string[],
  needle: readonly string[]
): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

function hasSignificant(
  tokens: readonly string[],
  minLength: number,
  ignored: ReadonlySet<string>
): boolean {
  return tokens.some(
    t => t.length >= minLength && !GENERIC.has(t) && !ignored.has(t)
  )
}

/**
 * Le meilleur rapport entre un morceau et un nom : identiques ; le nom est
 * dans le morceau (« jardin Galin » contient « Galin ») ; le morceau est
 * dans le nom (« Les Echoppes » dans « Le Vallon-Les Echoppes »). Les deux derniers
 * demandent un mot distinctif : ni courant (« parc », « centre »), ni le nom
 * de la commune, d'au moins trois lettres (quatre pour un morceau dans un nom).
 */
export function matchStrength(
  fragment: readonly string[],
  alias: readonly string[],
  ignored: ReadonlySet<string> = new Set()
): MatchStrength | null {
  if (
    fragment.length === alias.length &&
    indexOfSequence(fragment, alias) === 0
  ) {
    return 'exact'
  }
  if (
    alias.length < fragment.length &&
    indexOfSequence(fragment, alias) >= 0 &&
    hasSignificant(alias, 3, ignored)
  ) {
    return 'contained'
  }
  if (
    fragment.length < alias.length &&
    indexOfSequence(alias, fragment) >= 0 &&
    hasSignificant(fragment, 4, ignored)
  ) {
    return 'partial'
  }
  return null
}

/**
 * Les zones que chaque morceau désigne, en ne gardant pour un morceau que
 * ses meilleurs rapprochements (« Caudéran », nom exact d'un quartier,
 * n'est pas aussi « l'IRIS Villa Primerose Parc Bordelais-Caudéran »).
 */
export function matchDistrict(
  fragments: readonly DistrictFragment[],
  areas: readonly { key: string; aliases: readonly string[][] }[],
  commune?: string | null
): DistrictMatch[] {
  const ignored = new Set(commune ? placeTokens(commune) : [])
  const matches: DistrictMatch[] = []
  fragments.forEach((fragment, index) => {
    const found: DistrictMatch[] = []
    for (const area of areas) {
      let best: MatchStrength | null = null
      for (const alias of area.aliases) {
        const strength = matchStrength(fragment.tokens, alias, ignored)
        if (
          strength &&
          (best === null || STRENGTH_RANK[strength] > STRENGTH_RANK[best])
        ) {
          best = strength
        }
      }
      if (best) found.push({ fragment: index, key: area.key, strength: best })
    }
    const top = Math.max(-1, ...found.map(m => STRENGTH_RANK[m.strength]))
    matches.push(...found.filter(m => STRENGTH_RANK[m.strength] === top))
  })
  return matches
}

// ---------------------------------------------------------------------------
// Choix de la zone
// ---------------------------------------------------------------------------

/** Ce que PostGIS dit d'une zone candidate : sa surface. */
export interface AreaFacts {
  key: string
  areaSquareMeters: number
}

/** Le recouvrement de deux zones : surface commune / surface de la plus petite. */
export interface AreaOverlap {
  a: string
  b: string
  ratio: number
}

/** Au moins la moitié de la plus petite dans l'autre : les deux noms se confirment. */
export const NESTED_OVERLAP = 0.5
/** Moins de 5 % de la plus petite en commun : les deux zones sont distinctes. */
export const DISJOINT_OVERLAP = 0.05

export interface DistrictChoice {
  area: CandidateArea & { areaSquareMeters: number }
  /** Le morceau du texte qui la désigne, tel que saisi. */
  matchedText: string
  toVerify: boolean
  reasons: string[]
}

const quoted = (value: string): string => `« ${value} »`

function overlapOf(
  overlaps: readonly AreaOverlap[],
  a: string,
  b: string
): number {
  if (a === b) return 1
  const found = overlaps.find(
    o => (o.a === a && o.b === b) || (o.a === b && o.b === a)
  )
  return found?.ratio ?? 0
}

/** Une zone nommée avec ses articles : « le secteur « X » », « de l’IRIS X », « du lieu-dit « X » ». */
export interface AreaWording {
  /** « secteur « X » », « IRIS X ». */
  bare: string
  /** « le secteur « X » », « l’IRIS X ». */
  the: string
  /** « du secteur « X » », « de l’IRIS X ». */
  of: string
}

export function areaWording(
  area: Pick<PlacementArea, 'level' | 'name'>
): AreaWording {
  if (area.level === 'iris') {
    return { bare: area.name, the: `l’${area.name}`, of: `de l’${area.name}` }
  }
  if (area.level === 'commune') {
    return {
      bare: `commune de ${area.name}`,
      the: `la commune de ${area.name}`,
      of: `de la commune de ${area.name}`,
    }
  }
  const noun = PLACEMENT_AREA_LEVEL_LABELS[area.level]
  return {
    bare: `${noun} ${quoted(area.name)}`,
    the: `le ${noun} ${quoted(area.name)}`,
    of: `du ${noun} ${quoted(area.name)}`,
  }
}

const capitalized = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1)

/**
 * Le plus précis cohérent parmi les zones désignées par le texte : d'abord
 * une zone confirmée par un autre morceau (un secteur dans le quartier cité),
 * un morceau « près de » ne comptant que s'il est confirmé ; puis la plus
 * fine (secteur ou quartier, IRIS, quartier qui regroupe des secteurs) ; puis
 * le rapprochement le plus net ; puis la plus petite. « À vérifier » si la
 * zone retenue ne vient que d'un « près de », si un autre morceau désigne une
 * zone distincte, ou si le même morceau désigne des zones distinctes. Rien
 * de reconnu : null (repli sur un lieu-dit, puis la commune).
 */
export function chooseDistrictArea(input: {
  fragments: readonly DistrictFragment[]
  areas: readonly CandidateArea[]
  matches: readonly DistrictMatch[]
  facts: readonly AreaFacts[]
  overlaps: readonly AreaOverlap[]
  commune?: string | null
}): DistrictChoice | null {
  const byKey = new Map(input.areas.map(a => [a.key, a]))
  const surface = new Map(input.facts.map(f => [f.key, f.areaSquareMeters]))
  const keys = [...new Set(input.matches.map(m => m.key))].filter(
    key => byKey.has(key) && (surface.get(key) ?? 0) > 0
  )
  if (keys.length === 0) return null
  const matchesOf = (key: string) => input.matches.filter(m => m.key === key)
  const fragmentsOf = (key: string) =>
    new Set(matchesOf(key).map(m => m.fragment))
  const nearOnly = (key: string) =>
    [...fragmentsOf(key)].every(i => input.fragments[i]?.near)
  const support = (key: string): number => {
    const own = fragmentsOf(key)
    const confirming = new Set<number>()
    for (const other of keys) {
      if (other === key) continue
      if (overlapOf(input.overlaps, key, other) < NESTED_OVERLAP) continue
      for (const m of matchesOf(other)) {
        if (!own.has(m.fragment)) confirming.add(m.fragment)
      }
    }
    return confirming.size
  }
  const strength = (key: string) =>
    Math.max(...matchesOf(key).map(m => STRENGTH_RANK[m.strength]))
  const scored = keys.map(key => ({
    key,
    credible: !nearOnly(key) || support(key) > 0,
    support: support(key),
    level: LEVEL_RANK[(byKey.get(key) as CandidateArea).level],
    strength: strength(key),
    surface: surface.get(key) as number,
  }))
  scored.sort(
    (a, b) =>
      Number(b.credible) - Number(a.credible) ||
      b.support - a.support ||
      a.level - b.level ||
      b.strength - a.strength ||
      a.surface - b.surface ||
      a.key.localeCompare(b.key)
  )
  const best = scored[0] as (typeof scored)[number]
  const area = byKey.get(best.key) as CandidateArea
  const own = fragmentsOf(best.key)
  const first = Math.min(...own)
  const matchedText = (input.fragments[first] as DistrictFragment).raw
  const reasons: string[] = [
    `${capitalized(areaWording(area).bare)} reconnu dans ${quoted(matchedText)}${area.level === 'parent' ? ' (union de ses secteurs)' : ''}.`,
  ]
  let toVerify = false
  if (nearOnly(best.key)) {
    toVerify = true
    reasons.push(
      `${quoted(matchedText)} : le bien est dit à côté, il peut être dans un quartier voisin ; à vérifier.`
    )
  }
  // Un morceau qui désigne une zone distincte de celle retenue.
  for (const other of keys) {
    if (other === best.key) continue
    if (overlapOf(input.overlaps, best.key, other) >= DISJOINT_OVERLAP) continue
    const otherArea = byKey.get(other) as CandidateArea
    const sameFragment = [...fragmentsOf(other)].some(i => own.has(i))
    const where = (
      input.fragments[Math.min(...fragmentsOf(other))] as DistrictFragment
    ).raw
    toVerify = true
    reasons.push(
      `${quoted(where)} désigne ${sameFragment ? 'aussi ' : ''}${areaWording(otherArea).the}, distinct du quartier retenu : à vérifier.`
    )
  }
  // Les morceaux distinctifs que rien n'a reconnus.
  const ignored = new Set(input.commune ? placeTokens(input.commune) : [])
  const matched = new Set(input.matches.map(m => m.fragment))
  input.fragments.forEach((fragment, index) => {
    if (matched.has(index)) return
    if (!hasSignificant(fragment.tokens, 3, ignored)) return
    reasons.push(
      `${quoted(fragment.raw)} : aucun quartier de ce nom dans les contours importés${input.commune ? ` de ${input.commune}` : ''}.`
    )
  })
  return {
    area: { ...area, areaSquareMeters: best.surface },
    matchedText,
    toVerify,
    reasons,
  }
}

// ---------------------------------------------------------------------------
// Repli : lieux-dits OpenStreetMap
// ---------------------------------------------------------------------------

/** Un lieu-dit importé (table `places`). */
export interface PlaceRef {
  externalId: string
  name: string
  commune: string | null
  inseeCode: string | null
  source: string
  point: Point
}

export interface PlaceChoice {
  place: PlaceRef
  matchedText: string
  toVerify: boolean
  reasons: string[]
}

/**
 * Le lieu-dit de la commune que le texte nomme (nom identique, ou contenu
 * dans un morceau : « Moulinet est » nomme « Le Moulinet ») ; jamais un morceau
 * contenu dans un nom de lieu-dit, trop hasardeux. « À vérifier » pour un
 * « près de » ou si plusieurs lieux-dits de noms différents sont cités.
 */
export function choosePlace(input: {
  fragments: readonly DistrictFragment[]
  places: readonly PlaceRef[]
  commune?: string | null
}): PlaceChoice | null {
  const ignored = new Set(input.commune ? placeTokens(input.commune) : [])
  const found: { place: PlaceRef; fragment: number; strength: number }[] = []
  input.fragments.forEach((fragment, index) => {
    for (const place of input.places) {
      const strength = matchStrength(
        fragment.tokens,
        placeTokens(place.name),
        ignored
      )
      if (strength === 'exact' || strength === 'contained') {
        found.push({
          place,
          fragment: index,
          strength: STRENGTH_RANK[strength],
        })
      }
    }
  })
  if (found.length === 0) return null
  found.sort(
    (a, b) =>
      Number(input.fragments[a.fragment]?.near) -
        Number(input.fragments[b.fragment]?.near) ||
      b.strength - a.strength ||
      a.fragment - b.fragment ||
      a.place.name.localeCompare(b.place.name, 'fr') ||
      a.place.externalId.localeCompare(b.place.externalId)
  )
  const best = found[0] as (typeof found)[number]
  const fragment = input.fragments[best.fragment] as DistrictFragment
  const reasons = [
    `Lieu-dit ${quoted(best.place.name)} (OpenStreetMap) reconnu dans ${quoted(fragment.raw)} : aucun contour de quartier de ce nom.`,
  ]
  let toVerify = false
  if (fragment.near) {
    toVerify = true
    reasons.push(
      `${quoted(fragment.raw)} : le bien est dit à côté du lieu-dit ; à vérifier.`
    )
  }
  const others = [
    ...new Set(
      found
        .map(f => f.place.name)
        .filter(name => foldPlaceText(name) !== foldPlaceText(best.place.name))
    ),
  ]
  if (others.length) {
    toVerify = true
    reasons.push(
      `Autres lieux-dits cités : ${others.map(quoted).join(', ')} ; à vérifier.`
    )
  }
  return { place: best.place, matchedText: fragment.raw, toVerify, reasons }
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

/** Le placement d'une zone de quartier reconnue. */
export function districtPlacement(
  choice: DistrictChoice,
  computedAt: string
): ListingPlacement {
  const area: PlacementArea = {
    level: choice.area.level,
    name: choice.area.name,
    codes: [...choice.area.codes],
    commune: choice.area.commune,
    inseeCode: choice.area.inseeCode,
    source: choice.area.source,
    areaSquareMeters: Math.round(choice.area.areaSquareMeters),
  }
  return {
    method: 'neighbourhood_match',
    precision: 'district',
    matchedText: choice.matchedText,
    area,
    toVerify: choice.toVerify,
    reasons: choice.reasons,
    computedAt,
  }
}

/** Le placement sur un lieu-dit OpenStreetMap. */
export function placePlacement(
  choice: PlaceChoice,
  computedAt: string
): ListingPlacement {
  return {
    method: 'osm_place',
    precision: 'district',
    matchedText: choice.matchedText,
    area: {
      level: 'place',
      name: choice.place.name,
      codes: [],
      commune: choice.place.commune,
      inseeCode: choice.place.inseeCode,
      source: choice.place.source,
      areaSquareMeters: null,
    },
    toVerify: choice.toVerify,
    reasons: choice.reasons,
    computedAt,
  }
}

/** Le placement d'une adresse géocodée (numéro, rue, ou lieu-dit du géocodeur). */
export function addressPlacement(
  precision: LocationPrecision,
  label: string | null,
  computedAt: string
): ListingPlacement {
  return {
    method: 'address',
    precision,
    matchedText: null,
    area: null,
    toVerify: false,
    reasons: [
      precision === 'exact'
        ? `Adresse trouvée au numéro${label ? ` : ${label}` : ''}.`
        : precision === 'street'
          ? `Adresse trouvée à la rue, sans numéro${label ? ` : ${label}` : ''}.`
          : `Le géocodeur n’a trouvé qu’un lieu-dit${label ? ` : ${label}` : ''}.`,
    ],
    computedAt,
  }
}

/** Le placement au centre de la commune, avec ce qui n'a pas pu servir. */
export function communePlacement(input: {
  commune: string | null
  inseeCode: string | null
  district?: string | null
  /** Ce que la lecture du quartier a donné (noms non reconnus). */
  reasons?: readonly string[]
  /** D'où vient le point de la commune (géocodeur par défaut). */
  source?: string
  computedAt: string
}): ListingPlacement {
  const district = input.district?.trim()
  const reasons = [
    district
      ? `Aucun quartier reconnu dans ${quoted(district)} : repère au centre de la commune.`
      : 'Ni adresse au numéro ni quartier : repère au centre de la commune.',
    ...(input.reasons ?? []),
  ]
  return {
    method: 'commune',
    precision: 'commune',
    matchedText: null,
    area: {
      level: 'commune',
      name: input.commune ?? 'Commune',
      codes: [],
      commune: input.commune,
      inseeCode: input.inseeCode,
      source: input.source ?? 'Géoplateforme IGN (centre de la commune)',
      areaSquareMeters: null,
    },
    toVerify: false,
    reasons,
    computedAt: input.computedAt,
  }
}

/** Un point saisi à la main (carte) ou par le MCP : il prime toujours. */
export function manualPlacement(
  precision: LocationPrecision | null,
  computedAt: string
): ListingPlacement {
  return {
    method: 'manual',
    precision: precision ?? 'exact',
    matchedText: null,
    area: null,
    toVerify: false,
    reasons: [
      'Point saisi à la main ou par Claude : il prime sur le géocodage.',
    ],
    computedAt,
  }
}

const PRECISION_RANK: Record<LocationPrecision, number> = {
  exact: 3,
  street: 2,
  district: 1,
  commune: 0,
}

/** Vrai pour un repère à l'adresse (numéro ou rue), que le placement au quartier ne touche jamais. */
export function isAddressPrecision(
  precision: LocationPrecision | null | undefined
): boolean {
  return precision === 'exact' || precision === 'street'
}

const samePoint = (a: Point | null, b: Point | null): boolean =>
  a !== null &&
  b !== null &&
  Math.abs(a.coordinates[0] - b.coordinates[0]) < 1e-6 &&
  Math.abs(a.coordinates[1] - b.coordinates[1]) < 1e-6

/**
 * Le rattrapage (`relocate:listings`) remplace-t-il le repère actuel ?
 * Jamais un repère à l'adresse (numéro ou rue) ni un point saisi ; jamais
 * pour une précision moindre ; oui sans repère, pour une précision plus fine,
 * ou à précision égale quand le point ou la zone change. Un second passage
 * ne change donc rien.
 */
export function placementImproves(
  current: {
    point: Point | null
    precision: LocationPrecision | null
    placement: ListingPlacement | null
  },
  next: {
    point: Point
    precision: LocationPrecision
    placement: ListingPlacement
  }
): boolean {
  if (!current.point || current.precision === null) return true
  if (isAddressPrecision(current.precision)) return false
  if (current.placement?.method === 'manual') return false
  const before = PRECISION_RANK[current.precision]
  const after = PRECISION_RANK[next.precision]
  if (after !== before) return after > before
  const sameArea =
    (current.placement?.area?.codes ?? []).join(',') ===
      (next.placement.area?.codes ?? []).join(',') &&
    (current.placement?.area?.name ?? null) ===
      (next.placement.area?.name ?? null)
  return !samePoint(current.point, next.point) || !sameArea
}

// ---------------------------------------------------------------------------
// Textes : pastille de précision et réserves « ≈ »
// ---------------------------------------------------------------------------

export type PrecisionTone = LocationPrecision | 'none'

export interface PrecisionBadge {
  tone: PrecisionTone
  /** « Adresse exacte », « À la rue », « Au quartier (Caudéran) », « Commune seulement ». */
  label: string
  /** L'explication de l'infobulle : d'où vient le repère. */
  title: string
}

interface LocationLike {
  precision: LocationPrecision | null
  point?: Point | null
  placement?: ListingPlacement | null
  commune?: string | null
  district?: string | null
}

/** Le nom de la zone d'un repère au quartier, s'il est connu. */
export function placementAreaName(location: LocationLike): string | null {
  const area = location.placement?.area
  return area && area.level !== 'commune' ? area.name : null
}

/** La pastille de précision d'une annonce (liste, fiche, carte, comparaison). */
export function precisionBadge(location: LocationLike): PrecisionBadge {
  const placement = location.placement ?? null
  const verify =
    placement?.toVerify && placement.reasons.length > 1
      ? ` À vérifier : ${placement.reasons.slice(1).join(' ')}`
      : ''
  if (location.precision === null || location.point === null) {
    return {
      tone: 'none',
      label: LOCATION_PRECISION_LABELS.none,
      title:
        'Ni adresse ni commune géocodée : pas de repère, aucune distance calculée. Saisis une adresse ou une commune.',
    }
  }
  if (location.precision === 'exact') {
    return {
      tone: 'exact',
      label: LOCATION_PRECISION_LABELS.exact,
      title:
        placement?.method === 'manual'
          ? 'Point saisi à la main ou par Claude : il prime sur le géocodage. Distances, quartier et zone d’encadrement calculés depuis ce point.'
          : 'Repère à l’adresse, au numéro (géocodeur de l’IGN) : distances, quartier et zone d’encadrement calculés depuis l’adresse.',
    }
  }
  if (location.precision === 'street') {
    return {
      tone: 'street',
      label: LOCATION_PRECISION_LABELS.street,
      title:
        'Adresse sans numéro : repère au milieu de la rue. Distances à quelques centaines de mètres près ; zone d’encadrement à confirmer avec le numéro.',
    }
  }
  if (location.precision === 'district') {
    const name = placementAreaName(location)
    const area = placement?.area
    const title =
      placement?.method === 'neighbourhood_match' && area
        ? `Pas d’adresse au numéro : repère au centre ${areaWording(area).of}, reconnu dans ${quoted(placement.matchedText ?? location.district ?? '')} (${area.source}). Distances approchées ; précisez l’adresse pour les fiabiliser.${verify}`
        : placement?.method === 'osm_place' && area
          ? `Pas d’adresse au numéro ni de contour de quartier : repère sur le lieu-dit ${quoted(area.name)} d’OpenStreetMap, reconnu dans ${quoted(placement.matchedText ?? location.district ?? '')}. Distances approchées ; précisez l’adresse pour les fiabiliser.${verify}`
          : 'Le géocodeur n’a trouvé qu’un lieu-dit ou un quartier : repère approché. Précise l’adresse pour fiabiliser les distances.'
    return {
      tone: 'district',
      label: name
        ? `${LOCATION_PRECISION_LABELS.district} (${name})`
        : LOCATION_PRECISION_LABELS.district,
      title,
    }
  }
  const district = location.district?.trim()
  return {
    tone: 'commune',
    label: LOCATION_PRECISION_LABELS.commune,
    title: `Ni adresse au numéro ni quartier reconnu${district ? ` dans ${quoted(district)}` : ''} : repère au centre de la commune${location.commune ? ` (${location.commune})` : ''}. Distances, quartier et zone d’encadrement indicatifs ; précisez l’adresse ou le quartier.`,
  }
}

/**
 * La réserve des calculs faits depuis un repère approché : au centre du
 * quartier, sur un lieu-dit ou au centre de la commune ; rien pour une
 * adresse (numéro ou rue).
 */
export function locationApproximation(
  location: LocationLike
): LocationApproximation {
  if (location.point === null || location.precision === null) {
    return { approximate: false, origin: null, note: null }
  }
  let origin: string | null = null
  if (location.precision === 'district') {
    const area = location.placement?.area
    origin =
      area?.level === 'place'
        ? `lieu-dit ${quoted(area.name)}`
        : area
          ? `centre ${areaWording(area).of}`
          : 'centre du quartier'
  } else if (location.precision === 'commune') {
    origin = `centre de la commune${location.commune ? ` (${location.commune})` : ''}`
  }
  if (!origin) return { approximate: false, origin: null, note: null }
  return {
    approximate: true,
    origin,
    note: `Repère approché : distances mesurées depuis le ${origin}, à lire « ≈ ». Précise l’adresse pour les fiabiliser.`,
  }
}

/**
 * La zone d'un repère approché, pour le plafond d'encadrement : « le
 * secteur « X » », « l’IRIS X », « la commune de Bordeaux » ; null pour un
 * repère à l'adresse, un lieu-dit (sans contour) ou une zone inconnue.
 */
export function approximateAreaLabel(location: LocationLike): string | null {
  if (location.precision !== 'district' && location.precision !== 'commune') {
    return null
  }
  const area = location.placement?.area
  if (location.precision === 'commune') {
    const name = area?.commune ?? location.commune ?? area?.name
    return name ? `la commune de ${name}` : 'la commune'
  }
  if (!area || area.level === 'place') return null
  return areaWording(area).the
}

/** La réserve d'un calcul fait depuis un repère approché, selon le calcul. */
export function approximationReason(
  subject: 'transit' | 'market' | 'amenities',
  approximation: LocationApproximation
): string | null {
  if (!approximation.approximate || !approximation.origin) return null
  switch (subject) {
    case 'transit':
      return `Desserte mesurée depuis le ${approximation.origin}, repère approché : distances ≈.`
    case 'market':
      return `Ventes comparables cherchées autour du ${approximation.origin}, repère approché : médiane indicative.`
    default:
      return `Distance mesurée depuis le ${approximation.origin}, repère approché : à lire « ≈ ».`
  }
}
