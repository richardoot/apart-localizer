import { z } from 'zod'

/**
 * Adéquation d'une annonce aux critères de recherche (lot 14, ADR 0024).
 * Pour chaque annonce et chaque critère actif, un niveau parmi quatre, avec
 * la raison chiffrée ; le niveau de l'annonce est le meilleur parmi les
 * critères actifs, le détail par critère est conservé. L'adéquation est une
 * autre dimension que le statut : elle ne dit pas où en est le suivi, mais si
 * l'annonce correspond à ce qu'on cherche. Les mesures géographiques
 * viennent de PostGIS (module geo), la décision de `domain`
 * (`criteriaFit`, `bestFit`).
 */

export const CriteriaFitLevelSchema = z
  .enum(['in', 'to_confirm', 'margin', 'out'])
  .describe(
    'Adéquation aux critères : in (dans les critères), to_confirm (à confirmer : adresse imprécise ou donnée manquante), margin (à la marge : dépassement dans la tolérance), out (hors critères)'
  )
export type CriteriaFitLevel = z.infer<typeof CriteriaFitLevelSchema>

export const CRITERIA_FIT_LEVEL_LABELS: Record<CriteriaFitLevel, string> = {
  in: 'Dans les critères',
  to_confirm: 'À confirmer',
  margin: 'À la marge',
  out: 'Hors critères',
}

/** Ce que chaque niveau veut dire, en une phrase (infobulle, MCP). */
export const CRITERIA_FIT_LEVEL_DESCRIPTIONS: Record<CriteriaFitLevel, string> =
  {
    in: 'Localisation précise dans le périmètre, ou quartier entièrement dedans, et tous les filtres respectés.',
    to_confirm:
      'Adresse imprécise dont le quartier ou la commune touche le périmètre, ou donnée manquante (surface, pièces, DPE) : l’annonce reste jusqu’à ce que l’information tranche.',
    margin:
      'Dépasse un seuil du critère, mais dans sa marge de tolérance (raison chiffrée).',
    out: 'Au-delà de la marge de tous les critères actifs ; rien n’est perdu, elle revient d’elle-même si un critère s’élargit, si le prix baisse ou si l’adresse la place dans le périmètre.',
  }

/**
 * Du meilleur au moins bon. « À confirmer » passe avant « à la marge » :
 * rien ne dit qu'une annonce à confirmer dépasse un seuil (l'information
 * manque), alors qu'une annonce à la marge le dépasse à coup sûr.
 */
export const CRITERIA_FIT_LEVELS_BY_PREFERENCE: readonly CriteriaFitLevel[] = [
  'in',
  'to_confirm',
  'margin',
  'out',
]

/** Les niveaux de l'onglet principal « Dans les critères ». */
export const MAIN_TAB_FIT_LEVELS: readonly CriteriaFitLevel[] = [
  'in',
  'to_confirm',
  'margin',
]

/** Les filtres d'un critère que l'adéquation contrôle, un par ligne du détail. */
export const CriteriaFitCheckKeySchema = z
  .enum([
    'perimeter',
    'tram',
    'commune',
    'price_max',
    'price_min',
    'surface_min',
    'rooms_min',
    'dpe_max',
    'verdict',
  ])
  .describe(
    'Filtre contrôlé : périmètre, distance au tram, commune, prix maximal, prix minimal, surface minimale, pièces minimales, DPE maximal, verdict'
  )
export type CriteriaFitCheckKey = z.infer<typeof CriteriaFitCheckKeySchema>

// ---------------------------------------------------------------------------
// Marge de tolérance
// ---------------------------------------------------------------------------

/** Bornes des marges réglables. */
export const TOLERANCE_METERS_MAX = 2000
export const TOLERANCE_SHARE_MAX = 0.5
export const TOLERANCE_COUNT_MAX = 3

/**
 * La marge de tolérance d'un critère : au-delà d'un seuil mais en deçà de sa
 * marge, une annonce est « à la marge » ; au-delà, « hors critères ». 0 =
 * strict. Les parts sont des fractions (0,05 = 5 %).
 */
export interface CriteriaTolerance {
  perimeterMeters: number
  priceMaxShare: number
  priceMinShare: number
  surfaceMinShare: number
  roomsMin: number
  dpeClasses: number
  tramMeters: number
}

/**
 * La marge par défaut, proposée au lot 14 et validée par Richard le
 * 5 novembre 2026 (maquette « Critères : marge de tolérance », ADR 0024) :
 * 300 m autour du périmètre (adresse exacte ou à la rue ; pour une adresse
 * imprécise, c'est la distance du contour du quartier ou de la commune),
 * +5 % au-dessus du prix maximal, −5 % sous le prix minimal et sous la
 * surface minimale, aucune pièce de moins, une classe DPE de plus, 100 m de
 * plus jusqu'au tram. À changer avec sa date, l'ADR et la documentation.
 */
export const DEFAULT_CRITERIA_TOLERANCE: CriteriaTolerance = {
  perimeterMeters: 300,
  priceMaxShare: 0.05,
  priceMinShare: 0.05,
  surfaceMinShare: 0.05,
  roomsMin: 0,
  dpeClasses: 1,
  tramMeters: 100,
}

/** La date et la source de la marge par défaut. */
export const DEFAULT_CRITERIA_TOLERANCE_SOURCE = {
  asOf: '2026-11-05',
  label:
    'Valeurs proposées au lot 14 et validées par Richard le 5 novembre 2026 (ADR 0024)',
} as const

/** Aucune marge : chaque seuil est strict. */
export const STRICT_CRITERIA_TOLERANCE: CriteriaTolerance = {
  perimeterMeters: 0,
  priceMaxShare: 0,
  priceMinShare: 0,
  surfaceMinShare: 0,
  roomsMin: 0,
  dpeClasses: 0,
  tramMeters: 0,
}

const meters = (what: string, fallback: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(TOLERANCE_METERS_MAX)
    .default(fallback)
    .describe(`${what}, en mètres (0 à ${TOLERANCE_METERS_MAX} ; 0 = strict)`)
const share = (what: string, fallback: number) =>
  z
    .number()
    .min(0)
    .max(TOLERANCE_SHARE_MAX)
    .default(fallback)
    .describe(
      `${what}, en fraction (0,05 = 5 % ; 0 à ${TOLERANCE_SHARE_MAX} ; 0 = strict)`
    )
const count = (what: string, fallback: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(TOLERANCE_COUNT_MAX)
    .default(fallback)
    .describe(`${what} (0 à ${TOLERANCE_COUNT_MAX} ; 0 = strict)`)

const d = DEFAULT_CRITERIA_TOLERANCE
export const CriteriaToleranceSchema = z
  .object({
    perimeterMeters: meters(
      'Marge autour du périmètre : distance hors du périmètre acceptée pour une adresse exacte ou à la rue ; pour une adresse imprécise, distance du contour du quartier ou de la commune qui la rend « à confirmer »',
      d.perimeterMeters
    ),
    priceMaxShare: share(
      'Dépassement accepté du prix maximal',
      d.priceMaxShare
    ),
    priceMinShare: share('Écart accepté sous le prix minimal', d.priceMinShare),
    surfaceMinShare: share(
      'Écart accepté sous la surface minimale',
      d.surfaceMinShare
    ),
    roomsMin: count('Pièces de moins acceptées sous le minimum', d.roomsMin),
    dpeClasses: count(
      'Classes DPE de plus acceptées au-delà du maximum (1 : D au plus accepte E à la marge)',
      d.dpeClasses
    ),
    tramMeters: meters(
      'Distance au tram acceptée en plus du maximum',
      d.tramMeters
    ),
  })
  .describe(
    'Marge de tolérance du critère : au-delà d’un seuil mais dans sa marge, l’annonce est « à la marge » ; au-delà, « hors critères ». Défaut : 300 m, prix +5 %, prix minimal −5 %, surface −5 %, pièces 0, DPE une classe, tram +100 m'
  )
export type CriteriaToleranceInput = z.input<typeof CriteriaToleranceSchema>

/** Une marge enregistrée ; un JSON incomplet ou illisible reçoit les valeurs par défaut. */
export function criteriaToleranceOf(value: unknown): CriteriaTolerance {
  const parsed = CriteriaToleranceSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : { ...DEFAULT_CRITERIA_TOLERANCE }
}

/** Vrai si aucune marge n'est appliquée (tout à 0). */
export function isStrictTolerance(tolerance: CriteriaTolerance): boolean {
  return Object.values(tolerance).every(value => value === 0)
}

// ---------------------------------------------------------------------------
// Résultat
// ---------------------------------------------------------------------------

/** Une ligne du détail : un filtre du critère, la valeur de l'annonce, le seuil et sa marge. */
export const CriteriaFitCheckSchema = z.object({
  key: CriteriaFitCheckKeySchema,
  level: CriteriaFitLevelSchema,
  label: z
    .string()
    .describe('Le filtre et son seuil (« Prix maximal 220 000 € »)'),
  value: z
    .string()
    .nullable()
    .describe('La valeur de l’annonce (« 218 000 € », « ≈ 350 m »)'),
  detail: z.string().describe('La marge appliquée ou ce qui reste à confirmer'),
  reason: z
    .string()
    .nullable()
    .describe(
      'La raison chiffrée quand le filtre n’est pas respecté (« Prix +3,6 % (maximum 220 000 €, marge 5 %) »)'
    ),
  location: z
    .boolean()
    .describe(
      'Vrai si le résultat dépend de la localisation (périmètre, tram) : préciser l’adresse peut le trancher'
    ),
})
export type CriteriaFitCheck = z.infer<typeof CriteriaFitCheckSchema>

/** L'adéquation d'une annonce à un critère actif. */
export const CriteriaFitEntrySchema = z.object({
  criteriaId: z.string().uuid(),
  name: z.string().describe('Nom du critère'),
  level: CriteriaFitLevelSchema,
  reasons: z
    .array(z.string())
    .describe('Raisons chiffrées des filtres non respectés ; vide si « dans »'),
  checks: z
    .array(CriteriaFitCheckSchema)
    .describe('Le détail filtre par filtre'),
  locationPending: z
    .boolean()
    .describe(
      'À confirmer à cause de la localisation : préciser l’adresse tranchera'
    ),
  since: z
    .string()
    .datetime()
    .describe('Date du dernier changement de niveau pour ce critère'),
})
export type CriteriaFitEntry = z.infer<typeof CriteriaFitEntrySchema>

/** Pourquoi une annonce hors critères reste aussi dans l'onglet principal. */
export const CriteriaFitKeptSchema = z
  .enum(['offer', 'visit'])
  .describe(
    'Gardée dans la liste principale malgré « hors critères » : offre en cours (offre faite ou acceptée), visite prévue'
  )
export type CriteriaFitKept = z.infer<typeof CriteriaFitKeptSchema>

export const CRITERIA_FIT_KEPT_LABELS: Record<CriteriaFitKept, string> = {
  offer: 'offre en cours',
  visit: 'visite prévue',
}

/** Ce qui a fait changer le niveau d'une annonce (« depuis » de l'onglet « Hors critères »). */
export const CriteriaFitOriginSchema = z.object({
  cause: z
    .enum(['listing', 'criteria', 'assumptions', 'refresh'])
    .describe(
      'Écriture de l’annonce, critère créé ou modifié, hypothèses modifiées, rattrapage'
    ),
  trigger: z
    .string()
    .nullable()
    .describe(
      'Pour une écriture de l’annonce : created, updated, price_up, price_down, status, location, dpe, enriched'
    ),
  criteriaName: z
    .string()
    .nullable()
    .describe('Pour un critère créé ou modifié : son nom'),
})
export type CriteriaFitOrigin = z.infer<typeof CriteriaFitOriginSchema>

/** L'adéquation d'une annonce : le meilleur niveau parmi les critères actifs, et le détail. */
export const ListingCriteriaFitSchema = z.object({
  level: CriteriaFitLevelSchema.describe(
    'Le meilleur niveau parmi les critères actifs ; « in » quand aucun critère n’est actif'
  ),
  activeCriteria: z
    .number()
    .int()
    .min(0)
    .describe(
      'Nombre de critères actifs comparés (0 : aucun, tout est « in »)'
    ),
  criteriaId: z
    .string()
    .uuid()
    .nullable()
    .describe('Le critère qui donne le meilleur niveau'),
  name: z.string().nullable().describe('Son nom'),
  reasons: z
    .array(z.string())
    .describe('Les raisons de ce critère (vide si « dans les critères »)'),
  locationPending: z
    .boolean()
    .describe(
      'À confirmer à cause de la localisation : « Préciser l’adresse »'
    ),
  since: z
    .string()
    .datetime()
    .nullable()
    .describe('Date du dernier changement du niveau de l’annonce'),
  origin: CriteriaFitOriginSchema.nullable().describe(
    'Ce qui a fait changer ce niveau la dernière fois'
  ),
  kept: CriteriaFitKeptSchema.nullable().describe(
    'Hors critères mais gardée dans l’onglet principal (offre en cours, visite prévue) ; null sinon'
  ),
  criteria: z
    .array(CriteriaFitEntrySchema)
    .describe('Le détail par critère actif, dans l’ordre de création'),
})
export type ListingCriteriaFit = z.infer<typeof ListingCriteriaFitSchema>

/** L'adéquation par défaut : aucun critère actif, rien ne disparaît. */
export const NO_CRITERIA_FIT: ListingCriteriaFit = {
  level: 'in',
  activeCriteria: 0,
  criteriaId: null,
  name: null,
  reasons: [],
  locationPending: false,
  since: null,
  origin: null,
  kept: null,
  criteria: [],
}

/** Combien d'annonces à chaque niveau. */
export const CriteriaFitCountsSchema = z.object({
  in: z.number().int().min(0),
  to_confirm: z.number().int().min(0),
  margin: z.number().int().min(0),
  out: z.number().int().min(0),
})
export type CriteriaFitCounts = z.infer<typeof CriteriaFitCountsSchema>

export const EMPTY_FIT_COUNTS: CriteriaFitCounts = {
  in: 0,
  to_confirm: 0,
  margin: 0,
  out: 0,
}

/** Ce qui a fait changer l'adéquation (journal). */
export const CriteriaFitCauseSchema = z
  .enum(['listing', 'criteria', 'assumptions', 'refresh'])
  .describe(
    'Cause du recalcul : écriture de l’annonce, critère créé ou modifié, hypothèses modifiées (verdict), rattrapage'
  )
export type CriteriaFitCause = z.infer<typeof CriteriaFitCauseSchema>

/** Un changement de niveau pour un critère. */
export const CriteriaFitChangeSchema = z.object({
  criteriaId: z.string().uuid(),
  name: z.string(),
  before: CriteriaFitLevelSchema.nullable().describe(
    'Niveau avant ; null si l’annonce n’avait pas encore été comparée à ce critère'
  ),
  after: CriteriaFitLevelSchema,
  reasons: z.array(z.string()),
})
export type CriteriaFitChange = z.infer<typeof CriteriaFitChangeSchema>

/** Ce qu'un recalcul de l'espace a changé (écriture d'un critère, des hypothèses, rattrapage). */
export const CriteriaFitRefreshSummarySchema = z.object({
  listings: z.number().int().min(0).describe('Annonces comparées'),
  entered: z
    .number()
    .int()
    .min(0)
    .describe(
      'Passages de « hors critères » (ou jamais comparée) à un niveau gardé'
    ),
  left: z.number().int().min(0).describe('Passages à « hors critères »'),
  changed: z
    .number()
    .int()
    .min(0)
    .describe('Autres changements de niveau (dans, à confirmer, à la marge)'),
})
export type CriteriaFitRefreshSummary = z.infer<
  typeof CriteriaFitRefreshSummarySchema
>

/** Une ligne de l'historique de l'adéquation d'une annonce (fiche), tirée du journal. */
export const CriteriaFitHistoryItemSchema = z.object({
  at: z.string().datetime(),
  what: z
    .string()
    .describe('Ce qui a changé (« Entrée dans « Caudéran », à confirmer »)'),
  why: z.string().describe('Les raisons et la cause, vides si rien à dire'),
})
export type CriteriaFitHistoryItem = z.infer<
  typeof CriteriaFitHistoryItemSchema
>

export const CriteriaFitHistorySchema = z.object({
  listingId: z.string().uuid(),
  items: z
    .array(CriteriaFitHistoryItemSchema)
    .describe('Du plus récent au plus ancien, enregistrement compris'),
})
export type CriteriaFitHistory = z.infer<typeof CriteriaFitHistorySchema>
