import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { OpinionsService } from './opinions.service'
import {
  OpinionDto,
  OpinionInputDto,
  OpinionRevealDto,
} from './dto/opinion.dto'

@ApiTags('opinions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/opinions')
export class OpinionsController {
  constructor(private readonly opinions: OpinionsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Les avis visibles par le membre connecté sur l'annonce : le sien, et ceux des autres sauf à l'aveugle (lot 20)",
  })
  @ZodResponse({ status: 200, type: [OpinionDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OpinionDto[]> {
    return this.opinions.listForListing(member, id)
  }

  @Put('me')
  @ApiOperation({
    summary:
      'Enregistre mon avis : note globale sur 5 et phrase remplacées ; notes par critère fusionnées (seules les clés données changent, null efface) ; garde-fou `expectedUpdatedAt`',
  })
  @ZodResponse({ status: 200, type: OpinionDto })
  upsertMine(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpinionInputDto
  ): Promise<OpinionDto> {
    return this.opinions.upsert(member, id, body)
  }

  @Post('reveal')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "« Voir quand même » (lot 20) : affiche l'avis des autres avant d'avoir noté ; enregistré, et mon avis portera la mention « après avoir vu celui de … »",
  })
  @ZodResponse({ status: 200, type: OpinionRevealDto })
  reveal(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OpinionRevealDto> {
    return this.opinions.reveal(member, id)
  }
}
