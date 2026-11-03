/**
 * What the HTTP layer promises the browser, decided in one place.
 *
 * - Whether Swagger is served. `/api/docs` publishes the complete map of the
 *   API to anyone who asks, unauthenticated: a gift in development and a
 *   reconnaissance report in production, so it is served only outside
 *   production, with `API_DOCS=1` as the explicit override.
 * - What helmet sends. The strict profile is what an API should say: a CSP
 *   that forbids everything (these responses are JSON), plus helmet's
 *   defaults. Swagger UI cannot live under that CSP, so the relaxed profile
 *   exists for exactly as long as the docs do.
 *
 * Pure functions over `process.env`-shaped input.
 */
import type { HelmetOptions } from 'helmet'

export interface HardeningEnv {
  NODE_ENV?: string | undefined
  API_DOCS?: string | undefined
}

/** Whether `/api/docs` (and the relaxed CSP it drags in) is served. */
export function apiDocsEnabled(env: HardeningEnv): boolean {
  if (env.API_DOCS === '1') return true
  return env.NODE_ENV !== 'production'
}

/** The helmet profile matching that decision. */
export function helmetOptions(docsEnabled: boolean): HelmetOptions {
  if (docsEnabled) {
    return {
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    }
  }
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  }
}
