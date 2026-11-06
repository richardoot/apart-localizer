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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { DraftsService } from './drafts.service'
import { InboundSignatureGuard } from './inbound-signature.guard'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from './inbound-signature'
import { InboundEmailService } from './inbound.service'
import {
  InboundEmailDto,
  InboundEmailResultDto,
  ListingDraftAcceptResultDto,
  ListingDraftBatchAcceptDto,
  ListingDraftBatchAcceptResultDto,
  ListingDraftDecisionDto,
  ListingDraftDto,
  ListingDraftMergeDto,
  ListingDraftQueryDto,
} from './dto/inbound.dto'

/** Le webhook d'e-mails entrants : signé, sans session de membre. */
@ApiTags('inbound')
@Controller('inbound')
export class InboundEmailController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Post('email/:workspaceId')
  @HttpCode(202)
  @UseGuards(InboundSignatureGuard)
  @ApiHeader({ name: TIMESTAMP_HEADER, description: 'Secondes Unix' })
  @ApiHeader({
    name: SIGNATURE_HEADER,
    description:
      'sha256=<hex> : HMAC-SHA256 de « horodatage.corps brut » avec INBOUND_EMAIL_SECRET',
  })
  @ApiOperation({
    summary:
      "Reçoit un e-mail d'alerte transféré (sujet, texte, HTML) : annonces repérées, brouillons à valider, doublons signalés, membres prévenus",
  })
  @ZodResponse({ status: 202, type: InboundEmailResultDto })
  receive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: InboundEmailDto
  ): Promise<InboundEmailResultDto> {
    return this.inbound.receive(workspaceId, body)
  }
}

@ApiTags('inbound')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listing-drafts')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Annonces à valider, reçues par e-mail ou trouvées par Claude en explorant les portails (status=pending par défaut), avec leur adéquation aux critères calculée à la lecture ; lot 18 : attached=true donne les liens rattachés d’office (même agence, même référence) des derniers jours',
  })
  @ZodResponse({ status: 200, type: [ListingDraftDto] })
  list(
    @CurrentMember() member: Member,
    @Query() query: ListingDraftQueryDto
  ): Promise<ListingDraftDto[]> {
    return this.drafts.list(
      member,
      query.status,
      query.explorationId,
      query.attached ?? false
    )
  }

  @Post('accept-in-criteria')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : ajoute à la liste les brouillons à valider « dans les critères », sans doublon probable à trancher ; les autres restent à valider',
  })
  @ZodResponse({ status: 200, type: ListingDraftBatchAcceptResultDto })
  acceptInCriteria(
    @CurrentMember() member: Member,
    @Body() body: ListingDraftBatchAcceptDto
  ): Promise<ListingDraftBatchAcceptResultDto> {
    return this.drafts.acceptInCriteria(member, body)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un brouillon : fiche pré-remplie et doublons' })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingDraftDto> {
    return this.drafts.get(member, id)
  }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : « Ajouter à la liste » sans repasser par le formulaire : l’annonce est créée depuis la fiche pré-remplie ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingDraftAcceptResultDto })
  accept(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingDraftAcceptResultDto> {
    return this.drafts.accept(member, id)
  }

  @Post(':id/merge')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : « C’est la même : mettre à jour la fiche » : les faits lus s’appliquent à l’annonce suivie par une vérification (lot 15), le brouillon est reconnu (merged) ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  merge(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingDraftMergeDto
  ): Promise<ListingDraftDto> {
    return this.drafts.merge(member, id, body)
  }

  @Post(':id/detach')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 18 : « Ce n’est pas la même » sur un lien rattaché d’office : le lien est retiré de la fiche (le prix de la fiche suit ses liens restants), le brouillon revient « à valider » ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  detach(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingDraftDto> {
    return this.drafts.detach(member, id)
  }

  @Post(':id/distinct')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 16 : « C’en est une autre » : les doublons probables du brouillon ne sont plus proposés ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  distinct(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingDraftDto> {
    return this.drafts.distinct(member, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      "Valide (avec l'annonce créée), écarte (raison facultative) ou remet « à valider » un brouillon écarté ; journalisé",
  })
  @ZodResponse({ status: 200, type: ListingDraftDto })
  decide(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingDraftDecisionDto
  ): Promise<ListingDraftDto> {
    return this.drafts.decide(member, id, body)
  }
}
