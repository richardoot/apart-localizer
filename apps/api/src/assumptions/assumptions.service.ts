import { ConflictException, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
  ACTIVE_LISTING_STATUSES,
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  AssumptionsImpact,
  AssumptionsUpdate,
  AssumptionsUpdateResult,
  AssumptionsVersion as AssumptionsVersionDto,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { CriteriaMatchService } from '../listings/criteria-match.service'
import { listingInclude, toListingDto } from '../listings/listing.mapper'
import type { AssumptionsVersion, Member } from '../generated/prisma'
import { assumptionsImpact } from './impact'
import { RENTAL_CONTEXT_REFRESHER } from './rental-context'
import type { RentalContextRefresher } from './rental-context'

/**
 * Hypothèses globales de l'espace, versionnées : chaque modification ajoute
 * une ligne datée, la plus récente est en vigueur. Un espace sans hypothèses
 * reçoit celles de l'artefact à la première lecture.
 */
@Injectable()
export class AssumptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly criteriaFit: CriteriaMatchService,
    private readonly moduleRef: ModuleRef
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

  async history(workspaceId: string): Promise<AssumptionsVersionDto[]> {
    const versions = await this.prisma.assumptionsVersion.findMany({
      where: { workspaceId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    return versions.map(toDto)
  }

  /**
   * Nouvelle version. `expectedVersion` est le garde-fou optimiste : si une
   * autre version a été enregistrée depuis la lecture, rien n'est écrit. La
   * réponse porte l'impact sur les annonces actives (verdicts qui changent)
   * et, le verdict étant un filtre des critères, l'adéquation recalculée
   * (lot 14, sans alerte : ce n'est pas l'annonce qui a bougé).
   */
  async update(
    member: Member,
    update: AssumptionsUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<AssumptionsUpdateResult> {
    const previous = await this.current(member.workspaceId)
    if (
      update.expectedVersion !== undefined &&
      update.expectedVersion !== previous.id
    ) {
      throw new ConflictException(
        `Les hypothèses ont changé depuis votre lecture (version en vigueur : « ${previous.label ?? 'sans libellé'} », ${previous.id}) : relisez-les avant de les modifier`
      )
    }
    const impact = await this.impact(
      member.workspaceId,
      previous.values,
      update.values
    )
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
          after: {
            ...update.values,
            impact: {
              total: impact.total,
              changedVerdicts: impact.changedVerdicts,
              changes: impact.changes.map(c => c.listingId),
            },
          },
        },
        tx
      )
      return version
    })
    await this.refreshRentalContext(
      member,
      previous.values,
      AssumptionsSchema.parse(created.values),
      channel
    )
    const active = await this.prisma.searchCriteria.count({
      where: { workspaceId: member.workspaceId, active: true },
    })
    const criteriaFit = active
      ? (
          await this.criteriaFit.refresh(member.workspaceId, {
            origin: { cause: 'assumptions' },
            actorMemberId: member.id,
            channel,
            base: AssumptionsSchema.parse(created.values),
          })
        ).summary
      : null
    return { ...toDto(created), impact, criteriaFit }
  }

  /**
   * Lot 19 : l'année et le type de location se règlent pour tout l'espace ;
   * le plafond d'encadrement d'une annonce dépend du type (vide ou meublé) et
   * l'arrêté de l'année. Quand l'un d'eux change, l'instantané open data des
   * annonces qui ont une phase 2 est recalculé (plafond posé d'office
   * compris), comme à la modification d'une annonce. Aucun appel réseau : les
   * données ouvertes sont celles importées en base.
   */
  private async refreshRentalContext(
    member: Member,
    before: Assumptions,
    after: Assumptions,
    channel: ActivityChannel
  ): Promise<void> {
    if (
      before.leaseType === after.leaseType &&
      before.rentalYear === after.rentalYear
    ) {
      return
    }
    const enrichment = this.moduleRef.get<RentalContextRefresher>(
      RENTAL_CONTEXT_REFRESHER,
      { strict: false }
    )
    const rows = await this.prisma.listing.findMany({
      where: { workspaceId: member.workspaceId, rentalPlan: { isNot: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    for (const row of rows) {
      await enrichment.enrich(member, row.id, { dpe: false, channel })
    }
  }

  /** Impact d'hypothèses candidates sur les annonces actives, sans rien enregistrer. */
  async preview(
    workspaceId: string,
    values: Assumptions
  ): Promise<AssumptionsImpact> {
    const current = await this.currentValues(workspaceId)
    return this.impact(workspaceId, current, values)
  }

  private async impact(
    workspaceId: string,
    before: Assumptions,
    after: Assumptions
  ): Promise<AssumptionsImpact> {
    const rows = await this.prisma.listing.findMany({
      where: { workspaceId, status: { in: [...ACTIVE_LISTING_STATUSES] } },
      include: listingInclude,
      orderBy: { createdAt: 'asc' },
    })
    return assumptionsImpact(
      rows.map(row => toListingDto(row)),
      before,
      after
    )
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
