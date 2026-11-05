import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import { CriteriaFitHistorySchema } from '@apart/contracts'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { CriteriaMatchService } from './criteria-match.service'

export class CriteriaFitHistoryDto extends createZodDto(
  CriteriaFitHistorySchema
) {}

/**
 * L'historique de l'adéquation d'une annonce (lot 14) : entrées, sorties et
 * changements de niveau datés avec leurs raisons, tirés du journal.
 */
@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings')
export class CriteriaFitController {
  constructor(private readonly fits: CriteriaMatchService) {}

  @Get(':id/criteria-fit/history')
  @ApiOperation({
    summary:
      "Historique de l'adéquation aux critères : entrées, sorties et changements de niveau datés, avec leurs raisons",
  })
  @ZodResponse({ status: 200, type: CriteriaFitHistoryDto })
  history(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<CriteriaFitHistoryDto> {
    return this.fits.history(member, id)
  }
}
