import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { OpinionCriteriaService } from './opinion-criteria.service'
import {
  OpinionCriteriaOrderDto,
  OpinionCriterionCreateDto,
  OpinionCriterionUpdateDto,
  OpinionSettingsDto,
  OpinionSettingsUpdateDto,
} from './dto/opinion.dto'

/**
 * Lot 20 : les critères des avis de l'espace et l'avis à l'aveugle. Tout
 * membre les lit ; seul un propriétaire les règle (403 sinon). Aucune de ces
 * écritures n'existe au MCP.
 */
@ApiTags('opinions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('workspace')
export class OpinionCriteriaController {
  constructor(private readonly criteria: OpinionCriteriaService) {}

  @Get('opinion-criteria')
  @ApiOperation({
    summary:
      "Les critères des avis de l'espace (masqués compris, nombre de notes, retirable), l'avis à l'aveugle, la limite de dix",
  })
  @ZodResponse({ status: 200, type: OpinionSettingsDto })
  settings(@CurrentMember() member: Member): Promise<OpinionSettingsDto> {
    return this.criteria.settings(member)
  }

  @Patch('opinion-settings')
  @ApiOperation({
    summary: "Active ou désactive l'avis à l'aveugle (propriétaire)",
  })
  @ZodResponse({ status: 200, type: OpinionSettingsDto })
  setBlind(
    @CurrentMember() member: Member,
    @Body() body: OpinionSettingsUpdateDto
  ): Promise<OpinionSettingsDto> {
    return this.criteria.setBlind(member, body)
  }

  @Post('opinion-criteria')
  @ApiOperation({
    summary:
      'Ajoute un critère (propriétaire) ; clé générée ; dix critères au plus, masqués compris',
  })
  @ZodResponse({ status: 201, type: OpinionSettingsDto })
  add(
    @CurrentMember() member: Member,
    @Body() body: OpinionCriterionCreateDto
  ): Promise<OpinionSettingsDto> {
    return this.criteria.add(member, body)
  }

  @Put('opinion-criteria/order')
  @ApiOperation({
    summary: 'Change l’ordre des critères (propriétaire) : toutes les clés',
  })
  @ZodResponse({ status: 200, type: OpinionSettingsDto })
  reorder(
    @CurrentMember() member: Member,
    @Body() body: OpinionCriteriaOrderDto
  ): Promise<OpinionSettingsDto> {
    return this.criteria.reorder(member, body)
  }

  @Patch('opinion-criteria/:key')
  @ApiOperation({
    summary:
      'Renomme, change l’aide, masque ou réaffiche un critère (propriétaire) ; renommer garde les notes',
  })
  @ZodResponse({ status: 200, type: OpinionSettingsDto })
  update(
    @CurrentMember() member: Member,
    @Param('key') key: string,
    @Body() body: OpinionCriterionUpdateDto
  ): Promise<OpinionSettingsDto> {
    return this.criteria.update(member, key, body)
  }

  @Delete('opinion-criteria/:key')
  @ApiOperation({
    summary:
      'Retire un critère ajouté jamais noté (propriétaire) ; un critère par défaut ou noté se masque',
  })
  @ZodResponse({ status: 200, type: OpinionSettingsDto })
  remove(
    @CurrentMember() member: Member,
    @Param('key') key: string
  ): Promise<OpinionSettingsDto> {
    return this.criteria.remove(member, key)
  }
}
