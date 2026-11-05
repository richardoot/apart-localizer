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
import {
  ExplorationDetailDto,
  ExplorationListQueryDto,
  ExplorationSummaryDto,
  SearchBriefDto,
  SearchBriefQueryDto,
} from './dto/exploration.dto'
import { ExplorationsService } from './explorations.service'

/**
 * Lot 16 : les explorations des portails par Claude (compte rendu) et le
 * brief (ce que Claude cherche). Le tri et l'enregistrement passent par le
 * MCP (`triage_candidates`, `record_exploration`) ; le serveur ne
 * télécharge jamais une page de portail.
 */
@ApiTags('explorations')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('explorations')
export class ExplorationsController {
  constructor(private readonly explorations: ExplorationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Explorations de l’espace, de la plus récente à la plus ancienne : portails, compteurs, résumé',
  })
  @ZodResponse({ status: 200, type: [ExplorationSummaryDto] })
  list(
    @CurrentMember() member: Member,
    @Query() query: ExplorationListQueryDto
  ): Promise<ExplorationSummaryDto[]> {
    return this.explorations.list(member, query)
  }

  @Get('brief')
  @ApiOperation({
    summary:
      'Ce que Claude cherche : critères actifs marges comprises, zones, portails cochés et liens de recherche (fabriqués sans réseau), annonces déjà suivies ou écartées, dernières explorations',
  })
  @ZodResponse({ status: 200, type: SearchBriefDto })
  brief(
    @CurrentMember() member: Member,
    @Query() query: SearchBriefQueryDto
  ): Promise<SearchBriefDto> {
    return this.explorations.brief(member, query.criteriaId)
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Compte rendu d’une exploration : bilan par portail (bloqué compris) et une ligne par annonce lue (à valider, déjà suivie, déjà écartée, hors critères)',
  })
  @ZodResponse({ status: 200, type: ExplorationDetailDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ExplorationDetailDto> {
    return this.explorations.get(member, id)
  }
}

/** Le brief d'un critère, sur la page Critères. */
@ApiTags('search-criteria')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('search-criteria')
export class CriteriaBriefController {
  constructor(private readonly explorations: ExplorationsService) {}

  @Get(':id/brief')
  @ApiOperation({
    summary:
      'Ce que Claude cherche pour ce critère : seuils marge comprise, zones, portails et liens de recherche, dernières explorations',
  })
  @ZodResponse({ status: 200, type: SearchBriefDto })
  brief(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<SearchBriefDto> {
    return this.explorations.brief(member, id)
  }
}
