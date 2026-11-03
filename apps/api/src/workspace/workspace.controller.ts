import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { WorkspaceService } from './workspace.service'
import { WorkspaceMeDto } from './dto/workspace.dto'

@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  @ApiOperation({
    summary: "L'espace de travail du membre connecté et ses membres",
  })
  @ZodResponse({ status: 200, type: WorkspaceMeDto })
  me(@CurrentMember() member: Member): Promise<WorkspaceMeDto> {
    return this.workspace.me(member)
  }
}
