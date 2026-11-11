import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { TasksService } from './tasks.service'
import {
  OpenTasksDto,
  TaskDto,
  TaskInputDto,
  TaskUpdateDto,
} from './dto/task.dto'

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "Les tâches de l'annonce, dans l'ordre" })
  @ZodResponse({ status: 200, type: [TaskDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TaskDto[]> {
    return this.tasks.listForListing(member, id)
  }

  @Post()
  @ApiOperation({ summary: 'Ajoute une tâche' })
  @ZodResponse({ status: 201, type: TaskDto })
  create(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TaskInputDto
  ): Promise<TaskDto> {
    return this.tasks.create(member, id, body)
  }

  @Patch(':taskId')
  @ApiOperation({ summary: 'Coche, décoche, renomme ou assigne une tâche' })
  @ZodResponse({ status: 200, type: TaskDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: TaskUpdateDto
  ): Promise<TaskDto> {
    return this.tasks.update(member, id, taskId, body)
  }

  @Delete(':taskId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Supprime une tâche ajoutée par un membre, à la main ou depuis « Nos avis » (jamais la checklist)',
  })
  remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string
  ): Promise<void> {
    return this.tasks.remove(member, id, taskId)
  }
}

/**
 * Lot 23 (ADR 0033) : toutes les tâches ouvertes de l'espace, lues depuis
 * l'accueil. Lecture seule ; une tâche se coche par la route de son annonce.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('tasks')
export class OpenTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('open')
  @ApiOperation({
    summary:
      'Les tâches ouvertes des annonces suivies, par annonce, en retard d’abord',
  })
  @ZodResponse({ status: 200, type: OpenTasksDto })
  open(@CurrentMember() member: Member): Promise<OpenTasksDto> {
    return this.tasks.openAll(member)
  }
}
