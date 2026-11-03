import { z } from 'zod'
import { AI_MAX_IMAGES_HARD, AI_MAX_IMAGE_BYTES } from '@apart/contracts'

/** Modèle par défaut de l'extraction : précis, cadré par le schéma. */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5'
/** Modèle économique pour les relectures rapides et le volume. */
export const DEFAULT_AI_MODEL_BULK = 'claude-haiku-5-5'

export const AiEffortSchema = z.enum(['low', 'medium', 'high'])
export type AiEffort = z.infer<typeof AiEffortSchema>

const AiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default(DEFAULT_AI_MODEL),
  AI_MODEL_BULK: z.string().min(1).default(DEFAULT_AI_MODEL_BULK),
  AI_EFFORT: AiEffortSchema.default('medium'),
  AI_MAX_TOKENS: z.coerce.number().int().min(1024).max(128_000).default(16_000),
  AI_MAX_IMAGES: z.coerce
    .number()
    .int()
    .min(0)
    .max(AI_MAX_IMAGES_HARD)
    .default(4),
  AI_MAX_IMAGE_MB: z.coerce.number().min(0.1).max(5).default(5),
})

export interface AiConfig {
  /** Absente = IA non configurée : le reste de l'application fonctionne. */
  apiKey: string | null
  model: string
  bulkModel: string
  effort: AiEffort
  maxTokens: number
  maxImages: number
  maxImageBytes: number
}

/**
 * La configuration de l'IA lue dans l'environnement. Les variables vides
 * comptent comme absentes (un `.env.example` copié tel quel).
 */
export function aiConfig(env: Record<string, string | undefined>): AiConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== '' && value != null)
  )
  const parsed = AiEnvSchema.safeParse(cleaned)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuration IA invalide — ${issues}`)
  }
  const value = parsed.data
  return {
    apiKey: value.ANTHROPIC_API_KEY ?? null,
    model: value.AI_MODEL,
    bulkModel: value.AI_MODEL_BULK,
    effort: value.AI_EFFORT,
    maxTokens: value.AI_MAX_TOKENS,
    maxImages: value.AI_MAX_IMAGES,
    maxImageBytes: Math.min(
      Math.round(value.AI_MAX_IMAGE_MB * 1024 * 1024),
      AI_MAX_IMAGE_BYTES
    ),
  }
}
