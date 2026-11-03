import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { McpAuthGuard } from './mcp-auth.guard'
import { fakeJwt } from './mcp-scopes.spec'
import type { SupabaseService } from '../auth/supabase.service'
import type { WorkspaceService } from '../workspace/workspace.service'

const member = { id: 'm1', workspaceId: 'w1', handle: 'richard' }

function context(authorization?: string): {
  context: ExecutionContext
  request: Record<string, unknown>
  response: { setHeader: ReturnType<typeof vi.fn> }
} {
  const request: Record<string, unknown> = {
    headers: { authorization },
    protocol: 'https',
    get: (name: string) =>
      name.toLowerCase() === 'host' ? 'api.example.invalid' : undefined,
  }
  const response = { setHeader: vi.fn() }
  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
    request,
    response,
  }
}

describe('McpAuthGuard', () => {
  const supabase = { getUser: vi.fn() }
  const workspace = { resolveMember: vi.fn() }
  let guard: McpAuthGuard

  beforeEach(() => {
    vi.clearAllMocks()
    guard = new McpAuthGuard(
      supabase as unknown as SupabaseService,
      workspace as unknown as WorkspaceService
    )
    supabase.getUser.mockResolvedValue({
      id: 'sb-1',
      email: 'r@e.invalid',
      user_metadata: { full_name: 'Richard' },
    })
    workspace.resolveMember.mockResolvedValue(member)
  })

  it('sans jeton : 401 et WWW-Authenticate vers la découverte', async () => {
    const { context: ctx, response } = context()
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException
    )
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://api.example.invalid/.well-known/oauth-protected-resource"'
    )
  })

  it('jeton refusé par Supabase : 401 avec error=invalid_token', async () => {
    supabase.getUser.mockRejectedValue(new UnauthorizedException('expiré'))
    const { context: ctx, response } = context('Bearer bad')
    await expect(guard.canActivate(ctx)).rejects.toThrow('expiré')
    expect(response.setHeader.mock.calls[0]?.[1]).toContain(
      'error="invalid_token"'
    )
  })

  it('jeton opaque accepté : membre résolu et toutes les portées', async () => {
    const { context: ctx, request } = context('Bearer opaque-token')
    expect(await guard.canActivate(ctx)).toBe(true)
    expect(workspace.resolveMember).toHaveBeenCalledWith(
      'sb-1',
      'r@e.invalid',
      'Richard'
    )
    expect(request.member).toBe(member)
    expect(request.mcpScopes).toEqual(['listings:read', 'listings:write'])
  })

  it('jeton OAuth avec portée : seules les portées déclarées', async () => {
    const token = fakeJwt({ sub: 'sb-1', scope: 'openid listings:read' })
    const { context: ctx, request } = context(`Bearer ${token}`)
    await guard.canActivate(ctx)
    expect(request.mcpScopes).toEqual(['listings:read'])
  })
})
