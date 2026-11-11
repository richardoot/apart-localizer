import { z } from 'zod'
import { OpenDataStatusSchema } from './enums.js'

/**
 * Lot 28 : loyers observés par l'Observatoire local des loyers (OLL) de
 * l'agglomération de Bordeaux, par zone de calcul et nombre de pièces. Un
 * indicateur hors charges, jamais un plafond : il n'entre dans aucun calcul
 * (ADR 0038).
 */

/** Mention de la source, à afficher avec chaque valeur. */
export const RENT_OBSERVATORY_ATTRIBUTION =
  'Observatoire local des loyers de l’agglomération de Bordeaux (réseau des observatoires locaux des loyers, données ouvertes)'

/** Code de l'observatoire de l'agglomération de Bordeaux dans le réseau des OLL. */
export const BORDEAUX_RENT_OBSERVATORY = 'L3300'

/** Quartiles d'un loyer au m², hors charges. */
export const RentObservatoryStatsSchema = z.object({
  rooms: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe(
      'Pièces principales des appartements ; 4 = « 4 et plus » ; null = toutes tailles'
    ),
  medianPerM2: z
    .number()
    .positive()
    .describe('Loyer médian hors charges en €/m²/mois'),
  q1PerM2: z
    .number()
    .positive()
    .describe('1er quartile du loyer hors charges en €/m²/mois'),
  q3PerM2: z
    .number()
    .positive()
    .describe('3e quartile du loyer hors charges en €/m²/mois'),
  observations: z
    .number()
    .int()
    .min(0)
    .describe('Nombre de logements enquêtés'),
})
export type RentObservatoryStats = z.infer<typeof RentObservatoryStatsSchema>

/** Une zone de calcul de l'observatoire et ses loyers d'appartements. */
export const RentObservatoryZoneSchema = z.object({
  zone: z.number().int().min(1).describe('Numéro de la zone de calcul'),
  label: z.string().describe('Libellé de la zone (« Zone 3 »)'),
  stats: z
    .array(RentObservatoryStatsSchema)
    .min(1)
    .describe('Appartements : toutes tailles, puis par nombre de pièces'),
  recentTenants: RentObservatoryStatsSchema.nullable()
    .default(null)
    .describe(
      'Appartements dont le locataire est arrivé depuis moins d’un an, toutes tailles'
    ),
})
export type RentObservatoryZone = z.infer<typeof RentObservatoryZoneSchema>

/** Une année d'enquête importée, telle que rangée dans `ReferenceData` (sorte `rent_observatory`). */
export const RentObservatoryTableSchema = z.object({
  territory: z.string().describe('Territoire (bordeaux)'),
  observatory: z.string().describe('Code de l’observatoire (L3300)'),
  year: z.number().int().min(2000).describe('Année d’enquête'),
  observedAt: z
    .string()
    .date()
    .describe('Date des loyers observés (1er janvier de l’année d’enquête)'),
  housingType: z
    .literal('apartment')
    .describe('Type de logement de la table (appartements)'),
  zones: z.array(RentObservatoryZoneSchema).min(1),
  irisZones: z
    .record(z.string(), z.number().int().min(1))
    .describe('Zone de chaque IRIS des communes partagées entre zones'),
  communeZones: z
    .record(z.string(), z.number().int().min(1))
    .describe('Zone de chaque commune (code INSEE) entière dans une zone'),
  source: z.object({
    url: z.string().url().nullable(),
    file: z.string(),
    sha256: z.string(),
    importedAt: z.string().datetime(),
  }),
})
export type RentObservatoryTable = z.infer<typeof RentObservatoryTableSchema>

export const RentObservatoryPositionSchema = z
  .enum(['below_q1', 'within', 'above_q3'])
  .describe(
    'Place du loyer visé au m² : sous le 1er quartile, entre les quartiles, au-dessus du 3e quartile'
  )
export type RentObservatoryPosition = z.infer<
  typeof RentObservatoryPositionSchema
>

/** Le loyer observé pour une annonce : zone, quartiles et place du loyer visé. */
export const RentObservatoryLookupSchema = z.object({
  status: OpenDataStatusSchema,
  zone: z
    .object({ zone: z.number().int().min(1), label: z.string() })
    .nullable(),
  approximate: z
    .boolean()
    .describe('La zone est lue depuis un repère approché (rue, quartier)'),
  rooms: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe('Tranche de pièces retenue ; null = toutes tailles'),
  medianPerM2: z
    .number()
    .nullable()
    .describe('Loyer médian observé hors charges en €/m²/mois'),
  q1PerM2: z.number().nullable(),
  q3PerM2: z.number().nullable(),
  observations: z.number().int().nullable(),
  monthlyMedian: z
    .number()
    .nullable()
    .describe('Médiane au m² × surface, en euros par mois hors charges'),
  monthlyQ1: z.number().nullable(),
  monthlyQ3: z.number().nullable(),
  targetRent: z
    .number()
    .nullable()
    .describe('Loyer visé hors charges de l’annonce, en euros par mois'),
  gapToMedian: z
    .number()
    .nullable()
    .describe('Loyer visé / médiane observée − 1 (0,08 = 8 % au-dessus)'),
  position: RentObservatoryPositionSchema.nullable(),
  year: z.number().int().nullable().describe('Année d’enquête'),
  observedAt: z.string().date().nullable(),
  sourceUrl: z.string().nullable(),
  attribution: z.string().describe('Mention de la source'),
  reasons: z
    .array(z.string())
    .describe('Pourquoi le loyer observé est à vérifier ou sans objet'),
  notes: z
    .array(z.string())
    .describe('Remarques : place du loyer visé, limites de la donnée'),
})
export type RentObservatoryLookup = z.infer<typeof RentObservatoryLookupSchema>
