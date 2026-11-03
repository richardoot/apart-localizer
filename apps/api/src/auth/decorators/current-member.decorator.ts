import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { AuthenticatedRequest } from '../guards/supabase.guard'
import type { Member } from '../../generated/prisma'

/** The workspace member the guard attached to the request. */
export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Member => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.member
  }
)
