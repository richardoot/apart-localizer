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
  ListingDraftDecisionDto,
  ListingDraftDto,
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
      'Annonces reçues par e-mail, à valider (status=pending par défaut)',
  })
  @ZodResponse({ status: 200, type: [ListingDraftDto] })
  list(
    @CurrentMember() member: Member,
    @Query() query: ListingDraftQueryDto
  ): Promise<ListingDraftDto[]> {
    return this.drafts.list(member, query.status)
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

  @Patch(':id')
  @ApiOperation({
    summary:
      "Valide (avec l'annonce créée) ou écarte un brouillon ; journalisé",
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
