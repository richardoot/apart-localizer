import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { AuthenticatedRequest } from '../guards/supabase.guard'
import type { AuthIdentity } from '../identity'
import type { Member } from '../../generated/prisma'

/** The workspace member the guard attached to the request. */
export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Member => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.member
  }
)

/** The Supabase identity behind the request: e-mail and whether it is verified. */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthIdentity => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.identity
  }
)
