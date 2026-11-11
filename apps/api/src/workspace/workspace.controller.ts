import {
  Body,
  Controller,
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
import {
  CurrentIdentity,
  CurrentMember,
} from '../auth/decorators/current-member.decorator'
import type { AuthIdentity } from '../auth/identity'
import type { Member } from '../generated/prisma'
import { WorkspaceService } from './workspace.service'
import { MembersService } from './members.service'
import {
  GettingStartedDto,
  InvitationDto,
  InvitationInputDto,
  InvitationWriteResultDto,
  MemberDto,
  MemberRoleUpdateDto,
  ReceivedInvitationDto,
  WorkspaceMeDto,
  WorkspaceUpdateDto,
} from './dto/workspace.dto'

/**
 * L'espace, ses membres et ses invitations (lot 8). Seul un propriétaire
 * renomme, invite, annule, change un rôle ou retire ; chacun peut partir,
 * sauf le dernier propriétaire. Aucune de ces écritures n'existe au MCP.
 */
@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly members: MembersService
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "L'espace de travail du membre connecté, ses membres (actifs et anciens) et ses invitations",
  })
  @ZodResponse({ status: 200, type: WorkspaceMeDto })
  me(@CurrentMember() member: Member): Promise<WorkspaceMeDto> {
    return this.workspace.me(member)
  }

  @Get('getting-started')
  @ApiOperation({
    summary:
      'Lot 23 : la mise en route (hypothèses, critères, première annonce, Claude), ce qui est fait et ce qui reste',
  })
  @ZodResponse({ status: 200, type: GettingStartedDto })
  gettingStarted(@CurrentMember() member: Member): Promise<GettingStartedDto> {
    return this.workspace.gettingStarted(member)
  }

  @Patch()
  @ApiOperation({ summary: "Renomme l'espace (propriétaire)" })
  @ZodResponse({ status: 200, type: WorkspaceMeDto })
  rename(
    @CurrentMember() member: Member,
    @Body() body: WorkspaceUpdateDto
  ): Promise<WorkspaceMeDto> {
    return this.members.rename(member, body)
  }

  @Post('invitations')
  @ApiOperation({
    summary:
      "Invite une personne par e-mail (propriétaire) : e-mail envoyé si l'envoi est configuré, sinon le lien à transmettre",
  })
  @ZodResponse({ status: 201, type: InvitationWriteResultDto })
  invite(
    @CurrentMember() member: Member,
    @Body() body: InvitationInputDto
  ): Promise<InvitationWriteResultDto> {
    return this.members.invite(member, body)
  }

  @Get('invitations/received')
  @ApiOperation({
    summary:
      "Les invitations en attente vers d'autres espaces, pour l'adresse vérifiée du compte (bandeau)",
  })
  @ZodResponse({ status: 200, type: [ReceivedInvitationDto] })
  received(
    @CurrentMember() member: Member,
    @CurrentIdentity() identity: AuthIdentity
  ): Promise<ReceivedInvitationDto[]> {
    return this.members.received(member, identity)
  }

  @Post('invitations/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Annule une invitation (propriétaire)' })
  @ZodResponse({ status: 200, type: InvitationDto })
  cancel(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<InvitationDto> {
    return this.members.cancel(member, id)
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Rejoint l'espace qui invite (personne déjà inscrite) ; l'espace quitté reste intact",
  })
  @ZodResponse({ status: 200, type: WorkspaceMeDto })
  accept(
    @CurrentMember() member: Member,
    @CurrentIdentity() identity: AuthIdentity,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<WorkspaceMeDto> {
    return this.members.accept(member, identity, id)
  }

  @Post('invitations/:id/decline')
  @HttpCode(204)
  @ApiOperation({ summary: 'Refuse une invitation reçue' })
  decline(
    @CurrentIdentity() identity: AuthIdentity,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.members.decline(identity, id)
  }

  @Patch('members/:id')
  @ApiOperation({
    summary:
      "Change le rôle d'un membre (propriétaire) ; l'espace garde un propriétaire",
  })
  @ZodResponse({ status: 200, type: MemberDto })
  changeRole(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MemberRoleUpdateDto
  ): Promise<MemberDto> {
    return this.members.changeRole(member, id, body.role)
  }

  @Post('members/:id/remove')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Retire un membre (propriétaire) : accès coupé à la requête suivante, historique gardé à son nom',
  })
  @ZodResponse({ status: 200, type: MemberDto })
  remove(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<MemberDto> {
    return this.members.remove(member, id)
  }

  @Post('leave')
  @HttpCode(204)
  @ApiOperation({
    summary: "Quitte l'espace (jamais le dernier propriétaire)",
  })
  leave(@CurrentMember() member: Member): Promise<void> {
    return this.members.leave(member)
  }
}
