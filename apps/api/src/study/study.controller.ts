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
import { ComplianceService } from './compliance.service'
import { RentComparablesService } from './rent-comparables.service'
import { ScenariosService } from './scenarios.service'
import { StudyService } from './study.service'
import {
  ComplianceReportDto,
  OccupancyReportDto,
  ProjectionQueryDto,
  ProjectionReportDto,
  RentComparableInputDto,
  RentComparableListDto,
  RentComparableUpdateDto,
  RentComparableWriteResultDto,
  ScenarioComparisonDto,
  ScenarioEvaluateRequestDto,
} from './dto/study.dto'

/**
 * L'étude d'une annonce dans le temps (lot 5) : phase 1, projection
 * fiscale et revente, scénarios « et si », loyer de marché par comparables,
 * checklist réglementaire. Routes sous `/listings/:id/…`.
 */
@ApiTags('study')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings')
export class StudyController {
  constructor(
    private readonly study: StudyService,
    private readonly scenarios: ScenariosService,
    private readonly comparables: RentComparablesService,
    private readonly compliance: ComplianceService
  ) {}

  @Get(':id/occupancy')
  @ApiOperation({
    summary:
      "Coût d'occupation en phase 1 : mensualité, assurance, charges, taxe foncière, entretien, comparés au loyer actuel ; capital remboursé et coût réel ; date de bascule en phase 2",
  })
  @ZodResponse({ status: 200, type: OccupancyReportDto })
  occupancy(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OccupancyReportDto> {
    return this.study.occupancy(member, id)
  }

  @Get(':id/projection')
  @ApiOperation({
    summary:
      'Projection annuelle jusqu’à la revente : loyers indexés, charges, impôt estimé du régime (micro-foncier, réel, micro-BIC, LMNP réel), mensualités, capital restant dû, plus-value, TRI, VAN, comparaison des régimes. Estimation, pas un conseil fiscal.',
  })
  @ZodResponse({ status: 200, type: ProjectionReportDto })
  projection(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ProjectionQueryDto
  ): Promise<ProjectionReportDto> {
    return this.study.projection(member, id, query)
  }

  @Post(':id/scenarios/evaluate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Évalue un scénario « et si » (enregistré ou surcharges) contre la base : indicateurs, écarts, verdicts ; rien n’est enregistré',
  })
  @ZodResponse({ status: 200, type: ScenarioComparisonDto })
  evaluateScenario(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScenarioEvaluateRequestDto
  ): Promise<ScenarioComparisonDto> {
    return this.scenarios.evaluate(member, id, body)
  }

  @Get(':id/compliance')
  @ApiOperation({
    summary:
      'Checklist réglementaire datée à la date de mise en location prévue (DPE, encadrement, permis de louer, diagnostics, décence, meublé) et risques Géorisques à l’adresse',
  })
  @ZodResponse({ status: 200, type: ComplianceReportDto })
  complianceReport(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ComplianceReportDto> {
    return this.compliance.compliance(member, id)
  }

  @Get(':id/rent-comparables')
  @ApiOperation({
    summary:
      'Annonces de location comparables saisies et loyer de marché : médiane et quartiles au m², loyer estimé, position du loyer visé et du plafond',
  })
  @ZodResponse({ status: 200, type: RentComparableListDto })
  listComparables(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<RentComparableListDto> {
    return this.comparables.list(member, id)
  }

  @Post(':id/rent-comparables')
  @ApiOperation({ summary: 'Ajoute une annonce de location comparable' })
  @ZodResponse({ status: 201, type: RentComparableWriteResultDto })
  addComparable(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RentComparableInputDto
  ): Promise<RentComparableWriteResultDto> {
    return this.comparables.create(member, id, body)
  }

  @Patch(':id/rent-comparables/:comparableId')
  @ApiOperation({ summary: 'Modifie une annonce de location comparable' })
  @ZodResponse({ status: 200, type: RentComparableWriteResultDto })
  updateComparable(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('comparableId', ParseUUIDPipe) comparableId: string,
    @Body() body: RentComparableUpdateDto
  ): Promise<RentComparableWriteResultDto> {
    return this.comparables.update(member, id, comparableId, body)
  }

  @Delete(':id/rent-comparables/:comparableId')
  @ApiOperation({
    summary:
      'Supprime une annonce de location comparable (application web seulement, journalisé)',
  })
  @ZodResponse({ status: 200, type: RentComparableListDto })
  removeComparable(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('comparableId', ParseUUIDPipe) comparableId: string
  ): Promise<RentComparableListDto> {
    return this.comparables.remove(member, id, comparableId)
  }
}
