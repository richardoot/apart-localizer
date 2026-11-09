import { Injectable } from '@nestjs/common'
import type { DecisionSettingsUpdate, WorkspaceMe } from '@apart/contracts'
import { ownerRefusal } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import { refusalException } from '../workspace/members.service'
import { WorkspaceService } from '../workspace/workspace.service'
import type { Member } from '../generated/prisma'

/**
 * Lot 21 (ADR 0031) : le réglage d'espace « Décider à plusieurs ». Réservé
 * aux propriétaires, journalisé, lisible par tous (`GET /workspace`). Le
 * désactiver laisse les propositions déjà ouvertes : elles se résolvent
 * normalement.
 */
@Injectable()
export class DecisionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly workspace: WorkspaceService
  ) {}

  async update(
    member: Member,
    update: DecisionSettingsUpdate
  ): Promise<WorkspaceMe> {
    const refusal = ownerRefusal(member, 'changer ce réglage')
    if (refusal) throw refusalException(refusal)
    await this.prisma.$transaction(async tx => {
      const before = await tx.workspace.findUniqueOrThrow({
        where: { id: member.workspaceId },
        select: { decideTogether: true },
      })
      if (before.decideTogether === update.decideTogether) return
      await tx.workspace.update({
        where: { id: member.workspaceId },
        data: { decideTogether: update.decideTogether },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'workspace.decide_together_changed',
          before: { decideTogether: before.decideTogether },
          after: { decideTogether: update.decideTogether },
        },
        tx
      )
    })
    return this.workspace.me(member)
  }
}
