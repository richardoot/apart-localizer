import {
  ExplorationCountsSchema,
  ExplorationDetailSchema,
  ExplorationLineSchema,
  ExplorationPortalRunSchema,
  ExplorationSummarySchema,
} from '@apart/contracts'
import type {
  ExplorationDetail,
  ExplorationLine,
  ExplorationSummary,
} from '@apart/contracts'
import { EMPTY_EXPLORATION_COUNTS, portalBilan } from '@apart/domain'
import { z } from 'zod'
import { num } from '../listings/listing.mapper'
import type { Prisma } from '../generated/prisma'

/** Ce qu'une lecture d'exploration charge avec elle. */
export const explorationInclude = {
  author: { select: { id: true, displayName: true } },
} as const

export const explorationDetailInclude = {
  ...explorationInclude,
  lines: {
    orderBy: { position: 'asc' },
    include: { listing: { select: { id: true, title: true, status: true } } },
  },
} as const

export type ExplorationRow = Prisma.ExplorationGetPayload<{
  include: typeof explorationInclude
}>
export type ExplorationDetailRow = Prisma.ExplorationGetPayload<{
  include: typeof explorationDetailInclude
}>
type LineRow = ExplorationDetailRow['lines'][number]

const CriteriaRefs = z
  .array(z.object({ id: z.string().uuid(), name: z.string() }))
  .catch([])
const PortalRuns = z.array(ExplorationPortalRunSchema).catch([])
const Counts = ExplorationCountsSchema.catch({ ...EMPTY_EXPLORATION_COUNTS })
const Reasons = z.array(z.string()).catch([])

/** Une exploration sans ses lignes. */
export function toExplorationSummary(row: ExplorationRow): ExplorationSummary {
  return ExplorationSummarySchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    author: row.author
      ? { id: row.author.id, displayName: row.author.displayName }
      : null,
    channel: row.channel,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    criteria: CriteriaRefs.parse(row.criteria),
    portals: PortalRuns.parse(row.portals),
    counts: Counts.parse(row.counts),
    summary: row.summary,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  })
}

/** Une ligne du compte rendu. */
export function toExplorationLine(row: LineRow): ExplorationLine {
  return ExplorationLineSchema.parse({
    id: row.id,
    position: row.position,
    url: row.url,
    portal: row.portal,
    title: row.title,
    price: num(row.price),
    surface: num(row.surface),
    rooms: row.rooms,
    commune: row.commune,
    district: row.district,
    outcome: row.outcome,
    why: row.why,
    reasons: Reasons.parse(row.reasons),
    level: row.level,
    listing: row.listing ?? null,
    draftId: row.draftId,
    excerpt: row.excerpt,
  })
}

/** Le compte rendu complet : lignes et bilan par portail. */
export function toExplorationDetail(
  row: ExplorationDetailRow
): ExplorationDetail {
  const summary = toExplorationSummary(row)
  const lines = row.lines.map(toExplorationLine)
  return ExplorationDetailSchema.parse({
    ...summary,
    lines,
    bilan: portalBilan(summary.portals, lines),
    outDigest: row.outDigest,
  })
}
