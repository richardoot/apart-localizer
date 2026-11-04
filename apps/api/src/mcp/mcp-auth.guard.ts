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
import { identityOf } from '../auth/identity'
import type { AuthIdentity } from '../auth/identity'
import { WorkspaceService } from '../workspace/workspace.service'
import type { Member } from '../generated/prisma'
import { wwwAuthenticate } from './discovery'
import { effectiveScopes, scopesFromToken } from './mcp-scopes'

export interface McpAuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  identity: AuthIdentity
  member: Member
  /** Les portées effectives du jeton (toutes pour un jeton qui n'en déclare pas). */
  mcpScopes: McpScope[]
}

/**
 * Le garde de l'endpoint MCP : même chaîne que SupabaseGuard (jeton →
 * identité Supabase → membre), plus l'en-tête `WWW-Authenticate` qui, sur un
 * 401, dit au client où trouver le serveur d'autorisation (RFC 9728), et la
 * lecture des portées du jeton pour les outils d'écriture. Le membre est
 * résolu à chaque requête : un membre retiré perd l'accès au connecteur dès
 * l'appel suivant, même avec un jeton encore valide.
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
      const identity = identityOf(supabaseUser)
      const member = await this.workspaceService.resolveMember(identity, 'mcp')
      request.supabaseUser = supabaseUser
      request.identity = identity
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
