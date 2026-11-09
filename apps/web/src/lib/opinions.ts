import { OPINION_NO_SCORE_LABEL, OPINION_SCORE_LABELS } from '@apart/contracts'
import type {
  Opinion,
  OpinionInputRaw,
  OpinionMemberSummary,
  OpinionRow,
  OpinionScoreLevel,
  OpinionSummary,
  Task,
} from '@apart/contracts'
import { criterionLower, formatOpinionAverage } from '@apart/domain'

/**
 * Lot 20 (ADR 0030) : « Nos avis », côté interface. La confrontation
 * (moyennes, écarts, désaccords, note commune, bilan) vient du serveur,
 * calculée par `domain` avec les seuls avis visibles ; ici, les teintes de
 * l'échelle, les petites phrases des cartes, de la liste et de la
 * comparaison, et le brouillon de « Mon avis » (ce qui change, ce qui part).
 * Pur, testé.
 */

/** Ce que « Nos avis » demande à la fiche ; chaque action lance en cas d'échec. */
export interface OpinionActions {
  save: (input: OpinionInputRaw) => Promise<void>
  reveal: () => Promise<void>
  addTask: (task: { label: string; details: string }) => Promise<void>
}

/** Les six choix d'un critère : « — » (pas d'avis), puis 1 à 5 avec leur mot. */
export interface ScoreChoice {
  value: number | null
  /** « — », « 4 ». */
  num: string
  /** « pas d’avis », « bien ». */
  word: string
  /** « 4, bien », « pas d’avis » (lecteur d'écran, boutons sans mot). */
  aria: string
}

export const SCORE_CHOICES: readonly ScoreChoice[] = [
  {
    value: null,
    num: '—',
    word: OPINION_NO_SCORE_LABEL,
    aria: OPINION_NO_SCORE_LABEL,
  },
  ...([1, 2, 3, 4, 5] as const).map(value => ({
    value,
    num: String(value),
    word: OPINION_SCORE_LABELS[value],
    aria: `${value}, ${OPINION_SCORE_LABELS[value]}`,
  })),
]

/** Les cinq choix de la note globale. */
export const GLOBAL_CHOICES: readonly ScoreChoice[] = SCORE_CHOICES.filter(
  c => c.value !== null
).map(c => ({ ...c, aria: `${c.value} sur 5` }))

/** La teinte d'une note, en jetons du thème (clair et sombre, 4,5:1). */
export function scoreToneClass(score: number | null | undefined): string {
  switch (score) {
    case 1:
      return 'bg-bad-soft text-bad'
    case 2:
      return 'bg-warn-soft text-warn'
    case 3:
      return 'bg-surface-2 text-fg'
    case 4:
      return 'bg-accent-soft text-accent'
    case 5:
      return 'bg-accent text-accent-fg'
    default:
      return 'border border-line bg-surface text-muted'
  }
}

/** « 4 · bien », « — ». */
export function scoreChip(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  return `${score} · ${OPINION_SCORE_LABELS[score as OpinionScoreLevel]}`
}

/** L'écart d'un critère : « d’accord », « 1 point », « 2 points », « — ». */
export function gapText(gap: number | null): string {
  if (gap === null) return '—'
  if (gap === 0) return 'd’accord'
  return `${gap} point${gap > 1 ? 's' : ''}`
}

const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
})

/** « 14 nov. » (heure de Paris). */
export function shortDay(iso: string): string {
  return SHORT_DAY.format(new Date(iso))
}

/** « après la visite du 14 nov. ». */
export function afterVisitText(
  member: Pick<OpinionMemberSummary, 'afterVisit'>
): string | null {
  return member.afterVisit
    ? `après la visite du ${shortDay(member.afterVisit.visitedAt)}`
    : null
}

/** « après avoir vu celui de Chloé ». */
export function seenBeforeText(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
  return `après avoir vu ${names.length > 1 ? 'ceux' : 'celui'} de ${list}`
}

/** « 8 critères sur 8 · après la visite du 14 nov. · après avoir vu celui de Chloé ». */
export function memberMeta(member: OpinionMemberSummary): string {
  return [
    `${member.ratedCount} critère${member.ratedCount > 1 ? 's' : ''} sur ${member.criteriaCount}`,
    afterVisitText(member),
    seenBeforeText(member.seenBefore),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * La carte masquée : « Chloé a noté 7 critères sur 8, après la visite du 14
 * nov. Ses notes restent masquées tant que tu n'as pas donné les tiennes. »
 */
export function maskedText(member: OpinionMemberSummary): string {
  const visit = afterVisitText(member)
  const head = `${member.displayName} a noté ${member.ratedCount} critère${member.ratedCount > 1 ? 's' : ''} sur ${member.criteriaCount}${visit ? `, ${visit}` : ''}`
  // « 14 nov. » finit déjà la phrase.
  return `${head}${head.endsWith('.') ? '' : '.'} Ses notes restent masquées tant que tu n’as pas donné les tiennes.`
}

/** « Ce que vous en dites » : les mots de chacun, et qui n'a pas encore noté. */
export function rowNotes(row: OpinionRow, summary: OpinionSummary): string {
  const name = (id: string): string =>
    summary.members.find(m => m.memberId === id)?.displayName ?? 'Un membre'
  const words = row.scores
    .filter(s => s.word)
    .map(s => `${name(s.memberId)} : ${s.word}`)
  const scored = row.scores.some(s => s.score !== null)
  const missing = scored
    ? row.scores
        .filter(s => s.score === null && !s.word)
        .map(s => `${name(s.memberId)} : pas encore d’avis`)
    : []
  const parts = [...words, ...missing]
  return parts.length ? parts.join(' ; ') : '—'
}

/** Le membre visible dans une ligne de la liste : « 4/5 · 4,0 », « masqué », « — ». */
export function memberCell(
  summary: OpinionSummary | null,
  memberId: string
): string {
  const member = summary?.members.find(m => m.memberId === memberId)
  if (!member || member.state === 'missing') return '—'
  if (member.state === 'masked') return 'masqué'
  const global = member.rating ? `${member.rating}/5` : 'sans note'
  return member.average === null
    ? global
    : `${global} · ${formatOpinionAverage(member.average)}`
}

/** La valeur de tri d'un membre (moyenne, sinon note globale) ; −∞ sans avis visible. */
export function memberSortValue(
  summary: OpinionSummary | null,
  memberId: string
): number {
  const member = summary?.members.find(m => m.memberId === memberId)
  if (!member || member.state !== 'rated') return Number.NEGATIVE_INFINITY
  return member.average ?? member.rating ?? Number.NEGATIVE_INFINITY
}

/** La note commune : « 3,6 », « en attente », « — ». */
export function commonScoreText(summary: OpinionSummary | null): string {
  if (!summary || summary.status === 'empty') return '—'
  if (summary.status === 'pending') return 'en attente'
  return formatOpinionAverage(summary.commonScore)
}

/**
 * Les désaccords en une cellule : « 2 : calme, on s’y voit », « aucun »,
 * « en attente de Chloé », « à toi de noter », « — ».
 */
export function disagreementsText(
  summary: OpinionSummary | null,
  meId: string | null
): string {
  if (!summary || summary.status === 'empty') return '—'
  const keys = summary.disagreementKeys
  if (keys.length > 0) {
    const labels = keys.map(k =>
      criterionLower(summary.rows.find(r => r.key === k)?.label ?? k)
    )
    return `${keys.length} : ${labels.join(', ')}`
  }
  if (summary.status === 'pending') {
    if (meId && summary.pendingMemberIds.includes(meId)) return 'à toi de noter'
    const names = summary.members
      .filter(m => summary.pendingMemberIds.includes(m.memberId))
      .map(m => m.displayName)
    return `en attente de ${names.join(', ')}`
  }
  return 'aucun'
}

/** Une ligne de comparaison : « 4 / 2 », « 5 / — », « masqué ». */
export function compareCell(
  summary: OpinionSummary | null,
  key: string
): string {
  if (!summary || summary.members.length === 0) return '—'
  const row = summary.rows.find(r => r.key === key)
  return summary.members
    .map(m => {
      if (m.state === 'masked') return 'masqué'
      const score = row?.scores.find(s => s.memberId === m.memberId)?.score
      return score === null || score === undefined ? '—' : String(score)
    })
    .join(' / ')
}

/** Une tâche ouverte porte déjà ce libellé (la contre-visite est déjà dans À faire). */
export function hasOpenTask(
  tasks: readonly Pick<Task, 'label' | 'done'>[],
  label: string
): boolean {
  return tasks.some(t => !t.done && t.label.trim() === label.trim())
}

// ---------------------------------------------------------------------------
// Le brouillon de « Mon avis »
// ---------------------------------------------------------------------------

export interface OpinionDraftScore {
  score: number | null
  word: string
}

export interface OpinionDraft {
  rating: number
  text: string
  scores: Record<string, OpinionDraftScore>
}

/** Le brouillon depuis mon avis enregistré, pour les critères affichés. */
export function opinionDraft(
  opinion: Pick<Opinion, 'rating' | 'text' | 'scores'> | null,
  keys: readonly string[]
): OpinionDraft {
  const scores: Record<string, OpinionDraftScore> = {}
  for (const key of keys) {
    const saved = opinion?.scores.find(s => s.key === key)
    scores[key] = { score: saved?.score ?? null, word: saved?.word ?? '' }
  }
  return {
    rating: opinion?.rating ?? 0,
    text: opinion?.text ?? '',
    scores,
  }
}

const sameScore = (a: OpinionDraftScore, b: OpinionDraftScore): boolean =>
  a.score === b.score && a.word.trim() === b.word.trim()

/** Le brouillon a changé depuis l'ouverture. */
export function isOpinionDraftDirty(
  draft: OpinionDraft,
  pristine: OpinionDraft
): boolean {
  if (draft.rating !== pristine.rating) return true
  if (draft.text.trim() !== pristine.text.trim()) return true
  return Object.keys(draft.scores).some(
    key =>
      !sameScore(
        draft.scores[key] as OpinionDraftScore,
        pristine.scores[key] ?? { score: null, word: '' }
      )
  )
}

/**
 * Ce qui part : la note globale et la phrase, et seulement les critères qui
 * changent (null pour effacer une note sans mot), avec le garde-fou.
 */
export function opinionPayload(
  draft: OpinionDraft,
  pristine: OpinionDraft,
  expectedUpdatedAt: string | null
): OpinionInputRaw {
  const scores: NonNullable<OpinionInputRaw['scores']> = {}
  for (const [key, value] of Object.entries(draft.scores)) {
    const before = pristine.scores[key] ?? { score: null, word: '' }
    if (sameScore(value, before)) continue
    const word = value.word.trim()
    scores[key] =
      value.score === null && word === ''
        ? null
        : { score: value.score, word: word === '' ? null : word }
  }
  return {
    rating: draft.rating,
    text: draft.text.trim(),
    scores,
    expectedUpdatedAt,
  }
}

/** La moyenne en direct des critères notés du brouillon (indication). */
export function draftAverage(draft: OpinionDraft): {
  average: number | null
  count: number
  total: number
} {
  const values = Object.values(draft.scores)
    .map(s => s.score)
    .filter((v): v is number => v !== null)
  return {
    average: values.length
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : null,
    count: values.length,
    total: Object.keys(draft.scores).length,
  }
}
