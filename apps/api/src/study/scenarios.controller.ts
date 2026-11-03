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
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { ScenariosService } from './scenarios.service'
import {
  ScenarioDto,
  ScenarioInputDto,
  ScenarioListQueryDto,
  ScenarioUpdateDto,
} from './dto/study.dto'

/** Scénarios « et si » enregistrés de l'espace (besoin E4). */
@ApiTags('study')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Get()
  @ApiOperation({
    summary:
      'Scénarios de l’espace ; avec listingId, ceux de l’annonce et ceux d’espace',
  })
  @ZodResponse({ status: 200, type: [ScenarioDto] })
  list(
    @CurrentMember() member: Member,
    @Query() query: ScenarioListQueryDto
  ): Promise<ScenarioDto[]> {
    return this.scenarios.list(member, query)
  }

  @Post()
  @ApiOperation({
    summary: 'Enregistre un scénario (nom, surcharges, annonce ou espace)',
  })
  @ZodResponse({ status: 201, type: ScenarioDto })
  create(
    @CurrentMember() member: Member,
    @Body() body: ScenarioInputDto
  ): Promise<ScenarioDto> {
    return this.scenarios.create(member, body)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifie un scénario ; garde-fou expectedUpdatedAt (409)',
  })
  @ZodResponse({ status: 200, type: ScenarioDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScenarioUpdateDto
  ): Promise<ScenarioDto> {
    return this.scenarios.update(member, id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprime un scénario (journalisé)' })
  async remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.scenarios.remove(member, id)
  }
}
