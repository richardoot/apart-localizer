/**
 * Ce que le navigateur dit à Sentry, décidé en un seul endroit. Sans
 * `VITE_SENTRY_DSN`, rien n'est initialisé. Pas de props de composant (les
 * props d'une ligne sont l'annonce), pas de corps de requête ; le membre est
 * un identifiant opaque.
 */
import * as Sentry from '@sentry/vue'
import type { BrowserOptions } from '@sentry/vue'
import type { App } from 'vue'
import type { Router } from 'vue-router'

export interface SentryEnv {
  VITE_SENTRY_DSN?: string | undefined
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string | undefined
  VITE_API_URL?: string | undefined
  VITE_VERCEL_ENV?: string | undefined
  VITE_VERCEL_GIT_COMMIT_SHA?: string | undefined
  MODE?: string | undefined
}

export const DEFAULT_TRACES_SAMPLE_RATE = 1

export function sampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE
): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/** L'origine à laquelle les en-têtes de trace peuvent partir : l'API, rien d'autre. */
export function apiOrigin(apiUrl: string | undefined): string {
  try {
    return new URL(apiUrl ?? 'http://localhost:3000').origin
  } catch {
    return 'http://localhost:3000'
  }
}

export type SentryInitOptions = Omit<BrowserOptions, 'integrations'>

export function sentryOptions(env: SentryEnv): SentryInitOptions | undefined {
  if (!env.VITE_SENTRY_DSN) return undefined
  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_VERCEL_ENV ?? env.MODE ?? 'development',
    release: env.VITE_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: sampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    tracePropagationTargets: [apiOrigin(env.VITE_API_URL)],
  }
}

/** Démarre le SDK, ou ne fait rien sans DSN. */
export function installSentry(app: App, router: Router): void {
  const options = sentryOptions(import.meta.env as SentryEnv)
  if (!options) return
  Sentry.init({
    app,
    ...options,
    integrations: [
      Sentry.vueIntegration({ attachProps: false }),
      Sentry.browserTracingIntegration({ router }),
    ],
  })
}

/** À qui appartiennent les événements, comme identifiant opaque ; `null` à la déconnexion. */
export function setSentryUser(id: string | null | undefined): void {
  Sentry.setUser(id ? { id } : null)
}
