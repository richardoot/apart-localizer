import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ActivityChannel,
  Task,
  TaskInput,
  TaskUpdate,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { toTaskDto } from '../listings/listing.mapper'
import type { Member, Task as TaskRow } from '../generated/prisma'

/**
 * Les tâches d'une annonce : la checklist par défaut posée à la création,
 * les tâches saisies à la main, plus tard celles nées d'un champ manquant.
 * Cocher, décocher, renommer, assigner ; supprimer n'est permis qu'aux tâches
 * saisies à la main, et jamais par le MCP.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async listForListing(member: Member, listingId: string): Promise<Task[]> {
    await this.ensureListing(member, listingId)
    const rows = await this.prisma.task.findMany({
      where: { listingId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map(toTaskDto)
  }

  async create(
    member: Member,
    listingId: string,
    input: TaskInput,
    channel: ActivityChannel = 'web'
  ): Promise<Task> {
    await this.ensureListing(member, listingId)
    if (input.assigneeId) await this.ensureMember(member, input.assigneeId)
    const created = await this.prisma.$transaction(async tx => {
      const last = await tx.task.findFirst({
        where: { listingId },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      const task = await tx.task.create({
        data: {
          listingId,
          label: input.label,
          assigneeId: input.assigneeId,
          origin: input.origin,
          position: (last?.position ?? -1) + 1,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'task.created',
          after: {
            taskId: task.id,
            label: task.label,
            origin: task.origin,
            assigneeId: task.assigneeId,
          },
        },
        tx
      )
      return task
    })
    return toTaskDto(created)
  }

  async update(
    member: Member,
    listingId: string,
    taskId: string,
    update: TaskUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<Task> {
    const task = await this.findTask(member, listingId, taskId)
    if (update.assigneeId) await this.ensureMember(member, update.assigneeId)
    const saved = await this.prisma.$transaction(async tx => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          ...(update.label !== undefined ? { label: update.label } : {}),
          ...(update.assigneeId !== undefined
            ? { assigneeId: update.assigneeId }
            : {}),
          ...(update.done !== undefined
            ? { done: update.done, doneAt: update.done ? new Date() : null }
            : {}),
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action:
            update.done === true
              ? 'task.completed'
              : update.done === false
                ? 'task.reopened'
                : 'task.updated',
          before: {
            taskId: task.id,
            done: task.done,
            label: task.label,
            assigneeId: task.assigneeId,
          },
          after: { taskId: task.id, ...update },
        },
        tx
      )
      return next
    })
    return toTaskDto(saved)
  }

  /** REST seulement, et seulement une tâche saisie à la main : la checklist se coche, elle ne s'efface pas. */
  async remove(
    member: Member,
    listingId: string,
    taskId: string,
    channel: ActivityChannel = 'web'
  ): Promise<void> {
    const task = await this.findTask(member, listingId, taskId)
    if (task.origin !== 'manual') {
      throw new BadRequestException(
        'Seules les tâches saisies à la main peuvent être supprimées ; cochez les autres.'
      )
    }
    await this.prisma.$transaction(async tx => {
      await tx.task.delete({ where: { id: task.id } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'task.deleted',
          before: { taskId: task.id, label: task.label, done: task.done },
        },
        tx
      )
    })
  }

  private async findTask(
    member: Member,
    listingId: string,
    taskId: string
  ): Promise<TaskRow> {
    await this.ensureListing(member, listingId)
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, listingId },
    })
    if (!task) throw new NotFoundException('Tâche introuvable')
    return task
  }

  private async ensureListing(
    member: Member,
    listingId: string
  ): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
  }

  private async ensureMember(
    member: Member,
    assigneeId: string
  ): Promise<void> {
    // Un membre actif seulement : ni une invitation en attente, ni un ancien membre.
    const assignee = await this.prisma.member.findFirst({
      where: {
        id: assigneeId,
        workspaceId: member.workspaceId,
        status: 'active',
      },
      select: { id: true },
    })
    if (!assignee) {
      throw new BadRequestException("Le membre assigné n'est pas dans l'espace")
    }
  }
}
