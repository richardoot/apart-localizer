import type {
  ActivityEntry,
  CriteriaFitHistoryItem,
  FieldProvenanceMap,
  FieldSource,
  Listing,
  ListingCheck,
  ListingLink,
  ListingSource,
  PriceEvent,
} from '@apart/contracts'
import { LISTING_PORTAL_LABELS } from '@apart/contracts'
import { activityActorName, orderLinks } from '@apart/domain'
import { formatDate, formatEuros } from './format'
import type { Tone } from './ui'

/**
 * Lot 19 (ADR 0029) : l'onglet « Historique » de la fiche, une seule
 * chronologie. Elle fusionne le journal de l'annonce, ses vérifications sur
 * les portails, l'historique des prix et celui de l'adéquation aux critères ;
 * les échanges avec l'annonceur sont les lignes du journal
 * (`agency_request.*`, `contact.*`). Chaque ligne a un type (Prix,
 * Vérification, Échange, Fiche) pour les filtres. Les doublons sont retirés :
 * le changement de prix du journal laisse la place à l'historique des prix,
 * la vérification du journal à la vérification détaillée, l'adéquation du
 * journal à son historique lisible, un lien ajouté à sa vérification « Lien
 * ajouté ». Du plus récent au plus ancien. Pur, testé. Lot 20 : les avis
 * (« Chloé a donné son avis : 3/5, 7 critères… ») ont leur type et leur
 * filtre « Avis » ; à l'aveugle, la phrase reçue ne dit pas les notes.
 */
export type TimelineKind =
  'price' | 'check' | 'talk' | 'opinion' | 'decision' | 'edit'
export type TimelineFilter = 'all' | TimelineKind

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  price: 'Prix',
  check: 'Vérification',
  talk: 'Échange',
  opinion: 'Avis',
  decision: 'Décision',
  edit: 'Fiche',
}

/** Les filtres, dans l'ordre de la maquette. */
export const TIMELINE_FILTERS: ReadonlyArray<{
  id: TimelineFilter
  label: string
}> = [
  { id: 'all', label: 'Tout' },
  { id: 'price', label: 'Prix' },
  { id: 'check', label: 'Vérifications' },
  { id: 'talk', label: 'Échanges' },
  { id: 'opinion', label: 'Avis' },
  { id: 'decision', label: 'Décisions' },
  { id: 'edit', label: 'Fiche' },
]

/** Le ton de la pastille de chaque type (`UiBadge`, jetons du thème). */
export const TIMELINE_KIND_TONES: Record<TimelineKind, Tone> = {
  price: 'warn',
  check: 'info',
  talk: 'ai',
  opinion: 'opinion',
  decision: 'accent',
  edit: 'neutral',
}

interface EntryBase {
  key: string
  /** Date ISO de l'évènement. */
  at: string
  kind: TimelineKind
  /** Ce qui s'est passé. */
  text: string
  /** Qui, ou d'où (« Richard », « Claude (MCP, pour Richard) », « lu sur l'annonce »). */
  who: string | null
}

export type TimelineEntry =
  | (EntryBase & { source: 'journal'; journal: ActivityEntry })
  | (EntryBase & { source: 'check'; check: ListingCheck })
  | (EntryBase & { source: 'price'; event: PriceEvent })
  | (EntryBase & { source: 'fit'; why: string })

export interface TimelineInput {
  journal: readonly ActivityEntry[]
  checks: readonly ListingCheck[]
  priceEvents: readonly PriceEvent[]
  fitHistory: readonly CriteriaFitHistoryItem[]
  /** Les noms des membres (auteur d'une vérification). */
  memberNames?: ReadonlyMap<string, { displayName: string }>
}

/** Les actions du journal remplacées par une source plus détaillée. */
const REPLACED_ACTIONS = new Set([
  'listing.price_changed',
  'listing.checked',
  'criteria.matched',
  'criteria.unmatched',
  'criteria.fit_changed',
])

/** Le type d'une ligne du journal (sorte du lot 6). */
export function journalKind(entry: Pick<ActivityEntry, 'kind'>): TimelineKind {
  switch (entry.kind) {
    case 'price':
    case 'offer':
      return 'price'
    case 'check':
    case 'link':
      return 'check'
    case 'agency':
      return 'talk'
    case 'opinion':
      return 'opinion'
    case 'decision':
    case 'status':
      // Lot 21 : les propositions et les changements de statut.
      return 'decision'
    default:
      return 'edit'
  }
}

/** « Richard », « Claude pour Richard » : qui a écrit une ligne du journal. */
export function journalWho(entry: ActivityEntry): string {
  if (entry.channel === 'mcp')
    return entry.actor ? `Claude pour ${entry.actor.displayName}` : 'Claude'
  return entry.actor?.displayName ?? entry.channelLabel
}

const PRICE_SOURCE_WHO: Record<FieldSource, string> = {
  listing: 'lu sur l’annonce',
  user: 'saisi par un membre',
  ai: 'lu par l’IA',
  open_data: 'données ouvertes',
  estimated: 'estimé',
  agency: 'donné par l’annonceur',
}

/** « Baisse de prix : 220 000 € → 214 000 € (−6 000 €) », « Premier prix : 220 000 € ». */
export function priceEventText(
  event: Pick<PriceEvent, 'oldPrice' | 'newPrice'>
): string {
  if (event.oldPrice === null) {
    return `Premier prix : ${formatEuros(event.newPrice)}`
  }
  const diff = event.newPrice - event.oldPrice
  const head =
    diff < 0 ? 'Baisse de prix' : diff > 0 ? 'Hausse de prix' : 'Prix confirmé'
  const delta =
    diff === 0 ? '' : ` (${diff > 0 ? '+' : '−'}${formatEuros(Math.abs(diff))})`
  return `${head} : ${formatEuros(event.oldPrice)} → ${formatEuros(event.newPrice)}${delta}`
}

/** Le texte d'une vérification : ses écarts, sinon son résumé. */
export function checkText(check: Pick<ListingCheck, 'changes' | 'summary'>) {
  return check.changes.length
    ? check.changes.map(c => c.text).join(' · ')
    : check.summary
}

/** Deux évènements à moins d'une minute l'un de l'autre. */
const close = (a: string, b: string): boolean =>
  Math.abs(Date.parse(a) - Date.parse(b)) <= 60_000

/**
 * La chronologie fusionnée, du plus récent au plus ancien. Le journal donne
 * la trame ; prix, vérifications et adéquation remplacent leurs lignes du
 * journal par une version plus parlante.
 */
export function listingTimeline(input: TimelineInput): TimelineEntry[] {
  const names = input.memberNames ?? new Map()
  const entries: TimelineEntry[] = []
  const linkChecks = input.checks.filter(c => c.outcome === 'link_added')

  for (const entry of input.journal) {
    if (REPLACED_ACTIONS.has(entry.action)) continue
    // Un lien ajouté : sa vérification « Lien ajouté » le dit déjà.
    if (
      entry.action === 'listing_link.added' &&
      linkChecks.some(c => close(c.checkedAt, entry.createdAt))
    ) {
      continue
    }
    entries.push({
      key: `journal:${entry.id}`,
      at: entry.createdAt,
      kind: journalKind(entry),
      text: `${journalWho(entry)} ${entry.summary}`,
      who: entry.channelLabel,
      source: 'journal',
      journal: entry,
    })
  }
  for (const check of input.checks) {
    const who = activityActorName(
      { channel: check.channel, actorMemberId: check.authorId },
      names
    )
    const portal = check.link
      ? ` · sur ${LISTING_PORTAL_LABELS[check.link.portal]}`
      : ''
    entries.push({
      key: `check:${check.id}`,
      at: check.checkedAt,
      kind: 'check',
      text: checkText(check),
      who: `${who}${portal}`,
      source: 'check',
      check,
    })
  }
  for (const event of input.priceEvents) {
    entries.push({
      key: `price:${event.id}`,
      at: event.occurredAt,
      kind: 'price',
      text: priceEventText(event),
      who: PRICE_SOURCE_WHO[event.source],
      source: 'price',
      event,
    })
  }
  input.fitHistory.forEach((item, index) => {
    // « Enregistrée » sans raison : la création du journal le dit déjà.
    if (!item.why && item.what === 'Enregistrée') return
    entries.push({
      key: `fit:${item.at}:${index}`,
      at: item.at,
      kind: 'edit',
      text: item.what,
      who: 'calcul automatique de l’adéquation',
      source: 'fit',
      why: item.why,
    })
  })

  const seen = new Set<string>()
  return entries
    .filter(e => {
      if (seen.has(e.key)) return false
      seen.add(e.key)
      return true
    })
    .map((e, index) => ({ e, index }))
    .sort(
      (a, b) => Date.parse(b.e.at) - Date.parse(a.e.at) || a.index - b.index
    )
    .map(({ e }) => e)
}

export function filterTimeline(
  entries: readonly TimelineEntry[],
  filter: TimelineFilter
): TimelineEntry[] {
  return filter === 'all'
    ? [...entries]
    : entries.filter(e => e.kind === filter)
}

/** Le nombre de lignes par filtre (« Prix (3) »). */
export function timelineCounts(
  entries: readonly TimelineEntry[]
): Record<TimelineFilter, number> {
  const counts: Record<TimelineFilter, number> = {
    all: entries.length,
    price: 0,
    check: 0,
    talk: 0,
    opinion: 0,
    decision: 0,
    edit: 0,
  }
  for (const e of entries) counts[e.kind] += 1
  return counts
}

/** « 6 nov. », « 28 oct. 2025 » : la date courte d'une ligne. */
export function timelineDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

const SOURCE_NAMES: Record<ListingSource, string | null> = {
  seloger: 'SeLoger',
  leboncoin: 'Leboncoin',
  pap: 'PAP',
  bienici: 'Bien’ici',
  agence: 'le site d’une agence',
  autre: null,
}

/** D'où vient l'annonce : son lien principal, sinon sa source. */
export function listingOrigin(
  listing: Pick<Listing, 'source' | 'sourceLabel'>,
  links: readonly Pick<
    ListingLink,
    'id' | 'portal' | 'online' | 'url' | 'createdAt' | 'primary'
  >[] = []
): string | null {
  const primary = links.find(l => l.primary) ?? orderLinks(links)[0]
  if (primary && primary.portal !== 'autre' && primary.portal !== 'agence') {
    return LISTING_PORTAL_LABELS[primary.portal]
  }
  if (listing.sourceLabel) return listing.sourceLabel
  return SOURCE_NAMES[listing.source]
}

/** Combien de champs l'IA a lus dans l'annonce. */
export function aiFieldCount(
  fieldSources: FieldProvenanceMap | null | undefined
): number {
  return Object.values(fieldSources ?? {}).filter(p => p.source === 'ai').length
}

/**
 * Le pied de l'Historique : « Ajoutée le 8 octobre 2026 depuis Leboncoin,
 * 14 champs lus par l'IA · modifiée le 6 novembre 2026 · l'export CSV et
 * JSON reste dans la liste. »
 */
export function historyFooter(
  listing: Pick<
    Listing,
    'createdAt' | 'updatedAt' | 'source' | 'sourceLabel' | 'fieldSources'
  >,
  links: Parameters<typeof listingOrigin>[1] = []
): string {
  const origin = listingOrigin(listing, links)
  const ai = aiFieldCount(listing.fieldSources)
  const added = `Ajoutée le ${formatDate(listing.createdAt)}${origin ? ` depuis ${origin}` : ''}`
  const read =
    ai > 0
      ? `, ${ai} champ${ai > 1 ? 's' : ''} lu${ai > 1 ? 's' : ''} par l’IA`
      : ''
  return `${added}${read} · modifiée le ${formatDate(listing.updatedAt)} · l’export CSV et JSON reste dans la liste.`
}
