import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { OpinionsService } from './opinions.service'
import { OpinionDto, OpinionInputDto } from './dto/opinion.dto'

@ApiTags('opinions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/opinions')
export class OpinionsController {
  constructor(private readonly opinions: OpinionsService) {}

  @Get()
  @ApiOperation({ summary: "Les avis des membres sur l'annonce" })
  @ZodResponse({ status: 200, type: [OpinionDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OpinionDto[]> {
    return this.opinions.listForListing(member, id)
  }

  @Put('me')
  @ApiOperation({
    summary: 'Enregistre ou remplace mon avis (note sur 5 et texte)',
  })
  @ZodResponse({ status: 200, type: OpinionDto })
  upsertMine(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpinionInputDto
  ): Promise<OpinionDto> {
    return this.opinions.upsert(member, id, body)
  }
}
