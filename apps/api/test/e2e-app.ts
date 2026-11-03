/**
 * Boots the real application for e2e specs, on a database of its own.
 *
 * Two things are substituted, and only two:
 *  - PrismaService, pointed at a throwaway PostGIS database provisioned from
 *    prisma/migrations (see e2e-database.ts);
 *  - SupabaseService, the one call that leaves the machine to validate a
 *    token.
 *
 * Everything else runs for real: SupabaseGuard (token extraction, member
 * resolution), the Zod validation pipe, the exception filter, the services,
 * the SQL and PostGIS.
 */
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { SupabaseService } from '../src/auth/supabase.service'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { requestLogger } from '../src/common/request-log'
import { createE2eDatabase } from './e2e-database'
import type { E2eDatabase } from './e2e-database'

/** A caller: a bearer token, and the Supabase identity it stands for. */
export interface E2eIdentity {
  token: string
  supabaseId: string
  email: string
  name: string
}

/** Build an identity. Each spec file gets an empty database, so labels only have to be unique within a file. */
export function e2eIdentity(label: string): E2eIdentity {
  return {
    token: `e2e-token-${label}`,
    supabaseId: `e2e-supabase-${label}`,
    email: `${label}@e2e.invalid`,
    name: label.charAt(0).toUpperCase() + label.slice(1),
  }
}

export interface E2eContext {
  app: INestApplication
  /** Typed once here, so no spec has to cast `getHttpServer()` itself. */
  server: Server
  prisma: PrismaService
  db: E2eDatabase
  /** Authorization header for a known identity. */
  auth: (identity: E2eIdentity) => { Authorization: string }
  /** Closes the app and drops the database. */
  close: () => Promise<void>
}

export async function createE2eApp(
  identities: E2eIdentity[]
): Promise<E2eContext> {
  const byToken = new Map(
    identities.map(identity => [identity.token, identity])
  )
  const database = await createE2eDatabase()

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(database.prisma)
    .overrideProvider(SupabaseService)
    .useValue({
      getUser: (token: string) => {
        const identity = byToken.get(token)
        if (!identity) {
          // Same failure the real service raises on a bad token.
          throw new UnauthorizedException('Jeton invalide ou expiré')
        }
        return Promise.resolve({
          id: identity.supabaseId,
          email: identity.email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: { full_name: identity.name },
        })
      },
    })
    .compile()

  const app = moduleFixture.createNestApplication()

  // Mirrors main.ts: without these, validation and error shapes differ from
  // production and the specs would assert on something that never runs.
  app.use(requestLogger('pretty'))
  app.useGlobalFilters(new AllExceptionsFilter())

  await app.init()

  return {
    app,
    server: app.getHttpServer() as Server,
    prisma: database.prisma as unknown as PrismaService,
    db: database,
    auth: identity => ({ Authorization: `Bearer ${identity.token}` }),
    close: async () => {
      await app.close()
      await database.close()
    },
  }
}
