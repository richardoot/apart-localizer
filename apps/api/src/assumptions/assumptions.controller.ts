import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { AssumptionsService } from './assumptions.service'
import {
  AssumptionsUpdateDto,
  AssumptionsVersionDto,
} from './dto/assumptions.dto'

@ApiTags('assumptions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('assumptions')
export class AssumptionsController {
  constructor(private readonly assumptions: AssumptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Hypothèses en vigueur' })
  @ZodResponse({ status: 200, type: AssumptionsVersionDto })
  current(@CurrentMember() member: Member): Promise<AssumptionsVersionDto> {
    return this.assumptions.current(member.workspaceId)
  }

  @Get('history')
  @ApiOperation({ summary: 'Toutes les versions, la plus récente en premier' })
  @ZodResponse({ status: 200, type: [AssumptionsVersionDto] })
  history(@CurrentMember() member: Member): Promise<AssumptionsVersionDto[]> {
    return this.assumptions.history(member.workspaceId)
  }

  @Put()
  @ApiOperation({ summary: 'Enregistre une nouvelle version des hypothèses' })
  @ZodResponse({ status: 200, type: AssumptionsVersionDto })
  update(
    @CurrentMember() member: Member,
    @Body() body: AssumptionsUpdateDto
  ): Promise<AssumptionsVersionDto> {
    return this.assumptions.update(member, body)
  }
}
