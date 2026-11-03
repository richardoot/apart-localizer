import { MCP_SCOPES } from '@apart/contracts'

/**
 * Découverte OAuth du connecteur MCP (RFC 9728, RFC 8414), en fonctions
 * pures : le contrôleur `.well-known` ne fait que les appeler.
 */

export interface RequestLike {
  protocol: string
  get(name: string): string | undefined
}

export interface DiscoveryEnv {
  SUPABASE_URL?: string | undefined
  SUPABASE_EXTERNAL_URL?: string | undefined
  MCP_PUBLIC_URL?: string | undefined
}

/** L'origine publique de l'API : `MCP_PUBLIC_URL` sans son chemin, sinon la requête. */
export function publicOrigin(req: RequestLike, env: DiscoveryEnv): string {
  if (env.MCP_PUBLIC_URL) {
    try {
      return new URL(env.MCP_PUBLIC_URL).origin
    } catch {
      // Une URL invalide : on retombe sur la requête.
    }
  }
  const host = req.get('host') ?? 'localhost:3000'
  return `${req.protocol}://${host}`
}

/** L'URL de la ressource protégée : l'endpoint MCP lui-même. */
export function resourceUrl(req: RequestLike, env: DiscoveryEnv): string {
  if (env.MCP_PUBLIC_URL) {
    try {
      const url = new URL(env.MCP_PUBLIC_URL)
      return url.pathname === '/' ? `${url.origin}/mcp` : url.toString()
    } catch {
      // idem
    }
  }
  return `${publicOrigin(req, env)}/mcp`
}

/** Le serveur d'autorisation : GoTrue, à l'URL que les clients atteignent. */
export function authorizationServerUrl(env: DiscoveryEnv): string {
  const base = (env.SUPABASE_EXTERNAL_URL || env.SUPABASE_URL || '').replace(
    /\/$/,
    ''
  )
  return `${base}/auth/v1`
}

/** Métadonnées de ressource protégée (RFC 9728). */
export function protectedResourceMetadata(
  req: RequestLike,
  env: DiscoveryEnv
): Record<string, unknown> {
  return {
    resource: resourceUrl(req, env),
    authorization_servers: [authorizationServerUrl(env)],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'apart-localizer MCP',
    resource_documentation: `${publicOrigin(req, env)}/.well-known/oauth-protected-resource`,
  }
}

/** L'URL où GoTrue publie ses métadonnées de serveur d'autorisation (RFC 8414). */
export function authorizationServerMetadataUrl(env: DiscoveryEnv): string {
  return `${authorizationServerUrl(env)}/.well-known/oauth-authorization-server`
}

/** L'en-tête `WWW-Authenticate` d'un 401 sur l'endpoint MCP. */
export function wwwAuthenticate(
  req: RequestLike,
  env: DiscoveryEnv,
  error?: string
): string {
  const parts = [
    `Bearer resource_metadata="${publicOrigin(req, env)}/.well-known/oauth-protected-resource"`,
  ]
  if (error) parts.push(`error="${error}"`)
  return parts.join(', ')
}
