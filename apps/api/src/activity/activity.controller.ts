import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { ActivityQueryService } from './activity-query.service'
import {
  ActivityPageDto,
  ActivityQueryDto,
  ClaudeStatusDto,
} from './dto/activity.dto'

@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller()
export class ActivityController {
  constructor(private readonly activity: ActivityQueryService) {}

  @Get('activity')
  @ApiOperation({
    summary:
      "Journal de l'espace : qui, quoi, quand, par quel canal, champs modifiés ; filtres memberId, channel, kind, listingId ; paginé",
  })
  @ZodResponse({ status: 200, type: ActivityPageDto })
  list(
    @CurrentMember() member: Member,
    @Query() query: ActivityQueryDto
  ): Promise<ActivityPageDto> {
    return this.activity.list(member, query)
  }

  @Get('activity/claude')
  @ApiOperation({
    summary:
      'Lot 26 : ce que le journal sait du connecteur Claude (écritures du canal mcp par membre actif, la dernière, la phrase de la page « Claude ») ; une lecture par Claude ne laisse pas de trace',
  })
  @ZodResponse({ status: 200, type: ClaudeStatusDto })
  claude(@CurrentMember() member: Member): Promise<ClaudeStatusDto> {
    return this.activity.claude(member)
  }

  @Get('listings/:id/activity')
  @ApiOperation({ summary: "Journal d'une annonce, paginé" })
  @ZodResponse({ status: 200, type: ActivityPageDto })
  listForListing(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityQueryDto
  ): Promise<ActivityPageDto> {
    return this.activity.list(member, query, id)
  }
}
