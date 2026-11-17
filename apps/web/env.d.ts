/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
  /** ADR 0048 : `/api` en production, la réécriture de même origine vers l'API. */
  readonly VITE_API_PROXY_PATH?: string
  /** URL d'un style MapLibre sans clé ; défaut : OpenFreeMap Liberty. */
  readonly VITE_MAP_STYLE_URL?: string
  /** `1` = connexion par e-mail et mot de passe, en local seulement (ADR 0016). */
  readonly VITE_AUTH_PASSWORD?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string
  readonly VITE_VERCEL_ENV?: string
  readonly VITE_VERCEL_GIT_COMMIT_SHA?: string
}
