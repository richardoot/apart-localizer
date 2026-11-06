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
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import {
  ListingLinkInputDto,
  ListingLinkPatchDto,
  ListingLinkWriteResultDto,
  ListingLinksResultDto,
} from './dto/listing-link.dto'
import { ListingLinksService } from './listing-links.service'

/**
 * Lot 18 : les liens d'une annonce sur les portails (« Où la trouver »). Le
 * web s'en sert pour le tableau des liens et « Ajouter un lien » ; le MCP
 * passe par le même service (`add_listing_link`). Le serveur ne joint
 * jamais un portail.
 */
@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/links')
export class ListingLinksController {
  constructor(private readonly links: ListingLinksService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liens de l’annonce, le principal d’abord : portail, prix affiché, en ligne ou non, origine ; prix le plus bas en ligne et proposition quand le prix de la fiche a été saisi à la main',
  })
  @ZodResponse({ status: 200, type: ListingLinksResultDto })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingLinksResultDto> {
    return this.links.list(member, id)
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ajoute un lien de la même annonce sur un autre portail (portail reconnu d’après le lien) ; refusé (409) si l’URL est déjà celle d’une autre fiche, avec son nom ; ce qui a été lu (prix, en ligne) devient une vérification « Lien ajouté » ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingLinkWriteResultDto })
  add(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingLinkInputDto
  ): Promise<ListingLinkWriteResultDto> {
    const { origin, ...input } = body
    return this.links.add(member, id, input, { channel: 'web', origin })
  }

  @Patch(':linkId')
  @ApiOperation({
    summary:
      'Prix affiché ou état du lien relevés à la main (une vérification du lot 15 sur ce lien : le prix de la fiche suit le plus bas en ligne ; « Vendu ou retiré » n’est proposé que si plus aucun lien n’est en ligne), ou portail et identifiant corrigés ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingLinkWriteResultDto })
  patch(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() body: ListingLinkPatchDto
  ): Promise<ListingLinkWriteResultDto> {
    return this.links.patch(member, id, linkId, body)
  }

  @Delete(':linkId')
  @ApiOperation({
    summary:
      'Retire un lien de la fiche (un membre) ; jamais le dernier lien (409) ; le prix de la fiche suit les liens restants ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingLinkWriteResultDto })
  remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string
  ): Promise<ListingLinkWriteResultDto> {
    return this.links.remove(member, id, linkId)
  }
}
