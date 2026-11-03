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
  /** URL d'un style MapLibre sans clé ; défaut : OpenFreeMap Liberty. */
  readonly VITE_MAP_STYLE_URL?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string
  readonly VITE_VERCEL_ENV?: string
  readonly VITE_VERCEL_GIT_COMMIT_SHA?: string
}
