/**
 * Boots the real application for e2e specs, on a database of its own.
 *
 * Five things are substituted, and only five:
 *  - PrismaService, pointed at a throwaway PostGIS database provisioned from
 *    prisma/migrations (see e2e-database.ts);
 *  - SupabaseService, the one call that leaves the machine to validate a
 *    token;
 *  - the Anthropic client (ANTHROPIC_CLIENT), replaced by a recorder whose
 *    `parse` each spec scripts (`ctx.ai.parse`), or by null to exercise the
 *    "IA non configurée" answer (`{ ai: false }`);
 *  - the geocoder's fetch (GeocodingService.fetchImpl), which answers "no
 *    result" unless a spec says otherwise (`ctx.geocoding.fetchImpl`);
 *  - the other open data clients' fetch: the ADEME DPE search answers "no
 *    DPE" (`ctx.dpe.fetchImpl`) and the Géoplateforme isochrone fails
 *    (`ctx.isochrone.fetchImpl`), unless a spec scripts them.
 *
 * Everything else runs for real: SupabaseGuard (token extraction, member
 * resolution), the Zod validation pipe, the exception filter, the services,
 * the SQL and PostGIS.
 */
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Server } from 'node:http'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import { AppModule } from '../src/app.module'
import { ANTHROPIC_CLIENT } from '../src/ai/ai-client'
import { PrismaService } from '../src/prisma/prisma.service'
import { SupabaseService } from '../src/auth/supabase.service'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { requestLogger } from '../src/common/request-log'
import { GeocodingService } from '../src/opendata/geocoding.service'
import { DpeService } from '../src/opendata/dpe.service'
import { IsochroneService } from '../src/opendata/isochrone.service'
import { createE2eDatabase } from './e2e-database'
import type { E2eDatabase } from './e2e-database'

/** A caller: a bearer token, and the Supabase identity it stands for. */
export interface E2eIdentity {
  token: string
  supabaseId: string
  email: string
  name: string
}

/**
 * Build an identity. Each spec file gets an empty database, so labels only
 * have to be unique within a file. With `scope`, the token is shaped like the
 * JWT Supabase's OAuth server issues to a third-party client (unsigned here:
 * the harness replaces the verification), so the MCP guard reads its scopes.
 */
export function e2eIdentity(
  label: string,
  options: { scope?: string } = {}
): E2eIdentity {
  const supabaseId = `e2e-supabase-${label}`
  const token =
    options.scope === undefined
      ? `e2e-token-${label}`
      : fakeJwt({ sub: supabaseId, scope: options.scope, label })
  return {
    token,
    supabaseId,
    email: `${label}@e2e.invalid`,
    name: label.charAt(0).toUpperCase() + label.slice(1),
  }
}

/** An unsigned JWT: three base64url segments, a payload the guard can read. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.e2e-signature`
}

/** The fake Anthropic client: `parse` is scripted by each spec. */
export interface FakeAnthropic {
  messages: { parse: Mock }
}

export interface E2eContext {
  app: INestApplication
  /** Typed once here, so no spec has to cast `getHttpServer()` itself. */
  server: Server
  prisma: PrismaService
  db: E2eDatabase
  /** The scripted model: `ctx.ai.parse.mockResolvedValue(fakeParsedMessage(...))`. */
  ai: FakeAnthropic
  /** The geocoder; set `fetchImpl` to script the Géoplateforme's answers. */
  geocoding: GeocodingService
  /** The ADEME DPE search; set `fetchImpl` to script its answers. */
  dpe: DpeService
  /** The Géoplateforme isochrones; set `fetchImpl` to script its answers. */
  isochrone: IsochroneService
  /** Authorization header for a known identity. */
  auth: (identity: E2eIdentity) => { Authorization: string }
  /** Closes the app and drops the database. */
  close: () => Promise<void>
}

export interface E2eOptions {
  /** False builds the app without an AI client, as when ANTHROPIC_API_KEY is unset. */
  ai?: boolean
}

/** The ADEME answer with no DPE: the default for every spec. */
export const NO_DPE_RESULT: typeof NO_GEOCODE_RESULT = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ total: 0, results: [] }),
  })

/** The isochrone service down: the default, so that no spec reaches the network. */
export const ISOCHRONE_DOWN: typeof NO_GEOCODE_RESULT = () =>
  Promise.resolve({
    ok: false,
    status: 503,
    json: () => Promise.resolve({}),
  })

/** A geocoder answer with no result: the default for every spec. */
export const NO_GEOCODE_RESULT = (): Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}> =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ features: [] }),
  })

export async function createE2eApp(
  identities: E2eIdentity[],
  options: E2eOptions = {}
): Promise<E2eContext> {
  const byToken = new Map(
    identities.map(identity => [identity.token, identity])
  )
  const database = await createE2eDatabase()
  const ai: FakeAnthropic = { messages: { parse: vi.fn() } }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(database.prisma)
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue(options.ai === false ? null : ai)
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

  const app = moduleFixture.createNestApplication<NestExpressApplication>()

  // Mirrors main.ts: without these, validation and error shapes differ from
  // production and the specs would assert on something that never runs.
  app.use(requestLogger('pretty'))
  app.useBodyParser('json', { limit: '25mb' })
  app.useGlobalFilters(new AllExceptionsFilter())

  await app.init()

  // Nothing leaves the machine: the geocoder answers "no result" by default.
  const geocoding = app.get(GeocodingService)
  geocoding.fetchImpl = NO_GEOCODE_RESULT
  const dpe = app.get(DpeService)
  dpe.fetchImpl = NO_DPE_RESULT
  const isochrone = app.get(IsochroneService)
  isochrone.fetchImpl = ISOCHRONE_DOWN

  return {
    app,
    server: app.getHttpServer() as Server,
    prisma: database.prisma as unknown as PrismaService,
    db: database,
    ai,
    geocoding,
    dpe,
    isochrone,
    auth: identity => ({ Authorization: `Bearer ${identity.token}` }),
    close: async () => {
      await app.close()
      await database.close()
    },
  }
}
