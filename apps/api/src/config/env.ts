import { z } from 'zod'

/**
 * Les variables d'environnement, validées une fois au démarrage. Un nom mal
 * orthographié ou une URL absente arrête le processus avec un message qui
 * nomme la variable, au lieu d'un échec obscur à la première requête.
 */
export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .describe('Connexion Postgres du serveur (pooler en production)'),
  DIRECT_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().describe('URL du projet Supabase'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1)
    .describe('Clé service_role, côté serveur uniquement'),
  FRONTEND_URL: z
    .string()
    .default('http://localhost:5173')
    .describe('Origines CORS autorisées, séparées par des virgules'),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  LOG_LEVEL: z
    .enum(['verbose', 'debug', 'log', 'warn', 'error', 'fatal'])
    .optional(),
  API_DOCS: z.string().optional(),
})
export type Env = z.infer<typeof EnvSchema>

/** Les origines CORS, une par entrée. */
export function corsOrigins(frontendUrl: string): string[] {
  return frontendUrl
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Validation passée à `ConfigModule.forRoot`. Les variables vides sont
 * traitées comme absentes : un `.env.example` copié tel quel laisse des
 * `LOG_LEVEL=` qui ne doivent pas être pris pour une valeur.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== '')
  )
  const result = EnvSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuration invalide — ${issues}`)
  }
  return result.data
}
