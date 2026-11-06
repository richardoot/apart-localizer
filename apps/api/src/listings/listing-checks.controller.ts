import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import {
  ListingCheckDto,
  ListingCheckInputDto,
  ListingCheckPreviewDto,
  ListingCheckPreviewRequestDto,
  ListingCheckWriteResultDto,
} from './dto/listing-check.dto'
import { ListingChecksService } from './listing-checks.service'

/**
 * Lot 15 : les vérifications d'une annonce sur le portail. Le web s'en sert
 * pour la chronologie de l'Historique et les boutons « Vue en ligne
 * aujourd'hui » et « Plus en ligne » ; le MCP passe par le même service
 * (`check_listing`, `apply_listing_check`). Le serveur ne télécharge jamais
 * la page.
 */
@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/checks')
export class ListingChecksController {
  constructor(private readonly checks: ListingChecksService) {}

  @Get()
  @ApiOperation({
    summary:
      'Vérifications de l’annonce sur le portail, de la plus récente à la plus ancienne : date, auteur, canal, résultat, écarts appliqués ou proposés, extrait-preuve, annonce liée',
  })
  @ZodResponse({ status: 200, type: [ListingCheckDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingCheckDto[]> {
    return this.checks.list(member, id)
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Vérification à blanc : écarts entre la page lue (valeurs observées, ou texte de la page lu par l’extraction) et la fiche, résultat, statut proposé, republications probables ; rien n’est écrit',
  })
  @ZodResponse({ status: 200, type: ListingCheckPreviewDto })
  preview(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingCheckPreviewRequestDto
  ): Promise<ListingCheckPreviewDto> {
    return this.checks.preview(member, id, body)
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Enregistre une vérification : faits lus appliqués (prix par l’historique), dates de vérification, republication rattachée, journal ; garde-fous expectedUpdatedAt et expectedPrice (409) ; le statut proposé n’est jamais appliqué',
  })
  @ZodResponse({ status: 200, type: ListingCheckWriteResultDto })
  apply(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingCheckInputDto
  ): Promise<ListingCheckWriteResultDto> {
    return this.checks.apply(member, id, body)
  }
}
