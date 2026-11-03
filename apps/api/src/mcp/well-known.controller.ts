import { Controller, Get, Header, Req } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Request } from 'express'
import { protectedResourceMetadata } from './discovery'
import { OAuthDiscoveryService } from './oauth-discovery.service'

/**
 * Découverte OAuth, sans authentification : un client MCP qui reçoit un 401
 * lit `/.well-known/oauth-protected-resource`, y trouve le serveur
 * d'autorisation (GoTrue) et les portées, puis `/.well-known/oauth-authorization-server`
 * relayé depuis GoTrue pour les endpoints d'autorisation et de jeton.
 */
@ApiExcludeController()
@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly discovery: OAuthDiscoveryService) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  @Header('Cache-Control', 'public, max-age=300')
  protectedResource(@Req() req: Request): Record<string, unknown> {
    return protectedResourceMetadata(req, process.env)
  }

  @Get('oauth-authorization-server')
  @Header('Cache-Control', 'public, max-age=300')
  authorizationServer(): Promise<unknown> {
    return this.discovery.authorizationServerMetadata()
  }
}
