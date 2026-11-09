import {
  Body,
  Controller,
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
  ListingDraftAcceptResultDto,
  ListingDraftBatchAcceptDto,
  ListingDraftBatchAcceptResultDto,
  ListingDraftDecisionDto,
  ListingDraftDto,
} from '../inbound/dto/inbound.dto'
import {
  EvaluatedListingDto,
  ListingStatusChangeDto,
} from '../listings/dto/listing.dto'
import { WorkspaceMeDto } from '../workspace/dto/workspace.dto'
import { DecisionSettingsService } from './decision-settings.service'
import { DecisionsService } from './decisions.service'
import {
  DecisionCardDto,
  DecisionInputDto,
  DecisionRespondDto,
  DecisionResultDto,
  DecisionSessionResultDto,
  DecisionSettingsUpdateDto,
  DecisionSettleDto,
  WorkflowOverviewDto,
} from './dto/decisions.dto'

/**
 * Lot 21 (ADR 0031) : les décisions à plusieurs. Le contrôleur est mince :
 * tout passe par `DecisionsService`, les règles sont dans `domain`.
 */
@ApiTags('decisions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      "Compteurs des étapes, « Ce qui t'attend » du membre connecté et propositions en cours",
  })
  @ZodResponse({ status: 200, type: WorkflowOverviewDto })
  overview(@CurrentMember() member: Member): Promise<WorkflowOverviewDto> {
    return this.decisions.overview(member)
  }

  @Get('cards')
  @ApiOperation({
    summary:
      'Les propositions à confirmer par le membre (kind=confirm) ou à trancher ensemble (kind=settle), avec ce qu’elles visent',
  })
  @ZodResponse({ status: 200, type: [DecisionCardDto] })
  cards(
    @CurrentMember() member: Member,
    @Query('kind') kind?: string
  ): Promise<DecisionCardDto[]> {
    return this.decisions.cards(
      member,
      kind === 'settle' ? 'settle' : 'confirm'
    )
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Garder ou écarter un brouillon, passer une annonce À visiter, écarter une annonce : une proposition si l’espace décide à plusieurs, sinon appliqué tout de suite',
  })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  decide(
    @CurrentMember() member: Member,
    @Body() body: DecisionInputDto
  ): Promise<DecisionResultDto> {
    return this.decisions.decide(member, body)
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Termine une session de tri : une seule notification, s’il y a au moins une proposition ou une réponse pas encore annoncée',
  })
  @ZodResponse({ status: 200, type: DecisionSessionResultDto })
  finish(
    @CurrentMember() member: Member,
    @Param('sessionId', ParseUUIDPipe) sessionId: string
  ): Promise<DecisionSessionResultDto> {
    return this.decisions.finishSession(member, sessionId)
  }

  @Post('sessions/:sessionId/decide-now')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '« Décider sans attendre » : applique tous les choix ouverts de la session, journalisé avec cette mention',
  })
  @ZodResponse({ status: 200, type: DecisionSessionResultDto })
  decideSessionNow(
    @CurrentMember() member: Member,
    @Param('sessionId', ParseUUIDPipe) sessionId: string
  ): Promise<DecisionSessionResultDto> {
    return this.decisions.decideSessionNow(member, sessionId)
  }

  @Post(':id/respond')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'D’accord ou non avec une proposition ; d’accord de tous : la décision s’applique ; non : à trancher ensemble',
  })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  respond(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecisionRespondDto
  ): Promise<DecisionResultDto> {
    return this.decisions.respond(member, id, body)
  }

  @Post(':id/settle')
  @HttpCode(200)
  @ApiOperation({
    summary: '« À trancher ensemble » : un clic sur l’un des choix l’applique',
  })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  settle(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecisionSettleDto
  ): Promise<DecisionResultDto> {
    return this.decisions.settle(member, id, body)
  }

  @Post(':id/decide-now')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '« Décider sans attendre » : l’auteur applique sa proposition ouverte ; journalisé avec cette mention',
  })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  decideNow(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DecisionResultDto> {
    return this.decisions.decideNow(member, id)
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: 'L’auteur retire sa proposition' })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  withdraw(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DecisionResultDto> {
    return this.decisions.withdraw(member, id)
  }

  @Post(':id/undo')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '« Annuler » la dernière décision d’une session : retire la proposition, la réponse, ou remet le statut de départ ; refusé quand un brouillon est devenu une annonce',
  })
  @ZodResponse({ status: 200, type: DecisionResultDto })
  undo(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DecisionResultDto> {
    return this.decisions.undo(member, id)
  }
}

/** Les routes historiques du statut et des brouillons, à la même règle. */
@ApiTags('decisions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller()
export class DecisionRulesController {
  constructor(
    private readonly decisions: DecisionsService,
    private readonly settings: DecisionSettingsService
  ) {}

  @Post('listings/:id/status')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Change le statut, avec raison et garde-fou optimiste ; lot 21 : passer À visiter ou écarter crée une proposition quand l’espace décide à plusieurs (l’annonce ne bouge pas)',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  async setStatus(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingStatusChangeDto
  ): Promise<EvaluatedListingDto> {
    const { item } = await this.decisions.changeStatus(member, id, body)
    return item
  }

  @Post('listing-drafts/accept-in-criteria')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : ajoute à la liste les brouillons à valider « dans les critères », sans doublon probable à trancher ; lot 21 : à plusieurs, une proposition par brouillon et une seule notification',
  })
  @ZodResponse({ status: 200, type: ListingDraftBatchAcceptResultDto })
  acceptInCriteria(
    @CurrentMember() member: Member,
    @Body() body: ListingDraftBatchAcceptDto
  ): Promise<ListingDraftBatchAcceptResultDto> {
    return this.decisions.keepInCriteria(member, body)
  }

  @Post('listing-drafts/:id/accept')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : « Ajouter à la liste » : l’annonce est créée depuis la fiche pré-remplie ; lot 21 : à plusieurs, une proposition, l’annonce naît à l’accord complet',
  })
  @ZodResponse({ status: 200, type: ListingDraftAcceptResultDto })
  accept(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingDraftAcceptResultDto> {
    return this.decisions.keepDraft(member, id)
  }

  @Patch('listing-drafts/:id')
  @ApiOperation({
    summary:
      "Valide (avec l'annonce créée), écarte (raison facultative ; obligatoire à plusieurs, où c'est une proposition) ou remet « à valider » un brouillon écarté ; journalisé",
  })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  decideDraft(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingDraftDecisionDto
  ): Promise<ListingDraftDto> {
    return this.decisions.decideDraft(member, id, body)
  }

  @Patch('workspace/decisions')
  @ApiOperation({
    summary:
      '« Décider à plusieurs » : réservé aux propriétaires, journalisé ; les propositions déjà ouvertes restent et se résolvent normalement',
  })
  @ZodResponse({ status: 200, type: WorkspaceMeDto })
  updateSettings(
    @CurrentMember() member: Member,
    @Body() body: DecisionSettingsUpdateDto
  ): Promise<WorkspaceMeDto> {
    return this.settings.update(member, body)
  }
}
