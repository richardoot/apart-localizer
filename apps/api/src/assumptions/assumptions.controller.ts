import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { AssumptionsService } from './assumptions.service'
import {
  AssumptionsImpactDto,
  AssumptionsPreviewRequestDto,
  AssumptionsUpdateDto,
  AssumptionsUpdateResultDto,
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
  @ApiOperation({
    summary:
      'Enregistre une nouvelle version des hypothèses (garde-fou expectedVersion, 409) et rend son impact : annonces dont le verdict change',
  })
  @ZodResponse({ status: 200, type: AssumptionsUpdateResultDto })
  update(
    @CurrentMember() member: Member,
    @Body() body: AssumptionsUpdateDto
  ): Promise<AssumptionsUpdateResultDto> {
    return this.assumptions.update(member, body)
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Impact d’hypothèses candidates sur les annonces actives, sans rien enregistrer',
  })
  @ZodResponse({ status: 200, type: AssumptionsImpactDto })
  preview(
    @CurrentMember() member: Member,
    @Body() body: AssumptionsPreviewRequestDto
  ): Promise<AssumptionsImpactDto> {
    return this.assumptions.preview(member.workspaceId, body.values)
  }
}
