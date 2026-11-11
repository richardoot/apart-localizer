import { createZodDto } from 'nestjs-zod'
import {
  GettingStartedSchema,
  InvitationInputSchema,
  InvitationSchema,
  InvitationWriteResultSchema,
  MemberRoleUpdateSchema,
  MemberSchema,
  ReceivedInvitationSchema,
  WorkspaceMeSchema,
  WorkspaceSchema,
  WorkspaceUpdateSchema,
} from '@apart/contracts'

export class MemberDto extends createZodDto(MemberSchema) {}
export class WorkspaceDto extends createZodDto(WorkspaceSchema) {}
export class WorkspaceMeDto extends createZodDto(WorkspaceMeSchema) {}
export class WorkspaceUpdateDto extends createZodDto(WorkspaceUpdateSchema) {}
export class InvitationInputDto extends createZodDto(InvitationInputSchema) {}
export class InvitationDto extends createZodDto(InvitationSchema) {}
export class InvitationWriteResultDto extends createZodDto(
  InvitationWriteResultSchema
) {}
export class ReceivedInvitationDto extends createZodDto(
  ReceivedInvitationSchema
) {}
export class MemberRoleUpdateDto extends createZodDto(MemberRoleUpdateSchema) {}

/** Lot 23 : la mise en route de l'espace. */
export class GettingStartedDto extends createZodDto(GettingStartedSchema) {}
