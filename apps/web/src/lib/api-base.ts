/**
 * Où le web joint l'API (ADR 0048).
 *
 * Deux adresses, qui peuvent différer :
 * - celle des requêtes de l'application : le chemin `VITE_API_PROXY_PATH`
 *   (`/api` en production) quand il est donné, réécrit vers l'API par
 *   `vercel.json` (ou le serveur de Vite en local). Même origine que la page,
 *   donc aucun pré-vol CORS : chaque pré-vol réveillait une fonction Vercel ;
 * - l'adresse publique de l'API (`VITE_API_URL`), pour ce qu'un autre
 *   programme doit joindre directement : le connecteur MCP de claude.ai et
 *   le webhook des alertes e-mail.
 */
export interface ApiEnv {
  VITE_API_URL?: string | undefined
  VITE_API_PROXY_PATH?: string | undefined
}

const LOCAL_API = 'http://localhost:3000'

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

/** L'adresse publique de l'API, absolue, sans barre finale. */
export function apiPublicUrl(env: ApiEnv): string {
  const url = env.VITE_API_URL?.trim()
  return trimSlash(url ? url : LOCAL_API)
}

/**
 * Le chemin de la réécriture, normalisé (`api/` → `/api`), ou `null` sans
 * chemin ou s'il n'est pas un chemin de la même origine.
 */
export function apiProxyPath(env: ApiEnv): string | null {
  const raw = env.VITE_API_PROXY_PATH?.trim()
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    return null
  }
  const path = trimSlash(raw.startsWith('/') ? raw : `/${raw}`)
  return path === '' ? null : path
}

/** Ce que les requêtes de l'application préfixent : la réécriture, sinon l'API. */
export function apiRequestBase(env: ApiEnv): string {
  return apiProxyPath(env) ?? apiPublicUrl(env)
}
