import {
  SIMILARITY_THRESHOLDS,
  SIMILAR_LISTINGS_DEFAULT,
  normalizeCommune,
} from '@apart/contracts'
import type {
  DpeClass,
  DuplicateReason,
  ListingStatus,
  SellerType,
  SimilarListing,
  SimilarReason,
  SimilarityLevel,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import {
  duplicateReasons,
  isCertainMatch,
  rowLinkKeys,
} from './same-listing.js'
import type { DuplicateRow, DuplicateRowSeller } from './same-listing.js'
import { referenceKey, sameAgency } from './seller.js'

/**
 * Lot 27 (ADR 0037) : « Déjà vue ». Classer les annonces suivies par
 * ressemblance avec celle qu'on regarde (un brouillon, une annonce à trier,
 * des caractéristiques lues sur une page), pour retrouver en tête celle qui
 * est le même bien. Deux étages : les motifs de doublon du lot 18 (même
 * lien, même agence et même référence, même adresse…) qui fixent un
 * plancher, puis une note de 0 à 1 faite des caractéristiques comparables
 * (commune, quartier, distance, surface, prix, pièces, étage, DPE, année,
 * agence), pondérées et ramenées à ce qui est connu des deux côtés. Un texte
 * cherché filtre ; le classement reste celui de la ressemblance. Pur : la
 * distance vient du module geo.
 */

/** Ce qu'on compare : une annonce, un brouillon, ou des caractéristiques lues. */
export interface SimilarProbe {
  /** Annonce enregistrée : exclue des résultats. */
  listingId?: string | undefined
  url?: string | null | undefined
  /** Les clés des autres liens de l'annonce comparée. */
  links?: readonly string[] | undefined
  address?: string | null | undefined
  commune?: string | null | undefined
  district?: string | null | undefined
  price?: number | null | undefined
  surface?: number | null | undefined
  rooms?: number | null | undefined
  floor?: number | null | undefined
  dpeClass?: DpeClass | null | undefined
  constructionYear?: number | null | undefined
  sellerType?: SellerType | undefined
  sellerName?: string | null | undefined
  reference?: string | null | undefined
  /** Les autres agences de l'annonce comparée. */
  otherSellers?: readonly DuplicateRowSeller[] | undefined
}

/** Ce qu'une annonce enregistrée offre à la comparaison. */
export interface SimilarRow extends DuplicateRow {
  rooms: number | null
  floor: number | null
  dpeClass: DpeClass | null
  constructionYear: number | null
  district: string | null
  updatedAt: string
}

/** Le poids de chaque caractéristique dans la note. */
export const SIMILARITY_WEIGHTS = {
  commune: 2,
  district: 1,
  districtDiffers: 0.5,
  distance: 3,
  surface: 3,
  price: 3,
  rooms: 1.5,
  floor: 1,
  dpe: 1,
  year: 0.5,
  agency: 1,
} as const

/** En dessous de ce poids comparable, la note est rabattue (trop peu de faits communs). */
export const SIMILARITY_FULL_WEIGHT = 8

/** À moins de cette distance, deux repères sont « au même endroit ». */
const SAME_PLACE_METERS = 50

interface Feature {
  kind: SimilarReason['kind']
  weight: number
  similarity: number
  text: string
}

const DPE_ORDER: readonly DpeClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function fold(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function known<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

const m2 = (value: number): string =>
  `${String(Math.round(value * 10) / 10).replace('.', ',')} m²`

function relativeGap(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b))
  return max === 0 ? 0 : Math.abs(a - b) / max
}

/** « 40 m », « 1,2 km ». */
export function distanceText(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10 || 10} m`
  return `${String(Math.round(meters / 100) / 10).replace('.', ',')} km`
}

function floorText(floor: number): string {
  if (floor === 0) return 'rez-de-chaussée'
  return floor === 1 ? '1er étage' : `${floor}e étage`
}

/**
 * Les caractéristiques comparables des deux côtés, chacune avec sa
 * ressemblance de 0 à 1 et sa phrase, écrite du point de vue de l'annonce
 * suivie (« 46 m² contre 45 m² » : elle fait 46 m², celle qu'on regarde 45).
 */
export function similarityFeatures(
  probe: SimilarProbe,
  row: SimilarRow,
  distanceMeters: number | undefined
): Feature[] {
  const features: Feature[] = []
  const w = SIMILARITY_WEIGHTS

  const probeCommune = normalizeCommune(probe.commune)
  const rowCommune = normalizeCommune(row.commune)
  if (probeCommune !== null && rowCommune !== null) {
    const same = probeCommune === rowCommune
    features.push({
      kind: 'commune',
      weight: w.commune,
      similarity: same ? 1 : 0,
      text: same
        ? `Même commune (${row.commune})`
        : `Autre commune : ${row.commune}`,
    })
  }

  const probeDistrict = fold(probe.district)
  const rowDistrict = fold(row.district)
  if (probeDistrict && rowDistrict) {
    const same =
      probeDistrict === rowDistrict ||
      probeDistrict.includes(rowDistrict) ||
      rowDistrict.includes(probeDistrict)
    features.push({
      kind: 'district',
      weight: same ? w.district : w.districtDiffers,
      similarity: same ? 1 : 0,
      text: same
        ? `Même quartier (${row.district})`
        : `Autre quartier : ${row.district}`,
    })
  }

  if (distanceMeters !== undefined) {
    const span = SIMILARITY_THRESHOLDS.distanceSpanMeters
    const similarity =
      distanceMeters <= SAME_PLACE_METERS
        ? 1
        : Math.max(0, 1 - (distanceMeters - SAME_PLACE_METERS) / span)
    features.push({
      kind: 'distance',
      weight: w.distance,
      similarity,
      text:
        distanceMeters <= SAME_PLACE_METERS
          ? `Au même endroit (à ${distanceText(distanceMeters)})`
          : `À ${distanceText(distanceMeters)}`,
    })
  }

  if (known(probe.surface) && known(row.surface)) {
    const gap = relativeGap(probe.surface, row.surface)
    features.push({
      kind: 'surface',
      weight: w.surface,
      similarity: Math.max(0, 1 - gap / SIMILARITY_THRESHOLDS.surfaceSpan),
      text:
        gap < 0.005
          ? `Même surface (${m2(row.surface)})`
          : `${m2(row.surface)} contre ${m2(probe.surface)}`,
    })
  }

  if (known(probe.price) && probe.price > 0 && row.price > 0) {
    const gap = relativeGap(probe.price, row.price)
    const delta = row.price - probe.price
    features.push({
      kind: 'price',
      weight: w.price,
      similarity: Math.max(0, 1 - gap / SIMILARITY_THRESHOLDS.priceSpan),
      text:
        gap < 0.002
          ? `Même prix (${formatEuros(row.price)})`
          : `${formatEuros(Math.abs(delta))} de ${delta > 0 ? 'plus' : 'moins'} (${formatEuros(row.price)})`,
    })
  }

  if (known(probe.rooms) && known(row.rooms)) {
    const gap = Math.abs(probe.rooms - row.rooms)
    features.push({
      kind: 'rooms',
      weight: w.rooms,
      similarity: gap === 0 ? 1 : gap === 1 ? 0.3 : 0,
      text:
        gap === 0
          ? `Même nombre de pièces (${row.rooms})`
          : `${row.rooms} pièce${row.rooms > 1 ? 's' : ''} contre ${probe.rooms}`,
    })
  }

  if (known(probe.floor) && known(row.floor)) {
    const same = probe.floor === row.floor
    features.push({
      kind: 'floor',
      weight: w.floor,
      similarity: same ? 1 : 0,
      text: same
        ? `Même étage (${floorText(row.floor)})`
        : `Au ${floorText(row.floor)}, pas au ${floorText(probe.floor)}`,
    })
  }

  if (known(probe.dpeClass) && known(row.dpeClass)) {
    const gap = Math.abs(
      DPE_ORDER.indexOf(probe.dpeClass) - DPE_ORDER.indexOf(row.dpeClass)
    )
    features.push({
      kind: 'dpe',
      weight: w.dpe,
      similarity: gap === 0 ? 1 : gap === 1 ? 0.4 : 0,
      text:
        gap === 0
          ? `Même DPE (${row.dpeClass})`
          : `DPE ${row.dpeClass} contre ${probe.dpeClass}`,
    })
  }

  if (known(probe.constructionYear) && known(row.constructionYear)) {
    const gap = Math.abs(probe.constructionYear - row.constructionYear)
    features.push({
      kind: 'year',
      weight: w.year,
      similarity: gap === 0 ? 1 : gap <= 5 ? 0.5 : 0,
      text:
        gap === 0
          ? `Même année de construction (${row.constructionYear})`
          : `Construit en ${row.constructionYear}, pas en ${probe.constructionYear}`,
    })
  }

  // Une même agence rapproche ; une autre agence ne dit rien (mandat simple).
  const probeAgencies = [
    probe.sellerName,
    ...(probe.otherSellers ?? []).map(s => s.sellerName),
  ]
  const rowAgencies = [
    row.sellerName,
    ...(row.otherSellers ?? []).map(s => s.sellerName),
  ]
  const shared = rowAgencies.find(
    name => name && probeAgencies.some(other => sameAgency(name, other))
  )
  if (shared) {
    features.push({
      kind: 'same_agency',
      weight: w.agency,
      similarity: 1,
      text: `Même agence (« ${shared} »)`,
    })
  }
  return features
}

/** Les motifs de doublon du lot 18 entre la sonde (tous ses liens, toutes ses agences) et une annonce. */
export function probeDuplicateReasons(
  probe: SimilarProbe,
  row: SimilarRow,
  distanceMeters: number | undefined
): DuplicateReason[] {
  const base = {
    ...(probe.address ? { address: probe.address } : {}),
    ...(probe.commune ? { commune: probe.commune } : {}),
    ...(known(probe.price) ? { price: probe.price } : {}),
    ...(known(probe.surface) ? { surface: probe.surface } : {}),
  }
  const sellers: DuplicateRowSeller[] = [
    {
      sellerType: probe.sellerType,
      sellerName: probe.sellerName,
      sellerReference: probe.reference,
    },
    ...(probe.otherSellers ?? []),
  ]
  const urls = [probe.url ?? undefined, ...(probe.links ?? [])].filter(
    (url): url is string => Boolean(url)
  )
  const byKind = new Map<DuplicateReason['kind'], DuplicateReason>()
  const attempts = Math.max(sellers.length, urls.length, 1)
  for (let index = 0; index < attempts; index += 1) {
    const seller = sellers[index]
    const url = urls[index]
    const observedType =
      seller?.sellerType && seller.sellerType !== 'unknown'
        ? seller.sellerType
        : undefined
    const reasons = duplicateReasons(
      {
        ...base,
        ...(url ? { url } : {}),
        ...(observedType ? { sellerType: observedType } : {}),
        ...(seller?.sellerName ? { sellerName: seller.sellerName } : {}),
        ...(seller?.sellerReference
          ? { reference: seller.sellerReference }
          : {}),
      },
      row,
      distanceMeters
    )
    for (const reason of reasons) {
      const previous = byKind.get(reason.kind)
      if (!previous || reason.score > previous.score) {
        byKind.set(reason.kind, reason)
      }
    }
  }
  // La même référence chez la même agence vaut mieux que « autre agence ».
  if (byKind.has('same_reference')) byKind.delete('same_reference_other_agency')
  return [...byKind.values()].sort((a, b) => b.score - a.score)
}

/** Le niveau lisible d'une note. */
export function similarityLevel(
  score: number,
  certain: boolean
): SimilarityLevel {
  if (certain) return 'certain'
  if (score >= SIMILARITY_THRESHOLDS.veryClose) return 'very_close'
  if (score >= SIMILARITY_THRESHOLDS.close) return 'close'
  return 'far'
}

/**
 * La ressemblance d'une annonce suivie avec la sonde : la note, ce qui
 * concorde et ce qui diffère. La note est la moyenne pondérée des
 * caractéristiques comparables, rabattue quand peu de faits sont connus des
 * deux côtés ; un motif de doublon fixe un plancher (son score) ; un motif
 * certain donne 1.
 */
export function similarityOf(
  probe: SimilarProbe,
  row: SimilarRow,
  distanceMeters?: number
): Pick<SimilarListing, 'score' | 'level' | 'matches' | 'differences'> {
  const reasons = probeDuplicateReasons(probe, row, distanceMeters)
  const features = similarityFeatures(probe, row, distanceMeters)
  const weight = features.reduce((sum, f) => sum + f.weight, 0)
  const base =
    weight > 0
      ? features.reduce((sum, f) => sum + f.weight * f.similarity, 0) / weight
      : 0
  const confidence = Math.min(1, weight / SIMILARITY_FULL_WEIGHT)
  const measured = base * (0.4 + 0.6 * confidence)
  const certain = isCertainMatch(reasons)
  const floor = reasons.reduce((max, r) => Math.max(max, r.score), 0)
  const score = certain ? 1 : Math.max(measured, floor)

  // Un motif de doublon dit déjà la commune, la surface ou la distance.
  const told = new Set<SimilarReason['kind']>()
  for (const reason of reasons) {
    if (reason.kind === 'same_commune_price_surface') {
      told.add('commune').add('surface').add('price')
    } else if (reason.kind === 'nearby_similar') {
      told.add('distance').add('surface')
    } else if (reason.kind === 'same_reference') {
      told.add('same_agency')
    }
  }
  const strong: SimilarReason[] = reasons.map(reason => ({
    kind:
      reason.kind === 'same_commune_price_surface'
        ? 'commune'
        : reason.kind === 'nearby_similar'
          ? 'distance'
          : reason.kind,
    text: reason.detail,
  }))
  const ordered = [...features].sort(
    (a, b) => b.weight * b.similarity - a.weight * a.similarity
  )
  const matches = [
    ...strong,
    ...ordered
      .filter(f => f.similarity >= 0.5 && !told.has(f.kind))
      .map(f => ({ kind: f.kind, text: f.text })),
  ]
  const differences = [...features]
    .filter(f => f.similarity < 0.5)
    .sort((a, b) => b.weight - a.weight)
    .map(f => ({ kind: f.kind, text: f.text }))
  return {
    score: Math.round(score * 100) / 100,
    level: similarityLevel(score, certain),
    matches,
    differences,
  }
}

/** Les mots d'un texte cherché, sans accents ni ponctuation. */
export function searchTokens(query: string | null | undefined): string[] {
  return fold(query).split(' ').filter(Boolean)
}

/**
 * Le texte cherché désigne-t-il cette annonce ? Chaque mot doit se trouver
 * dans son titre, sa commune, son quartier, son adresse, une de ses agences,
 * une de ses références (espaces et tirets ignorés), son prix ou sa surface.
 */
export function matchesSearch(
  row: SimilarRow,
  tokens: readonly string[]
): boolean {
  if (tokens.length === 0) return true
  const sellers = [row, ...(row.otherSellers ?? [])]
  const words = fold(
    [
      row.title,
      row.commune,
      row.district,
      row.addressRaw,
      row.addressNormalized,
      ...sellers.map(s => s.sellerName),
      ...sellers.map(s => s.sellerReference),
    ]
      .filter(Boolean)
      .join(' ')
  )
  const compact = [
    words.replace(/ /g, ''),
    ...sellers.map(
      s => s.sellerReferenceKey ?? referenceKey(s.sellerReference) ?? ''
    ),
    String(Math.round(row.price)),
    known(row.surface) ? String(row.surface) : '',
  ]
    .join(' ')
    .toLowerCase()
  return tokens.every(token => words.includes(token) || compact.includes(token))
}

/** L'ordre des étapes pour départager deux annonces de même note : les suivies avant les archivées. */
const STATUS_RANK: Record<ListingStatus, number> = {
  offer_accepted: 0,
  offer_made: 1,
  visited: 2,
  to_visit: 3,
  to_study: 4,
  offer_refused: 5,
  discarded: 6,
  sold_or_withdrawn: 7,
}

/**
 * Les annonces suivies, de la plus ressemblante à la moins ressemblante. Sans
 * texte cherché, celles dont la note passe le plancher (ou qui ont un motif
 * de doublon) ; avec un texte, celles qu'il désigne, toujours classées par
 * ressemblance. L'annonce comparée est exclue.
 */
export function rankSimilarListings(
  probe: SimilarProbe,
  rows: readonly SimilarRow[],
  distances: ReadonlyMap<string, number> = new Map(),
  options: { q?: string | null | undefined; limit?: number } = {}
): { items: SimilarListing[]; compared: number } {
  const tokens = searchTokens(options.q)
  const limit = options.limit ?? SIMILAR_LISTINGS_DEFAULT
  const candidates = rows.filter(row => row.id !== probe.listingId)
  const items: SimilarListing[] = []
  for (const row of candidates) {
    if (!matchesSearch(row, tokens)) continue
    const similarity = similarityOf(probe, row, distances.get(row.id))
    if (
      tokens.length === 0 &&
      similarity.level === 'far' &&
      similarity.score < SIMILARITY_THRESHOLDS.floor
    ) {
      continue
    }
    items.push({
      listingId: row.id,
      title: row.title,
      status: row.status,
      price: row.price,
      surface: row.surface,
      rooms: row.rooms,
      commune: row.commune,
      district: row.district,
      url: row.url,
      sellerName: row.sellerName ?? null,
      sellerReference: row.sellerReference ?? null,
      linkCount: rowLinkKeys(row).size,
      updatedAt: row.updatedAt,
      ...similarity,
    })
  }
  items.sort(
    (a, b) =>
      Number(b.level === 'certain') - Number(a.level === 'certain') ||
      b.score - a.score ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.title.localeCompare(b.title)
  )
  return { items: items.slice(0, limit), compared: candidates.length }
}

/** « 3 annonces ressemblantes, dont 1 très proche », « Aucune annonce ressemblante ». */
export function similarSummaryText(
  items: readonly Pick<SimilarListing, 'level'>[],
  query?: string | null
): string {
  if (items.length === 0) {
    return query
      ? `Aucune annonce suivie ne correspond à « ${query} »`
      : 'Aucune annonce suivie ne lui ressemble'
  }
  const head = `${items.length} annonce${items.length > 1 ? 's' : ''} ${items.length > 1 ? 'ressemblantes' : 'ressemblante'}`
  const certain = items.filter(i => i.level === 'certain').length
  const veryClose = items.filter(i => i.level === 'very_close').length
  if (certain > 0) {
    return `${head}, dont ${certain === 1 ? 'la même annonce' : `${certain} fois la même annonce`}`
  }
  return veryClose > 0
    ? `${head}, dont ${veryClose} très proche${veryClose > 1 ? 's' : ''}`
    : head
}

/** La note en clair : « 87 % ». */
export function similarityPercent(score: number): string {
  return `${Math.round(score * 100)} %`
}
