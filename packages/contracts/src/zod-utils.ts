import { z } from 'zod'

type StripDefaults<T extends z.ZodRawShape> = {
  [K in keyof T]: T[K] extends z.ZodDefault<infer Inner extends z.ZodType>
    ? Inner
    : T[K]
}

/**
 * La même forme sans ses valeurs par défaut de premier niveau. Nécessaire
 * pour un schéma de mise à jour partielle : `.partial()` seul laisse les
 * `.default()` remplir les champs absents, ce qui écraserait les valeurs
 * enregistrées.
 */
export function withoutDefaults<T extends z.ZodRawShape>(
  shape: T
): StripDefaults<T> {
  const entries = Object.entries(shape).map(([key, schema]) => [
    key,
    schema instanceof z.ZodDefault ? schema.removeDefault() : schema,
  ])
  return Object.fromEntries(entries) as StripDefaults<T>
}
