import { MCP_SCOPES } from '@apart/contracts'
import type { McpScope } from '@apart/contracts'

/**
 * Les portées de l'application déclarées par un jeton, lues dans sa charge
 * utile JWT.
 *
 * Un jeton émis par le serveur OAuth 2.1 de Supabase à un client tiers
 * (claude.ai, Claude Code, l'inspecteur MCP) porte une revendication `scope`
 * (chaîne séparée par des espaces) ; un jeton de session de première main
 * (l'application web, un test) n'en porte pas. Seules les portées de
 * l'application (`listings:…`) comptent : GoTrue n'accepte que les portées
 * OpenID (`email`, `openid`, `profile`…) et en inscrit une dans tout jeton
 * OAuth, ce qui ne dit rien des droits sur les annonces (ADR 0017). Un jeton
 * qui ne déclare aucune portée de l'application vaut donc toutes les
 * portées, puisque la personne derrière peut tout faire dans l'application.
 * Le jeton est authentifié par Supabase, pas ici : cette lecture ne vérifie
 * aucune signature, elle lit une revendication d'un jeton déjà accepté.
 *
 * Rend `null` quand le jeton ne dit rien des portées de l'application.
 */
export function scopesFromToken(token: string): string[] | null {
  const declared = declaredScopes(token)
  if (declared === null) return null
  const own = declared.filter(isApplicationScope)
  return own.length > 0 ? own : null
}

/** Préfixe des portées de l'application (`listings:read`, `listings:write`). */
export const APPLICATION_SCOPE_PREFIX = 'listings:'

/** Vrai pour une portée de l'application, connue ou non (`listings:admin`). */
export function isApplicationScope(scope: string): boolean {
  return scope.startsWith(APPLICATION_SCOPE_PREFIX)
}

/** Toutes les portées que le jeton déclare, de l'application ou non. */
function declaredScopes(token: string): string[] | null {
  const payload = jwtPayload(token)
  if (!payload) return null
  const raw: unknown = payload.scope ?? payload.scopes ?? payload.scp
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === 'string')
  }
  return null
}

/** Vrai si le jeton accorde la portée : explicitement, ou parce qu'il n'en déclare aucune. */
export function hasScope(
  scopes: readonly string[] | null,
  scope: McpScope
): boolean {
  if (scopes === null) return true
  return scopes.includes(scope)
}

/** Les portées effectives : celles du jeton si connues, sinon toutes. */
export function effectiveScopes(scopes: readonly string[] | null): McpScope[] {
  if (scopes === null) return [...MCP_SCOPES]
  return MCP_SCOPES.filter(scope => scopes.includes(scope))
}

function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = Buffer.from(
      (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
