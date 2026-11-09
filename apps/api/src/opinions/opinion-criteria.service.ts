import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OPINION_CRITERIA_MAX } from '@apart/contracts'
import type {
  OpinionCriteriaOrder,
  OpinionCriterionCreate,
  OpinionCriterionUpdate,
  OpinionSettings,
  OpinionSettingsUpdate,
} from '@apart/contracts'
import {
  OPINION_DISAGREEMENT_GAP,
  addCriterionRefusal,
  customCriterionKey,
  defaultOpinionCriteria,
  effectiveOpinionCriteria,
  labelTakenRefusal,
  ownerRefusal,
  removeCriterionRefusal,
  reorderRefusal,
} from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { refusalException } from '../workspace/members.service'
import type { Member, Prisma } from '../generated/prisma'

const CHANNEL = 'web' as const

/**
 * Les critères des avis de l'espace et l'avis à l'aveugle (lot 20, ADR
 * 0030). Un espace sans ligne a les huit critères par défaut ; au premier
 * réglage d'un propriétaire, les huit sont écrits puis le réglage
 * s'applique (même résultat qu'un espace créé avec eux). Renommer garde les
 * notes (la clé ne change pas) ; masquer retire le critère des fiches et des
 * calculs, ses notes restent ; un critère ajouté jamais noté peut être
 * retiré ; dix critères au plus. Seuls les propriétaires règlent ; chaque
 * changement entre au journal. Rien de tout cela au MCP.
 */
@Injectable()
export class OpinionCriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async settings(member: Member): Promise<OpinionSettings> {
    const [workspace, rows, counts] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: member.workspaceId },
        select: { opinionsBlind: true },
      }),
      this.prisma.opinionCriterion.findMany({
        where: { workspaceId: member.workspaceId },
      }),
      this.scoreCounts(this.prisma, member.workspaceId),
    ])
    const criteria = effectiveOpinionCriteria(rows)
    return {
      blind: workspace.opinionsBlind,
      criteria: criteria.map(c => {
        const scoreCount = counts.get(c.key) ?? 0
        return {
          ...c,
          scoreCount,
          removable: removeCriterionRefusal(c, scoreCount) === null,
        }
      }),
      max: OPINION_CRITERIA_MAX,
      disagreementGap: OPINION_DISAGREEMENT_GAP,
      canEdit: ownerRefusal(member, 'régler les critères des avis') === null,
    }
  }

  async setBlind(
    member: Member,
    update: OpinionSettingsUpdate
  ): Promise<OpinionSettings> {
    this.assertOwner(member)
    await this.prisma.$transaction(async tx => {
      const before = await tx.workspace.findUniqueOrThrow({
        where: { id: member.workspaceId },
        select: { opinionsBlind: true },
      })
      if (before.opinionsBlind === update.blind) return
      await tx.workspace.update({
        where: { id: member.workspaceId },
        data: { opinionsBlind: update.blind },
      })
      await this.record(tx, member, 'opinion_settings.blind_changed', {
        before: { blind: before.opinionsBlind },
        after: { blind: update.blind },
      })
    })
    return this.settings(member)
  }

  async add(
    member: Member,
    input: OpinionCriterionCreate
  ): Promise<OpinionSettings> {
    this.assertOwner(member)
    await this.prisma.$transaction(async tx => {
      const rows = await this.materialize(tx, member.workspaceId)
      const refusal = addCriterionRefusal(rows, input.label)
      if (refusal) throw new ConflictException(refusal)
      const key = customCriterionKey(
        input.label,
        rows.map(r => r.key)
      )
      const created = await tx.opinionCriterion.create({
        data: {
          workspaceId: member.workspaceId,
          key,
          label: input.label,
          hint: input.hint,
          position: Math.max(-1, ...rows.map(r => r.position)) + 1,
          origin: 'custom',
        },
      })
      await this.record(tx, member, 'opinion_settings.criterion_added', {
        after: { key: created.key, label: created.label, hint: created.hint },
      })
    })
    return this.settings(member)
  }

  async update(
    member: Member,
    key: string,
    patch: OpinionCriterionUpdate
  ): Promise<OpinionSettings> {
    this.assertOwner(member)
    await this.prisma.$transaction(async tx => {
      const rows = await this.materialize(tx, member.workspaceId)
      const criterion = this.find(rows, key)
      if (patch.label !== undefined && patch.label !== criterion.label) {
        const refusal = labelTakenRefusal(
          rows.filter(r => r.key !== key),
          patch.label
        )
        if (refusal) throw new ConflictException(refusal)
      }
      if (
        patch.hidden === true &&
        !criterion.hidden &&
        rows.filter(r => !r.hidden).length <= 1
      ) {
        throw new ConflictException(
          'Gardez au moins un critère affiché : les avis en ont besoin.'
        )
      }
      const changed = Object.fromEntries(
        Object.entries(patch).filter(
          ([field, value]) =>
            value !== undefined &&
            value !== (criterion as Record<string, unknown>)[field]
        )
      )
      if (Object.keys(changed).length === 0) return
      await tx.opinionCriterion.update({
        where: { id: criterion.id },
        data: changed,
      })
      await this.record(tx, member, 'opinion_settings.criterion_updated', {
        before: {
          key,
          label: criterion.label,
          hint: criterion.hint,
          hidden: criterion.hidden,
        },
        after: changed,
      })
    })
    return this.settings(member)
  }

  async reorder(
    member: Member,
    order: OpinionCriteriaOrder
  ): Promise<OpinionSettings> {
    this.assertOwner(member)
    await this.prisma.$transaction(async tx => {
      const rows = await this.materialize(tx, member.workspaceId)
      const current = [...rows].sort((a, b) => a.position - b.position)
      const refusal = reorderRefusal(
        current.map(r => r.key),
        order.keys
      )
      if (refusal) throw new BadRequestException(refusal)
      if (current.every((r, i) => r.key === order.keys[i])) return
      for (const [position, key] of order.keys.entries()) {
        const row = current.find(r => r.key === key) as (typeof current)[0]
        if (row.position !== position) {
          await tx.opinionCriterion.update({
            where: { id: row.id },
            data: { position },
          })
        }
      }
      const labelOf = (k: string) =>
        (current.find(r => r.key === k) as (typeof current)[0]).label
      await this.record(tx, member, 'opinion_settings.criteria_reordered', {
        before: { labels: current.map(r => r.label) },
        after: { labels: order.keys.map(labelOf) },
      })
    })
    return this.settings(member)
  }

  async remove(member: Member, key: string): Promise<OpinionSettings> {
    this.assertOwner(member)
    await this.prisma.$transaction(async tx => {
      const rows = await this.materialize(tx, member.workspaceId)
      const criterion = this.find(rows, key)
      const counts = await this.scoreCounts(tx, member.workspaceId)
      const refusal = removeCriterionRefusal(criterion, counts.get(key) ?? 0)
      if (refusal) throw new ConflictException(refusal)
      await tx.opinionCriterion.delete({ where: { id: criterion.id } })
      // Les positions restent continues.
      const rest = rows
        .filter(r => r.key !== key)
        .sort((a, b) => a.position - b.position)
      for (const [position, row] of rest.entries()) {
        if (row.position !== position) {
          await tx.opinionCriterion.update({
            where: { id: row.id },
            data: { position },
          })
        }
      }
      await this.record(tx, member, 'opinion_settings.criterion_removed', {
        before: { key, label: criterion.label },
      })
    })
    return this.settings(member)
  }

  private assertOwner(member: Member): void {
    const refusal = ownerRefusal(member, 'régler les critères des avis')
    if (refusal) throw refusalException(refusal)
  }

  private find<T extends { key: string }>(rows: T[], key: string): T {
    const row = rows.find(r => r.key === key)
    if (!row) throw new NotFoundException(`Critère introuvable : « ${key} »`)
    return row
  }

  /**
   * Les lignes des critères de l'espace, écrites d'abord si l'espace n'a
   * encore rien réglé (les huit par défaut). Le verrou de l'espace
   * sérialise deux réglages simultanés (limite de dix, ordre).
   */
  private async materialize(tx: Prisma.TransactionClient, workspaceId: string) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`opinion-criteria:${workspaceId}`}, 0))`
    const rows = await tx.opinionCriterion.findMany({ where: { workspaceId } })
    if (rows.length > 0) return rows
    await tx.opinionCriterion.createMany({
      data: defaultOpinionCriteria().map(c => ({
        workspaceId,
        key: c.key,
        label: c.label,
        hint: c.hint,
        position: c.position,
        hidden: false,
        origin: 'default' as const,
      })),
      skipDuplicates: true,
    })
    return tx.opinionCriterion.findMany({ where: { workspaceId } })
  }

  /** Les notes données par critère dans l'espace (masqués compris). */
  private async scoreCounts(
    db: Prisma.TransactionClient,
    workspaceId: string
  ): Promise<Map<string, number>> {
    const groups = await db.opinionScore.groupBy({
      by: ['criterionKey'],
      where: { opinion: { listing: { workspaceId } } },
      _count: { _all: true },
    })
    return new Map(groups.map(g => [g.criterionKey, g._count._all]))
  }

  private record(
    tx: Prisma.TransactionClient,
    member: Member,
    action: string,
    change: { before?: unknown; after?: unknown }
  ): Promise<void> {
    return this.activity.record(
      {
        workspaceId: member.workspaceId,
        actorMemberId: member.id,
        channel: CHANNEL,
        action,
        before: change.before ?? null,
        after: change.after ?? null,
      },
      tx
    )
  }
}
