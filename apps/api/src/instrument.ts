/**
 * Sentry, démarré avant tout le reste.
 *
 * Importé en premier par main.ts : le SDK instrumente `http`, `pg` et le
 * client Prisma au chargement, et ce qui est chargé avant lui ne l'est pas.
 * Sans SENTRY_DSN (à un bureau, dans les tests) il ne fait rien.
 */
import * as Sentry from '@sentry/nestjs'
import { sentryOptions } from './common/sentry'

const options = sentryOptions(process.env)
if (options) {
  Sentry.init({
    ...options,
    integrations: [Sentry.prismaIntegration()],
  })
}
