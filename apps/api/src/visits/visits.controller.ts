import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { VisitsService } from './visits.service'
import {
  VisitDto,
  VisitInputDto,
  VisitPhotoDto,
  VisitPhotoUploadDto,
  VisitPhotoUploadRequestDto,
  VisitUpdateDto,
  VisitWriteResultDto,
} from './dto/visit.dto'

@ApiTags('visits')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings/:id/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Visites de l'annonce, de la plus récente à la plus ancienne, photos prêtes avec leurs URL signées à durée courte",
  })
  @ZodResponse({ status: 200, type: [VisitDto] })
  list(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<VisitDto[]> {
    return this.visits.list(member, id)
  }

  @Post()
  @ApiOperation({
    summary:
      'Ajoute une visite faite ou planifiée ; « préparer la visite » en tâche sur demande ; renvoie le statut proposé (jamais appliqué)',
  })
  @ZodResponse({ status: 201, type: VisitWriteResultDto })
  create(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VisitInputDto
  ): Promise<VisitWriteResultDto> {
    return this.visits.create(member, id, body)
  }

  @Get(':visitId')
  @ApiOperation({ summary: 'Une visite et ses photos' })
  @ZodResponse({ status: 200, type: VisitDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string
  ): Promise<VisitDto> {
    return this.visits.get(member, id, visitId)
  }

  @Patch(':visitId')
  @ApiOperation({
    summary:
      'Modifie une visite (champs donnés seulement, garde-fou expectedUpdatedAt)',
  })
  @ZodResponse({ status: 200, type: VisitWriteResultDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: VisitUpdateDto
  ): Promise<VisitWriteResultDto> {
    return this.visits.update(member, id, visitId, body)
  }

  @Delete(':visitId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Supprime une visite et les photos du membre ; refusé si elle porte des photos d'un autre membre",
  })
  remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string
  ): Promise<void> {
    return this.visits.remove(member, id, visitId)
  }

  @Post(':visitId/photos')
  @ApiOperation({
    summary:
      'Annonce une photo (type, taille, vignette) et reçoit deux URL d’envoi signées (photo et vignette) pour un PUT direct vers Supabase Storage',
  })
  @ZodResponse({ status: 201, type: VisitPhotoUploadDto })
  requestUpload(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: VisitPhotoUploadRequestDto
  ): Promise<VisitPhotoUploadDto> {
    return this.visits.requestPhotoUpload(member, id, visitId, body)
  }

  @Post(':visitId/photos/:photoId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Termine l'envoi : vérifie la présence, la taille et le type des objets, puis rend la photo avec ses URL signées",
  })
  @ZodResponse({ status: 200, type: VisitPhotoDto })
  complete(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string
  ): Promise<VisitPhotoDto> {
    return this.visits.completePhoto(member, id, visitId, photoId)
  }

  @Delete(':visitId/photos/:photoId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprime une photo (son auteur seulement ; jamais par le MCP)',
  })
  removePhoto(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string
  ): Promise<void> {
    return this.visits.removePhoto(member, id, visitId, photoId)
  }
}
