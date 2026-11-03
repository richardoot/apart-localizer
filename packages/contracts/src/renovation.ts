import { z } from 'zod'
import { RenovationLevelSchema } from './enums.js'

export const RenovationItemInputSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(200)
    .describe('Poste de travaux (peinture, sols, cuisine...)'),
  amount: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Montant estimé du poste en euros TTC ; null = pas encore chiffré'
    ),
})
export type RenovationItemInput = z.infer<typeof RenovationItemInputSchema>

export const RenovationItemSchema = RenovationItemInputSchema.extend({
  id: z.string().uuid(),
  position: z.number().int().min(0).describe("Ordre d'affichage"),
})
export type RenovationItem = z.infer<typeof RenovationItemSchema>

/** Travaux avant emménagement. */
export const RenovationInputSchema = z.object({
  active: z
    .boolean()
    .default(false)
    .describe(
      'Travaux prévus avant emménagement ; faux = aucun travaux compté'
    ),
  level: RenovationLevelSchema.nullable().default(null),
  durationMonths: z
    .number()
    .int()
    .min(0)
    .max(60)
    .nullable()
    .default(null)
    .describe('Durée estimée des travaux en mois'),
  items: z.array(RenovationItemInputSchema).default([]),
  notes: z.string().max(5000).nullable().default(null),
})
export type RenovationInput = z.infer<typeof RenovationInputSchema>

export const RenovationSchema = RenovationInputSchema.extend({
  items: z.array(RenovationItemSchema),
})
export type Renovation = z.infer<typeof RenovationSchema>

/** Postes suggérés dans le formulaire, repris de l'artefact. */
export const SUGGESTED_RENOVATION_ITEMS: readonly string[] = [
  'Peinture',
  'Sols',
  'Cuisine',
  'Salle de bains',
  'Électricité',
  'Plomberie',
  'Menuiseries / fenêtres',
  'Chauffage',
  'Isolation',
  'Cloison (chambre en plus)',
]
