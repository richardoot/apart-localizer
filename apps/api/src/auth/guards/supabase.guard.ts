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
import { identityOf } from '../identity'
import type { AuthIdentity } from '../identity'

export { displayNameOf } from '../identity'

export interface AuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  /** Identifiant, adresse (vérifiée ou non) et nom de l'identité. */
  identity: AuthIdentity
  /** The workspace member this identity stands for. */
  member: Member
}

/**
 * Bearer token → Supabase identity → workspace member.
 *
 * The member is resolved (or created, see WorkspaceService.resolveMember)
 * once per request and attached to it; controllers read it through
 * `@CurrentMember()`. Every route except `/health` sits behind this guard.
 * Since the member is resolved on every request, a member removed from a
 * workspace (identity detached) loses access on the very next request.
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
    const identity = identityOf(supabaseUser)
    const member = await this.workspaceService.resolveMember(identity, 'web')

    request.supabaseUser = supabaseUser
    request.identity = identity
    request.member = member
    return true
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
