// Sentry d'abord, avant les modules qu'il instrumente. Voir instrument.ts.
import './instrument'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { apiDocsEnabled, helmetOptions } from './common/http-hardening'
import { createLogger, logFormat } from './common/logging'
import { requestLogger } from './common/request-log'
import { corsOrigins } from './config/env'

/**
 * Taille maximale d'un corps JSON (captures en base64 comprises). Non exportée :
 * le lanceur NestJS de Vercel refuse un `dist/main.js` qui a des exports sans
 * export par défaut (« Invalid export found in module », main.spec.ts).
 */
const JSON_BODY_LIMIT = '25mb'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // JSON lines in production so Vercel indexes them, readable ones at a
    // desk. Decided in common/logging.ts.
    logger: createLogger(process.env),
    // Le corps brut reste lisible pour vérifier la signature du webhook
    // d'alertes e-mail (inbound/inbound-signature.guard.ts).
    rawBody: true,
  })

  // One line per request, with an id the response also carries. First in
  // the chain so that a request refused by a guard is logged too.
  app.use(requestLogger(logFormat(process.env)))

  // Les captures d'écran de l'extraction IA voyagent en base64 dans le JSON :
  // la limite par défaut (100 ko) ne suffit pas. Vercel plafonne de son côté
  // le corps d'une requête à 4,5 Mo ; le web réduit les images avant envoi.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT })

  // Trust the reverse proxy (Vercel) so that `req.protocol` reflects the
  // client-facing scheme and the OAuth discovery URLs say https://.
  app.set('trust proxy', 1)

  // Security headers: strict when the docs are off, relaxed while Swagger UI
  // is served. Both decisions come from common/http-hardening.ts.
  const docsEnabled = apiDocsEnabled(process.env)
  app.use(helmet(helmetOptions(docsEnabled)))

  // The Zod validation pipe is registered as APP_PIPE in AppModule.
  app.useGlobalFilters(new AllExceptionsFilter())

  app.enableCors({
    origin: corsOrigins(process.env.FRONTEND_URL ?? 'http://localhost:5173'),
    credentials: true,
  })

  // OpenAPI from the very Zod schemas the DTOs are built on, outside
  // production only (see http-hardening.ts).
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('apart-localizer API')
      .setDescription(
        "Suivi d'annonces d'achat d'appartement : annonces, hypothèses, calculs, géo"
      )
      .setVersion('0.1')
      .addBearerAuth()
      .build()
    const documentFactory = (): ReturnType<
      typeof SwaggerModule.createDocument
    > => cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
    SwaggerModule.setup('api/docs', app, documentFactory)
  }

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`)
}
void bootstrap()
