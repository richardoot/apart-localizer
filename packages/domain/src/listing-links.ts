import {
  LISTING_CHECK_TOLERANCES,
  LISTING_LINK_ORIGIN_LABELS,
  LISTING_PORTAL_LABELS,
  LISTING_PORTAL_SOURCE,
  LISTING_STATUS_LABELS,
} from '@apart/contracts'
import type {
  FieldSource,
  ListingCheckChange,
  ListingCheckField,
  ListingCheckOutcome,
  ListingLinkOrigin,
  ListingLinksAvailability,
  ListingObserved,
  ListingPortal,
  ListingSource,
  ListingStatus,
} from '@apart/contracts'
import { formatEuros } from './format.js'
import { OFFLINE_SUGGESTED_STATUS, listingCheckDiff } from './listing-checks.js'
import type {
  CheckOutcomeResolution,
  CheckableListing,
  ListingCheckDiff,
  ListingCheckPatch,
} from './listing-checks.js'
import { detectLinkPortal, linkKey } from './listing-urls.js'
import {
  cleanReference,
  cleanSellerName,
  sellerObservationDiff,
  shortDay,
} from './seller.js'
import type { SellerFacts } from './seller.js'

/**
 * Une annonce, plusieurs portails (lot 18, ADR 0028), sans E/S : le lien
 * principal, l'état de l'annonce d'après ses liens (en ligne, en partie,
 * plus en ligne), le prix de la fiche (le plus bas des liens en ligne dont
 * le prix est connu, jamais à la place d'un prix saisi à la main sans
 * proposition), l'écart entre portails (« +5 000 € : frais inclus ? »,
 * noté, jamais résolu d'office), et la vérification d'un lien (lot 15) : ce
 * qu'un lien lu change à ce lien et à la fiche. L'API écrit, le web et le
 * MCP affichent.
 */

/** Ce que les règles lisent d'un lien. */
export interface LinkState {
  id: string
  portal: ListingPortal
  url: string
  normalizedUrl: string
  externalId?: string | null
  price: number | null
  priceAt: string | null
  online: boolean
  offlineSince: string | null
  lastSeenOnlineAt: string | null
  lastCheckedAt: string | null
  createdAt: string
  origin: ListingLinkOrigin
  readSellerName?: string | null
  readReference?: string | null
}

type Ordered = Pick<LinkState, 'createdAt' | 'id'>

const byAge = (a: Ordered, b: Ordered): number =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)

/**
 * Le lien principal, recopié dans `Listing.url`, `source` et `externalId` :
 * le plus ancien des liens en ligne, à défaut le plus ancien ; null sans lien.
 */
export function primaryLink<T extends Ordered & Pick<LinkState, 'online'>>(
  links: readonly T[]
): T | null {
  const sorted = [...links].sort(byAge)
  return sorted.find(l => l.online) ?? sorted[0] ?? null
}

/** Les liens dans l'ordre de la fiche : le principal, puis du plus ancien au plus récent. */
export function orderLinks<T extends Ordered & Pick<LinkState, 'online'>>(
  links: readonly T[]
): T[] {
  const primary = primaryLink(links)
  return [...links].sort(
    (a, b) =>
      Number(b.id === primary?.id) - Number(a.id === primary?.id) || byAge(a, b)
  )
}

/** En ligne partout, en partie, plus en ligne, ou aucun lien. */
export function linksAvailability(
  links: readonly Pick<LinkState, 'online'>[]
): ListingLinksAvailability {
  if (links.length === 0) return 'none'
  const online = links.filter(l => l.online).length
  if (online === links.length) return 'online'
  return online === 0 ? 'offline' : 'partial'
}

/** « 3 liens · 2 en ligne », « 1 lien · en ligne », « Aucun lien ». */
export function linkCountText(
  links: readonly Pick<LinkState, 'online'>[]
): string {
  if (links.length === 0) return 'Aucun lien'
  const online = links.filter(l => l.online).length
  const head = `${links.length} lien${links.length > 1 ? 's' : ''}`
  if (links.length === 1)
    return `${head} · ${online ? 'en ligne' : 'plus en ligne'}`
  return `${head} · ${online} en ligne`
}

type Priced = Ordered & Pick<LinkState, 'online' | 'price' | 'portal'>

/** Le prix le plus bas des liens en ligne dont le prix est connu (le plus ancien à égalité). */
export function lowestOnlinePrice<T extends Priced>(
  links: readonly T[]
): { price: number; link: T } | null {
  let best: { price: number; link: T } | null = null
  for (const link of [...links].sort(byAge)) {
    if (!link.online || link.price === null) continue
    if (best === null || link.price < best.price) {
      best = { price: link.price, link }
    }
  }
  return best
}

/** Le prix le plus haut des liens en ligne dont le prix est connu. */
function highestOnlinePrice<T extends Priced>(
  links: readonly T[]
): { price: number; link: T } | null {
  let best: { price: number; link: T } | null = null
  for (const link of [...links].sort(byAge)) {
    if (!link.online || link.price === null) continue
    if (best === null || link.price > best.price) {
      best = { price: link.price, link }
    }
  }
  return best
}

/** L'écart entre portails : le plus haut et le plus bas en ligne, à partir d'un euro. */
export function priceSpread<T extends Priced>(
  links: readonly T[],
  tolerance: number = LISTING_CHECK_TOLERANCES.price
): {
  min: { price: number; link: T }
  max: { price: number; link: T }
  gap: number
} | null {
  const min = lowestOnlinePrice(links)
  const max = highestOnlinePrice(links)
  if (!min || !max) return null
  const gap = max.price - min.price
  return gap >= tolerance ? { min, max, gap } : null
}

/** L'écart d'un lien au prix le plus bas en ligne (null : pas d'écart, ou lien hors ligne, ou prix inconnu). */
export function linkPriceGap<T extends Priced>(
  link: T,
  links: readonly T[],
  tolerance: number = LISTING_CHECK_TOLERANCES.price
): number | null {
  if (!link.online || link.price === null) return null
  const min = lowestOnlinePrice(links)
  if (!min) return null
  const gap = link.price - min.price
  return gap >= tolerance ? gap : null
}

/** « +5 000 € : frais inclus ? » */
export function priceGapText(gap: number): string {
  return `+${formatEuros(gap)} : frais inclus ?`
}

/** « jusqu'à 219 000 € selon le portail » quand les portails n'affichent pas le même prix. */
export function priceRangeText(links: readonly Priced[]): string | null {
  const spread = priceSpread(links)
  return spread
    ? `jusqu’à ${formatEuros(spread.max.price)} selon le portail`
    : null
}

/**
 * Un prix lu comparé au prix de la fiche (« Liens rattachés d'office ») :
 * « 219 000 € : 5 000 € de plus », « 209 000 € : 5 000 € de moins »,
 * « même prix », « prix à relever ».
 */
export function comparedPriceText(
  price: number | null,
  fichePrice: number,
  tolerance: number = LISTING_CHECK_TOLERANCES.price
): string {
  if (price === null || !(price > 0)) return 'prix à relever'
  const gap = price - fichePrice
  if (Math.abs(gap) < tolerance) return 'même prix'
  return `${formatEuros(price)} : ${formatEuros(Math.abs(gap))} de ${gap > 0 ? 'plus' : 'moins'}`
}

/** « hier », « aujourd’hui », « le 4 nov. », « pas encore vue ». */
export function linkSeenText(
  link: Pick<LinkState, 'lastSeenOnlineAt' | 'offlineSince'>,
  now: Date
): string {
  const at = link.offlineSince ?? link.lastSeenOnlineAt
  if (!at) return 'pas encore vue'
  const day = (iso: string | Date) =>
    new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const today = day(now)
  const yesterday = day(new Date(now.getTime() - 86_400_000))
  const seen = day(at)
  if (seen === today) return 'aujourd’hui'
  if (seen === yesterday) return 'hier'
  return `le ${shortDay(at)}`
}

/** « Plus en ligne · le 4 nov. », « vue hier », « pas encore vue ». */
export function linkStateText(
  link: Pick<LinkState, 'online' | 'lastSeenOnlineAt' | 'offlineSince'>,
  now: Date
): string {
  const seen = linkSeenText(link, now)
  if (!link.online) return `Plus en ligne · ${seen}`
  return seen === 'pas encore vue' ? seen : `vue ${seen}`
}

/**
 * La ligne sous le portail : « lien d'origine · n° 0000000101 »,
 * « rattaché par Claude, même référence », « rattaché à la main ».
 */
export function linkSubLabel(
  link: Pick<LinkState, 'origin'> & {
    externalId?: string | null
    readReference?: string | null
  },
  options: { autoAttached?: boolean } = {}
): string {
  const head = options.autoAttached
    ? 'rattaché par Claude, même référence'
    : LISTING_LINK_ORIGIN_LABELS[link.origin]
  return link.externalId ? `${head} · n° ${link.externalId}` : head
}

/** Le portail d'une annonce enregistrée, d'après sa source (et le lien). */
export function portalOfListingSource(
  source: ListingSource,
  sourceLabel: string | null,
  url: string | null
): ListingPortal {
  const fromSource: ListingPortal =
    source === 'autre' && sourceLabel?.trim().toLowerCase() === 'logic-immo'
      ? 'logicimmo'
      : source
  return detectLinkPortal(url, fromSource)
}

const PORTAL_SOURCE_LABELS = new Set(
  Object.values(LISTING_PORTAL_SOURCE)
    .map(s => s.sourceLabel)
    .filter((l): l is string => l !== null)
)

/**
 * Les colonnes du lien principal recopiées dans l'annonce : `url`, `source`,
 * `externalId` et, pour Logic-Immo, le libellé de la source ; un libellé
 * saisi (« Agence X ») n'est jamais écrasé. Sans lien : rien ne change.
 */
export function primarySourceFields(
  primary: Pick<LinkState, 'portal' | 'url'> & {
    externalId?: string | null
  },
  current: { sourceLabel: string | null }
): {
  url: string
  source: ListingSource
  sourceLabel: string | null
  externalId: string | null
} {
  const mapped = LISTING_PORTAL_SOURCE[primary.portal]
  const ownLabel =
    current.sourceLabel !== null &&
    !PORTAL_SOURCE_LABELS.has(current.sourceLabel)
  return {
    url: primary.url,
    source: mapped.source,
    sourceLabel: ownLabel ? current.sourceLabel : mapped.sourceLabel,
    externalId: primary.externalId ?? null,
  }
}

// ---------------------------------------------------------------------------
// Le prix de la fiche
// ---------------------------------------------------------------------------

export type FichePriceDecision =
  | { kind: 'none' }
  | {
      kind: 'apply' | 'propose'
      from: number
      to: number
      portal: ListingPortal | null
      linkId: string | null
    }

/**
 * Le prix de la fiche après un changement de ses liens : le plus bas des
 * liens en ligne dont le prix est connu. Il s'applique comme un changement
 * de prix ordinaire, sauf si le prix de la fiche a été saisi à la main
 * (provenance « user ») et ne suivait pas déjà les liens (il différait du
 * plus bas en ligne, ou aucun lien n'avait de prix) : il est alors proposé,
 * jamais écrasé. Sans lien en ligne au prix connu, rien ne change.
 */
export function fichePriceDecision(input: {
  fichePrice: number
  priceSource: FieldSource | null
  before: readonly Priced[]
  after: readonly Priced[]
  tolerance?: number
}): FichePriceDecision {
  const tolerance = input.tolerance ?? LISTING_CHECK_TOLERANCES.price
  const lowest = lowestOnlinePrice(input.after)
  if (!lowest) return { kind: 'none' }
  if (Math.abs(lowest.price - input.fichePrice) < tolerance) {
    return { kind: 'none' }
  }
  const previous = lowestOnlinePrice(input.before)
  const followedLinks =
    previous !== null && Math.abs(previous.price - input.fichePrice) < tolerance
  const pinned = input.priceSource === 'user' && !followedLinks
  return {
    kind: pinned ? 'propose' : 'apply',
    from: input.fichePrice,
    to: lowest.price,
    portal: lowest.link.portal,
    linkId: lowest.link.id,
  }
}

/**
 * La proposition visible sur la fiche quand son prix n'est pas le plus bas
 * en ligne (prix saisi à la main, ou liens changés depuis) : « Le plus bas
 * affiché en ligne est 209 000 € (SeLoger) ». Null s'il n'y a rien à dire.
 */
export function fichePriceProposal(input: {
  fichePrice: number
  priceSource: FieldSource | null
  links: readonly Priced[]
  tolerance?: number
}): {
  from: number
  to: number
  portal: ListingPortal
  text: string
} | null {
  const tolerance = input.tolerance ?? LISTING_CHECK_TOLERANCES.price
  const lowest = lowestOnlinePrice(input.links)
  if (!lowest || Math.abs(lowest.price - input.fichePrice) < tolerance) {
    return null
  }
  const label = LISTING_PORTAL_LABELS[lowest.link.portal]
  const manual = input.priceSource === 'user'
  return {
    from: input.fichePrice,
    to: lowest.price,
    portal: lowest.link.portal,
    text: manual
      ? `Prix de la fiche saisi à la main : ${formatEuros(input.fichePrice)}. Le plus bas affiché en ligne est ${formatEuros(lowest.price)} (${label}).`
      : `Le plus bas affiché en ligne est ${formatEuros(lowest.price)} (${label}), la fiche dit ${formatEuros(input.fichePrice)}.`,
  }
}

// ---------------------------------------------------------------------------
// La vérification d'un lien (lot 15 étendu)
// ---------------------------------------------------------------------------

/** Ce qu'une vérification écrit dans un lien. */
export interface LinkPatch {
  price?: number
  priceAt?: string
  online?: boolean
  offlineSince?: string | null
  lastSeenOnlineAt?: string
  url?: string
  normalizedUrl?: string
  readSellerName?: string
  readReference?: string
}

export interface LinkCheckInput {
  /** La fiche (prix de la fiche, lien principal). */
  stored: CheckableListing
  /** La provenance du prix de la fiche (`fieldSources.price.source`). */
  priceSource: FieldSource | null
  seller: SellerFacts
  links: readonly LinkState[]
  /** Le lien vérifié ; null pour une annonce sans lien (règles du lot 15). */
  linkId: string | null
  observed: ListingObserved
  /** ISO 8601. */
  now: string
  tolerances?: typeof LISTING_CHECK_TOLERANCES
}

export interface LinkCheckDiff extends ListingCheckDiff {
  link: LinkState | null
  linkPatch: LinkPatch
  linksAfter: LinkState[]
  fichePrice: FichePriceDecision
  sellerPatch: Partial<SellerFacts>
  /** Plus aucun lien en ligne après la vérification (ou, sans lien, page disparue). */
  allOffline: boolean
}

const CLOSED_STATUSES: readonly ListingStatus[] = [
  'sold_or_withdrawn',
  'discarded',
]

const FIELD_LABELS: Partial<Record<ListingCheckField, string>> = {
  price: 'Prix',
  linkPrice: 'Prix sur le portail',
  online: 'En ligne',
  status: 'Statut',
  url: 'Lien de l’annonce',
  priceGap: 'Écart entre portails',
  link: 'Lien de l’annonce',
}

function change(
  field: ListingCheckField,
  before: string | number | boolean | null,
  after: string | number | boolean | null,
  disposition: ListingCheckChange['disposition'],
  text: string
): ListingCheckChange {
  return {
    field,
    label: FIELD_LABELS[field] ?? field,
    before,
    after,
    disposition,
    text,
  }
}

function join(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

function withPatch(link: LinkState, patch: LinkPatch): LinkState {
  return {
    ...link,
    ...(patch.price !== undefined ? { price: patch.price } : {}),
    ...(patch.priceAt !== undefined ? { priceAt: patch.priceAt } : {}),
    ...(patch.online !== undefined ? { online: patch.online } : {}),
    ...(patch.offlineSince !== undefined
      ? { offlineSince: patch.offlineSince }
      : {}),
    ...(patch.lastSeenOnlineAt !== undefined
      ? { lastSeenOnlineAt: patch.lastSeenOnlineAt }
      : {}),
    ...(patch.url !== undefined ? { url: patch.url } : {}),
    ...(patch.normalizedUrl !== undefined
      ? { normalizedUrl: patch.normalizedUrl }
      : {}),
    ...(patch.readSellerName !== undefined
      ? { readSellerName: patch.readSellerName }
      : {}),
    ...(patch.readReference !== undefined
      ? { readReference: patch.readReference }
      : {}),
  }
}

/** La note d'écart entre portails, quand l'écart apparaît, change ou disparaît. */
function spreadChange(
  before: readonly LinkState[],
  after: readonly LinkState[],
  tolerance: number
): ListingCheckChange | null {
  const previous = priceSpread(before, tolerance)
  const next = priceSpread(after, tolerance)
  if (next) {
    const same =
      previous !== null &&
      previous.max.link.id === next.max.link.id &&
      Math.abs(previous.gap - next.gap) < tolerance
    if (same) return null
    const max = LISTING_PORTAL_LABELS[next.max.link.portal]
    const min = LISTING_PORTAL_LABELS[next.min.link.portal]
    return change(
      'priceGap',
      previous?.gap ?? null,
      next.gap,
      'noted',
      `Écart entre portails : ${max} affiche ${formatEuros(next.max.price)}, +${formatEuros(next.gap)} par rapport à ${min} (${formatEuros(next.min.price)}) : frais inclus ?`
    )
  }
  if (previous) {
    const lowest = lowestOnlinePrice(after)
    return change(
      'priceGap',
      previous.gap,
      null,
      'noted',
      lowest
        ? `Prix alignés sur les portails (${formatEuros(lowest.price)})`
        : 'Plus d’écart entre portails en ligne'
    )
  }
  return null
}

/**
 * Compare un lien lu à la fiche. Les faits du bien (charges, taxe, surface,
 * pièces, DPE, dates, description) suivent les règles du lot 15. Le prix lu
 * est celui du lien ; le prix de la fiche devient le plus bas des liens en
 * ligne (appliqué, ou proposé si le prix a été saisi à la main :
 * `fichePriceDecision`). Un lien « plus en ligne » ne propose « Vendu ou
 * retiré » que si plus aucun lien n'est en ligne. Un écart entre portails
 * est noté, jamais résolu. Le vendeur lu est appliqué s'il était inconnu,
 * proposé s'il contredit. Sans lien, ce sont les règles du lot 15.
 */
export function linkCheckDiff(input: LinkCheckInput): LinkCheckDiff {
  const tolerances = input.tolerances ?? LISTING_CHECK_TOLERANCES
  const { stored, links, now } = input
  const {
    sellerType: observedSellerType,
    sellerName,
    reference,
    ...listingObserved
  } = input.observed
  const seller = sellerObservationDiff(input.seller, {
    sellerType: observedSellerType,
    sellerName,
    reference,
  })
  const link = input.linkId
    ? (links.find(l => l.id === input.linkId) ?? null)
    : null

  if (!link) {
    const base = listingCheckDiff(stored, listingObserved, tolerances)
    return {
      ...base,
      changes: [...base.changes, ...seller.changes],
      link: null,
      linkPatch: {},
      linksAfter: [...links],
      fichePrice: base.price
        ? {
            kind: 'apply',
            from: base.price.from,
            to: base.price.to,
            portal: null,
            linkId: null,
          }
        : { kind: 'none' },
      sellerPatch: seller.patch,
      allOffline: base.online === false,
    }
  }

  const { price, online, url, ...facts } = listingObserved
  const base = listingCheckDiff({ ...stored, url: link.url }, facts, tolerances)
  const portal = LISTING_PORTAL_LABELS[link.portal]
  const linkPatch: LinkPatch = {}
  const linkChanges: ListingCheckChange[] = []

  if (price !== undefined) {
    if (
      link.price === null ||
      Math.abs(price - link.price) >= tolerances.price
    ) {
      linkPatch.price = price
      linkChanges.push(
        change(
          'linkPrice',
          link.price,
          price,
          'applied',
          link.price === null
            ? `Prix sur ${portal} : ${formatEuros(price)}`
            : `Prix sur ${portal} ${formatEuros(link.price)} → ${formatEuros(price)}`
        )
      )
    }
    linkPatch.priceAt = now
  }

  if (url !== undefined) {
    const key = linkKey(url)
    if (key !== null && key !== link.normalizedUrl) {
      linkPatch.url = url.trim()
      linkPatch.normalizedUrl = key
      linkChanges.push(
        change(
          'url',
          link.url,
          url.trim(),
          'applied',
          links.length > 1
            ? `Lien ${portal} modifié`
            : 'Lien de l’annonce modifié'
        )
      )
    }
  }

  const stateChanges: ListingCheckChange[] = []
  if (online === true) {
    linkPatch.lastSeenOnlineAt = now
    if (!link.online) {
      linkPatch.online = true
      linkPatch.offlineSince = null
      stateChanges.push(
        change(
          'online',
          false,
          true,
          'applied',
          `De nouveau en ligne sur ${portal}`
        )
      )
    }
  } else if (online === false && link.online) {
    linkPatch.online = false
    linkPatch.offlineSince = now
  }
  const readName = cleanSellerName(sellerName)
  if (readName) linkPatch.readSellerName = readName
  const readReference = cleanReference(reference)
  if (readReference) linkPatch.readReference = readReference

  const linkAfter = withPatch(link, linkPatch)
  const linksAfter = links.map(l => (l.id === link.id ? linkAfter : l))
  const allOffline = linksAfter.every(l => !l.online)
  const closed = CLOSED_STATUSES.includes(stored.status)
  const statusLabel = LISTING_STATUS_LABELS[stored.status]
  let suggestedStatus: ListingStatus | null = null

  if (online === false) {
    const several = links.length > 1
    if (several && link.online) {
      const stillOnline = linksAfter
        .filter(l => l.online)
        .map(l => LISTING_PORTAL_LABELS[l.portal])
      stateChanges.push(
        change(
          'online',
          true,
          false,
          'applied',
          stillOnline.length
            ? `Plus en ligne sur ${portal} (toujours en ligne sur ${join([...new Set(stillOnline)])})`
            : `Plus en ligne sur ${portal}`
        )
      )
    }
    if (allOffline) {
      if (closed) {
        stateChanges.push(
          change(
            'online',
            true,
            false,
            'noted',
            `Plus en ligne (statut déjà « ${statusLabel} »)`
          )
        )
      } else {
        suggestedStatus = OFFLINE_SUGGESTED_STATUS
        stateChanges.push(
          change(
            'status',
            stored.status,
            OFFLINE_SUGGESTED_STATUS,
            'proposed',
            several
              ? `Plus en ligne sur aucun portail : statut proposé « ${LISTING_STATUS_LABELS[OFFLINE_SUGGESTED_STATUS]} »`
              : `Plus en ligne : statut proposé « ${LISTING_STATUS_LABELS[OFFLINE_SUGGESTED_STATUS]} »`
          )
        )
      }
    }
  } else if (online === true && closed) {
    stateChanges.push(
      change(
        'online',
        false,
        true,
        'noted',
        `Toujours en ligne alors que l’annonce est « ${statusLabel} »`
      )
    )
  }

  const fichePrice = fichePriceDecision({
    fichePrice: stored.price,
    priceSource: input.priceSource,
    before: links,
    after: linksAfter,
    tolerance: tolerances.price,
  })
  const patch: ListingCheckPatch = { ...base.patch }
  const priceChanges: ListingCheckChange[] = []
  let shownLinkChanges = linkChanges
  if (fichePrice.kind === 'apply') {
    patch.price = fichePrice.to
    const fromThisLink = fichePrice.linkId === link.id
    // Le prix lu sur ce lien devient celui de la fiche : une seule ligne.
    if (fromThisLink) {
      shownLinkChanges = linkChanges.filter(c => c.field !== 'linkPrice')
    }
    const where =
      fromThisLink || fichePrice.portal === null
        ? ''
        : ` (plus bas en ligne : ${LISTING_PORTAL_LABELS[fichePrice.portal]})`
    priceChanges.push(
      change(
        'price',
        fichePrice.from,
        fichePrice.to,
        'applied',
        `Prix ${formatEuros(fichePrice.from)} → ${formatEuros(fichePrice.to)}${where}`
      )
    )
  } else if (fichePrice.kind === 'propose') {
    priceChanges.push(
      change(
        'price',
        fichePrice.from,
        fichePrice.to,
        'proposed',
        `Prix le plus bas en ligne ${formatEuros(fichePrice.to)}${fichePrice.portal ? ` (${LISTING_PORTAL_LABELS[fichePrice.portal]})` : ''} : prix de la fiche saisi à la main (${formatEuros(fichePrice.from)}) gardé, à appliquer si tu le souhaites`
      )
    )
  }
  const gap = spreadChange(links, linksAfter, tolerances.price)

  return {
    changes: [
      ...priceChanges,
      ...shownLinkChanges,
      ...base.changes,
      ...stateChanges,
      ...(gap ? [gap] : []),
      ...seller.changes,
    ],
    patch,
    price:
      patch.price !== undefined
        ? { from: stored.price, to: patch.price }
        : null,
    online: online ?? null,
    suggestedStatus,
    link,
    linkPatch,
    linksAfter,
    fichePrice,
    sellerPatch: seller.patch,
    allOffline,
  }
}

/**
 * Le résultat d'une vérification de lien (lot 15 étendu) : celui déclaré,
 * s'il colle à ce qui a été lu, sinon un refus lisible. Avec plusieurs
 * liens, « plus en ligne » ne vaut pour l'annonce que si plus aucun lien
 * n'est en ligne ; sinon le lien hors ligne est une mise à jour de la fiche.
 */
export function resolveLinkCheckOutcome(input: {
  declared?: ListingCheckOutcome | undefined
  observed: ListingObserved
  diff: Pick<LinkCheckDiff, 'changes' | 'link' | 'allOffline'>
  linked: boolean
}): CheckOutcomeResolution {
  const { declared, observed, diff, linked } = input
  const facts = Object.entries(observed).filter(
    ([key, value]) => value !== undefined && key !== 'online' && key !== 'url'
  )
  const applied = diff.changes.filter(c => c.disposition === 'applied')
  const urlChanged = applied.some(c => c.field === 'url')
  const offline = observed.online === false
  const listingOffline = offline && (diff.link === null || diff.allOffline)
  const refuse = (problem: string): CheckOutcomeResolution => ({
    ok: false,
    problem,
  })
  const ok = (
    outcome: ListingCheckOutcome,
    seenOnline: boolean,
    applyFacts = true
  ): CheckOutcomeResolution => ({ ok: true, outcome, seenOnline, applyFacts })
  const partial = (): CheckOutcomeResolution =>
    ok(applied.length > 0 ? 'changed' : 'unchanged', false)

  switch (declared) {
    case 'inaccessible':
      if (facts.length > 0 || observed.online !== undefined || linked) {
        return refuse(
          'Une page inaccessible n’a rien à appliquer : retirez les valeurs observées (observed) et republishedListingId, ou choisissez un autre résultat.'
        )
      }
      return ok('inaccessible', false, false)
    case 'offline':
      if (observed.online === true) {
        return refuse(
          'La page est notée en ligne (observed.online vrai) : le résultat ne peut pas être « offline ».'
        )
      }
      return listingOffline || !offline ? ok('offline', false) : partial()
    case 'republished':
      if (!linked && !urlChanged) {
        return refuse(
          'Republiée : donnez republishedListingId (l’autre annonce de l’espace) ou observed.url (le nouveau lien de l’annonce).'
        )
      }
      return ok('republished', linked ? observed.online === true : !offline)
    case 'changed':
    case 'unchanged': {
      if (listingOffline) {
        return refuse(
          'La page n’est plus en ligne (observed.online faux) : le résultat est « offline ».'
        )
      }
      if (linked) {
        return refuse(
          'Avec republishedListingId, le résultat est « republished ».'
        )
      }
      if (declared === 'changed' && applied.length === 0) {
        return refuse(
          'Aucune valeur observée ne diffère de la fiche : le résultat est « unchanged ».'
        )
      }
      if (declared === 'unchanged' && applied.length > 0) {
        return refuse(
          `Des valeurs diffèrent de la fiche (${applied.map(c => c.text).join(' ; ')}) : le résultat est « changed » (ou laissez outcome vide).`
        )
      }
      return ok(declared, !offline)
    }
    case 'link_added':
      return refuse(
        '« link_added » ne se déclare pas : il vient de l’ajout d’un lien (add_listing_link).'
      )
    default:
      if (linked) return ok('republished', observed.online === true)
      if (listingOffline) return ok('offline', false)
      if (offline) return partial()
      return ok(applied.length > 0 ? 'changed' : 'unchanged', true)
  }
}

/** La ligne « Lien SeLoger ajouté : 219 000 € » d'une vérification née d'un ajout de lien. */
export function linkAddedChange(link: {
  portal: ListingPortal
  url: string
  price: number | null
  online: boolean
}): ListingCheckChange {
  const portal = LISTING_PORTAL_LABELS[link.portal]
  const what = link.online
    ? link.price !== null
      ? ` : ${formatEuros(link.price)}`
      : ' (prix à relever)'
    : ' (plus en ligne)'
  return change(
    'link',
    null,
    link.url,
    'applied',
    `Lien ${portal} ajouté${what}`
  )
}

/**
 * Le plan d'un ajout de lien avec ce qui a été lu sur sa page : la
 * vérification du nouveau lien (prix de la fiche, écart, vendeur), en tête
 * la ligne « Lien … ajouté ». Le prix lu est celui du lien.
 */
export function linkAddedDiff(
  input: Omit<LinkCheckInput, 'linkId'> & { link: LinkState }
): LinkCheckDiff {
  const initial: LinkState = { ...input.link, price: null }
  const diff = linkCheckDiff({
    ...input,
    links: [...input.links.filter(l => l.id !== input.link.id), initial],
    linkId: initial.id,
  })
  const added = diff.linksAfter.find(l => l.id === initial.id) ?? initial
  return {
    ...diff,
    changes: [
      linkAddedChange(added),
      ...diff.changes.filter(
        c =>
          !(
            c.field === 'linkPrice' ||
            (c.field === 'online' && c.disposition === 'applied')
          )
      ),
    ],
  }
}
