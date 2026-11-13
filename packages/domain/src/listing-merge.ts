import {
  LISTING_FIELD_LABELS,
  LISTING_LINKS_MAX,
  LISTING_SELLERS_MAX,
  MERGED_LISTING_RETENTION_DAYS,
} from '@apart/contracts'
import type {
  FieldProvenanceMap,
  ListingMergeCounts,
  ListingMergeField,
  ListingStatus,
  LocationPrecision,
} from '@apart/contracts'
import { formatActivityValue } from './activity.js'
import { formatEuros } from './format.js'
import { TARGET_RENT_KEY, targetRentIsEstimated } from './rent-observatory.js'
import {
  isEmptySeller,
  knownSellers,
  normalizeSeller,
  otherSellerText,
  sameSeller,
} from './seller.js'
import type { NormalizedSeller, SellerFacts } from './seller.js'

/**
 * Lot 27 (ADR 0037) : fusionner deux fiches du même bien. Une fiche est
 * gardée, l'autre absorbée : ses liens, ses agences et leurs références, ses
 * visites, offres, avis, tâches et questions aux agences rejoignent la fiche
 * gardée ; ses champs complètent ceux qui étaient vides (jamais un champ déjà
 * rempli : la fiche gardée l'emporte) ; ses notes sont recopiées à la suite.
 * La fiche absorbée est écartée comme doublon, cachée des listes, et la
 * fusion s'annule pendant sept jours, puis la fiche est supprimée (lot 30).
 * Ici les règles pures ; l'API écrit.
 */

/**
 * Les champs du bien qu'une fusion complète quand la fiche gardée ne les
 * connaît pas. Ni le prix (il suit les liens, lot 18), ni l'adresse et le
 * repère (ils se corrigent sur la fiche, avec le géocodage), ni le statut.
 */
export const MERGE_FILL_FIELDS = [
  'description',
  'publishedAt',
  'feesAmount',
  'feesPercent',
  'feesPayer',
  'surface',
  'surfaceTotal',
  'rooms',
  'bedrooms',
  'floor',
  'floorsTotal',
  'floorLabel',
  'elevator',
  'constructionYear',
  'constructionPeriod',
  'dpeClass',
  'dpeConsumption',
  'gesClass',
  'dpeDate',
  'dpeNumber',
  'heatingType',
  'heatingCollective',
  'outdoor',
  'parking',
  'cellar',
  'orientation',
  'condition',
  'annualCharges',
  'nonRecoverableChargesMonthly',
  'lotsCount',
  'proceedings',
  'votedWorks',
  'syndic',
  'propertyTax',
  'furnitureValue',
] as const
export type MergeFillField = (typeof MERGE_FILL_FIELDS)[number]

/** Les valeurs de ces champs pour une fiche (clé absente ou null = vide). */
export type MergeFieldValues = Partial<Record<MergeFillField, unknown>>

/** Ce que la fusion lit d'une des deux fiches. */
export interface MergeListingFacts {
  id: string
  title: string
  status: ListingStatus
  createdAt: string
  /** La fiche qui a déjà absorbé celle-ci ; null sinon. */
  mergedIntoId: string | null
  locationPrecision: LocationPrecision | null
  counts: {
    links: number
    visits: number
    offers: number
    opinions: number
    tasks: number
  }
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function label(field: string): string {
  return LISTING_FIELD_LABELS[field] ?? field
}

/** Pourquoi ces deux fiches ne peuvent pas être fusionnées ; null si elles le peuvent. */
export function mergeRefusal(
  keep: Pick<MergeListingFacts, 'id' | 'title' | 'mergedIntoId' | 'counts'>,
  absorb: Pick<MergeListingFacts, 'id' | 'title' | 'mergedIntoId' | 'counts'>
): string | null {
  if (keep.id === absorb.id) {
    return 'Une fiche ne se fusionne pas avec elle-même.'
  }
  if (keep.mergedIntoId) {
    return `« ${keep.title} » a déjà été fusionnée dans une autre fiche : garde plutôt cette autre fiche, ou annule d’abord cette fusion.`
  }
  if (absorb.mergedIntoId) {
    return `« ${absorb.title} » a déjà été fusionnée dans une autre fiche.`
  }
  const links = keep.counts.links + absorb.counts.links
  if (links > LISTING_LINKS_MAX) {
    return `Les deux fiches ont ${links} liens à elles deux : une annonce en a au plus ${LISTING_LINKS_MAX}. Retire des liens avant de fusionner.`
  }
  return null
}

/**
 * Champ par champ : ceux que la fiche gardée ne connaît pas et que l'autre
 * complète (`fills`), ceux qui diffèrent (`differences` : la fiche gardée
 * l'emporte, l'autre valeur reste lisible sur la fiche absorbée).
 */
export function mergeFieldPlan(
  keep: MergeFieldValues,
  absorb: MergeFieldValues
): {
  fills: ListingMergeField[]
  differences: ListingMergeField[]
  values: MergeFieldValues
} {
  const fills: ListingMergeField[] = []
  const differences: ListingMergeField[] = []
  const values: MergeFieldValues = {}
  for (const field of MERGE_FILL_FIELDS) {
    const kept = keep[field]
    const other = absorb[field]
    if (isEmpty(other)) continue
    const line = {
      field,
      label: label(field),
      kept: formatActivityValue(field, kept),
      other: formatActivityValue(field, other),
    }
    if (isEmpty(kept)) {
      fills.push(line)
      values[field] = other
    } else if (
      JSON.stringify(kept) !== JSON.stringify(other) &&
      line.kept !== line.other
    ) {
      differences.push(line)
    }
  }
  return { fills, differences, values }
}

/** Ce qu'une fusion lit du loyer visé d'une fiche (ADR 0046). */
export interface MergeRentSide {
  rentalPlan: { targetRent: number | null } | null
  fieldSources: FieldProvenanceMap
}

/**
 * ADR 0046 : un loyer visé donné sur la fiche absorbée (par un membre, par
 * Claude, lu dans l'annonce) remplace le loyer vide ou estimé de la fiche
 * gardée ; un loyer estimé de l'absorbée n'apporte rien. Sans phase 2 sur la
 * fiche gardée, c'est la phase 2 entière qui passe : null ici.
 */
export function mergeTargetRentFill(
  keep: MergeRentSide,
  absorb: MergeRentSide
): { targetRent: number; line: ListingMergeField } | null {
  if (!keep.rentalPlan) return null
  const other = absorb.rentalPlan?.targetRent ?? null
  if (other === null || !(other > 0)) return null
  if (targetRentIsEstimated(absorb.fieldSources)) return null
  const kept = keep.rentalPlan.targetRent
  if (kept !== null && !targetRentIsEstimated(keep.fieldSources)) return null
  return {
    targetRent: other,
    line: {
      field: TARGET_RENT_KEY,
      label: 'Loyer visé',
      kept: kept === null ? null : `${formatEuros(kept)} (estimé)`,
      other: formatEuros(other),
    },
  }
}

/** La provenance des champs complétés : celle de la fiche absorbée, gardée telle quelle. */
export function mergedFieldSources(
  keep: FieldProvenanceMap,
  absorb: FieldProvenanceMap,
  fields: readonly string[]
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...keep }
  for (const field of fields) {
    const provenance = absorb[field]
    if (provenance) result[field] = provenance
    else delete result[field]
  }
  return result
}

/**
 * Les agences après la fusion : si la fiche gardée ne sait rien de son
 * vendeur, l'agence principale de l'autre devient la sienne (`principal`) ;
 * chaque autre agence inconnue de la fiche gardée s'y ajoute (`add`), sans
 * doublon, dans la limite de `LISTING_SELLERS_MAX` (`dropped` compte le
 * reste).
 */
export function mergeSellersPlan(input: {
  keep: SellerFacts
  keepOthers: readonly SellerFacts[]
  absorb: SellerFacts
  absorbOthers: readonly SellerFacts[]
}): {
  principal: NormalizedSeller | null
  add: NormalizedSeller[]
  dropped: number
} {
  const incoming = knownSellers(input.absorb, input.absorbOthers)
  let principal: NormalizedSeller | null = null
  const known = knownSellers(input.keep, input.keepOthers)
  const add: NormalizedSeller[] = []
  let dropped = 0
  for (const seller of incoming) {
    if (known.some(existing => sameSeller(existing, seller))) continue
    const normalized = normalizeSeller(seller)
    if (isEmptySeller(input.keep) && principal === null) {
      principal = normalized
    } else if (input.keepOthers.length + add.length >= LISTING_SELLERS_MAX) {
      dropped += 1
      continue
    } else {
      add.push(normalized)
    }
    known.push(normalized)
  }
  return { principal, add, dropped }
}

/** Les agences de la fiche gardée après la fusion, une ligne chacune, la principale d'abord. */
export function mergedSellerLines(input: {
  keep: SellerFacts
  keepOthers: readonly SellerFacts[]
  plan: Pick<ReturnType<typeof mergeSellersPlan>, 'principal' | 'add'>
}): string[] {
  const principal = input.plan.principal ?? input.keep
  const lines: string[] = []
  if (!isEmptySeller(principal)) {
    lines.push(
      `${otherSellerText(principal)}${input.plan.principal ? ' (reprise de l’autre fiche)' : ''}`
    )
  }
  for (const seller of input.keepOthers) lines.push(otherSellerText(seller))
  for (const seller of input.plan.add) {
    lines.push(`${otherSellerText(seller)} (reprise de l’autre fiche)`)
  }
  return lines
}

/** L'en-tête sous lequel les notes de la fiche absorbée sont recopiées. */
export function mergedNotesHeading(absorbedTitle: string): string {
  return `— Notes de « ${absorbedTitle} » (fiche fusionnée) —`
}

/**
 * Les notes après la fusion : celles de la fiche absorbée recopiées à la
 * suite, sous leur en-tête. Null si elle n'en a pas ; `appended` est le bloc
 * ajouté, gardé pour l'annulation.
 */
export function mergedNotes(
  keepNotes: string | null,
  absorbNotes: string | null,
  absorbedTitle: string
): { notes: string; appended: string } | null {
  const other = absorbNotes?.trim()
  if (!other) return null
  const block = `${mergedNotesHeading(absorbedTitle)}\n${other}`
  const own = keepNotes?.trim()
  return own
    ? { notes: `${own}\n\n${block}`, appended: `\n\n${block}` }
    : { notes: block, appended: block }
}

/** Les notes sans le bloc recopié par une fusion (annulation) ; inchangées s'il a été retouché. */
export function withoutMergedNotes(
  notes: string | null,
  appended: string
): string | null {
  if (!notes || !appended || !notes.includes(appended)) return notes
  const rest = notes.replace(appended, '').trim()
  return rest || null
}

/** Une tâche se reconnaît à son libellé, casse, accents et espaces ignorés. */
export function taskLabelKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Les tâches de la fiche absorbée que la fiche gardée n'a pas déjà (même libellé). */
export function tasksToMove<T extends { id: string; label: string }>(
  keepTasks: readonly { label: string }[],
  absorbTasks: readonly T[]
): T[] {
  const seen = new Set(keepTasks.map(task => taskLabelKey(task.label)))
  const moved: T[] = []
  for (const task of absorbTasks) {
    const key = taskLabelKey(task.label)
    if (seen.has(key)) continue
    seen.add(key)
    moved.push(task)
  }
  return moved
}

/** L'avancement d'une fiche : plus elle est loin dans le parcours, plus elle vaut d'être gardée. */
const STATUS_PROGRESS: Record<ListingStatus, number> = {
  offer_accepted: 6,
  offer_made: 5,
  visited: 4,
  to_visit: 3,
  to_study: 2,
  offer_refused: 1,
  sold_or_withdrawn: 0,
  discarded: 0,
}

const PRECISION_RANK: Record<LocationPrecision, number> = {
  exact: 3,
  street: 2,
  district: 1,
  commune: 0,
}

/**
 * Laquelle garder ? La plus avancée dans le parcours, puis celle qui a le
 * plus de suivi (visites, offres, avis), puis la mieux placée sur la carte,
 * puis la plus ancienne.
 */
export function suggestKeep(
  a: MergeListingFacts,
  b: MergeListingFacts
): { id: string; reason: string } {
  const pick = (
    winner: MergeListingFacts,
    reason: string
  ): { id: string; reason: string } => ({ id: winner.id, reason })
  const progress = STATUS_PROGRESS[a.status] - STATUS_PROGRESS[b.status]
  if (progress !== 0) {
    return pick(progress > 0 ? a : b, 'c’est la plus avancée dans le parcours')
  }
  const history = (facts: MergeListingFacts): number =>
    facts.counts.visits + facts.counts.offers + facts.counts.opinions
  if (history(a) !== history(b)) {
    return pick(
      history(a) > history(b) ? a : b,
      'c’est elle qui porte le plus de suivi (visites, offres, avis)'
    )
  }
  const precision = (facts: MergeListingFacts): number =>
    facts.locationPrecision ? PRECISION_RANK[facts.locationPrecision] : -1
  if (precision(a) !== precision(b)) {
    return pick(
      precision(a) > precision(b) ? a : b,
      'c’est la mieux placée sur la carte'
    )
  }
  return pick(
    Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? a : b,
    'c’est la plus ancienne'
  )
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`

/** Ce qui rejoint la fiche gardée, une ligne par sorte (aperçu). */
export function mergeMoveLines(counts: ListingMergeCounts): string[] {
  const lines: string[] = []
  if (counts.links) {
    lines.push(
      `${plural(counts.links, 'lien', 'liens')} de portail, avec ${counts.links > 1 ? 'leurs prix et leurs' : 'son prix et ses'} vérifications`
    )
  }
  if (counts.sellers) {
    lines.push(
      `${plural(counts.sellers, 'agence', 'agences')} avec ${counts.sellers > 1 ? 'leurs références' : 'sa référence'}`
    )
  }
  if (counts.visits) {
    lines.push(`${plural(counts.visits, 'visite', 'visites')} et leurs photos`)
  }
  if (counts.offers) lines.push(plural(counts.offers, 'offre', 'offres'))
  if (counts.opinions) lines.push(plural(counts.opinions, 'avis', 'avis'))
  if (counts.tasks) lines.push(plural(counts.tasks, 'tâche', 'tâches'))
  if (counts.agencyRequests) {
    lines.push(
      plural(
        counts.agencyRequests,
        'question à l’agence',
        'questions aux agences'
      )
    )
  }
  if (counts.fields) {
    lines.push(
      plural(counts.fields, 'champ vide complété', 'champs vides complétés')
    )
  }
  if (counts.notes) lines.push('ses notes, recopiées à la suite des tiennes')
  return lines
}

/** « Fusionnée avec « B » : 2 liens, 1 agence, 1 visite, 3 champs complétés ». */
export function mergeSummaryText(
  absorbedTitle: string,
  counts: ListingMergeCounts
): string {
  const parts = [
    counts.links ? plural(counts.links, 'lien', 'liens') : null,
    counts.sellers ? plural(counts.sellers, 'agence', 'agences') : null,
    counts.visits ? plural(counts.visits, 'visite', 'visites') : null,
    counts.offers ? plural(counts.offers, 'offre', 'offres') : null,
    counts.opinions ? plural(counts.opinions, 'avis', 'avis') : null,
    counts.tasks ? plural(counts.tasks, 'tâche', 'tâches') : null,
    counts.agencyRequests
      ? plural(counts.agencyRequests, 'question', 'questions')
      : null,
    counts.fields
      ? plural(counts.fields, 'champ complété', 'champs complétés')
      : null,
    counts.notes ? 'notes recopiées' : null,
  ].filter(Boolean)
  const head = `Fusionnée avec « ${absorbedTitle} »`
  return parts.length
    ? `${head} : ${parts.join(', ')}`
    : `${head} (rien à reprendre)`
}

/** La raison d'écart portée par la fiche absorbée (elle n'est plus suivie). */
export function mergedDiscardReason(keptTitle: string): string {
  return `Doublon de « ${keptTitle} » (fiches fusionnées)`
}

/** Le refus d'une écriture sur une fiche fusionnée. */
export function mergedListingRefusal(keptTitle: string): string {
  return `Cette fiche a été fusionnée dans « ${keptTitle} » : c’est elle qui est suivie. Annule la fusion (dans la fiche gardée) pour reprendre celle-ci.`
}

/** Le bandeau d'une fiche fusionnée. */
export function mergedBannerText(keptTitle: string): string {
  return `Doublon fusionné dans « ${keptTitle} » : cette fiche n’est plus suivie, son suivi a rejoint l’autre.`
}

/** Ce qui reste sur la fiche absorbée, dit avant de fusionner. */
export function mergeLeftBehindLines(input: {
  opinionsKept: number
  tasksKept: number
  sellersDropped: number
  hasAddress: boolean
}): string[] {
  const lines = [
    `La fiche fusionnée est supprimée ${MERGED_LISTING_RETENTION_DAYS} jours après la fusion, avec son historique des prix et son journal ; d’ici là, la fusion s’annule.`,
  ]
  if (input.opinionsKept) {
    lines.push(
      `${plural(input.opinionsKept, 'avis n’est pas repris', 'avis ne sont pas repris')} : son auteur en a déjà un sur la fiche gardée.`
    )
  }
  if (input.tasksKept) {
    lines.push(
      `${plural(input.tasksKept, 'tâche n’est pas reprise', 'tâches ne sont pas reprises')} : la fiche gardée a déjà la même.`
    )
  }
  if (input.sellersDropped) {
    lines.push(
      `${plural(input.sellersDropped, 'agence n’est pas reprise', 'agences ne sont pas reprises')} : une annonce a au plus ${LISTING_SELLERS_MAX} autres agences.`
    )
  }
  if (input.hasAddress) {
    lines.push(
      'L’adresse et le repère de la fiche gardée ne changent pas : corrige-les ensuite si l’autre était mieux placée.'
    )
  }
  return lines
}

const DAY_MS = 86_400_000

/**
 * Lot 30 (ADR 0043) : la date jusqu'à laquelle une fusion s'annule ; ensuite
 * la fiche absorbée est supprimée.
 */
export function mergeUndoUntil(
  mergedAt: string | Date,
  days: number = MERGED_LISTING_RETENTION_DAYS
): string {
  return new Date(new Date(mergedAt).getTime() + days * DAY_MS).toISOString()
}

/** La date avant laquelle une fusion ne s'annule plus (fiches absorbées à supprimer). */
export function mergePurgeBefore(
  now: Date,
  days: number = MERGED_LISTING_RETENTION_DAYS
): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/** Le refus d'annuler une fusion trop ancienne, ou null. */
export function mergeUndoRefusal(
  mergedAt: string | Date,
  now: Date,
  days: number = MERGED_LISTING_RETENTION_DAYS
): string | null {
  return now.getTime() >= Date.parse(mergeUndoUntil(mergedAt, days))
    ? `Cette fusion date de plus de ${days} jours : elle ne s’annule plus, la fiche fusionnée est supprimée.`
    : null
}

/** « Annulable jusqu'au 19 novembre », dit sous une fusion. */
export function mergeUndoText(undoUntil: string): string {
  const day = new Date(undoUntil).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  })
  return `Annulable jusqu’au ${day} ; ensuite la fiche fusionnée est supprimée.`
}
