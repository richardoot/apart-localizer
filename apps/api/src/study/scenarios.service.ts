import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ActivityChannel,
  Scenario as ScenarioDto,
  ScenarioComparison,
  ScenarioEvaluateRequest,
  ScenarioInput,
  ScenarioListQuery,
  ScenarioUpdate,
} from '@apart/contracts'
import { mergeScenarioOverrides } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import type { Member, Prisma } from '../generated/prisma'
import { StudyService } from './study.service'
import { toScenarioDto } from './study.mapper'

/**
 * Scénarios « et si » enregistrés (besoin E4) : nom, surcharges, annonce ou
 * espace. Chaque écriture est journalisée ; la suppression n'existe qu'en
 * REST (le MCP n'a aucun outil de suppression).
 */
@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly study: StudyService
  ) {}

  /** Les scénarios de l'espace ; avec `listingId`, ceux de l'annonce et ceux d'espace. */
  async list(
    member: Member,
    query: ScenarioListQuery = {}
  ): Promise<ScenarioDto[]> {
    const rows = await this.prisma.scenario.findMany({
      where: {
        workspaceId: member.workspaceId,
        ...(query.listingId
          ? { OR: [{ listingId: query.listingId }, { listingId: null }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toScenarioDto)
  }

  async get(member: Member, id: string): Promise<ScenarioDto> {
    const row = await this.prisma.scenario.findFirst({
      where: { id, workspaceId: member.workspaceId },
    })
    if (!row) throw new NotFoundException('Scénario introuvable')
    return toScenarioDto(row)
  }

  async create(
    member: Member,
    input: ScenarioInput,
    channel: ActivityChannel = 'web'
  ): Promise<ScenarioDto> {
    if (input.listingId) await this.ensureListing(member, input.listingId)
    const row = await this.prisma.$transaction(async tx => {
      const created = await tx.scenario.create({
        data: {
          workspaceId: member.workspaceId,
          listingId: input.listingId,
          name: input.name,
          overrides: input.overrides as Prisma.InputJsonValue,
          notes: input.notes,
          createdById: member.id,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: input.listingId,
          actorMemberId: member.id,
          channel,
          action: 'scenario.created',
          after: {
            id: created.id,
            name: input.name,
            overrides: input.overrides,
          },
        },
        tx
      )
      return created
    })
    return toScenarioDto(row)
  }

  async update(
    member: Member,
    id: string,
    update: ScenarioUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<ScenarioDto> {
    const current = await this.get(member, id)
    if (
      update.expectedUpdatedAt !== undefined &&
      Date.parse(update.expectedUpdatedAt) !== Date.parse(current.updatedAt)
    ) {
      throw new ConflictException(
        `Le scénario a changé depuis ta lecture (modifié le ${current.updatedAt}) : relis-le`
      )
    }
    const { expectedUpdatedAt: _guard, ...patch } = update
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Aucun champ à modifier')
    }
    const row = await this.prisma.$transaction(async tx => {
      const saved = await tx.scenario.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.overrides !== undefined
            ? { overrides: patch.overrides as Prisma.InputJsonValue }
            : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: current.listingId,
          actorMemberId: member.id,
          channel,
          action: 'scenario.updated',
          before: { name: current.name, overrides: current.overrides },
          after: patch,
        },
        tx
      )
      return saved
    })
    return toScenarioDto(row)
  }

  /** Suppression (application web seulement), journalisée. */
  async remove(member: Member, id: string): Promise<void> {
    const current = await this.get(member, id)
    await this.prisma.$transaction(async tx => {
      await tx.scenario.delete({ where: { id } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: current.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'scenario.deleted',
          before: { id, name: current.name, overrides: current.overrides },
        },
        tx
      )
    })
  }

  /**
   * Évalue un scénario sur une annonce, sans rien enregistrer : un scénario
   * enregistré (de l'annonce ou d'espace), complété des surcharges données,
   * ou des surcharges seules.
   */
  async evaluate(
    member: Member,
    listingId: string,
    request: ScenarioEvaluateRequest
  ): Promise<ScenarioComparison> {
    let saved: ScenarioDto | null = null
    if (request.scenarioId) {
      saved = await this.get(member, request.scenarioId)
      if (saved.listingId !== null && saved.listingId !== listingId) {
        throw new BadRequestException(
          `Le scénario « ${saved.name} » appartient à une autre annonce`
        )
      }
    }
    const overrides = mergeScenarioOverrides(
      saved?.overrides ?? {},
      request.overrides
    )
    return this.study.compare(member, listingId, overrides, {
      id: saved?.id ?? null,
      name: saved?.name ?? null,
    })
  }

  private async ensureListing(
    member: Member,
    listingId: string
  ): Promise<void> {
    const found = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!found) throw new NotFoundException('Annonce introuvable')
  }
}
