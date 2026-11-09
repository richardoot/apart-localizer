import {
  DEFAULT_OPINION_CRITERIA,
  OPINION_CRITERIA_MAX,
  OPINION_SCORE_LABELS,
  TASK_DETAILS_MAX,
} from '@apart/contracts'
import type {
  OpinionCriterion,
  OpinionCriterionOrigin,
  OpinionMemberSummary,
  OpinionRow,
  OpinionScoreLevel,
  OpinionSummary,
  OpinionSummaryStatus,
  OpinionVisitRef,
} from '@apart/contracts'
import { joinFrench } from './exploration.js'

/**
 * Lot 20 (ADR 0030) : nos avis, critère par critère. Les critères de
 * l'espace (huit par défaut, dix au plus), la règle de l'avis à l'aveugle
 * (qui voit quoi), la mention « après visite », la confrontation des avis
 * visibles (moyenne par personne, écart et accord par critère, désaccords,
 * note commune) et ses phrases (bilan, points de la Synthèse, prochaine
 * étape, tâche de contre-visite proposée). Pur : l'API applique la
 * visibilité avant que rien ne parte, le web et le MCP lisent le résultat.
 * La note globale reste à part ; la moyenne des critères n'est qu'une
 * indication. Le verdict ne change pas.
 */

/** Deux notes qui s'écartent de 2 points ou plus : un désaccord. */
export const OPINION_DISAGREEMENT_GAP = 2
/** « Ce qui plaît » : un critère noté au moins « bien » par tous. */
export const OPINION_LIKED_MIN = 4
/** « À surveiller » : un critère noté « rédhibitoire » par quelqu'un. */
export const OPINION_DEALBREAKER = 1
/** Critères cités au plus dans une phrase. */
export const OPINION_SENTENCE_MAX = 3

// ---------------------------------------------------------------------------
// Les critères de l'espace
// ---------------------------------------------------------------------------

/** Ce qu'on lit d'un critère enregistré. */
export interface OpinionCriterionLike {
  key: string
  label: string
  hint: string
  position: number
  hidden: boolean
  origin: OpinionCriterionOrigin
}

/** Les huit critères par défaut, comme s'ils étaient enregistrés. */
export function defaultOpinionCriteria(): OpinionCriterion[] {
  return DEFAULT_OPINION_CRITERIA.map((c, position) => ({
    key: c.key,
    label: c.label,
    hint: c.hint,
    position,
    hidden: false,
    origin: 'default',
  }))
}

/**
 * Les critères d'un espace : ceux enregistrés, dans leur ordre ; tant que
 * l'espace n'a rien réglé (aucune ligne), les huit par défaut. Le résultat
 * est le même que si les défauts avaient été écrits.
 */
export function effectiveOpinionCriteria(
  rows: readonly OpinionCriterionLike[] | null | undefined
): OpinionCriterion[] {
  if (!rows || rows.length === 0) return defaultOpinionCriteria()
  return [...rows]
    .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
    .map(r => ({
      key: r.key,
      label: r.label,
      hint: r.hint,
      position: r.position,
      hidden: r.hidden,
      origin: r.origin,
    }))
}

/** Les critères affichés (non masqués), dans l'ordre. */
export function visibleOpinionCriteria<T extends OpinionCriterionLike>(
  criteria: readonly T[]
): T[] {
  return [...criteria]
    .filter(c => !c.hidden)
    .sort((a, b) => a.position - b.position)
}

/** Les clés des critères affichés. */
export function visibleCriterionKeys(
  criteria: readonly OpinionCriterionLike[]
): Set<string> {
  return new Set(visibleOpinionCriteria(criteria).map(c => c.key))
}

/** « calme », « on s’y voit » ; un sigle (« DPE ») garde sa casse. */
export function criterionLower(label: string): string {
  if (/^\p{Lu}{2}/u.test(label)) return label
  return label.charAt(0).toLocaleLowerCase('fr-FR') + label.slice(1)
}

/** La première lettre en capitale (« Le calme », « « On s’y voit » »). */
export function capitalizeFirst(text: string): string {
  const index = text.search(/\p{L}/u)
  if (index < 0) return text
  return (
    text.slice(0, index) +
    text.charAt(index).toLocaleUpperCase('fr-FR') +
    text.slice(index + 1)
  )
}

/**
 * Le critère dans une phrase : « le calme » pour un critère par défaut au
 * libellé d'origine, sinon son libellé entre guillemets (« « Cuisine » »).
 */
export function criterionInSentence(
  criterion: Pick<OpinionCriterionLike, 'key' | 'label'>
): string {
  const known = DEFAULT_OPINION_CRITERIA.find(c => c.key === criterion.key)
  return known && known.label === criterion.label
    ? known.inSentence
    : `« ${criterion.label} »`
}

/** Une clé générée pour un critère ajouté : `custom_` et le libellé sans accents, unique. */
export function customCriterionKey(
  label: string,
  existing: Iterable<string>
): string {
  const taken = new Set(existing)
  const slug =
    label
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'critere'
  const base = `custom_${slug}`
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const key = `${base}_${n}`
    if (!taken.has(key)) return key
  }
}

/** Ajouter un critère : refus au-delà de dix (masqués compris) ou si le libellé existe. */
export function addCriterionRefusal(
  criteria: readonly Pick<OpinionCriterionLike, 'label'>[],
  label: string
): string | null {
  if (criteria.length >= OPINION_CRITERIA_MAX) {
    return `${OPINION_CRITERIA_MAX} critères au plus, masqués compris : masquez-en un ou retirez un critère ajouté jamais noté.`
  }
  return labelTakenRefusal(criteria, label)
}

/** Un libellé déjà pris par un autre critère (casse et accents ignorés). */
export function labelTakenRefusal(
  criteria: readonly Pick<OpinionCriterionLike, 'label'>[],
  label: string
): string | null {
  const wanted = comparableLabel(label)
  return criteria.some(c => comparableLabel(c.label) === wanted)
    ? `Un critère s’appelle déjà « ${label.trim()} ».`
    : null
}

/**
 * Le critère que désigne un texte dicté (MCP) : sa clé exacte, sinon son
 * libellé (casse, accents et apostrophes ignorés) ; null sinon.
 */
export function resolveOpinionCriterion<T extends OpinionCriterionLike>(
  criteria: readonly T[],
  text: string
): T | null {
  const wanted = text.trim()
  const byKey = criteria.find(c => c.key === wanted)
  if (byKey) return byKey
  const label = comparableLabel(wanted)
  return criteria.find(c => comparableLabel(c.label) === label) ?? null
}

/** Un libellé comparable : sans accents, sans casse, apostrophes unifiées. */
export function comparableLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Retirer un critère : seulement un critère ajouté par l'espace et jamais
 * noté ; un critère par défaut ou noté se masque (ses notes restent).
 */
export function removeCriterionRefusal(
  criterion: Pick<OpinionCriterionLike, 'origin' | 'label'>,
  scoreCount: number
): string | null {
  if (criterion.origin === 'default') {
    return `« ${criterion.label} » est un critère par défaut : masquez-le plutôt.`
  }
  if (scoreCount > 0) {
    return `« ${criterion.label} » a déjà ${scoreCount} note${scoreCount > 1 ? 's' : ''} : masquez-le pour les garder.`
  }
  return null
}

/** Un nouvel ordre : toutes les clés, chacune une fois. */
export function reorderRefusal(
  current: readonly string[],
  keys: readonly string[]
): string | null {
  const wanted = new Set(keys)
  if (
    wanted.size !== keys.length ||
    keys.length !== current.length ||
    current.some(k => !wanted.has(k))
  ) {
    return 'Le nouvel ordre doit reprendre chaque critère de l’espace une fois.'
  }
  return null
}

/** Un critère qui monte ou descend d'un cran ; null au bord. */
export function moveCriterion(
  keys: readonly string[],
  key: string,
  direction: 'up' | 'down'
): string[] | null {
  const index = keys.indexOf(key)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= keys.length) return null
  const next = [...keys]
  next[index] = keys[target] as string
  next[target] = key
  return next
}

// ---------------------------------------------------------------------------
// Les avis et ce que chacun voit
// ---------------------------------------------------------------------------

/** Ce qu'on lit d'une note de critère. */
export interface OpinionScoreLike {
  key: string
  score: number | null
  word: string | null
}

/** Ce qu'on lit d'un avis. */
export interface OpinionLike {
  memberId: string
  rating: number
  text?: string
  scores: readonly OpinionScoreLike[]
  updatedAt?: string | null
  afterVisit?: OpinionVisitRef | null
  seenBefore?: readonly string[]
}

/** Les notes données (1 à 5) sur les critères affichés. */
export function ratedScores(
  opinion: Pick<OpinionLike, 'scores'>,
  visibleKeys: ReadonlySet<string>
): Array<OpinionScoreLike & { score: number }> {
  return opinion.scores.filter(
    (s): s is OpinionScoreLike & { score: number } =>
      s.score !== null && visibleKeys.has(s.key)
  )
}

/** A noté : au moins un critère affiché, ou une note globale. */
export function opinionHasRating(
  opinion: Pick<OpinionLike, 'rating' | 'scores'> | null | undefined,
  visibleKeys: ReadonlySet<string>
): boolean {
  if (!opinion) return false
  return opinion.rating > 0 || ratedScores(opinion, visibleKeys).length > 0
}

/** La moyenne des critères notés, à titre indicatif ; null sans note. */
export function opinionAverage(
  opinion: Pick<OpinionLike, 'scores'>,
  visibleKeys: ReadonlySet<string>
): number | null {
  const rated = ratedScores(opinion, visibleKeys)
  if (rated.length === 0) return null
  return rated.reduce((sum, s) => sum + s.score, 0) / rated.length
}

/**
 * L'avis à l'aveugle : un membre voit l'avis des autres si l'espace ne masque
 * pas, s'il a déjà noté (un critère ou la note globale), ou s'il a choisi
 * « Voir quand même » sur l'annonce.
 */
export function canSeeOthersOpinions(input: {
  blind: boolean
  viewerRated: boolean
  revealed: boolean
}): boolean {
  return !input.blind || input.viewerRated || input.revealed
}

/**
 * Les avis d'une annonce pour un membre : le sien toujours ; ceux des autres
 * s'il peut les voir, sinon ils sont masqués (seulement comptés). Un avis
 * masqué ne doit jamais partir dans une réponse destinée à ce membre.
 */
export function splitOpinionsForViewer<T extends OpinionLike>(
  opinions: readonly T[],
  context: {
    viewerId: string
    blind: boolean
    revealed: boolean
    visibleKeys: ReadonlySet<string>
  }
): { visible: T[]; masked: T[]; viewerRated: boolean; canSeeOthers: boolean } {
  const own = opinions.find(o => o.memberId === context.viewerId) ?? null
  const viewerRated = opinionHasRating(own, context.visibleKeys)
  const canSeeOthers = canSeeOthersOpinions({
    blind: context.blind,
    viewerRated,
    revealed: context.revealed,
  })
  const visible: T[] = []
  const masked: T[] = []
  for (const opinion of opinions) {
    if (opinion.memberId === context.viewerId || canSeeOthers) {
      visible.push(opinion)
    } else if (opinionHasRating(opinion, context.visibleKeys)) {
      masked.push(opinion)
    }
  }
  return { visible, masked, viewerRated, canSeeOthers }
}

/** Ce qu'on lit d'une visite pour la mention « après visite ». */
export interface OpinionVisitLike {
  id: string
  visitedAt: string
  status: 'planned' | 'done'
  participantIds: readonly string[]
}

/**
 * « Après visite » : la dernière visite faite de l'annonce, avec ce membre
 * parmi les participants, avant la date de son avis ; null sinon (rien
 * d'inventé : sans participant enregistré, pas de mention).
 */
export function opinionAfterVisit(
  visits: readonly OpinionVisitLike[],
  memberId: string,
  at: string | Date
): OpinionVisitRef | null {
  const limit = new Date(at).getTime()
  const candidates = visits
    .filter(
      v =>
        v.status === 'done' &&
        v.participantIds.includes(memberId) &&
        Date.parse(v.visitedAt) <= limit
    )
    .sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt))
  const visit = candidates[0]
  return visit ? { visitId: visit.id, visitedAt: visit.visitedAt } : null
}

// ---------------------------------------------------------------------------
// La confrontation
// ---------------------------------------------------------------------------

export interface ConfrontationInput {
  /** Tous les critères de l'espace (les masqués sont écartés). */
  criteria: readonly OpinionCriterionLike[]
  /** Les membres actifs, dans l'ordre d'affichage. */
  members: readonly { id: string; displayName: string }[]
  /** Les avis visibles par le membre connecté. */
  visible: readonly OpinionLike[]
  /** Les avis masqués (seulement comptés, jamais recopiés). */
  masked: readonly OpinionLike[]
  blind: boolean
  revealed: boolean
  viewerRated: boolean
  /** Les prénoms des membres, anciens compris (mention « après avoir vu »). */
  names?: ReadonlyMap<string, string>
}

const mean = (values: readonly number[]): number | null =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null

/**
 * La confrontation des avis visibles : par membre (état, note globale,
 * moyenne des critères, après visite), par critère (notes, écart, moyenne,
 * accord), les désaccords (écart de 2 points ou plus), la note commune
 * (moyenne, sur les critères notés par tous, des moyennes par critère ;
 * calculée seulement quand chaque membre actif a un avis visible) et la
 * phrase de bilan. Un avis masqué n'y entre que par son nombre de critères.
 */
export function confrontOpinions(input: ConfrontationInput): OpinionSummary {
  const criteria = visibleOpinionCriteria(input.criteria)
  const keys = new Set(criteria.map(c => c.key))
  const names = new Map<string, string>(input.names ?? [])
  for (const m of input.members) names.set(m.id, m.displayName)

  const members: OpinionMemberSummary[] = input.members.map(member => {
    const visible = input.visible.find(o => o.memberId === member.id)
    const masked = input.masked.find(o => o.memberId === member.id)
    const seenBefore = (visible?.seenBefore ?? [])
      .map(id => names.get(id))
      .filter((n): n is string => Boolean(n))
    if (visible && opinionHasRating(visible, keys)) {
      return {
        memberId: member.id,
        displayName: member.displayName,
        state: 'rated',
        rating: visible.rating,
        average: opinionAverage(visible, keys),
        ratedCount: ratedScores(visible, keys).length,
        criteriaCount: criteria.length,
        afterVisit: visible.afterVisit ?? null,
        seenBefore,
        updatedAt: visible.updatedAt ?? null,
      }
    }
    if (masked && opinionHasRating(masked, keys)) {
      return {
        memberId: member.id,
        displayName: member.displayName,
        state: 'masked',
        rating: null,
        average: null,
        ratedCount: ratedScores(masked, keys).length,
        criteriaCount: criteria.length,
        afterVisit: masked.afterVisit ?? null,
        seenBefore: [],
        updatedAt: masked.updatedAt ?? null,
      }
    }
    return {
      memberId: member.id,
      displayName: member.displayName,
      state: 'missing',
      rating: visible ? visible.rating : null,
      average: null,
      ratedCount: 0,
      criteriaCount: criteria.length,
      afterVisit: null,
      seenBefore,
      updatedAt: visible?.updatedAt ?? null,
    }
  })

  const rated = members.filter(m => m.state === 'rated')
  const everyoneRated = members.length > 0 && rated.length === members.length
  const rows: OpinionRow[] = criteria.map(criterion => {
    const scores = rated.map(m => {
      const opinion = input.visible.find(o => o.memberId === m.memberId)
      const score = opinion?.scores.find(s => s.key === criterion.key)
      return {
        memberId: m.memberId,
        score: score?.score ?? null,
        word: score?.word ?? null,
      }
    })
    const values = scores
      .map(s => s.score)
      .filter((v): v is number => v !== null)
    const gap =
      values.length >= 2 ? Math.max(...values) - Math.min(...values) : null
    return {
      key: criterion.key,
      label: criterion.label,
      hint: criterion.hint,
      scores,
      gap,
      mean: mean(values),
      common: everyoneRated && values.length === members.length,
      agreement:
        gap === null
          ? null
          : gap === 0
            ? 'agree'
            : gap < OPINION_DISAGREEMENT_GAP
              ? 'close'
              : 'disagree',
    }
  })
  const disagreementKeys = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.agreement === 'disagree')
    .sort(
      (a, b) =>
        (b.row.gap as number) - (a.row.gap as number) || a.index - b.index
    )
    .map(({ row }) => row.key)
  const gaps = rows.map(r => r.gap).filter((g): g is number => g !== null)
  const commonRows = rows.filter(r => r.common)
  const pending = members.filter(m => m.state !== 'rated')
  const status: OpinionSummaryStatus =
    rated.length === 0 && members.every(m => m.state !== 'masked')
      ? 'empty'
      : pending.length > 0
        ? 'pending'
        : commonRows.length === 0
          ? 'none'
          : 'ready'
  const summary: OpinionSummary = {
    blind: input.blind,
    masked: members.some(m => m.state === 'masked'),
    revealed: input.revealed,
    viewerRated: input.viewerRated,
    members,
    rows,
    agreements: rows.filter(
      r => r.agreement === 'agree' || r.agreement === 'close'
    ).length,
    disagreementKeys,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    commonScore:
      status === 'ready'
        ? (mean(commonRows.map(r => r.mean as number)) as number)
        : null,
    status,
    pendingMemberIds: pending.map(m => m.memberId),
    sentence: '',
  }
  return { ...summary, sentence: opinionSummarySentence(summary) }
}

// ---------------------------------------------------------------------------
// Les phrases
// ---------------------------------------------------------------------------

/** « 4,0 », « 3,6 » : une moyenne au dixième. */
export function formatOpinionAverage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** « 4 · bien », « — ». */
export function scoreText(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  return `${score} · ${OPINION_SCORE_LABELS[score as OpinionScoreLevel]}`
}

/** « Un », « Deux »… pour un petit nombre ; le chiffre au-delà de dix. */
export function countWord(n: number, feminine = false): string {
  const words = [
    'Aucun',
    feminine ? 'Une' : 'Un',
    'Deux',
    'Trois',
    'Quatre',
    'Cinq',
    'Six',
    'Sept',
    'Huit',
    'Neuf',
    'Dix',
  ]
  return words[n] ?? String(n)
}

/** « 1 critère », « 7 critères ». */
export function criteriaCountText(n: number): string {
  return `${n} critère${n > 1 ? 's' : ''}`
}

function rowOf(summary: OpinionSummary, key: string): OpinionRow {
  return summary.rows.find(r => r.key === key) as OpinionRow
}

/** Les notes d'une ligne viennent toujours d'un membre de la confrontation. */
function nameOf(summary: OpinionSummary, memberId: string): string {
  return (
    summary.members.find(m => m.memberId === memberId) as OpinionMemberSummary
  ).displayName
}

/**
 * Les notes d'un critère : « (Richard 4, Chloé 2) » la première fois, « (4
 * et 2) » ensuite.
 */
function scoresInParens(
  summary: OpinionSummary,
  row: OpinionRow,
  withNames: boolean
): string {
  const scored = row.scores.filter(s => s.score !== null)
  return withNames
    ? `(${scored.map(s => `${nameOf(summary, s.memberId)} ${s.score}`).join(', ')})`
    : `(${joinFrench(scored.map(s => String(s.score)))})`
}

/** « le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2) ». */
export function disagreementList(
  summary: OpinionSummary,
  keys: readonly string[] = summary.disagreementKeys
): string {
  const shown = keys.slice(0, OPINION_SENTENCE_MAX)
  const parts = shown.map((key, index) => {
    const row = rowOf(summary, key)
    return `${criterionInSentence(row)} ${scoresInParens(summary, row, index === 0)}`
  })
  const more = keys.length - shown.length
  return more > 0
    ? `${parts.join(', ')} et ${more} autre${more > 1 ? 's' : ''}`
    : joinFrench(parts)
}

/**
 * Le bilan : « D'accord sur 5 critères. Désaccord sur le calme (Richard 4,
 * Chloé 2) et « on s’y voit » (4 et 2). Chloé n'a pas encore noté la rue. »
 * Seulement ce que les avis visibles disent.
 */
export function opinionSummarySentence(summary: OpinionSummary): string {
  if (summary.status === 'empty') {
    return 'Personne n’a encore donné son avis.'
  }
  const parts: string[] = []
  const rated = summary.members.filter(m => m.state === 'rated')
  if (rated.length >= 2) {
    if (summary.agreements > 0) {
      parts.push(`D’accord sur ${criteriaCountText(summary.agreements)}.`)
    }
    if (summary.disagreementKeys.length > 0) {
      parts.push(`Désaccord sur ${disagreementList(summary)}.`)
    } else if (summary.rows.some(r => r.gap !== null)) {
      parts.push('Aucun désaccord de 2 points ou plus.')
    }
    // Ce qu'un membre n'a pas noté alors qu'un autre l'a fait.
    for (const member of rated) {
      const missing = summary.rows.filter(
        r =>
          r.scores.some(
            s => s.memberId !== member.memberId && s.score !== null
          ) && r.scores.find(s => s.memberId === member.memberId)?.score == null
      )
      if (missing.length === 0) continue
      const shown = missing.slice(0, OPINION_SENTENCE_MAX)
      const more = missing.length - shown.length
      const list = shown.map(r => criterionInSentence(r))
      parts.push(
        `${member.displayName} n’a pas encore noté ${more > 0 ? `${list.join(', ')} et ${more} autre${more > 1 ? 's' : ''}` : joinFrench(list)}.`
      )
    }
  } else if (rated.length === 1) {
    const only = rated[0] as OpinionMemberSummary
    parts.push(
      `${only.displayName} : ${criteriaCountText(only.ratedCount)} noté${only.ratedCount > 1 ? 's' : ''} sur ${only.criteriaCount}${only.average !== null ? `, ${formatOpinionAverage(only.average)} en moyenne` : ''}.`
    )
  }
  const masked = summary.members.filter(m => m.state === 'masked')
  if (masked.length > 0) {
    parts.push(
      `L’avis de ${joinFrench(masked.map(m => m.displayName))} reste masqué tant que tu n’as pas noté.`
    )
  }
  const missing = summary.members.filter(m => m.state === 'missing')
  if (missing.length > 0 && rated.length > 0) {
    parts.push(
      `En attente de l’avis de ${joinFrench(missing.map(m => m.displayName))}.`
    )
  }
  return parts.join(' ')
}

/** L'onglet d'un point de la Synthèse né des avis : la Synthèse elle-même, section « Nos avis ». */
export interface OpinionHighlight {
  key: string
  text: string
  tab: 'synthese'
  section: 'opinions'
}

/** « Vous aimez tous les deux », « Vous aimez tous », « Vous aimez ». */
function youLike(count: number): string {
  return count === 1
    ? 'Vous aimez'
    : count === 2
      ? 'Vous aimez tous les deux'
      : 'Vous aimez tous'
}

/**
 * Les points de la Synthèse nés des avis visibles : « Ce qui plaît » quand
 * un critère est noté au moins « bien » par tous (tous les avis visibles) ;
 * « À surveiller » quand quelqu'un a noté un critère « rédhibitoire », puis
 * pour les désaccords (hors critères déjà cités comme rédhibitoires).
 */
export function opinionHighlights(summary: OpinionSummary | null | undefined): {
  good: OpinionHighlight[]
  watch: OpinionHighlight[]
} {
  const good: OpinionHighlight[] = []
  const watch: OpinionHighlight[] = []
  if (!summary) return { good, watch }
  const at = { tab: 'synthese' as const, section: 'opinions' as const }

  if (summary.status === 'ready' || summary.status === 'none') {
    const liked = summary.rows
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          row.common &&
          row.scores.every(s => (s.score as number) >= OPINION_LIKED_MIN)
      )
      .sort(
        (a, b) =>
          (b.row.mean as number) - (a.row.mean as number) || a.index - b.index
      )
      .map(({ row }) => row)
    if (liked.length > 0) {
      const shown = liked.slice(0, OPINION_SENTENCE_MAX)
      good.push({
        key: 'opinions_liked',
        text: `${youLike(summary.members.length)} : ${shown
          .map(
            r =>
              `${criterionLower(r.label)} (${joinFrench(r.scores.map(s => String(s.score)))})`
          )
          .join(', ')}`,
        ...at,
      })
    }
  }

  const dealbreakers = summary.rows.filter(r =>
    r.scores.some(s => s.score === OPINION_DEALBREAKER)
  )
  if (dealbreakers.length > 0) {
    const shown = dealbreakers.slice(0, OPINION_SENTENCE_MAX)
    watch.push({
      key: 'opinions_dealbreaker',
      text: `Noté rédhibitoire : ${joinFrench(
        shown.map(
          r =>
            `${criterionInSentence(r)} (${joinFrench(
              r.scores
                .filter(s => s.score === OPINION_DEALBREAKER)
                .map(s => nameOf(summary, s.memberId))
            )})`
        )
      )}`,
      ...at,
    })
  }
  const cited = new Set(dealbreakers.map(r => r.key))
  const disagreements = summary.disagreementKeys.filter(k => !cited.has(k))
  if (disagreements.length > 0) {
    watch.push({
      key: 'opinions_disagreement',
      text: `Vous n’êtes pas d’accord sur ${disagreementList(summary, disagreements)}`,
      ...at,
    })
  }
  return { good, watch }
}

/** La prochaine étape « À rediscuter » : les désaccords et leur écart. */
export function opinionNextStepText(
  summary: OpinionSummary | null | undefined
): string | null {
  if (!summary || summary.disagreementKeys.length === 0) return null
  const keys = summary.disagreementKeys
  const shown = keys
    .slice(0, 2)
    .map(k => criterionInSentence(rowOf(summary, k)))
  const more = keys.length - shown.length
  const list =
    more > 0
      ? `${shown.join(', ')} et ${more} autre${more > 1 ? 's' : ''}`
      : joinFrench(shown)
  const gaps = keys.map(k => rowOf(summary, k).gap as number)
  const low = Math.min(...gaps)
  const high = Math.max(...gaps)
  const gapText = low === high ? `${low} points` : `${low} à ${high} points`
  return `${capitalizeFirst(list)} : vos notes s’écartent de ${gapText}`
}

/** Le texte du bouton de contre-visite (« À revoir à la contre-visite : le calme »). */
export function counterVisitLabel(
  criterion: Pick<OpinionCriterionLike, 'key' | 'label'>
): string {
  return `À revoir à la contre-visite : ${criterionInSentence(criterion)}`
}

/**
 * La tâche proposée pour un désaccord (jamais créée d'office : le membre la
 * confirme) : le titre, et le contexte des notes et des mots de chacun.
 */
export function counterVisitTask(
  summary: OpinionSummary,
  key: string
): { label: string; details: string } | null {
  const row = summary.rows.find(r => r.key === key)
  if (!row || row.agreement !== 'disagree') return null
  const parts = row.scores
    .filter(s => s.score !== null)
    .map(
      s =>
        `${nameOf(summary, s.memberId)} ${s.score}${s.word ? ` (« ${s.word} »)` : ''}`
    )
  const details = `Vos notes s’écartent de ${row.gap} points : ${parts.join(', ')}.`
  return {
    label: counterVisitLabel(row),
    details:
      details.length > TASK_DETAILS_MAX
        ? `${details.slice(0, TASK_DETAILS_MAX - 1)}…`
        : details,
  }
}

/**
 * La meilleure note commune d'une ligne de comparaison : les positions des
 * valeurs les plus hautes, s'il y a au moins deux valeurs et qu'elles ne
 * sont pas toutes égales.
 */
export function bestCommonIndexes(
  values: readonly (number | null)[]
): number[] {
  const known = values
    .map((value, index) => ({ value, index }))
    .filter((v): v is { value: number; index: number } => v.value !== null)
  if (known.length < 2) return []
  const top = Math.max(...known.map(v => v.value))
  const best = known.filter(v => v.value === top)
  return best.length === known.length ? [] : best.map(v => v.index)
}

/**
 * Les désaccords d'un avis qu'on écrit avec chacun des autres avis notés
 * (journal : « Deux désaccords avec Richard : calme, on s'y voit »).
 */
export function disagreementsWith(
  mine: Pick<OpinionLike, 'scores'>,
  others: readonly Pick<OpinionLike, 'memberId' | 'scores'>[],
  visibleKeys: ReadonlySet<string>
): Array<{ memberId: string; keys: string[] }> {
  const myScores = new Map(
    ratedScores(mine, visibleKeys).map(s => [s.key, s.score])
  )
  const order = [...visibleKeys]
  return others.map(other => ({
    memberId: other.memberId,
    keys: ratedScores(other, visibleKeys)
      .filter(s => {
        const own = myScores.get(s.key)
        return (
          own !== undefined &&
          Math.abs(own - s.score) >= OPINION_DISAGREEMENT_GAP
        )
      })
      .map(s => s.key)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  }))
}
