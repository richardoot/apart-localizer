/**
 * Le SDK Sentry, chargé seulement avec un DSN (ADR 0048).
 *
 * `@sentry/nestjs` et OpenTelemetry pèsent environ 230 ms de chargement à
 * chaque démarrage à froid. Sans `SENTRY_DSN` le SDK n'est jamais initialisé :
 * il n'est donc pas chargé non plus, ni son module Nest, et `captureException`
 * ne fait rien.
 */
import type { DynamicModule } from '@nestjs/common'
import type * as SentryNest from '@sentry/nestjs'
import type * as SentryNestSetup from '@sentry/nestjs/setup'
import { sentryOptions } from './sentry'
import type { SentryEnv } from './sentry'

type SentrySdk = Pick<
  typeof SentryNest,
  'init' | 'prismaIntegration' | 'captureException'
>
type SentrySetup = Pick<typeof SentryNestSetup, 'SentryModule'>

let started: SentrySdk | null = null

/* eslint-disable @typescript-eslint/no-require-imports -- chargement différé voulu */
const loadSdk = (): SentrySdk => require('@sentry/nestjs') as SentrySdk
const loadSetup = (): SentrySetup =>
  require('@sentry/nestjs/setup') as SentrySetup
/* eslint-enable @typescript-eslint/no-require-imports */

/** Démarre Sentry quand un DSN est donné ; rend le SDK, ou `null` sans DSN. */
export function startSentry(
  env: SentryEnv,
  load: () => SentrySdk = loadSdk
): SentrySdk | null {
  const options = sentryOptions(env)
  if (!options) return null
  const sdk = load()
  sdk.init({ ...options, integrations: [sdk.prismaIntegration()] })
  started = sdk
  return sdk
}

/** Le module Nest de Sentry, seulement si le SDK a démarré. */
export function sentryModules(
  load: () => SentrySetup = loadSetup
): DynamicModule[] {
  return started ? [load().SentryModule.forRoot()] : []
}

/** Envoie une erreur à Sentry, ou ne fait rien quand il n'a pas démarré. */
export function captureException(
  exception: unknown,
  hint?: Parameters<SentrySdk['captureException']>[1]
): void {
  started?.captureException(exception, hint)
}

/** Pour les tests : oublie le SDK démarré. */
export function resetSentryForTests(): void {
  started = null
}
