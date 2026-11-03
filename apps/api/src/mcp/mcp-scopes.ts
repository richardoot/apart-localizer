import { MCP_SCOPES } from '@apart/contracts'
import type { McpScope } from '@apart/contracts'

/**
 * Les portées d'un jeton, lues dans sa charge utile JWT.
 *
 * Un jeton émis par le serveur OAuth 2.1 de Supabase à un client tiers
 * (claude.ai) porte une revendication `scope` (chaîne séparée par des
 * espaces). Un jeton de session de première main (l'application web, un
 * test) n'en porte pas : il vaut alors toutes les portées, puisque la
 * personne derrière peut tout faire dans l'application. Le jeton est
 * authentifié par Supabase, pas ici : cette lecture ne vérifie aucune
 * signature, elle lit une revendication d'un jeton déjà accepté.
 *
 * Rend `null` quand le jeton ne dit rien de ses portées.
 */
export function scopesFromToken(token: string): string[] | null {
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
