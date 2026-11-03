import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { McpScope } from '@apart/contracts'
import { SupabaseService } from '../auth/supabase.service'
import { displayNameOf } from '../auth/guards/supabase.guard'
import { WorkspaceService } from '../workspace/workspace.service'
import type { Member } from '../generated/prisma'
import { wwwAuthenticate } from './discovery'
import { effectiveScopes, scopesFromToken } from './mcp-scopes'

export interface McpAuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  member: Member
  /** Les portées effectives du jeton (toutes pour un jeton qui n'en déclare pas). */
  mcpScopes: McpScope[]
}

/**
 * Le garde de l'endpoint MCP : même chaîne que SupabaseGuard (jeton →
 * identité Supabase → membre), plus l'en-tête `WWW-Authenticate` qui, sur un
 * 401, dit au client où trouver le serveur d'autorisation (RFC 9728), et la
 * lecture des portées du jeton pour les outils d'écriture.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp()
    const request = http.getRequest<McpAuthenticatedRequest>()
    const response = http.getResponse<Response>()

    const [type, token] = request.headers.authorization?.split(' ') ?? []
    if (type !== 'Bearer' || !token) {
      response.setHeader(
        'WWW-Authenticate',
        wwwAuthenticate(request, process.env)
      )
      throw new UnauthorizedException('Aucun jeton fourni')
    }

    try {
      const supabaseUser = await this.supabaseService.getUser(token)
      const member = await this.workspaceService.resolveMember(
        supabaseUser.id,
        supabaseUser.email ?? null,
        displayNameOf(supabaseUser)
      )
      request.supabaseUser = supabaseUser
      request.member = member
      request.mcpScopes = effectiveScopes(scopesFromToken(token))
      return true
    } catch (error) {
      response.setHeader(
        'WWW-Authenticate',
        wwwAuthenticate(request, process.env, 'invalid_token')
      )
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Jeton invalide ou expiré')
    }
  }
}
