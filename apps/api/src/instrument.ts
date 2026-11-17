/**
 * Sentry, démarré avant tout le reste.
 *
 * Importé en premier par main.ts : le SDK instrumente `http`, `pg` et le
 * client Prisma au chargement, et ce qui est chargé avant lui ne l'est pas.
 * Sans SENTRY_DSN (à un bureau, dans les tests, en production tant qu'aucun
 * DSN n'est posé) le SDK n'est même pas chargé (ADR 0048).
 */
import { startSentry } from './common/sentry-runtime'

startSentry(process.env)
