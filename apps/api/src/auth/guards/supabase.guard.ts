import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { SupabaseService } from '../supabase.service'
import { WorkspaceService } from '../../workspace/workspace.service'
import type { Member } from '../../generated/prisma'

export interface AuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  /** The workspace member this identity stands for. */
  member: Member
}

/**
 * Bearer token → Supabase identity → workspace member.
 *
 * The member is resolved (or created, see WorkspaceService.resolveMember)
 * once per request and attached to it; controllers read it through
 * `@CurrentMember()`. Every route except `/health` sits behind this guard.
 */
@Injectable()
export class SupabaseGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.extractTokenFromHeader(request)

    if (!token) {
      throw new UnauthorizedException('Aucun jeton fourni')
    }

    const supabaseUser = await this.supabaseService.getUser(token)
    const member = await this.workspaceService.resolveMember(
      supabaseUser.id,
      supabaseUser.email ?? null,
      displayNameOf(supabaseUser)
    )

    request.supabaseUser = supabaseUser
    request.member = member
    return true
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}

/** The name Google (or the e-mail) gives this person, for a member created on first sight. */
export function displayNameOf(user: SupabaseUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const candidates = [meta?.full_name, meta?.name, user.email?.split('@')[0]]
  const found = candidates.find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  )
  return found?.trim() ?? 'Membre'
}
