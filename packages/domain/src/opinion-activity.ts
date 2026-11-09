import type { ActivityActor, ActivityChange } from '@apart/contracts'
import { joinFrench } from './exploration.js'
import {
  countWord,
  criteriaCountText,
  criterionLower,
  disagreementsWith,
  ratedScores,
  scoreText,
} from './opinions.js'
import type { OpinionCriterionLike, OpinionLike } from './opinions.js'

/**
 * Lot 20 (ADR 0030) : les avis au journal. Ce qu'une écriture d'avis garde
 * (note globale, phrase, notes et mots par critère, libellés du moment,
 * « après la visite », « après avoir vu celui de … », désaccords avec les
 * autres avis notés), la phrase qui la raconte (« Chloé a donné son avis :
 * 3/5, 7 critères. Deux désaccords avec Richard : calme, on s’y voit. »), la
 * même phrase sans les notes pour un membre qui n'a pas encore noté (avis à
 * l'aveugle), et les réglages des critères de l'espace. Pur.
 */

type Names = ReadonlyMap<string, Pick<ActivityActor, 'displayName'>>

/** L'état d'un avis tel que le journal le garde. */
export interface OpinionJournalSnapshot {
  rating: number
  text: string
  /** Les notes données sur les critères affichés, par clé. */
  scores: Record<string, number>
  /** Les mots non vides, par clé. */
  words: Record<string, string>
}

/** Ce que le journal garde après une écriture d'avis. */
export interface OpinionJournalAfter extends OpinionJournalSnapshot {
  /** Les libellés des critères cités, au moment de l'écriture. */
  labels: Record<string, string>
  /**
   * Les clés citées dans l'ordre des critères (un objet JSON de Postgres ne
   * garde pas l'ordre de ses clés).
   */
  order: string[]
  /** Critères notés (affichés). */
  criteriaCount: number
  /** L'avis suit une visite faite à laquelle le membre participait. */
  afterVisit: boolean
  /** Membres dont il avait vu l'avis avant de noter. */
  seenBefore: string[]
  /** Désaccords avec chacun des autres avis notés. */
  disagreements: Array<{ memberId: string; keys: string[] }>
  /** Les autres membres actifs qui avaient déjà noté (notifications). */
  ratedMemberIds: string[]
  /** L'espace masque les avis avant de noter. */
  blind: boolean
}

/** L'état d'un avis pour le journal : notes des critères affichés, mots non vides. */
export function opinionSnapshot(
  opinion: Pick<OpinionLike, 'rating' | 'text' | 'scores'>,
  visibleKeys: ReadonlySet<string>
): OpinionJournalSnapshot {
  const scores: Record<string, number> = {}
  for (const s of ratedScores(opinion, visibleKeys)) scores[s.key] = s.score
  const words: Record<string, string> = {}
  for (const s of opinion.scores) {
    if (s.word && visibleKeys.has(s.key)) words[s.key] = s.word
  }
  return { rating: opinion.rating, text: opinion.text ?? '', scores, words }
}

/** Ce qu'une écriture d'avis met au journal (avant, après). */
export function opinionJournalPayload(input: {
  before: OpinionJournalSnapshot | null
  opinion: Pick<OpinionLike, 'rating' | 'text' | 'scores'>
  criteria: readonly OpinionCriterionLike[]
  visibleKeys: ReadonlySet<string>
  afterVisit: boolean
  seenBefore: readonly string[]
  /** Les autres membres actifs et leur avis noté. */
  others: readonly Pick<OpinionLike, 'memberId' | 'scores' | 'rating'>[]
  blind: boolean
}): { before: OpinionJournalSnapshot | null; after: OpinionJournalAfter } {
  const after = opinionSnapshot(input.opinion, input.visibleKeys)
  const cited = new Set([
    ...Object.keys(after.scores),
    ...Object.keys(after.words),
    ...Object.keys(input.before?.scores ?? {}),
    ...Object.keys(input.before?.words ?? {}),
  ])
  const labels: Record<string, string> = {}
  const order: string[] = []
  for (const c of [...input.criteria].sort((a, b) => a.position - b.position)) {
    if (!cited.has(c.key)) continue
    labels[c.key] = c.label
    order.push(c.key)
  }
  const rated = input.others.filter(
    o => o.rating > 0 || ratedScores(o, input.visibleKeys).length > 0
  )
  return {
    before: input.before,
    after: {
      ...after,
      labels,
      order,
      criteriaCount: Object.keys(after.scores).length,
      afterVisit: input.afterVisit,
      seenBefore: [...input.seenBefore],
      disagreements: disagreementsWith(
        input.opinion,
        rated,
        input.visibleKeys
      ).filter(d => d.keys.length > 0),
      ratedMemberIds: rated.map(o => o.memberId),
      blind: input.blind,
    },
  }
}

/** Une écriture qui ne change rien (même note, même phrase, mêmes notes et mots). */
export function sameOpinionSnapshot(
  a: OpinionJournalSnapshot | null,
  b: OpinionJournalSnapshot
): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b)
}

const OPINION_WRITES = new Set(['opinion.created', 'opinion.updated'])

/**
 * Ce qu'un membre qui n'a pas encore noté peut lire d'une écriture d'avis
 * d'un autre (avis à l'aveugle) : qui, combien de critères, après la
 * visite ; jamais les notes, les mots, la phrase ni les désaccords.
 */
export function redactOpinionActivity(
  action: string,
  before: unknown,
  after: unknown
): { before: unknown; after: unknown } {
  if (!OPINION_WRITES.has(action)) return { before, after }
  const record = isRecord(after) ? after : {}
  return {
    before: null,
    after: {
      masked: true,
      criteriaCount:
        typeof record.criteriaCount === 'number' ? record.criteriaCount : null,
      afterVisit: record.afterVisit === true,
    },
  }
}

/** Vrai pour une écriture d'avis que l'avis à l'aveugle peut masquer. */
export function isOpinionWrite(action: string): boolean {
  return OPINION_WRITES.has(action)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numbers(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (e): e is [string, number] => typeof e[1] === 'number'
    )
  )
}

function strings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (e): e is [string, string] => typeof e[1] === 'string'
    )
  )
}

/** Les clés citées, dans l'ordre des critères gardé au journal, les autres à la suite. */
function orderedKeys(
  order: readonly string[],
  ...records: Record<string, unknown>[]
): string[] {
  const rank = (key: string) => {
    const index = order.indexOf(key)
    return index < 0 ? order.length : index
  }
  return [...new Set(records.flatMap(r => Object.keys(r)))].sort(
    (a, b) => rank(a) - rank(b)
  )
}

function nameOf(names: Names, id: string): string {
  return names.get(id)?.displayName ?? 'un membre'
}

/** « après la visite », « après avoir vu celui de Chloé », les deux. */
function qualifiers(record: Record<string, unknown>, names: Names): string {
  const parts: string[] = []
  if (record.afterVisit === true) parts.push('après la visite')
  const seen = Array.isArray(record.seenBefore)
    ? record.seenBefore.filter((v): v is string => typeof v === 'string')
    : []
  if (seen.length > 0) {
    parts.push(
      `après avoir vu ${seen.length > 1 ? 'ceux' : 'celui'} de ${joinFrench(seen.map(id => nameOf(names, id)))}`
    )
  }
  return parts.length ? ` ${parts.join(' et ')}` : ''
}

/** Les écarts d'une mise à jour : « état 4 → 3 », « note globale 3 → 4 ». */
function scoreMoves(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
  order: readonly string[]
): string[] {
  const moves: string[] = []
  const was = numbers(before.scores)
  const now = numbers(after.scores)
  for (const key of orderedKeys(order, was, now)) {
    if (was[key] === now[key]) continue
    moves.push(
      `${criterionLower(labels[key] ?? key)} ${was[key] ?? '—'} → ${now[key] ?? '—'}`
    )
  }
  const ratingBefore = typeof before.rating === 'number' ? before.rating : 0
  const ratingAfter = typeof after.rating === 'number' ? after.rating : 0
  if (ratingBefore !== ratingAfter) {
    moves.push(`note globale ${ratingBefore || '—'} → ${ratingAfter || '—'}`)
  }
  return moves
}

/** Le détail d'une écriture d'avis : note, phrase, notes et mots par critère. */
function opinionChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
  order: readonly string[]
): ActivityChange[] {
  const changes: ActivityChange[] = []
  const ratingBefore = typeof before.rating === 'number' ? before.rating : 0
  const ratingAfter = typeof after.rating === 'number' ? after.rating : 0
  if (ratingBefore !== ratingAfter) {
    changes.push({
      field: 'rating',
      label: 'Note globale',
      before: ratingBefore ? `${ratingBefore}/5` : null,
      after: ratingAfter ? `${ratingAfter}/5` : null,
    })
  }
  const textBefore = typeof before.text === 'string' ? before.text : ''
  const textAfter = typeof after.text === 'string' ? after.text : ''
  if (textBefore !== textAfter) {
    changes.push({
      field: 'text',
      label: 'Phrase',
      before: textBefore || null,
      after: textAfter || null,
    })
  }
  const was = numbers(before.scores)
  const now = numbers(after.scores)
  for (const key of orderedKeys(order, was, now)) {
    if (was[key] === now[key]) continue
    changes.push({
      field: `scores.${key}`,
      label: labels[key] ?? key,
      before: was[key] === undefined ? null : scoreText(was[key]),
      after: now[key] === undefined ? null : scoreText(now[key]),
    })
  }
  const wordsBefore = strings(before.words)
  const wordsAfter = strings(after.words)
  for (const key of orderedKeys(order, wordsBefore, wordsAfter)) {
    if (wordsBefore[key] === wordsAfter[key]) continue
    changes.push({
      field: `words.${key}`,
      label: `${labels[key] ?? key} (mot)`,
      before: wordsBefore[key] ?? null,
      after: wordsAfter[key] ?? null,
    })
  }
  return changes
}

/** « Deux désaccords avec Richard : calme, on s’y voit. » */
function disagreementSentences(
  record: Record<string, unknown>,
  labels: Record<string, string>,
  names: Names
): string[] {
  const list = Array.isArray(record.disagreements) ? record.disagreements : []
  return list.filter(isRecord).flatMap(d => {
    const keys = Array.isArray(d.keys)
      ? d.keys.filter((k): k is string => typeof k === 'string')
      : []
    if (keys.length === 0 || typeof d.memberId !== 'string') return []
    const n = keys.length
    return [
      `${countWord(n)} désaccord${n > 1 ? 's' : ''} avec ${nameOf(names, d.memberId)} : ${keys.map(k => criterionLower(labels[k] ?? k)).join(', ')}.`,
    ]
  })
}

function quotedLabel(record: unknown): string {
  return isRecord(record) && typeof record.label === 'string'
    ? ` « ${record.label} »`
    : ''
}

/**
 * La phrase et le détail des lignes d'avis du journal (lot 20), ou null
 * pour une autre action. `legacy` décrit une ligne d'avant le lot 20 (note
 * et texte seulement).
 */
export function describeOpinionActivity(
  action: string,
  before: unknown,
  after: unknown,
  names: Names,
  legacy: (before: unknown, after: unknown) => ActivityChange[]
): { summary: string; changes: ActivityChange[] } | null {
  const b = isRecord(before) ? before : {}
  const a = isRecord(after) ? after : {}
  switch (action) {
    case 'opinion.created':
    case 'opinion.updated': {
      const head =
        action === 'opinion.created'
          ? 'a donné son avis'
          : 'a mis à jour son avis'
      if (a.masked === true) {
        const count =
          typeof a.criteriaCount === 'number' && a.criteriaCount > 0
            ? ` : ${criteriaCountText(a.criteriaCount)} noté${a.criteriaCount > 1 ? 's' : ''}`
            : ''
        return {
          summary: `${head}${a.afterVisit === true ? ' après la visite' : ''}${count} (masqué tant que tu n’as pas noté).`,
          changes: [],
        }
      }
      if (!('scores' in a)) {
        // Avant le lot 20 : la note sur 5 et le texte.
        return {
          summary:
            action === 'opinion.created'
              ? 'a donné son avis'
              : 'a modifié son avis',
          changes: legacy(before, after),
        }
      }
      const labels = strings(a.labels)
      // Une ligne sans `order` (jeu antérieur) garde l'ordre de ses libellés.
      const order = Array.isArray(a.order)
        ? a.order.filter((k): k is string => typeof k === 'string')
        : Object.keys(labels)
      const rating = typeof a.rating === 'number' ? a.rating : 0
      const count = Object.keys(numbers(a.scores)).length
      const main = [
        rating > 0 ? `${rating}/5` : null,
        count > 0 ? criteriaCountText(count) : null,
      ].filter(Boolean)
      const moves =
        action === 'opinion.updated' ? scoreMoves(b, a, labels, order) : []
      const shownMoves = moves.length > 3 ? [...moves.slice(0, 3), '…'] : moves
      const first = `${head}${qualifiers(a, names)}${main.length ? ` : ${main.join(', ')}` : ''}${shownMoves.length ? ` (${shownMoves.join(', ')})` : ''}.`
      return {
        summary: [first, ...disagreementSentences(a, labels, names)].join(' '),
        changes: opinionChanges(b, a, labels, order),
      }
    }
    case 'opinion.revealed': {
      const ids = Array.isArray(a.memberIds)
        ? a.memberIds.filter((v): v is string => typeof v === 'string')
        : []
      return {
        summary: ids.length
          ? `a affiché l’avis de ${joinFrench(ids.map(id => nameOf(names, id)))} avant de noter`
          : 'a choisi de voir les avis avant de noter',
        changes: [],
      }
    }
    case 'opinion_settings.blind_changed':
      return {
        summary:
          a.blind === true
            ? 'a activé les avis à l’aveugle'
            : 'a désactivé les avis à l’aveugle',
        changes: [],
      }
    case 'opinion_settings.criterion_added':
      return {
        summary: `a ajouté le critère d’avis${quotedLabel(a)}`,
        changes: [],
      }
    case 'opinion_settings.criterion_removed':
      return {
        summary: `a retiré le critère d’avis${quotedLabel(b)}`,
        changes: [],
      }
    case 'opinion_settings.criterion_updated': {
      const changes = legacy(before, after)
      if (a.hidden === true && b.hidden !== true) {
        return {
          summary: `a masqué le critère d’avis${quotedLabel(b)}`,
          changes,
        }
      }
      if (a.hidden === false && b.hidden === true) {
        return {
          summary: `a réaffiché le critère d’avis${quotedLabel(b)}`,
          changes,
        }
      }
      if (typeof a.label === 'string' && a.label !== b.label) {
        return {
          summary: `a renommé le critère d’avis${quotedLabel(b)} en « ${a.label} »`,
          changes,
        }
      }
      return {
        summary: `a modifié le critère d’avis${quotedLabel(b)}`,
        changes,
      }
    }
    case 'opinion_settings.criteria_reordered': {
      const order = (record: Record<string, unknown>): string | null =>
        Array.isArray(record.labels)
          ? record.labels
              .filter((v): v is string => typeof v === 'string')
              .join(' · ')
          : null
      return {
        summary: 'a changé l’ordre des critères d’avis',
        changes: [
          {
            field: 'order',
            label: 'Ordre',
            before: order(b),
            after: order(a),
          },
        ],
      }
    }
    default:
      return null
  }
}

/**
 * La notification d'un avis donné, pour un destinataire : le nombre de
 * désaccords avec lui s'il a déjà noté ; sinon « à toi de noter », sans les
 * notes.
 */
export function opinionNotificationText(input: {
  action: string
  after: unknown
  actorName: string
  recipientId: string
  listingTitle: string
}): { title: string; body: string } {
  const a = isRecord(input.after) ? input.after : {}
  const verb =
    input.action === 'opinion.created'
      ? 'a donné son avis'
      : 'a mis à jour son avis'
  const rated = Array.isArray(a.ratedMemberIds)
    ? a.ratedMemberIds.includes(input.recipientId)
    : false
  if (!rated) {
    return {
      title: `${input.actorName} ${verb}, à toi de noter`,
      body:
        a.blind === true
          ? `${input.listingTitle} : ses notes restent masquées tant que tu n’as pas noté.`
          : `${input.listingTitle}.`,
    }
  }
  const mine = (Array.isArray(a.disagreements) ? a.disagreements : [])
    .filter(isRecord)
    .find(d => d.memberId === input.recipientId)
  const count = Array.isArray(mine?.keys) ? mine.keys.length : 0
  return {
    title: `${input.actorName} ${verb}`,
    body:
      count > 0
        ? `${input.listingTitle} : ${count} désaccord${count > 1 ? 's' : ''} à discuter.`
        : `${input.listingTitle} : aucun désaccord de 2 points ou plus.`,
  }
}
