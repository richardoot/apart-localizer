import { Injectable } from '@nestjs/common'
import {
  AssumptionsOverrideSchema,
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  AssumptionsUpdate,
  AssumptionsVersion as AssumptionsVersionDto,
} from '@apart/contracts'
import { mergeAssumptions } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import type { AssumptionsVersion, Member } from '../generated/prisma'

/**
 * Hypothèses globales de l'espace, versionnées : chaque modification ajoute
 * une ligne datée, la plus récente est en vigueur. Un espace sans hypothèses
 * reçoit celles de l'artefact à la première lecture.
 */
@Injectable()
export class AssumptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async current(workspaceId: string): Promise<AssumptionsVersionDto> {
    const latest = await this.prisma.assumptionsVersion.findFirst({
      where: { workspaceId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    if (latest) return toDto(latest)
    const created = await this.prisma.assumptionsVersion.create({
      data: {
        workspaceId,
        label: 'Hypothèses par défaut',
        values: DEFAULT_ASSUMPTIONS,
      },
    })
    return toDto(created)
  }

  /** The values in force, as the domain wants them. */
  async currentValues(workspaceId: string): Promise<Assumptions> {
    return (await this.current(workspaceId)).values
  }

  /** The values in force for one listing: the workspace's, overridden field by field. */
  async forListing(
    workspaceId: string,
    override: unknown
  ): Promise<Assumptions> {
    const base = await this.currentValues(workspaceId)
    const parsed = AssumptionsOverrideSchema.nullable().safeParse(
      override ?? null
    )
    return mergeAssumptions(base, parsed.success ? parsed.data : null)
  }

  async history(workspaceId: string): Promise<AssumptionsVersionDto[]> {
    const versions = await this.prisma.assumptionsVersion.findMany({
      where: { workspaceId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    return versions.map(toDto)
  }

  async update(
    member: Member,
    update: AssumptionsUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<AssumptionsVersionDto> {
    const previous = await this.current(member.workspaceId)
    const created = await this.prisma.$transaction(async tx => {
      const version = await tx.assumptionsVersion.create({
        data: {
          workspaceId: member.workspaceId,
          label: update.label ?? null,
          values: update.values,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'assumptions.updated',
          before: previous.values,
          after: update.values,
        },
        tx
      )
      return version
    })
    return toDto(created)
  }
}

function toDto(version: AssumptionsVersion): AssumptionsVersionDto {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    label: version.label,
    effectiveFrom: version.effectiveFrom.toISOString(),
    createdAt: version.createdAt.toISOString(),
    // Re-parsed so that a version saved before a new default existed still
    // comes out complete.
    values: AssumptionsSchema.parse(version.values),
  }
}
