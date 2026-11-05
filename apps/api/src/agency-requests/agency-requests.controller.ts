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
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { AgencyRequestsService } from './agency-requests.service'
import {
  AgencyAnswerInputDto,
  AgencyAnswerResultDto,
  AgencyApplyProposedDto,
  AgencyApplyResultDto,
  AgencyRequestApproveDto,
  AgencyRequestDraftInputDto,
  AgencyRequestSentDto,
  AgencyRequestUpdateDto,
  AgencyRequestWriteResultDto,
  AgencyRequestsWriteResultDto,
  AgencySettingsDto,
  AgencySettingsUpdateDto,
  ListingContactDto,
  ListingContactInputDto,
  ListingContactResultDto,
  ListingExchangesDto,
  PendingAgencyRequestsDto,
} from './dto/agency-requests.dto'

/**
 * Lot 17 : le contact de l'annonceur et les demandes d'une annonce (onglet
 * « Échanges »). Contrôleur mince : tout passe par AgencyRequestsService.
 * Le serveur n'envoie jamais de message à une agence.
 */
@ApiTags('agency-requests')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id')
export class ListingAgencyController {
  constructor(private readonly agency: AgencyRequestsService) {}

  @Get('contact')
  @ApiOperation({
    summary: "Le contact de l'annonceur (null s'il n'y en a pas)",
  })
  @ZodResponse({ status: 200, type: ListingContactResultDto })
  async getContact(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingContactResultDto> {
    return { contact: await this.agency.getContact(member, id) }
  }

  @Put('contact')
  @ApiOperation({
    summary:
      "Enregistre le contact de l'annonceur (agence, interlocuteur, e-mail, téléphone, messagerie, canal) ; un champ à null est vidé",
  })
  @ZodResponse({ status: 200, type: ListingContactDto })
  putContact(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingContactInputDto
  ): Promise<ListingContactDto> {
    return this.agency.putContact(member, id, body)
  }

  @Delete('contact')
  @HttpCode(204)
  @ApiOperation({
    summary: "Efface le contact de l'annonceur (jamais possible par le MCP)",
  })
  clearContact(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.agency.clearContact(member, id)
  }

  @Get('agency-requests')
  @ApiOperation({
    summary:
      "Les échanges d'une annonce : contact, demandes (de la plus récente à la plus ancienne), questions ouvertes, signature",
  })
  @ZodResponse({ status: 200, type: ListingExchangesDto })
  exchanges(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingExchangesDto> {
    return this.agency.exchanges(member, id)
  }

  @Post('agency-requests')
  @ApiOperation({
    summary:
      "Prépare un message à valider pour l'annonceur (questions ouvertes par défaut, texte poli par défaut) ; rien n'est envoyé",
  })
  @ZodResponse({ status: 201, type: AgencyRequestWriteResultDto })
  async draft(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AgencyRequestDraftInputDto
  ): Promise<AgencyRequestWriteResultDto> {
    const [request] = await this.agency.createDrafts(
      member,
      [{ ...body, listingId: id }],
      'web'
    )
    return { request: request as AgencyRequestWriteResultDto['request'] }
  }
}

/**
 * Lot 17 : les demandes elles-mêmes (validation par lot, modification,
 * annulation, envoi enregistré, réponse, « pas de réponse », valeurs
 * proposées appliquées) et la signature des messages de l'espace.
 */
@ApiTags('agency-requests')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('agency-requests')
export class AgencyRequestsController {
  constructor(private readonly agency: AgencyRequestsService) {}

  @Get('pending')
  @ApiOperation({
    summary:
      'Messages à valider, validés à envoyer et relances dues, toutes annonces confondues (Synthèse)',
  })
  @ZodResponse({ status: 200, type: PendingAgencyRequestsDto })
  pending(@CurrentMember() member: Member): Promise<PendingAgencyRequestsDto> {
    return this.agency.pending(member)
  }

  @Get('settings')
  @ApiOperation({ summary: 'La signature des messages aux annonceurs' })
  @ZodResponse({ status: 200, type: AgencySettingsDto })
  settings(@CurrentMember() member: Member): Promise<AgencySettingsDto> {
    return this.agency.settings(member)
  }

  @Put('settings')
  @ApiOperation({
    summary:
      'Change la signature des messages (null = prénoms des membres) ; aucune coordonnée de membre ajoutée',
  })
  @ZodResponse({ status: 200, type: AgencySettingsDto })
  updateSettings(
    @CurrentMember() member: Member,
    @Body() body: AgencySettingsUpdateDto
  ): Promise<AgencySettingsDto> {
    return this.agency.updateSettings(member, body)
  }

  @Post('approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Valide l'envoi de plusieurs messages ensemble (tous « à valider », sinon aucun) ; Claude les envoie ensuite avec les outils de l'utilisateur",
  })
  @ZodResponse({ status: 200, type: AgencyRequestsWriteResultDto })
  async approve(
    @CurrentMember() member: Member,
    @Body() body: AgencyRequestApproveDto
  ): Promise<AgencyRequestsWriteResultDto> {
    return {
      requests: await this.agency.approve(
        member,
        body.requestIds,
        'app',
        'web'
      ),
    }
  }

  @Patch(':requestId')
  @ApiOperation({
    summary:
      'Modifie un message avant l’envoi (objet, texte, canal, destinataire) ; un message validé repasse « à valider »',
  })
  @ZodResponse({ status: 200, type: AgencyRequestWriteResultDto })
  async update(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: AgencyRequestUpdateDto
  ): Promise<AgencyRequestWriteResultDto> {
    return { request: await this.agency.update(member, requestId, body) }
  }

  @Post(':requestId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Annule un message pas encore envoyé' })
  @ZodResponse({ status: 200, type: AgencyRequestWriteResultDto })
  async cancel(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string
  ): Promise<AgencyRequestWriteResultDto> {
    return { request: await this.agency.cancel(member, requestId) }
  }

  @Post(':requestId/sent')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Enregistre l'envoi d'un message validé, fait par un membre ou par Claude (le serveur n'envoie rien) ; les tâches passent « demandées »",
  })
  @ZodResponse({ status: 200, type: AgencyRequestWriteResultDto })
  async sent(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: AgencyRequestSentDto
  ): Promise<AgencyRequestWriteResultDto> {
    return {
      request: await this.agency.markSent(member, requestId, body, 'web'),
    }
  }

  @Post(':requestId/answer')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Enregistre la réponse de l'annonceur : valeurs appliquées (source « agence ») ou proposées, tâches cochées ; garde-fou expectedUpdatedAt (409)",
  })
  @ZodResponse({ status: 200, type: AgencyAnswerResultDto })
  answer(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: AgencyAnswerInputDto
  ): Promise<AgencyAnswerResultDto> {
    return this.agency.recordAnswer(member, requestId, body, 'web')
  }

  @Post(':requestId/no-answer')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Clôt une demande envoyée restée sans réponse ; ses questions se reposent',
  })
  @ZodResponse({ status: 200, type: AgencyRequestWriteResultDto })
  async noAnswer(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string
  ): Promise<AgencyRequestWriteResultDto> {
    return { request: await this.agency.noAnswer(member, requestId) }
  }

  @Post(':requestId/apply')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Applique des valeurs proposées par l'annonceur (elles contredisaient une saisie à la main) ; garde-fou expectedUpdatedAt",
  })
  @ZodResponse({ status: 200, type: AgencyApplyResultDto })
  apply(
    @CurrentMember() member: Member,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: AgencyApplyProposedDto
  ): Promise<AgencyApplyResultDto> {
    return this.agency.applyProposed(member, requestId, body)
  }
}
