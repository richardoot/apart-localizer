import {
  Body,
  Controller,
  Get,
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
import { OffersService } from './offers.service'
import {
  OfferDto,
  OfferInputDto,
  OfferUpdateDto,
  OfferWriteResultDto,
} from './dto/offer.dto'

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @ApiOperation({
    summary:
      "Les offres faites sur l'annonce, de la plus récente à la plus ancienne",
  })
  @ZodResponse({ status: 200, type: [OfferDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OfferDto[]> {
    return this.offers.listForListing(member, id)
  }

  @Post()
  @ApiOperation({
    summary:
      "Enregistre une offre (montant, date, canal, réponse connue) ; la réponse porte le statut proposé pour l'annonce, jamais appliqué d'office",
  })
  @ZodResponse({ status: 201, type: OfferWriteResultDto })
  create(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OfferInputDto
  ): Promise<OfferWriteResultDto> {
    return this.offers.create(member, id, body)
  }

  @Patch(':offerId')
  @ApiOperation({
    summary:
      'Réponse du vendeur, contre-proposition, commentaire ; garde-fou expectedResponse (409). Pas de suppression.',
  })
  @ZodResponse({ status: 200, type: OfferWriteResultDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() body: OfferUpdateDto
  ): Promise<OfferWriteResultDto> {
    return this.offers.update(member, id, offerId, body)
  }
}
