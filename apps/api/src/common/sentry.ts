/**
 * Ce que l'API dit à Sentry, décidé en un seul endroit.
 *
 * Sentry garde une défaillance après la fenêtre des journaux Vercel : la
 * pile, la requête, le membre (comme identifiant), la fréquence. Rien de ce
 * qui part ne doit pouvoir être pris pour les données : pas de corps de
 * requête, pas de chaîne de requête, pas de cookie, pas de variable locale.
 *
 * Fonctions pures sur une entrée de la forme de `process.env`, pour que la
 * politique soit vérifiable en test sans charger le SDK. Sans `SENTRY_DSN`,
 * `sentryOptions` rend `undefined` et le SDK n'est pas initialisé.
 */
import type { NodeOptions } from '@sentry/nestjs'

export interface SentryEnv {
  SENTRY_DSN?: string | undefined
  SENTRY_TRACES_SAMPLE_RATE?: string | undefined
  VERCEL_ENV?: string | undefined
  NODE_ENV?: string | undefined
  VERCEL_GIT_COMMIT_SHA?: string | undefined
}

/** Tout, par défaut : deux utilisateurs produisent quelques milliers de requêtes par jour. */
export const DEFAULT_TRACES_SAMPLE_RATE = 1

/** Un taux est un nombre dans [0, 1] ; tout autre texte vaut le défaut. */
export function sampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE
): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

const ID_SEGMENT = /^(?:[0-9a-f-]{20,}|\d{6,}|[A-Za-z0-9_-]{32,})$/i

/** Un chemin sans identifiant : `/listings/<uuid>/tasks` → `/listings/:id/tasks`. */
export function scrubPath(path: string): string {
  const bare = path.split('?')[0] ?? path
  return bare
    .split('/')
    .map(segment => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
}

/** Une URL réduite à son origine et à son chemin anonymisé. */
export function scrubUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return scrubPath(url)
  }
  return `${parsed.origin}${scrubPath(parsed.pathname)}`
}

type Breadcrumb = NonNullable<
  Parameters<NonNullable<NodeOptions['beforeBreadcrumb']>>[0]
>

/** Les fils d'Ariane HTTP gardent l'endpoint, perdent les identifiants. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url: unknown = breadcrumb.data?.url
  if (typeof url === 'string') {
    breadcrumb.data = { ...breadcrumb.data, url: scrubUrl(url) }
  }
  return breadcrumb
}

/** Les options de `Sentry.init`, ou `undefined` sans DSN. */
export function sentryOptions(env: SentryEnv): NodeOptions | undefined {
  if (!env.SENTRY_DSN) return undefined
  return {
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? 'development',
    release: env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: sampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
