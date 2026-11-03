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
import { listingFiltersFromQuery } from '@apart/contracts'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { ListingsService } from './listings.service'
import {
  CreateListingDto,
  EvaluatedListingDto,
  ListingListDto,
  ListingListQueryDto,
  ListingStatusChangeDto,
  UpdateListingDto,
} from './dto/listing.dto'

@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Annonces filtrées et calculées',
    description:
      'Listes séparées par des virgules (status, commune, dpe, verdict). Point et rayon : lng, lat, radius (mètres).',
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

  @Get(':id')
  @ApiOperation({ summary: 'Une annonce et ses calculs' })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.get(member, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Met à jour des champs ; les sous-objets fournis sont remplacés',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateListingDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.update(member, id, body)
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
}
