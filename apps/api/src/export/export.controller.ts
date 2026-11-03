import {
  Controller,
  Get,
  Header,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import { ExportQuerySchema } from '@apart/contracts'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { ExportService } from './export.service'

export class ExportQueryDto extends createZodDto(ExportQuerySchema) {}

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      "Export de l'espace : format=csv (« ; », UTF-8 avec BOM, colonnes en français, indicateurs calculés) ou json (complet, versionné, sans photos) ; scope=workspace (tout) ou selection (filtres de la liste et ids)",
  })
  async export(
    @CurrentMember() member: Member,
    @Query() query: ExportQueryDto
  ): Promise<StreamableFile> {
    const file = await this.exports.export(member, query)
    return new StreamableFile(Buffer.from(file.body, 'utf8'), {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    })
  }
}
