import {
  DUPLICATE_TOLERANCES,
  normalizeAddress,
  normalizeCommune,
  normalizeUrl,
  withinPercent,
} from '@apart/contracts'
import type {
  DuplicateCandidate,
  DuplicateProbe,
  DuplicateReason,
  ListingStatus,
} from '@apart/contracts'
import { formatEuros } from '@apart/domain'

/** Ce qu'une annonce enregistrée offre à la comparaison. */
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
 * Les motifs pour lesquels une annonce existante ressemble à la sonde, dans
 * l'ordre de force : même lien (1), même adresse (0,9), même commune avec
 * surface à ±3 % et prix à ±5 % (0,8), à moins de 50 m avec surface à ±5 %
 * (0,7). Pure : la distance vient du module geo, passée en paramètre.
 */
export function duplicateReasons(
  probe: DuplicateProbe,
  row: DuplicateRow,
  distanceMeters: number | undefined
): DuplicateReason[] {
  const reasons: DuplicateReason[] = []

  const probeUrl = normalizeUrl(probe.url)
  if (probeUrl && probeUrl === normalizeUrl(row.url)) {
    reasons.push({
      kind: 'same_url',
      score: 1,
      detail: `Même lien : ${probeUrl}`,
    })
  }

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

/** Les candidats, du plus vraisemblable au moins, un par annonce avec tous ses motifs. */
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
    })
  }
  return candidates.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title)
  )
}
