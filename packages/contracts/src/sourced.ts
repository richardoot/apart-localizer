import { z } from 'zod'
import { FieldSourceSchema } from './enums.js'

/**
 * Provenance d'une valeur : d'où elle vient, avec quelle confiance, et sur
 * quel extrait elle s'appuie quand c'est l'IA qui l'a lue.
 */
export const ProvenanceSchema = z.object({
  source: FieldSourceSchema,
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confiance de 0 à 1 (surtout pour une valeur extraite par IA)'),
  evidence: z
    .string()
    .max(2000)
    .optional()
    .describe("Extrait de l'annonce qui justifie la valeur"),
  recordedAt: z
    .string()
    .datetime()
    .optional()
    .describe('Date ISO 8601 à laquelle la valeur a été relevée'),
})
export type Provenance = z.infer<typeof ProvenanceSchema>

/**
 * `Sourced<T>` : une valeur accompagnée de sa provenance. Utilisé par la
 * sortie structurée de l'extraction IA et par les outils MCP qui veulent
 * expliquer d'où vient un chiffre.
 */
export function sourced<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    ...ProvenanceSchema.shape,
  })
}
export type Sourced<T> = Provenance & { value: T }

/**
 * Carte des provenances d'une annonce : nom de champ → provenance. Le champ
 * est une clé du schéma `Listing` (prix, surface, taxe foncière...).
 */
export const FieldProvenanceMapSchema = z
  .record(z.string(), ProvenanceSchema)
  .describe(
    "Provenance par champ : clé = nom du champ de l'annonce, valeur = source, confiance, extrait"
  )
export type FieldProvenanceMap = z.infer<typeof FieldProvenanceMapSchema>
