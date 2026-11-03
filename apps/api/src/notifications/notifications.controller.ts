import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { NotificationsService } from './notifications.service'
import {
  MarkAllReadResultDto,
  NotificationDto,
  NotificationPageDto,
  NotificationPreferencesUpdateDto,
  NotificationQueryDto,
  NotificationReadDto,
  NotificationSettingsDto,
  PushSubscriptionInputDto,
  PushUnsubscribeDto,
} from './dto/notification.dto'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Notifications du membre connecté (cloche), des plus récentes aux plus anciennes, avec le nombre de non lues',
  })
  @ZodResponse({ status: 200, type: NotificationPageDto })
  list(
    @CurrentMember() member: Member,
    @Query() query: NotificationQueryDto
  ): Promise<NotificationPageDto> {
    return this.notifications.list(member, query)
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marque toutes les notifications comme lues' })
  @ZodResponse({ status: 200, type: MarkAllReadResultDto })
  markAllRead(@CurrentMember() member: Member): Promise<MarkAllReadResultDto> {
    return this.notifications.markAllRead(member)
  }

  @Get('settings')
  @ApiOperation({
    summary:
      'Préférences par type et par canal, état du web push (clé publique VAPID) et de l’e-mail',
  })
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  settings(@CurrentMember() member: Member): Promise<NotificationSettingsDto> {
    return this.notifications.settings(member)
  }

  @Put('preferences')
  @ApiOperation({
    summary:
      'Modifie les préférences : seuls les types et canaux donnés changent',
  })
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  updatePreferences(
    @CurrentMember() member: Member,
    @Body() body: NotificationPreferencesUpdateDto
  ): Promise<NotificationSettingsDto> {
    return this.notifications.updatePreferences(member, body)
  }

  @Post('push/subscriptions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Abonne cet appareil au web push (PushSubscription.toJSON())',
  })
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  subscribe(
    @CurrentMember() member: Member,
    @Body() body: PushSubscriptionInputDto
  ): Promise<NotificationSettingsDto> {
    return this.notifications.subscribe(member, body)
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Désabonne cet appareil du web push' })
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  unsubscribe(
    @CurrentMember() member: Member,
    @Body() body: PushUnsubscribeDto
  ): Promise<NotificationSettingsDto> {
    return this.notifications.unsubscribe(member, body.endpoint)
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marque une notification lue (ou non lue)' })
  @ZodResponse({ status: 200, type: NotificationDto })
  markRead(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: NotificationReadDto
  ): Promise<NotificationDto> {
    return this.notifications.markRead(member, id, body.read)
  }
}
