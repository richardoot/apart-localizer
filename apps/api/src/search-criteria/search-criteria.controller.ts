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
import {
  SearchCriteriaInputDto,
  SearchCriteriaListQueryDto,
  SearchCriteriaPreviewDto,
  SearchCriteriaPreviewRequestDto,
  SearchCriteriaSummaryDto,
  SearchCriteriaUpdateDto,
} from './dto/search-criteria.dto'
import { SearchCriteriaService } from './search-criteria.service'

@ApiTags('search-criteria')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('search-criteria')
export class SearchCriteriaController {
  constructor(private readonly criteria: SearchCriteriaService) {}

  @Get()
  @ApiOperation({
    summary:
      "Critères de recherche de l'espace avec le nombre d'annonces, de nouveautés pour moi et d'annonces localisées sous réserve",
  })
  @ZodResponse({ status: 200, type: [SearchCriteriaSummaryDto] })
  list(
    @CurrentMember() member: Member,
    @Query() query: SearchCriteriaListQueryDto
  ): Promise<SearchCriteriaSummaryDto[]> {
    return this.criteria.list(member, {
      includeArchived: query.includeArchived,
    })
  }

  @Post()
  @ApiOperation({
    summary:
      'Crée un critère : filtres et périmètre (point et rayon, polygone GeoJSON, isochrone Géoplateforme figée en polygone)',
  })
  @ZodResponse({ status: 201, type: SearchCriteriaSummaryDto })
  create(
    @CurrentMember() member: Member,
    @Body() body: SearchCriteriaInputDto
  ): Promise<SearchCriteriaSummaryDto> {
    return this.criteria.create(member, body)
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Aperçu d'un critère sans l'enregistrer : périmètre résolu et annonces retenues",
  })
  @ZodResponse({ status: 200, type: SearchCriteriaPreviewDto })
  preview(
    @CurrentMember() member: Member,
    @Body() body: SearchCriteriaPreviewRequestDto
  ): Promise<SearchCriteriaPreviewDto> {
    return this.criteria.preview(member, body)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un critère et ses compteurs' })
  @ZodResponse({ status: 200, type: SearchCriteriaSummaryDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<SearchCriteriaSummaryDto> {
    return this.criteria.get(member, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Modifie un critère (filtres fusionnés, périmètre remplacé, archivage par active: false) ; garde-fou expectedUpdatedAt (409)',
  })
  @ZodResponse({ status: 200, type: SearchCriteriaSummaryDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SearchCriteriaUpdateDto
  ): Promise<SearchCriteriaSummaryDto> {
    return this.criteria.update(member, id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Supprime un critère et ses entrées (web seulement ; le MCP archive)',
  })
  async remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.criteria.remove(member, id)
  }
}
