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
  SUPABASE_EXTERNAL_URL: z
    .string()
    .url()
    .optional()
    .describe(
      "URL du projet Supabase telle qu'un client MCP l'atteint (défaut : SUPABASE_URL)"
    ),
  MCP_PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .describe(
      "URL publique de l'endpoint MCP annoncée dans la découverte OAuth (défaut : déduite de la requête)"
    ),
  FRONTEND_URL: z
    .string()
    .default('http://localhost:5173')
    .describe('Origines CORS autorisées, séparées par des virgules'),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  LOG_LEVEL: z
    .enum(['verbose', 'debug', 'log', 'warn', 'error', 'fatal'])
    .optional(),
  API_DOCS: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(300),
  // IA : la clé reste côté serveur ; sans elle, l'extraction répond 503 et
  // le reste fonctionne. Les bornes fines sont vérifiées par ai/ai.config.ts.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_MODEL_BULK: z.string().min(1).optional(),
  AI_EFFORT: z.enum(['low', 'medium', 'high']).optional(),
  AI_MAX_TOKENS: z.coerce.number().int().min(1024).optional(),
  AI_MAX_IMAGES: z.coerce.number().int().min(0).optional(),
  AI_MAX_IMAGE_MB: z.coerce.number().positive().optional(),
  // Données ouvertes : géocodeur IGN Géoplateforme (défaut dans opendata/geoplateforme.ts).
  GEOCODING_URL: z.string().url().optional(),
  ISOCHRONE_URL: z.string().url().optional(),
  ADEME_DPE_URL: z.string().url().optional(),
  GEORISQUES_URL: z.string().url().optional(),
  // Lot 6 : photos de visite dans Supabase Storage (bucket privé).
  STORAGE_BUCKET_VISIT_PHOTOS: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,62}$/)
    .default('visit-photos')
    .describe('Bucket privé des photos de visite'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(600)
    .describe('Durée de validité des URL signées de lecture, en secondes'),
  // Web push : clés VAPID (npx web-push generate-vapid-keys), jamais commitées.
  VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/)
    .optional()
    .describe('Contact VAPID : mailto:adresse ou https://site'),
  // E-mail sortant (facultatif) : un point d'envoi HTTP JSON, sinon inerte.
  EMAIL_HTTP_URL: z.string().url().optional(),
  EMAIL_HTTP_TOKEN: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  // E-mails d'alerte entrants : secret HMAC du webhook (32 caractères au moins).
  INBOUND_EMAIL_SECRET: z.string().min(32).optional(),
  // Lot 8 : durée de validité d'une invitation, en jours (défaut 14).
  INVITATION_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe(
      "Durée de validité d'une invitation à rejoindre l'espace, en jours"
    ),
})
export type Env = z.infer<typeof EnvSchema>

/** Les origines CORS, une par entrée. */
export function corsOrigins(frontendUrl: string): string[] {
  return frontendUrl
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** L'URL Supabase que les clients extérieurs (claude.ai) atteignent. */
export function supabaseExternalUrl(env: {
  SUPABASE_URL?: string | undefined
  SUPABASE_EXTERNAL_URL?: string | undefined
}): string {
  return (env.SUPABASE_EXTERNAL_URL || env.SUPABASE_URL || '').replace(
    /\/$/,
    ''
  )
}

/** Limites du garde-fou de débit : ttl en millisecondes, limite par fenêtre et par adresse. */
export function throttleOptions(env: {
  THROTTLE_TTL_MS?: string | undefined
  THROTTLE_LIMIT?: string | undefined
}): { ttl: number; limit: number } {
  const parsed = EnvSchema.pick({
    THROTTLE_TTL_MS: true,
    THROTTLE_LIMIT: true,
  }).safeParse(
    Object.fromEntries(
      Object.entries(env).filter(([, value]) => value !== '' && value != null)
    )
  )
  return parsed.success
    ? { ttl: parsed.data.THROTTLE_TTL_MS, limit: parsed.data.THROTTLE_LIMIT }
    : { ttl: 60_000, limit: 300 }
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
