import {
  ACTIVE_LISTING_STATUSES,
  DEFAULT_STALE_DAYS,
  LISTING_CHECK_EVIDENCE_MAX,
  LISTING_CHECK_TOLERANCES,
  LISTING_STATUS_LABELS,
} from '@apart/contracts'
import type {
  DpeClass,
  ListingCheckChange,
  ListingCheckField,
  ListingCheckOutcome,
  ListingObserved,
  ListingStatus,
} from '@apart/contracts'
import { formatEuros } from './format.js'

/**
 * Le suivi des mises à jour des annonces (lot 15, ADR 0025) : comparer ce
 * qui a été lu sur la page du portail avec la fiche, classer chaque écart
 * (fait appliqué, statut proposé, simple note), dire le résultat et le
 * résumer en français ; savoir quelles annonces sont à revérifier ; masquer
 * les coordonnées dans l'extrait-preuve ; orienter une republication. Pur :
 * aucune E/S, l'API écrit, le web et le MCP affichent.
 */

/** Ce que la comparaison lit de la fiche enregistrée. */
export interface CheckableListing {
  status: ListingStatus
  price: number
  annualCharges: number | null
  propertyTax: number | null
  surface: number | null
  rooms: number | null
  dpeClass: DpeClass | null
  gesClass: DpeClass | null
  dpeConsumption: number | null
  description: string | null
  publishedAt: string | null
  sourceUpdatedAt: string | null
  url: string | null
}

/** Les faits à écrire dans la fiche (seulement ceux qui changent). */
export interface ListingCheckPatch {
  price?: number
  annualCharges?: number
  propertyTax?: number
  surface?: number
  rooms?: number
  dpeClass?: DpeClass
  gesClass?: DpeClass
  dpeConsumption?: number
  description?: string
  /** ISO 8601. */
  publishedAt?: string
  /** ISO 8601. */
  sourceUpdatedAt?: string
  url?: string
}

export interface ListingCheckDiff {
  /** Les écarts, dans l'ordre des champs : appliqués, proposés, notés. */
  changes: ListingCheckChange[]
  /** Les faits appliqués, prix compris. */
  patch: ListingCheckPatch
  /** Le changement de prix, s'il y en a un (il passe par l'historique des prix). */
  price: { from: number; to: number } | null
  /** En ligne (vrai), plus en ligne (faux), non constaté (null). */
  online: boolean | null
  /** Statut proposé, jamais appliqué d'office. */
  suggestedStatus: ListingStatus | null
}

/** Libellés des champs dans les phrases d'une vérification. */
export const LISTING_CHECK_FIELD_LABELS: Record<ListingCheckField, string> = {
  price: 'Prix',
  annualCharges: 'Charges annuelles',
  propertyTax: 'Taxe foncière',
  surface: 'Surface Carrez',
  rooms: 'Pièces',
  dpeClass: 'DPE',
  gesClass: 'GES',
  dpeConsumption: 'Consommation énergétique',
  description: 'Description',
  publishedAt: 'Date de publication',
  sourceUpdatedAt: 'Mise à jour sur le portail',
  url: 'Lien de l’annonce',
  online: 'En ligne',
  status: 'Statut',
  // Lot 18.
  link: 'Lien de l’annonce',
  linkPrice: 'Prix sur le portail',
  priceGap: 'Écart entre portails',
  sellerType: 'Vendeur',
  sellerName: 'Agence ou réseau',
  sellerReference: 'Référence de l’annonce',
}

/** Statuts pour lesquels « plus en ligne » ne propose rien : l'annonce est déjà sortie du suivi. */
const CLOSED_STATUSES: readonly ListingStatus[] = [
  'sold_or_withdrawn',
  'discarded',
]

/** Le statut proposé pour une annonce qui n'est plus en ligne. */
export const OFFLINE_SUGGESTED_STATUS: ListingStatus = 'sold_or_withdrawn'

const DAY_MS = 86_400_000

/** Une date lue (AAAA-MM-JJ ou ISO 8601) en ISO 8601 ; null si illisible. */
export function normalizeCheckDate(value: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/** Le jour (AAAA-MM-JJ, UTC) d'une date ISO. */
function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

/** « 12 octobre 2026 ». */
export function formatCheckDay(iso: string): string {
  return new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Un lien comparable : espaces et barre finale retirés. */
function comparableUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

const EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/giu
/** Téléphones français : 06 12 34 56 78, 06.12.34.56.78, +33 6 12 34 56 78, 0033 6…, 0612345678. */
const PHONE = /(?:(?:\+|00)33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g

/**
 * L'extrait-preuve d'une vérification : espaces resserrés, adresses e-mail
 * et numéros de téléphone (de l'agent, du vendeur) masqués, tronqué à
 * `max` caractères (500). Vide : null.
 */
export function sanitizeEvidence(
  text: string | null | undefined,
  max = LISTING_CHECK_EVIDENCE_MAX
): string | null {
  if (text === null || text === undefined) return null
  const cleaned = flat(
    text.replace(EMAIL, '[e-mail masqué]').replace(PHONE, '[téléphone masqué]')
  )
  return cleaned ? truncate(cleaned, max) : null
}

type Value = string | number | boolean | null

function formatValue(field: ListingCheckField, value: Value): string {
  if (value === null) return '—'
  switch (field) {
    case 'price':
    case 'annualCharges':
    case 'propertyTax':
      return formatEuros(Number(value))
    case 'surface':
      return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m²`
    case 'dpeConsumption':
      return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh/m²/an`
    case 'publishedAt':
    case 'sourceUpdatedAt':
      return formatCheckDay(String(value))
    default:
      return String(value)
  }
}

/** « Prix 215 000 € → 205 000 € » ; « Taxe foncière : 820 € (nouveau) ». */
function transition(
  field: ListingCheckField,
  before: Value,
  after: Value
): string {
  const label = LISTING_CHECK_FIELD_LABELS[field]
  return before === null
    ? `${label} : ${formatValue(field, after)} (nouveau)`
    : `${label} ${formatValue(field, before)} → ${formatValue(field, after)}`
}

const AMOUNT_FIELDS = [
  'price',
  'annualCharges',
  'propertyTax',
  'surface',
  'dpeConsumption',
] as const

/**
 * Compare la page lue à la fiche. Seuls les champs fournis comptent (un
 * champ absent n'est pas un changement) ; montants et surface à la
 * tolérance d'arrondi près (`LISTING_CHECK_TOLERANCES`). Les faits sont
 * appliqués ; « plus en ligne » propose « Vendu ou retiré » ; une date de
 * publication plus récente que celle enregistrée (annonce « remontée ») est
 * notée, la première publication est gardée (elle compte dans la
 * négociation).
 */
export function listingCheckDiff(
  stored: CheckableListing,
  observed: ListingObserved,
  tolerances: Readonly<
    Record<(typeof AMOUNT_FIELDS)[number], number>
  > = LISTING_CHECK_TOLERANCES
): ListingCheckDiff {
  const changes: ListingCheckChange[] = []
  const patch: ListingCheckPatch = {}
  const push = (
    field: ListingCheckField,
    before: Value,
    after: Value,
    disposition: ListingCheckChange['disposition'],
    text: string
  ): void => {
    changes.push({
      field,
      label: LISTING_CHECK_FIELD_LABELS[field],
      before,
      after,
      disposition,
      text,
    })
  }

  for (const field of AMOUNT_FIELDS) {
    const next = observed[field]
    if (next === undefined) continue
    const current = stored[field]
    if (current !== null && Math.abs(next - current) < tolerances[field]) {
      continue
    }
    patch[field] = next
    push(field, current, next, 'applied', transition(field, current, next))
  }

  if (observed.rooms !== undefined && observed.rooms !== stored.rooms) {
    patch.rooms = observed.rooms
    push(
      'rooms',
      stored.rooms,
      observed.rooms,
      'applied',
      transition('rooms', stored.rooms, observed.rooms)
    )
  }
  for (const field of ['dpeClass', 'gesClass'] as const) {
    const next = observed[field]
    if (next === undefined || next === stored[field]) continue
    patch[field] = next
    push(
      field,
      stored[field],
      next,
      'applied',
      transition(field, stored[field], next)
    )
  }

  if (observed.description !== undefined) {
    const next = flat(observed.description)
    const current =
      stored.description === null ? null : flat(stored.description)
    if (next && next !== current) {
      patch.description = observed.description
      push(
        'description',
        current === null
          ? null
          : truncate(sanitizeEvidence(current) ?? '', 200),
        truncate(sanitizeEvidence(next) ?? '', 200),
        'applied',
        current === null ? 'Description ajoutée' : 'Description modifiée'
      )
    }
  }

  if (observed.publishedAt !== undefined) {
    const next = normalizeCheckDate(observed.publishedAt)
    const current = stored.publishedAt
    if (next !== null && (current === null || dayOf(next) !== dayOf(current))) {
      if (current !== null && dayOf(next) > dayOf(current)) {
        push(
          'publishedAt',
          dayOf(current),
          dayOf(next),
          'noted',
          `Date de publication affichée ${formatCheckDay(next)} : annonce remontée, première publication gardée (${formatCheckDay(current)})`
        )
      } else {
        patch.publishedAt = next
        push(
          'publishedAt',
          current === null ? null : dayOf(current),
          dayOf(next),
          'applied',
          transition('publishedAt', current, next)
        )
      }
    }
  }

  if (observed.sourceUpdatedAt !== undefined) {
    const next = normalizeCheckDate(observed.sourceUpdatedAt)
    const current = stored.sourceUpdatedAt
    if (next !== null && (current === null || dayOf(next) !== dayOf(current))) {
      patch.sourceUpdatedAt = next
      push(
        'sourceUpdatedAt',
        current === null ? null : dayOf(current),
        dayOf(next),
        'applied',
        transition('sourceUpdatedAt', current, next)
      )
    }
  }

  if (observed.url !== undefined) {
    const current = stored.url
    if (
      current === null ||
      comparableUrl(current) !== comparableUrl(observed.url)
    ) {
      patch.url = observed.url.trim()
      push(
        'url',
        current,
        observed.url.trim(),
        'applied',
        current === null
          ? 'Lien de l’annonce ajouté'
          : 'Lien de l’annonce modifié'
      )
    }
  }

  const online = observed.online ?? null
  let suggestedStatus: ListingStatus | null = null
  const statusLabel = LISTING_STATUS_LABELS[stored.status]
  if (online === false) {
    if (CLOSED_STATUSES.includes(stored.status)) {
      push(
        'online',
        true,
        false,
        'noted',
        `Plus en ligne (statut déjà « ${statusLabel} »)`
      )
    } else {
      suggestedStatus = OFFLINE_SUGGESTED_STATUS
      push(
        'status',
        stored.status,
        OFFLINE_SUGGESTED_STATUS,
        'proposed',
        `Plus en ligne : statut proposé « ${LISTING_STATUS_LABELS[OFFLINE_SUGGESTED_STATUS]} »`
      )
    }
  } else if (online === true && CLOSED_STATUSES.includes(stored.status)) {
    push(
      'online',
      false,
      true,
      'noted',
      `Toujours en ligne alors que l’annonce est « ${statusLabel} »`
    )
  }

  return {
    changes,
    patch,
    price:
      patch.price !== undefined
        ? { from: stored.price, to: patch.price }
        : null,
    online,
    suggestedStatus,
  }
}

/**
 * Les valeurs observées complétées par le résultat déclaré : une page
 * « plus en ligne » est hors ligne même si `online` n'est pas donné ; une
 * page lue (inchangée, mise à jour) est en ligne.
 */
export function effectiveObserved(
  observed: ListingObserved,
  declared?: ListingCheckOutcome
): ListingObserved {
  if (observed.online !== undefined) return observed
  if (declared === 'offline') return { ...observed, online: false }
  if (declared === 'unchanged' || declared === 'changed') {
    return { ...observed, online: true }
  }
  return observed
}

export type CheckOutcomeResolution =
  | {
      ok: true
      outcome: ListingCheckOutcome
      /** L'annonce a été vue en ligne (lastSeenOnlineAt avance). */
      seenOnline: boolean
      /** Les faits lus s'appliquent (faux pour une page inaccessible). */
      applyFacts: boolean
    }
  | { ok: false; problem: string }

/**
 * Le résultat d'une vérification : celui déclaré, s'il est cohérent avec ce
 * qui a été lu, sinon un refus lisible ; sans déclaration, déduit (plus en
 * ligne, republiée si une annonce est rattachée, mise à jour si un fait
 * change, inchangée sinon).
 */
export function resolveCheckOutcome(input: {
  declared?: ListingCheckOutcome | undefined
  observed: ListingObserved
  diff: ListingCheckDiff
  /** Une autre annonce de l'espace est rattachée comme republication. */
  linked: boolean
}): CheckOutcomeResolution {
  const { declared, observed, diff, linked } = input
  const facts = Object.entries(observed).filter(
    ([key, value]) => value !== undefined && key !== 'online' && key !== 'url'
  )
  const applied = diff.changes.filter(c => c.disposition === 'applied')
  const urlChanged = applied.some(c => c.field === 'url')
  const offline = observed.online === false
  const refuse = (problem: string): CheckOutcomeResolution => ({
    ok: false,
    problem,
  })
  const ok = (
    outcome: ListingCheckOutcome,
    seenOnline: boolean,
    applyFacts = true
  ): CheckOutcomeResolution => ({ ok: true, outcome, seenOnline, applyFacts })

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
      return ok('offline', false)
    case 'republished':
      if (!linked && !urlChanged) {
        return refuse(
          'Republiée : donnez republishedListingId (l’autre annonce de l’espace) ou observed.url (le nouveau lien de l’annonce).'
        )
      }
      return ok('republished', linked ? observed.online === true : !offline)
    case 'changed':
    case 'unchanged': {
      if (offline) {
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
      return ok(declared, true)
    }
    default:
      if (linked) return ok('republished', observed.online === true)
      if (offline) return ok('offline', false)
      return ok(applied.length > 0 ? 'changed' : 'unchanged', true)
  }
}

/** Le résumé d'une vérification en une phrase. */
export function listingCheckSummary(
  outcome: ListingCheckOutcome,
  changes: readonly Pick<ListingCheckChange, 'text'>[],
  linked: { title: string; role: 'predecessor' | 'successor' } | null = null
): string {
  const texts = changes.map(c => c.text)
  switch (outcome) {
    case 'inaccessible':
      return 'Non vérifiée : page inaccessible'
    case 'unchanged':
      return texts.length ? `Inchangée (${texts.join(' · ')})` : 'Inchangée'
    case 'changed':
      return texts.join(' · ') || 'Mise à jour'
    case 'offline':
      return texts.join(' · ') || 'Plus en ligne'
    case 'link_added':
      return texts.join(' · ') || 'Lien ajouté'
    case 'republished': {
      const head = linked
        ? linked.role === 'successor'
          ? `Republiée : reprise par « ${linked.title} »`
          : `Republication de « ${linked.title} »`
        : 'Republiée sous un autre lien'
      return [head, ...texts].join(' · ')
    }
  }
}

// ---------------------------------------------------------------------------
// Republication
// ---------------------------------------------------------------------------

/** Ce qui oriente une republication : la première publication constatée. */
export interface RepublicationCandidate {
  id: string
  title: string
  status: ListingStatus
  publishedAt: string | null
  createdAt: string
}

function firstSeen(listing: RepublicationCandidate): number {
  const published = listing.publishedAt ? Date.parse(listing.publishedAt) : NaN
  return Number.isFinite(published) ? published : Date.parse(listing.createdAt)
}

/**
 * La plus ancienne des deux (première publication constatée, à défaut
 * date d'ajout, puis identifiant) est la publication d'origine ; l'autre la
 * reprend.
 */
export function orderRepublication(
  a: RepublicationCandidate,
  b: RepublicationCandidate
): { predecessor: RepublicationCandidate; successor: RepublicationCandidate } {
  const order =
    firstSeen(a) - firstSeen(b) ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.id.localeCompare(b.id)
  return order <= 0
    ? { predecessor: a, successor: b }
    : { predecessor: b, successor: a }
}

/**
 * Pourquoi deux annonces ne peuvent pas être rattachées, ou null : une
 * annonce n'est pas sa propre republication ; chaque annonce reprend au
 * plus une annonce et n'est reprise que par une ; pas de boucle.
 */
export function republicationLinkProblem(input: {
  predecessor: Pick<RepublicationCandidate, 'id' | 'title'>
  successor: Pick<RepublicationCandidate, 'id' | 'title'>
  /** L'annonce que le successeur reprend déjà, s'il y en a une. */
  successorFromId: string | null
  /** L'annonce qui reprend déjà le prédécesseur, s'il y en a une. */
  predecessorToId: string | null
  /** Les annonces que le prédécesseur reprend, de proche en proche. */
  predecessorAncestors: readonly string[]
}): string | null {
  const { predecessor, successor } = input
  if (predecessor.id === successor.id) {
    return 'Une annonce ne peut pas être sa propre republication.'
  }
  if (
    input.successorFromId !== null &&
    input.successorFromId !== predecessor.id
  ) {
    return `« ${successor.title} » est déjà rattachée comme republication d’une autre annonce.`
  }
  if (
    input.predecessorToId !== null &&
    input.predecessorToId !== successor.id
  ) {
    return `« ${predecessor.title} » est déjà reprise par une autre annonce.`
  }
  if (input.predecessorAncestors.includes(successor.id)) {
    return `Rattacher « ${successor.title} » à « ${predecessor.title} » ferait une boucle de republications.`
  }
  return null
}

/**
 * Le statut proposé pour la publication d'origine quand une republication
 * est rattachée : « Vendu ou retiré » (l'ancienne annonce a été retirée),
 * sauf si elle est déjà sortie du suivi.
 */
export function republicationProposal(
  predecessor: Pick<RepublicationCandidate, 'title' | 'status'>,
  successor: Pick<RepublicationCandidate, 'title'>
): ListingCheckChange | null {
  if (CLOSED_STATUSES.includes(predecessor.status)) return null
  return {
    field: 'status',
    label: LISTING_CHECK_FIELD_LABELS.status,
    before: predecessor.status,
    after: OFFLINE_SUGGESTED_STATUS,
    disposition: 'proposed',
    text: `Statut proposé pour « ${predecessor.title} » : « ${LISTING_STATUS_LABELS[OFFLINE_SUGGESTED_STATUS]} » (republiée sous « ${successor.title} »)`,
  }
}

// ---------------------------------------------------------------------------
// À revérifier
// ---------------------------------------------------------------------------

/** Ce que la fraîcheur lit d'une annonce. */
export interface CheckFreshnessInput {
  status: ListingStatus
  lastCheckedAt: string | null
  createdAt: string
}

/** La date qui compte pour revérifier : la dernière vérification, à défaut l'ajout. */
export function checkReference(listing: CheckFreshnessInput): string {
  return listing.lastCheckedAt ?? listing.createdAt
}

/**
 * À revérifier : une annonce active dont la dernière vérification (à défaut,
 * l'ajout dans l'espace) remonte à plus de `days` jours (7 par défaut). Une
 * annonce écartée, vendue ou à l'offre refusée n'est jamais à revérifier.
 */
export function isStale(
  listing: CheckFreshnessInput,
  now: Date,
  days = DEFAULT_STALE_DAYS
): boolean {
  if (!ACTIVE_LISTING_STATUSES.includes(listing.status)) return false
  const reference = Date.parse(checkReference(listing))
  if (!Number.isFinite(reference)) return true
  return now.getTime() - reference > days * DAY_MS
}

export interface CheckFreshness {
  stale: boolean
  checked: boolean
  /** Jours révolus depuis la dernière vérification ; null si jamais vérifiée. */
  ageDays: number | null
  /** « Vérifiée il y a 3 j », « À revérifier », ou null (rien à dire). */
  label: string | null
  /** L'explication, pour une infobulle. */
  title: string
}

/** La mention discrète de la liste : « Vérifiée il y a 3 j » ou « À revérifier ». */
export function checkFreshness(
  listing: CheckFreshnessInput,
  now: Date,
  days = DEFAULT_STALE_DAYS,
  /** Le résultat de la dernière vérification : une page inaccessible n'est pas « vérifiée ». */
  lastOutcome: ListingCheckOutcome | null = null
): CheckFreshness {
  const stale = isStale(listing, now, days)
  const checked = listing.lastCheckedAt !== null
  const ageDays = checked
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - Date.parse(listing.lastCheckedAt as string)) / DAY_MS
        )
      )
    : null
  const blocked = lastOutcome === 'inaccessible'
  const title = checked
    ? blocked
      ? `Dernière tentative le ${formatCheckDay(listing.lastCheckedAt as string)} : page inaccessible, rien n’a été vérifié`
      : `Dernière vérification sur le portail le ${formatCheckDay(listing.lastCheckedAt as string)}`
    : `Jamais revérifiée depuis l’ajout le ${formatCheckDay(listing.createdAt)}`
  let label: string | null = null
  if (stale) label = 'À revérifier'
  else if (ageDays !== null) {
    const head = blocked ? 'Page inaccessible' : 'Vérifiée'
    label =
      ageDays === 0
        ? `${head} aujourd’hui`
        : ageDays === 1
          ? `${head} hier`
          : `${head} il y a ${ageDays} j`
  }
  return {
    stale,
    checked,
    ageDays,
    label,
    title: stale ? `${title} : à revérifier (plus de ${days} jours)` : title,
  }
}

// ---------------------------------------------------------------------------
// Extraction (texte de la page lu par le modèle côté serveur)
// ---------------------------------------------------------------------------

/** Ce qu'une fiche extraite donne à comparer. */
export interface ExtractedListingFacts {
  price: number
  annualCharges: number | null
  propertyTax: number | null
  surface: number | null
  rooms: number | null
  dpeClass: DpeClass | null
  gesClass: DpeClass | null
  dpeConsumption: number | null
  publishedAt: string | null
  sourceUpdatedAt: string | null
}

/**
 * Les valeurs observées d'une fiche extraite du texte de la page : seules
 * celles que le modèle a lues (non nulles ; un prix nul n'a pas été lu). La
 * description n'est pas comparée : le modèle la condense, elle différerait
 * toujours. Le lien non plus : c'est celui qu'on lui a donné.
 */
export function observedFromExtraction(
  facts: ExtractedListingFacts
): ListingObserved {
  const observed: ListingObserved = {}
  if (facts.price > 0) observed.price = facts.price
  if (facts.annualCharges !== null) observed.annualCharges = facts.annualCharges
  if (facts.propertyTax !== null) observed.propertyTax = facts.propertyTax
  if (facts.surface !== null) observed.surface = facts.surface
  if (facts.rooms !== null) observed.rooms = facts.rooms
  if (facts.dpeClass !== null) observed.dpeClass = facts.dpeClass
  if (facts.gesClass !== null) observed.gesClass = facts.gesClass
  if (facts.dpeConsumption !== null)
    observed.dpeConsumption = facts.dpeConsumption
  if (facts.publishedAt !== null) observed.publishedAt = facts.publishedAt
  if (facts.sourceUpdatedAt !== null)
    observed.sourceUpdatedAt = facts.sourceUpdatedAt
  return observed
}
