import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { WhatsNewService } from './whats-new.service'
import {
  ListingChangesDto,
  WhatsNewMarkSeenDto,
  WhatsNewQueryDto,
  WhatsNewReportDto,
  WhatsNewVisitDto,
} from './dto/whats-new.dto'

@ApiTags('whats-new')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller()
export class WhatsNewController {
  constructor(private readonly whatsNew: WhatsNewService) {}

  @Get('whats-new')
  @ApiOperation({
    summary:
      'Ce qui a changé pour le membre depuis sa dernière visite : nouvelles annonces, prix, statuts, avis et tâches de l’autre membre, entrées dans un critère',
  })
  @ZodResponse({ status: 200, type: WhatsNewReportDto })
  report(
    @CurrentMember() member: Member,
    @Query() query: WhatsNewQueryDto
  ): Promise<WhatsNewReportDto> {
    return this.whatsNew.report(member, query)
  }

  @Post('whats-new/visit')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Signale une visite de l'application (au chargement) : après trente minutes d'absence, le point de départ avance à la fin de la visite précédente",
  })
  @ZodResponse({ status: 200, type: WhatsNewVisitDto })
  visit(@CurrentMember() member: Member): Promise<WhatsNewVisitDto> {
    return this.whatsNew.visit(member)
  }

  @Post('whats-new/mark-seen')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Tout marquer comme vu : point de départ à maintenant, toutes les annonces vues, notifications lues',
  })
  @ZodResponse({ status: 200, type: WhatsNewMarkSeenDto })
  markSeen(@CurrentMember() member: Member): Promise<WhatsNewMarkSeenDto> {
    return this.whatsNew.markAllSeen(member)
  }

  @Get('listings/:id/changes')
  @ApiOperation({
    summary:
      'Ce qui a changé sur la fiche depuis sa dernière ouverture par le membre (à lire avant POST /listings/:id/seen) : champs modifiés et lignes du journal',
  })
  @ZodResponse({ status: 200, type: ListingChangesDto })
  listingChanges(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingChangesDto> {
    return this.whatsNew.listingChanges(member, id)
  }
}
