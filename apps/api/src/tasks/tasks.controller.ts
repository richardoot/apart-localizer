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
import { TaskDto, TaskInputDto, TaskUpdateDto } from './dto/task.dto'

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
    summary: 'Supprime une tâche saisie à la main (jamais la checklist)',
  })
  remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string
  ): Promise<void> {
    return this.tasks.remove(member, id, taskId)
  }
}
