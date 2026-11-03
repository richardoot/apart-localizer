import { Module } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ZodValidationPipe } from 'nestjs-zod'
import { validateEnv } from './config/env'
import { PrismaModule } from './prisma/prisma.module'
import { ActivityModule } from './activity/activity.module'
import { GeoModule } from './geo/geo.module'
import { HealthModule } from './health/health.module'
import { WorkspaceModule } from './workspace/workspace.module'
import { AuthModule } from './auth/auth.module'
import { AssumptionsModule } from './assumptions/assumptions.module'
import { ListingsModule } from './listings/listings.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ActivityModule,
    GeoModule,
    HealthModule,
    WorkspaceModule,
    AuthModule,
    AssumptionsModule,
    ListingsModule,
  ],
  providers: [
    // Every @Body() and @Query() DTO is a createZodDto(schema): the pipe
    // parses with the schema and answers 400 with the issues.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
