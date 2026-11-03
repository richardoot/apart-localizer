import { createZodDto } from 'nestjs-zod'
import {
  MemberSchema,
  WorkspaceMeSchema,
  WorkspaceSchema,
} from '@apart/contracts'

export class MemberDto extends createZodDto(MemberSchema) {}
export class WorkspaceDto extends createZodDto(WorkspaceSchema) {}
export class WorkspaceMeDto extends createZodDto(WorkspaceMeSchema) {}
