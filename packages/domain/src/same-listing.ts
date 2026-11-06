import {
  CERTAIN_DUPLICATE_REASONS,
  DUPLICATE_TOLERANCES,
  normalizeAddress,
  normalizeCommune,
  withinPercent,
} from '@apart/contracts'
import type {
  DuplicateCandidate,
  DuplicateProbe,
  DuplicateReason,
  ListingStatus,
  SellerType,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import { linkKey } from './listing-urls.js'
import { cleanReference, referenceKey, sameAgency } from './seller.js'

/**
 * Reconnaître la même annonce (lots 2 et 18, ADR 0028) : même lien, comparé
 * à tous les liens de chaque annonce (certain) ; même agence et même
 * référence (certain) ; même référence avec une agence différente ou
 * inconnue (probable, à trancher) ; même adresse ; même commune avec surface
 * et prix proches ; voisinage à 50 m. Pur : la distance vient du module geo,
 * passée en paramètre ; l'API lit les annonces et les liens.
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

/** Les clés de tous les liens d'une annonce, lien principal compris. */
export function rowLinkKeys(
  row: Pick<DuplicateRow, 'url' | 'links'>
): Set<string> {
  const keys = new Set(row.links ?? [])
  const main = linkKey(row.url)
  if (main) keys.add(main)
  return keys
}

/**
 * Le motif « référence » : même référence (clé sans espaces ni tirets) des
 * deux côtés, aucun particulier ; même agence (après normalisation) = la même
 * annonce, sinon probable. Null sans référence commune.
 */
export function referenceReason(
  probe: Pick<DuplicateProbe, 'reference' | 'sellerName' | 'sellerType'>,
  row: Pick<
    DuplicateRow,
    'sellerType' | 'sellerName' | 'sellerReference' | 'sellerReferenceKey'
  >
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

/**
 * Les motifs pour lesquels une annonce existante ressemble à la sonde, dans
 * l'ordre de force : même lien (1), même agence et même référence (1), même
 * référence autre agence (0,85), même adresse (0,9), même commune avec
 * surface à ±3 % et prix à ±5 % (0,8), à moins de 50 m avec surface à ±5 %
 * (0,7).
 */
export function duplicateReasons(
  probe: DuplicateProbe,
  row: DuplicateRow,
  distanceMeters: number | undefined
): DuplicateReason[] {
  const reasons: DuplicateReason[] = []

  const probeUrl = linkKey(probe.url)
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

  const probeAddress = addressKey(probe.address, probe.commune ?? row.commune)
  if (probeAddress && !communesDiffer) {
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
    reasons.push({
      kind: 'same_commune_price_surface',
      score: 0.8,
      detail: `${row.commune} : ${m2(row.surface)} contre ${m2(probe.surface ?? null)}, ${formatEuros(row.price)} contre ${formatEuros(probe.price ?? 0)}`,
    })
  }

  if (
    distanceMeters !== undefined &&
    distanceMeters <= DUPLICATE_TOLERANCES.nearbyMeters &&
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

/** Vrai si les motifs suffisent à dire que c'est la même annonce (même lien, ou même agence et même référence). */
export function isCertainMatch(
  reasons: readonly Pick<DuplicateReason, 'kind'>[]
): boolean {
  return reasons.some(r => CERTAIN_DUPLICATE_REASONS.includes(r.kind))
}

/** Les candidats, du plus vraisemblable au moins, un par annonce avec tous ses motifs ; les certains d'abord. */
export function matchDuplicates(
  probe: DuplicateProbe,
  rows: readonly DuplicateRow[],
  distances: ReadonlyMap<string, number> = new Map()
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = []
  for (const row of rows) {
    if (probe.listingId && row.id === probe.listingId) continue
    const reasons = duplicateReasons(probe, row, distances.get(row.id))
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

/** La première annonce au même lien, ou null. */
export function sameUrlMatchOf<T extends Pick<DuplicateCandidate, 'reasons'>>(
  candidates: readonly T[]
): T | null {
  return (
    candidates.find(c => c.reasons.some(r => r.kind === 'same_url')) ?? null
  )
}
