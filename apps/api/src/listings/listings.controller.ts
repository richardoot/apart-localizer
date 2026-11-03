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
import { listingFiltersFromQuery, splitListingPatch } from '@apart/contracts'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { ListingsService } from './listings.service'
import {
  CreateListingDto,
  EvaluateRequestDto,
  EvaluateResultDto,
  EvaluatedListingDto,
  ListingListDto,
  ListingListQueryDto,
  ListingPatchDto,
  ListingStatusChangeDto,
  PriceEventDto,
  PriceEventInputDto,
} from './dto/listing.dto'

@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Annonces filtrées, calculées, triées et paginées',
    description:
      'Listes séparées par des virgules (status, commune, dpe, verdict) ; bornes priceMin, priceMax, surfaceMin, surfaceMax, roomsMin ; ' +
      'point et rayon : lng, lat, radius (mètres) ; page et limit (50 par défaut, 200 au plus). ' +
      'Le verdict, le tri et la pagination s’appliquent après le calcul des indicateurs.',
  })
  @ZodResponse({ status: 200, type: ListingListDto })
  list(
    @CurrentMember() member: Member,
    @Query() query: ListingListQueryDto
  ): Promise<ListingListDto> {
    return this.listings.list(member, listingFiltersFromQuery(query))
  }

  @Post()
  @ApiOperation({ summary: 'Crée une annonce avec sa checklist par défaut' })
  @ZodResponse({ status: 201, type: EvaluatedListingDto })
  create(
    @CurrentMember() member: Member,
    @Body() body: CreateListingDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.create(member, body)
  }

  @Post('evaluate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Évalue une annonce hypothétique, ou une annonce enregistrée avec des surcharges, sans rien enregistrer',
  })
  @ZodResponse({ status: 200, type: EvaluateResultDto })
  evaluate(
    @CurrentMember() member: Member,
    @Body() body: EvaluateRequestDto
  ): Promise<EvaluateResultDto> {
    return this.listings.evaluate(member, body)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Une annonce, ses calculs, avis, tâches et prix' })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.get(member, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Met à jour des champs ; les sous-objets fournis sont remplacés ; garde-fous expectedUpdatedAt et expectedPrice (409)',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingPatchDto
  ): Promise<EvaluatedListingDto> {
    const { update, guards } = splitListingPatch(body)
    return this.listings.update(member, id, update, guards)
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change le statut, avec raison et garde-fou optimiste',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  setStatus(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingStatusChangeDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.setStatus(member, id, body)
  }

  @Post(':id/seen')
  @HttpCode(200)
  @ApiOperation({
    summary: "Marque l'annonce comme vue par le membre connecté",
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  markSeen(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.markSeen(member, id)
  }

  @Get(':id/price-events')
  @ApiOperation({
    summary: 'Historique des prix, du plus récent au plus ancien',
  })
  @ZodResponse({ status: 200, type: [PriceEventDto] })
  async priceEvents(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PriceEventDto[]> {
    return (await this.listings.get(member, id)).priceEvents
  }

  @Post(':id/price-events')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Enregistre une baisse ou une hausse constatée : met le prix à jour et ajoute une ligne à l’historique',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  recordPriceChange(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PriceEventInputDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.recordPriceChange(member, id, body)
  }
}
