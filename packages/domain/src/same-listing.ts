import {
  CERTAIN_DUPLICATE_REASONS,
  DUPLICATE_SCORES,
  DUPLICATE_TOLERANCES,
  normalizeAddress,
  normalizeCommune,
  withinPercent,
} from '@apart/contracts'
import type {
  DpeClass,
  DuplicateCandidate,
  DuplicateProbe,
  DuplicateReason,
  ListingStatus,
  LocationPrecision,
  SellerType,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import { linkIdentity } from './listing-urls.js'
import { cleanReference, referenceKey, sameAgency } from './seller.js'

/**
 * Reconnaître la même annonce (lots 2 et 18, ADR 0028) : même lien, comparé
 * à tous les liens de chaque annonce (certain) ; même agence et même
 * référence (certain) ; même référence avec une agence différente ou
 * inconnue (probable, à trancher) ; même adresse ; même commune avec surface
 * et prix proches ; voisinage à 50 m. Pur : la distance vient du module geo,
 * passée en paramètre ; l'API lit les annonces et les liens.
 *
 * ADR 0041 : un motif probable ne suffit plus. Les faits connus des deux
 * côtés le contredisent (autre nombre de pièces, autre étage, surface à plus
 * de 5 %, DPE à deux classes, construction à plus de trois ans, même agence
 * avec une autre référence) : ce n'est pas un doublon. Une petite différence
 * (DPE voisin, prix éloigné, surface ou prix au bord de la tolérance) baisse
 * le score ; sous `DUPLICATE_SCORES.minimum`, rien n'est rendu. Le voisinage
 * ne compte qu'entre deux repères à l'adresse : deux annonces placées au
 * centre du même quartier sont « à 0 m » sans être voisines.
 */

/** Ce qu'une annonce enregistrée (ou un brouillon) offre à la comparaison. */
export interface DuplicateRow {
  id: string
  title: string
  status: ListingStatus
  price: number
  surface: number | null
  commune: string | null
  url: string | null
  addressRaw: string | null
  addressNormalized: string | null
  /** Lot 18 : les clés des liens de l'annonce (`listing_links.normalized_url`). */
  links?: readonly string[]
  sellerType?: SellerType
  sellerName?: string | null
  sellerReference?: string | null
  /** La clé de la référence, si elle est déjà calculée. */
  sellerReferenceKey?: string | null
  /** Lot 27 : les autres agences qui vendent le même bien, chacune avec sa référence. */
  otherSellers?: readonly DuplicateRowSeller[]
  /** ADR 0041 : les faits qui confirment ou contredisent un motif probable. */
  rooms?: number | null
  floor?: number | null
  dpeClass?: DpeClass | null
  constructionYear?: number | null
  /** La précision du repère : le voisinage à 50 m ne vaut qu'à l'adresse. */
  locationPrecision?: LocationPrecision | null
}

/** Un vendeur d'une annonce enregistrée, tel que la comparaison le lit. */
export interface DuplicateRowSeller {
  sellerType?: SellerType | undefined
  sellerName?: string | null | undefined
  sellerReference?: string | null | undefined
  sellerReferenceKey?: string | null | undefined
}

const m2 = (value: number | null): string =>
  value === null ? 'surface inconnue' : `${value} m²`

/**
 * Une adresse comparable, débarrassée des mots de la commune : « 12 rue du
 * Forum, 33400 Talence » et « 12 rue du Forum » (commune Talence à côté)
 * donnent la même clé.
 */
export function addressKey(
  address: string | null | undefined,
  commune: string | null | undefined
): string | null {
  const normalized = normalizeAddress(address)
  if (!normalized) return null
  const communeWords = new Set(
    (normalizeCommune(commune) ?? '').split(' ').filter(Boolean)
  )
  const words = normalized.split(' ').filter(word => !communeWords.has(word))
  return words.length > 0 ? words.join(' ') : null
}

/**
 * Les identités de tous les liens d'une annonce, lien principal compris
 * (`linkIdentity` : les deux formes d'une page Bien'ici n'en font qu'une).
 */
export function rowLinkKeys(
  row: Pick<DuplicateRow, 'url' | 'links'>
): Set<string> {
  const keys = new Set<string>()
  for (const link of [row.url, ...(row.links ?? [])]) {
    const key = linkIdentity(link)
    if (key) keys.add(key)
  }
  return keys
}

/**
 * Le motif « référence » : même référence (clé sans espaces ni tirets) des
 * deux côtés, aucun particulier ; même agence (après normalisation) = la même
 * annonce, sinon probable. Null sans référence commune. Lot 27 : la sonde
 * est comparée à chaque agence de la fiche (la principale et les autres) ;
 * le motif le plus fort l'emporte.
 */
export function referenceReason(
  probe: Pick<DuplicateProbe, 'reference' | 'sellerName' | 'sellerType'>,
  row: Pick<
    DuplicateRow,
    | 'sellerType'
    | 'sellerName'
    | 'sellerReference'
    | 'sellerReferenceKey'
    | 'otherSellers'
  >
): DuplicateReason | null {
  let best: DuplicateReason | null = null
  for (const seller of [row, ...(row.otherSellers ?? [])]) {
    const reason = sellerReferenceReason(probe, seller)
    if (reason && (best === null || reason.score > best.score)) best = reason
  }
  return best
}

function sellerReferenceReason(
  probe: Pick<DuplicateProbe, 'reference' | 'sellerName' | 'sellerType'>,
  row: DuplicateRowSeller
): DuplicateReason | null {
  if (probe.sellerType === 'private' || row.sellerType === 'private') {
    return null
  }
  const probeKey = referenceKey(probe.reference)
  const rowKey = row.sellerReferenceKey ?? referenceKey(row.sellerReference)
  if (!probeKey || !rowKey || probeKey !== rowKey) return null
  const reference = cleanReference(probe.reference) ?? probeKey
  const typesDiffer =
    probe.sellerType !== undefined &&
    row.sellerType !== undefined &&
    row.sellerType !== 'unknown' &&
    probe.sellerType !== row.sellerType
  if (!typesDiffer && sameAgency(probe.sellerName, row.sellerName)) {
    return {
      kind: 'same_reference',
      score: 1,
      detail: `Même agence et même référence : ${reference} (« ${row.sellerName} »)`,
    }
  }
  // ADR 0041 : une référence courte chez une autre agence est une coïncidence.
  if (probeKey.length < DUPLICATE_TOLERANCES.otherAgencyReferenceMinLength) {
    return null
  }
  const agencies =
    probe.sellerName && row.sellerName
      ? `« ${probe.sellerName} » contre « ${row.sellerName} »`
      : 'agence inconnue d’un côté'
  return {
    kind: 'same_reference_other_agency',
    score: 0.85,
    detail: `Même référence ${reference}, autre agence (${typesDiffer ? 'autre vendeur' : agencies}) : deux agences ont parfois le même mandat, à trancher`,
  }
}

/** Les faits de la sonde qu'un motif probable doit respecter. */
type ProbeFacts = Partial<DuplicateProbe>

const DPE_ORDER: readonly DpeClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function known<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function relativeGap(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b))
  return max === 0 ? 0 : Math.abs(a - b) / max
}

function floorText(floor: number): string {
  if (floor === 0) return 'rez-de-chaussée'
  return floor === 1 ? '1er étage' : `${floor}e étage`
}

const rooms = (value: number): string => `${value} pièce${value > 1 ? 's' : ''}`

/** Un repère approché (rue, centre du quartier, centre de la commune) ne dit pas qui est voisin. */
function approximate(precision: LocationPrecision | null | undefined): boolean {
  return (
    precision === 'street' ||
    precision === 'district' ||
    precision === 'commune'
  )
}

/** « 700 m », « 2,4 km » (au mètre près ne voudrait rien dire entre deux contours). */
function gapText(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${String(Math.round(meters / 100) / 10).replace('.', ',')} km`
}

/**
 * Vrai si l'écart entre deux lieux se mesure de ce côté (ADR 0041) : une
 * adresse ou une rue par son point, un quartier ou une commune par son
 * contour seulement (un centre de quartier ne dit pas où est le bien).
 */
export function measurableZone(
  precision: LocationPrecision | null | undefined,
  hasArea: boolean
): boolean {
  if (precision === 'exact' || precision === 'street') return true
  return (precision === 'district' || precision === 'commune') && hasArea
}

/**
 * Même agence, autre référence : deux mandats de la même agence, donc deux
 * biens (les trois lots d'un même immeuble chez la même agence). Null si une
 * agence de la fiche a la même référence, ou si rien n'est comparable.
 */
function otherReferenceSameAgency(
  probe: ProbeFacts,
  row: DuplicateRow
): string | null {
  if (probe.sellerType === 'private') return null
  const probeKey = referenceKey(probe.reference)
  if (!probeKey || !probe.sellerName) return null
  let contradiction: string | null = null
  for (const seller of [row, ...(row.otherSellers ?? [])]) {
    if (seller.sellerType === 'private') continue
    if (!sameAgency(probe.sellerName, seller.sellerName)) continue
    const rowKey =
      seller.sellerReferenceKey ?? referenceKey(seller.sellerReference)
    if (!rowKey) continue
    if (rowKey === probeKey) return null
    contradiction ??= `Même agence (« ${seller.sellerName} »), autre référence : ${cleanReference(seller.sellerReference) ?? rowKey} contre ${cleanReference(probe.reference) ?? probeKey}`
  }
  return contradiction
}

/**
 * Ce qui contredit le doublon, fait par fait, connu des deux côtés : un autre
 * nombre de pièces, un autre étage, une surface à plus de 5 %, un DPE à deux
 * classes ou plus, une construction à plus de trois ans, la même agence avec
 * une autre référence, deux lieux à plus de 500 m (`zoneGapMeters`, mesuré
 * par PostGIS entre les contours ou les points, `measurableZone` des deux
 * côtés). Chaque phrase est écrite du point de vue de l'annonce
 * suivie (« 4 pièces contre 3 » : elle en a 4).
 */
export function duplicateContradictions(
  probe: ProbeFacts,
  row: DuplicateRow,
  zoneGapMeters?: number
): string[] {
  const t = DUPLICATE_TOLERANCES
  const found: string[] = []
  if (known(probe.rooms) && known(row.rooms) && probe.rooms !== row.rooms) {
    found.push(`${rooms(row.rooms)} contre ${probe.rooms}`)
  }
  if (known(probe.floor) && known(row.floor) && probe.floor !== row.floor) {
    found.push(`Au ${floorText(row.floor)}, pas au ${floorText(probe.floor)}`)
  }
  if (
    known(probe.surface) &&
    known(row.surface) &&
    probe.surface > 0 &&
    row.surface > 0 &&
    relativeGap(probe.surface, row.surface) > t.contradictionSurface
  ) {
    found.push(`${m2(row.surface)} contre ${m2(probe.surface)}`)
  }
  if (known(probe.dpeClass) && known(row.dpeClass)) {
    const gap = Math.abs(
      DPE_ORDER.indexOf(probe.dpeClass) - DPE_ORDER.indexOf(row.dpeClass)
    )
    if (gap >= t.contradictionDpeClasses) {
      found.push(`DPE ${row.dpeClass} contre ${probe.dpeClass}`)
    }
  }
  if (
    known(probe.constructionYear) &&
    known(row.constructionYear) &&
    Math.abs(probe.constructionYear - row.constructionYear) >
      t.contradictionYears
  ) {
    found.push(
      `Construit en ${row.constructionYear}, pas en ${probe.constructionYear}`
    )
  }
  const reference = otherReferenceSameAgency(probe, row)
  if (reference) found.push(reference)
  if (
    zoneGapMeters !== undefined &&
    zoneGapMeters > t.contradictionZoneGapMeters
  ) {
    found.push(`Au moins ${gapText(zoneGapMeters)} entre les deux lieux`)
  }
  return found
}

/**
 * Les petites différences qui rendent un doublon moins probable, chacune avec
 * ce qu'elle retire au score : un DPE à une classe (0,15), un prix à plus de
 * 5 % (0,15).
 */
export function duplicateDifferences(
  probe: ProbeFacts,
  row: DuplicateRow
): { text: string; penalty: number }[] {
  const found: { text: string; penalty: number }[] = []
  if (known(probe.dpeClass) && known(row.dpeClass)) {
    const gap = Math.abs(
      DPE_ORDER.indexOf(probe.dpeClass) - DPE_ORDER.indexOf(row.dpeClass)
    )
    if (gap === 1) {
      found.push({
        text: `DPE ${row.dpeClass} contre ${probe.dpeClass}`,
        penalty: 0.15,
      })
    }
  }
  if (
    known(probe.price) &&
    probe.price > 0 &&
    row.price > 0 &&
    relativeGap(probe.price, row.price) > DUPLICATE_TOLERANCES.price
  ) {
    found.push({
      text: `${formatEuros(row.price)} contre ${formatEuros(probe.price)}`,
      penalty: 0.15,
    })
  }
  return found
}

/**
 * Les motifs bruts, avant les contradictions, dans l'ordre de force : même
 * lien (1), même agence et même référence (1), même référence autre agence
 * (0,85), même adresse au numéro (0,9), même commune avec surface à ±3 % et
 * prix à ±5 % (0,8, moins selon l'écart), deux repères à l'adresse à moins
 * de 50 m avec surface à ±5 % (0,7).
 */
function rawDuplicateReasons(
  probe: DuplicateProbe,
  row: DuplicateRow,
  distanceMeters: number | undefined
): DuplicateReason[] {
  const reasons: DuplicateReason[] = []

  const probeUrl = linkIdentity(probe.url)
  if (probeUrl && rowLinkKeys(row).has(probeUrl)) {
    reasons.push({
      kind: 'same_url',
      score: 1,
      detail: `Même lien : ${probeUrl}`,
    })
  }

  const reference = referenceReason(probe, row)
  if (reference) reasons.push(reference)

  const probeCommune = normalizeCommune(probe.commune)
  const rowCommune = normalizeCommune(row.commune)
  const communesDiffer =
    probeCommune !== null && rowCommune !== null && probeCommune !== rowCommune

  // Une rue sans numéro n'est pas une adresse : tout un immeuble, toute une rue.
  const probeAddress = addressKey(probe.address, probe.commune ?? row.commune)
  if (probeAddress && hasNumber(probeAddress) && !communesDiffer) {
    const rowAddresses = [row.addressRaw, row.addressNormalized]
      .map(address => addressKey(address, row.commune))
      .filter((a): a is string => a !== null)
    if (rowAddresses.includes(probeAddress)) {
      reasons.push({
        kind: 'same_address',
        score: 0.9,
        detail: `Même adresse : ${row.addressRaw ?? row.addressNormalized ?? probe.address}`,
      })
    }
  }

  if (
    probeCommune !== null &&
    probeCommune === rowCommune &&
    withinPercent(probe.surface, row.surface, DUPLICATE_TOLERANCES.surface) &&
    withinPercent(probe.price, row.price, DUPLICATE_TOLERANCES.price)
  ) {
    // Au bord des tolérances, la ressemblance est moins forte (0,6 au pire).
    const surfaceGap =
      relativeGap(probe.surface ?? 0, row.surface ?? 0) /
      DUPLICATE_TOLERANCES.surface
    const priceGap =
      relativeGap(probe.price ?? 0, row.price) / DUPLICATE_TOLERANCES.price
    reasons.push({
      kind: 'same_commune_price_surface',
      score: round2(0.8 - 0.1 * surfaceGap - 0.1 * priceGap),
      detail: `${row.commune} : ${m2(row.surface)} contre ${m2(probe.surface ?? null)}, ${formatEuros(row.price)} contre ${formatEuros(probe.price ?? 0)}`,
    })
  }

  if (
    distanceMeters !== undefined &&
    distanceMeters <= DUPLICATE_TOLERANCES.nearbyMeters &&
    !approximate(probe.precision) &&
    !approximate(row.locationPrecision) &&
    withinPercent(
      probe.surface,
      row.surface,
      DUPLICATE_TOLERANCES.nearbySurface
    )
  ) {
    reasons.push({
      kind: 'nearby_similar',
      score: 0.7,
      detail: `À ${Math.round(distanceMeters)} m, ${m2(row.surface)} contre ${m2(probe.surface ?? null)}`,
    })
  }
  return reasons
}

const round2 = (value: number): number => Math.round(value * 100) / 100

/** Une clé d'adresse qui porte un numéro (« 12 forum rue »). */
function hasNumber(key: string): boolean {
  return key.split(' ').some(word => /^\d+[a-z]?$/.test(word))
}

/** Les motifs, les contradictions et les différences d'une annonce face à la sonde. */
export interface DuplicateAssessment {
  reasons: DuplicateReason[]
  /** Les faits qui disent que ce n'est pas le même bien. */
  contradictions: string[]
  /** Ce qui diffère encore (petites différences, contradictions d'un doublon certain). */
  differences: string[]
}

/**
 * Le jugement complet (ADR 0041) : un motif certain (même lien, même agence
 * et même référence) le reste, ses contradictions sont dites ; sans motif
 * certain, une contradiction écarte tout, et les petites différences
 * baissent le score de chaque motif, gardé à partir de
 * `DUPLICATE_SCORES.minimum`.
 */
export function assessDuplicate(
  probe: DuplicateProbe,
  row: DuplicateRow,
  distanceMeters: number | undefined,
  zoneGapMeters?: number
): DuplicateAssessment {
  const raw = rawDuplicateReasons(probe, row, distanceMeters)
  if (raw.length === 0)
    return { reasons: [], contradictions: [], differences: [] }
  const contradictions = duplicateContradictions(probe, row, zoneGapMeters)
  if (isCertainMatch(raw)) {
    return {
      reasons: raw,
      contradictions,
      differences: [
        ...contradictions,
        ...duplicateDifferences(probe, row).map(d => d.text),
      ],
    }
  }
  if (contradictions.length > 0) {
    return { reasons: [], contradictions, differences: [] }
  }
  const differences = duplicateDifferences(probe, row)
  const penalty = differences.reduce((sum, d) => sum + d.penalty, 0)
  const reasons = raw
    .map(reason => ({ ...reason, score: round2(reason.score - penalty) }))
    .filter(reason => reason.score >= DUPLICATE_SCORES.minimum)
  return {
    reasons,
    contradictions,
    differences: reasons.length ? differences.map(d => d.text) : [],
  }
}

/**
 * Les motifs pour lesquels une annonce existante ressemble à la sonde, après
 * les contradictions et les petites différences (`assessDuplicate`).
 */
export function duplicateReasons(
  probe: DuplicateProbe,
  row: DuplicateRow,
  distanceMeters: number | undefined,
  zoneGapMeters?: number
): DuplicateReason[] {
  return assessDuplicate(probe, row, distanceMeters, zoneGapMeters).reasons
}

/** Vrai si les motifs suffisent à dire que c'est la même annonce (même lien, ou même agence et même référence). */
export function isCertainMatch(
  reasons: readonly Pick<DuplicateReason, 'kind'>[]
): boolean {
  return reasons.some(r => CERTAIN_DUPLICATE_REASONS.includes(r.kind))
}

/**
 * Les candidats, du plus vraisemblable au moins, un par annonce avec tous ses
 * motifs ; les certains d'abord. `distances` : les annonces à 50 m ;
 * `zoneGaps` : l'écart entre les lieux, pour les annonces où il se mesure.
 */
export function matchDuplicates(
  probe: DuplicateProbe,
  rows: readonly DuplicateRow[],
  distances: ReadonlyMap<string, number> = new Map(),
  zoneGaps: ReadonlyMap<string, number> = new Map()
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = []
  for (const row of rows) {
    if (probe.listingId && row.id === probe.listingId) continue
    const { reasons, differences } = assessDuplicate(
      probe,
      row,
      distances.get(row.id),
      zoneGaps.get(row.id)
    )
    if (reasons.length === 0) continue
    candidates.push({
      listingId: row.id,
      title: row.title,
      status: row.status,
      price: row.price,
      surface: row.surface,
      commune: row.commune,
      url: row.url,
      score: Math.max(...reasons.map(r => r.score)),
      reasons,
      certain: isCertainMatch(reasons),
      sellerType: row.sellerType ?? 'unknown',
      sellerName: row.sellerName ?? null,
      sellerReference: row.sellerReference ?? null,
      linkCount: rowLinkKeys(row).size,
      differences,
    })
  }
  return candidates.sort(
    (a, b) =>
      Number(b.certain) - Number(a.certain) ||
      b.score - a.score ||
      a.title.localeCompare(b.title)
  )
}

/** La première annonce certaine par agence et référence (même agence, même référence), ou null. */
export function referenceMatchOf<T extends Pick<DuplicateCandidate, 'reasons'>>(
  candidates: readonly T[]
): T | null {
  return (
    candidates.find(c => c.reasons.some(r => r.kind === 'same_reference')) ??
    null
  )
}

/**
 * ADR 0041 : le premier doublon probable qui bloque la création (score à
 * partir de `DUPLICATE_SCORES.blocking`, sans motif certain), ou null.
 */
export function blockingDuplicateOf<
  T extends Pick<DuplicateCandidate, 'certain' | 'score'>,
>(candidates: readonly T[]): T | null {
  return (
    candidates.find(c => !c.certain && c.score >= DUPLICATE_SCORES.blocking) ??
    null
  )
}

/** La première annonce au même lien, ou null. */
export function sameUrlMatchOf<T extends Pick<DuplicateCandidate, 'reasons'>>(
  candidates: readonly T[]
): T | null {
  return (
    candidates.find(c => c.reasons.some(r => r.kind === 'same_url')) ?? null
  )
}
