import { OPINION_SCORE_LABELS } from '@apart/contracts'
import type {
  EvaluatedListing,
  McpAddOpinionInput,
  OpinionScoreLevel,
  OpinionScoresInput,
  OpinionSummary,
} from '@apart/contracts'
import {
  comparableLabel,
  criteriaCountText,
  criterionLower,
  formatActivityDate,
  formatOpinionAverage,
  joinFrench,
  resolveOpinionCriterion,
  visibleOpinionCriteria,
} from '@apart/domain'
import type { Member } from '../generated/prisma'
import type { ListingsService } from '../listings/listings.service'
import type { OpinionsService } from '../opinions/opinions.service'
import { dataResult, refusal } from './tool-results'
import type { ToolResult } from './tool-results'

/**
 * Lot 20 (ADR 0030) : les avis au connecteur. `add_opinion` n'enregistre que
 * des notes dictées, pour le membre connecté : un autre membre est refusé ;
 * un critère se désigne par sa clé ou son libellé dans l'espace. Les
 * lectures disent ce que ce membre voit (avis à l'aveugle compris) : la
 * confrontation de `domain`, jamais une note masquée.
 */

/** « 4 (bien) », « — ». */
function scoreWithWord(score: number | null): string {
  return score === null
    ? '—'
    : `${score} (${OPINION_SCORE_LABELS[score as OpinionScoreLevel]})`
}

/** Une ligne courte pour une liste ou une comparaison ; null si personne n'a noté. */
export function describeOpinionsShort(
  summary: OpinionSummary | null
): string | null {
  if (!summary || summary.status === 'empty') return null
  const waiting = summary.members
    .filter(m => m.state !== 'rated')
    .map(m =>
      m.state === 'masked' ? `${m.displayName} (masqué)` : m.displayName
    )
  const disagreements = summary.disagreementKeys.map(k =>
    criterionLower(summary.rows.find(r => r.key === k)?.label ?? k)
  )
  const parts: string[] = []
  if (summary.commonScore !== null) {
    parts.push(`note commune ${formatOpinionAverage(summary.commonScore)}`)
  } else if (summary.status === 'pending') {
    parts.push(`en attente de ${joinFrench(waiting)}`)
  } else {
    parts.push('aucun critère noté par tous')
  }
  if (disagreements.length) {
    parts.push(
      `${disagreements.length} désaccord${disagreements.length > 1 ? 's' : ''} (${disagreements.join(', ')})`
    )
  }
  return `avis : ${parts.join(', ')}`
}

/** Les avis d'une annonce pour get_listing : chaque membre, le bilan, le détail par critère. */
export function describeOpinions(item: EvaluatedListing): string {
  const summary = item.opinionSummary
  if (!summary) return 'Avis : non disponibles.'
  const lines = summary.members.map(m => {
    const visit = m.afterVisit
      ? `, après la visite du ${formatActivityDate(m.afterVisit.visitedAt.slice(0, 10))}`
      : ''
    if (m.state === 'masked') {
      return `  - ${m.displayName} : a noté ${criteriaCountText(m.ratedCount)} sur ${m.criteriaCount}${visit} — masqué tant que le membre connecté n'a pas noté (« Voir quand même » dans l'application)`
    }
    if (m.state === 'missing') {
      return `  - ${m.displayName} : pas encore noté`
    }
    const opinion = item.opinions.find(o => o.memberId === m.memberId)
    const seen = m.seenBefore.length
      ? `, après avoir vu celui de ${joinFrench(m.seenBefore)}`
      : ''
    return `  - ${m.displayName} : ${m.rating ? `${m.rating}/5` : 'sans note globale'}, critères ${formatOpinionAverage(m.average)} en moyenne (${m.ratedCount} sur ${m.criteriaCount})${visit}${seen}${opinion?.text ? ` — « ${opinion.text} »` : ''}`
  })
  const rated = summary.members.filter(m => m.state === 'rated')
  const rows = summary.rows
    .filter(r => r.scores.some(s => s.score !== null))
    .map(r => {
      const scores = rated
        .map(m => {
          const s = r.scores.find(x => x.memberId === m.memberId)
          return `${m.displayName} ${s?.score ?? '—'}${s?.word ? ` « ${s.word} »` : ''}`
        })
        .join(', ')
      const gap =
        r.gap === null
          ? ''
          : r.agreement === 'disagree'
            ? ` — désaccord de ${r.gap} points`
            : r.gap === 0
              ? ' — d’accord'
              : ' — 1 point d’écart'
      return `  - ${r.label} : ${scores}${gap}`
    })
  return [
    `Avis${summary.masked ? ' (à l’aveugle : certains sont masqués)' : ''} :`,
    ...lines,
    `Bilan : ${summary.sentence}`,
    summary.commonScore !== null
      ? `Note commune : ${formatOpinionAverage(summary.commonScore)} / 5`
      : summary.status === 'pending'
        ? 'Note commune : en attente'
        : null,
    rows.length ? `Par critère :\n${rows.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Le membre désigné est-il le membre connecté (identifiant court ou prénom) ? */
export function isConnectedMember(
  member: Pick<Member, 'handle' | 'displayName'>,
  who: string
): boolean {
  const wanted = comparableLabel(who)
  return (
    wanted === comparableLabel(member.handle) ||
    wanted === comparableLabel(member.displayName) ||
    ['moi', 'me', 'myself'].includes(wanted)
  )
}

/** L'outil `add_opinion` : notes dictées par le membre connecté, fusionnées. */
export async function addOpinion(
  ctx: {
    member: Member
    opinions: OpinionsService
    listings: ListingsService
  },
  input: McpAddOpinionInput
): Promise<ToolResult> {
  const me = ctx.member
  if (input.member && !isConnectedMember(me, input.member)) {
    return refusal(
      `Refusé : Claude n'enregistre que l'avis du membre connecté (${me.displayName}) ; « ${input.member} » donne le sien lui-même, dans l'application ou depuis sa propre conversation.`
    )
  }
  const criteria = input.criteria ?? []
  if (
    input.rating === undefined &&
    input.text === undefined &&
    criteria.length === 0
  ) {
    return refusal(
      'Rien à enregistrer : donnez une note globale (`rating`), une phrase (`text`) ou des notes par critère (`criteria`) dictées par le membre.'
    )
  }
  const opinionContext = await ctx.opinions.context(me.workspaceId)
  const shown = visibleOpinionCriteria(opinionContext.criteria)
  const scores: OpinionScoresInput = {}
  const said: string[] = []
  for (const entry of criteria) {
    const criterion = resolveOpinionCriterion(
      opinionContext.criteria,
      entry.criterion
    )
    if (!criterion) {
      return refusal(
        `Refusé : aucun critère « ${entry.criterion} » dans l'espace. Critères : ${shown.map(c => `${c.label} (${c.key})`).join(', ')}.`
      )
    }
    if (criterion.hidden) {
      return refusal(
        `Refusé : le critère « ${criterion.label} » est masqué dans l'espace ; un propriétaire peut le réafficher dans « Critères des avis ».`
      )
    }
    scores[criterion.key] = {
      score: entry.score,
      ...(entry.word !== undefined ? { word: entry.word } : {}),
    }
    said.push(
      `${criterionLower(criterion.label)} ${scoreWithWord(entry.score)}${entry.word ? ` « ${entry.word} »` : ''}`
    )
  }
  const opinion = await ctx.opinions.upsert(
    me,
    input.listingId,
    {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      scores,
      ...(input.expectedUpdatedAt !== undefined
        ? { expectedUpdatedAt: input.expectedUpdatedAt }
        : {}),
    },
    'mcp'
  )
  const item = await ctx.listings.get(me, input.listingId)
  const unrated = shown.filter(
    c => !opinion.scores.some(s => s.key === c.key && s.score !== null)
  )
  const summary = [
    `C'est noté pour ${me.displayName} (notes dictées)${said.length ? ` : ${said.join(', ')}` : ''}.`,
    input.rating !== undefined
      ? `Note globale : ${input.rating > 0 ? `${input.rating}/5` : 'aucune'}.`
      : null,
    input.text !== undefined
      ? input.text
        ? `Phrase : « ${input.text} ».`
        : 'Phrase effacée.'
      : null,
    unrated.length
      ? `Sans avis : ${unrated.map(c => criterionLower(c.label)).join(', ')}.`
      : null,
    item.opinionSummary ? `Bilan : ${item.opinionSummary.sentence}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return dataResult(summary, {
    opinion,
    opinionSummary: item.opinionSummary,
  })
}
