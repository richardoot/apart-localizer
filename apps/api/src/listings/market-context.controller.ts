import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import {
  MarketContextReportDto,
  MarketContextRequestDto,
} from './dto/listing.dto'
import { ListingEnrichmentService } from './enrichment.service'

/** Le contexte de marché d'une annonce, d'une adresse ou d'un point (comme `get_market_context`). */
@ApiTags('opendata')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('market-context')
export class MarketContextController {
  constructor(private readonly enrichment: ListingEnrichmentService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Comparables DVF, plafond d’encadrement et desserte TBM pour une annonce (listingId), une adresse (géocodée) ou un point',
  })
  @ZodResponse({ status: 200, type: MarketContextReportDto })
  report(
    @CurrentMember() member: Member,
    @Body() body: MarketContextRequestDto
  ): Promise<MarketContextReportDto> {
    return this.enrichment.marketReport(member, body)
  }
}
