import { Module } from '@nestjs/common'
import { APP_GUARD, APP_PIPE } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { SentryModule } from '@sentry/nestjs/setup'
import { ZodValidationPipe } from 'nestjs-zod'
import { throttleOptions, validateEnv } from './config/env'
import { PrismaModule } from './prisma/prisma.module'
import { ActivityModule } from './activity/activity.module'
import { GeoModule } from './geo/geo.module'
import { HealthModule } from './health/health.module'
import { WorkspaceModule } from './workspace/workspace.module'
import { AuthModule } from './auth/auth.module'
import { AssumptionsModule } from './assumptions/assumptions.module'
import { ListingsModule } from './listings/listings.module'
import { OpinionsModule } from './opinions/opinions.module'
import { OffersModule } from './offers/offers.module'
import { TasksModule } from './tasks/tasks.module'
import { SearchCriteriaModule } from './search-criteria/search-criteria.module'
import { StudyModule } from './study/study.module'
import { VisitsModule } from './visits/visits.module'
import { WhatsNewModule } from './whats-new/whats-new.module'
import { InboundModule } from './inbound/inbound.module'
import { ExportModule } from './export/export.module'
import { McpModule } from './mcp/mcp.module'

@Module({
  imports: [
    // Inerte sans SENTRY_DSN (instrument.ts n'initialise pas le SDK).
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Garde-fou de débit par adresse, sur toutes les routes (santé,
    // découverte OAuth, MCP, REST). Deux utilisateurs n'approchent jamais la
    // limite ; un robot qui frappe /health ou /mcp, si.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...throttleOptions(process.env) }],
      errorMessage: 'Trop de requêtes : réessayez dans une minute.',
    }),
    PrismaModule,
    ActivityModule,
    GeoModule,
    HealthModule,
    WorkspaceModule,
    AuthModule,
    AssumptionsModule,
    ListingsModule,
    OpinionsModule,
    OffersModule,
    TasksModule,
    SearchCriteriaModule,
    StudyModule,
    VisitsModule,
    WhatsNewModule,
    InboundModule,
    ExportModule,
    McpModule,
  ],
  providers: [
    // Every @Body() and @Query() DTO is a createZodDto(schema): the pipe
    // parses with the schema and answers 400 with the issues.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
