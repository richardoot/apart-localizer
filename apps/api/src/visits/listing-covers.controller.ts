import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import {
  ListingCoverInputDto,
  ListingCoversDto,
  ListingCoversQueryDto,
} from './dto/visit.dto'
import { ListingCoversService } from './listing-covers.service'

/**
 * Lot 25 (ADR 0035) : la photo de couverture des annonces (liste, cartes,
 * fiche) : la vignette d'une photo de visite, par URL signée à durée courte.
 */
@ApiTags('visits')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller()
export class ListingCoversController {
  constructor(private readonly covers: ListingCoversService) {}

  @Get('listing-covers')
  @ApiOperation({
    summary:
      'Couvertures de plusieurs annonces (la photo choisie, sinon la première photo de la première visite) : vignettes signées à durée courte, en un seul appel au stockage',
  })
  @ZodResponse({ status: 200, type: ListingCoversDto })
  list(
    @CurrentMember() member: Member,
    @Query() query: ListingCoversQueryDto
  ): Promise<ListingCoversDto> {
    return this.covers.covers(member, query.ids)
  }

  @Put('listings/:id/cover')
  @ApiOperation({
    summary:
      'Choisit la photo de couverture (une photo prête d’une visite de l’annonce) ou revient à la première (null) ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingCoversDto })
  async choose(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingCoverInputDto
  ): Promise<ListingCoversDto> {
    const cover = await this.covers.choose(member, id, body.photoId)
    return { covers: cover ? [cover] : [] }
  }
}
