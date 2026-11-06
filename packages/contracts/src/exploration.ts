import { z } from 'zod'
import {
  CriteriaFitLevelSchema,
  CriteriaToleranceSchema,
  ListingCriteriaFitSchema,
} from './criteria-fit.js'
import type { CriteriaTolerance } from './criteria-fit.js'
import { DuplicateCandidateSchema } from './duplicates.js'
import {
  ActivityChannelSchema,
  DpeClassSchema,
  ListingStatusSchema,
  ObservedSellerTypeSchema,
  PerimeterTypeSchema,
} from './enums.js'
import {
  ListingCheckChangeSchema,
  ListingCheckOutcomeSchema,
} from './listing-checks.js'
import { ExplorationPortalSchema, SearchPortalSchema } from './portals.js'
import type { SearchPortal } from './portals.js'
import { CriteriaFiltersSchema } from './search-criteria.js'

/**
 * Exploration par les critères (lot 16, ADR 0026). Claude, dans le
 * navigateur de l'utilisateur, parcourt les portails à partir des critères
 * actifs (le « brief ») ; l'application trie ce qu'il a lu : une annonce
 * déjà suivie devient une vérification (lot 15), une annonce écartée n'est
 * jamais reproposée, une annonce hors critères (même avec la marge) n'est
 * qu'une ligne du compte rendu, toute autre devient un brouillon « À
 * valider ». Claude n'ajoute jamais une annonce lui-même. Le serveur ne
 * télécharge aucune page : il ne reçoit que ce que Claude a lu, et les
 * liens de recherche sont fabriqués sans réseau (`PORTAL_SEARCH_TEMPLATES`).
 */

// ---------------------------------------------------------------------------
// Ce que Claude a lu
// ---------------------------------------------------------------------------

/** Au plus autant d'annonces par appel de tri ou d'enregistrement. */
export const EXPLORATION_MAX_CANDIDATES = 50
/** Longueur maximale de l'extrait lu par Claude. */
export const EXPLORATION_EXCERPT_MAX = 2000
/** Longueur maximale de l'extrait gardé avec une ligne du compte rendu ou un brouillon. */
export const EXPLORATION_LINE_EXCERPT_MAX = 500

const candidateDate = (what: string) =>
  z
    .union([z.string().date(), z.string().datetime({ offset: true })])
    .optional()
    .describe(`${what}, AAAA-MM-JJ ou ISO 8601 ; absent = non lue`)

const candidateAmount = (what: string) =>
  z
    .number()
    .min(0)
    .optional()
    .describe(`${what} lu sur la page, en euros ; absent = non lu`)

/**
 * Une annonce lue par Claude sur un portail (page de résultats ou page de
 * l'annonce), dans le navigateur de l'utilisateur. Seuls le lien et le
 * portail sont obligatoires ; ne mettre que ce qui a été lu. Les clés
 * inconnues sont refusées (une faute de frappe ne passe pas en silence).
 */
export const ExplorationCandidateSchema = z
  .strictObject({
    url: z
      .string()
      .url()
      .max(2000)
      .describe('Lien de l’annonce sur le portail (page de l’annonce)'),
    portal: ExplorationPortalSchema,
    title: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe('Titre affiché par le portail'),
    price: candidateAmount('Prix affiché FAI'),
    surface: z
      .number()
      .positive()
      .max(10_000)
      .optional()
      .describe('Surface en m²'),
    rooms: z
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .describe('Nombre de pièces principales'),
    bedrooms: z
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .describe('Nombre de chambres'),
    dpeClass: DpeClassSchema.optional().describe('Classe DPE affichée'),
    commune: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe('Commune affichée'),
    inseeCode: z
      .string()
      .regex(/^\d[0-9AB]\d{3}$/)
      .optional()
      .describe('Code INSEE de la commune, s’il est connu (5 caractères)'),
    district: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Quartier ou secteur cité par l’annonce, du plus large au plus fin (« Caudéran, Saint-Augustin »)'
      ),
    address: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe('Adresse affichée (rare sur une page de résultats)'),
    excerpt: z
      .string()
      .max(EXPLORATION_EXCERPT_MAX)
      .optional()
      .describe(
        `Extrait de la description lue (${EXPLORATION_EXCERPT_MAX} caractères au plus) ; sans téléphone ni e-mail d’annonceur : ils sont masqués de toute façon`
      ),
    publishedAt: candidateDate('Date de publication affichée'),
    annualCharges: candidateAmount(
      'Charges de copropriété annuelles (montant mensuel × 12)'
    ),
    propertyTax: candidateAmount('Taxe foncière annuelle'),
    // Lot 18 : le vendeur lu sur la page (même agence et même référence
    // qu'une annonce suivie : le lien est rattaché d'office à sa fiche).
    sellerType: ObservedSellerTypeSchema.optional(),
    sellerName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "Agence, ou réseau pour un mandataire, affichés sur la page ; jamais le nom d'une personne"
      ),
    reference: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe(
        'Référence de l’annonce affichée (« Réf. EX-2041 », « Mandat n° 2041 ») ; jamais pour un particulier'
      ),
  })
  .describe(
    'Une annonce lue par Claude sur un portail : seuls url et portal sont obligatoires, le reste si la page le donne'
  )
export type ExplorationCandidate = z.infer<typeof ExplorationCandidateSchema>
export type ExplorationCandidateInput = z.input<
  typeof ExplorationCandidateSchema
>

// ---------------------------------------------------------------------------
// Le tri
// ---------------------------------------------------------------------------

export const ExplorationOutcomeSchema = z
  .enum(['new', 'duplicate_probable', 'known', 'dismissed', 'out', 'attached'])
  .describe(
    'Résultat du tri : new (nouvelle, brouillon « À valider »), duplicate_probable (même bien qu’une annonce suivie, sous un autre lien : brouillon à trancher), known (déjà suivie, même lien : vérification lot 15), dismissed (déjà écartée : jamais reproposée), out (hors critères même avec la marge : une ligne du compte rendu seulement), attached (lot 18 : même agence et même référence qu’une annonce suivie : le lien est rattaché d’office à sa fiche, « Ce n’est pas la même » le détache)'
  )
export type ExplorationOutcome = z.infer<typeof ExplorationOutcomeSchema>

export const EXPLORATION_OUTCOME_LABELS: Record<ExplorationOutcome, string> = {
  new: 'À valider',
  duplicate_probable: 'Doublon probable',
  known: 'Déjà suivie',
  dismissed: 'Déjà écartée',
  out: 'Hors critères',
  attached: 'Rattachée d’office',
}

/** Les résultats qui deviennent un brouillon « À valider ». */
export const DRAFT_OUTCOMES: readonly ExplorationOutcome[] = [
  'new',
  'duplicate_probable',
]

/** Les filtres du compte rendu : « À valider » regroupe les nouvelles et les doublons à trancher. */
export const ExplorationLineFilterSchema = z
  .enum(['all', 'todo', 'known', 'dismissed', 'out'])
  .describe('Toutes, à valider, déjà suivies, déjà écartées, hors critères')
export type ExplorationLineFilter = z.infer<typeof ExplorationLineFilterSchema>

export const EXPLORATION_LINE_FILTER_LABELS: Record<
  ExplorationLineFilter,
  string
> = {
  all: 'Toutes',
  todo: 'À valider',
  known: 'Déjà suivies',
  dismissed: 'Déjà écartées',
  out: 'Hors critères',
}

/** Une annonce de l'espace, en quelques champs. */
export const ExplorationListingRefSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: ListingStatusSchema,
})
export type ExplorationListingRef = z.infer<typeof ExplorationListingRefSchema>

/** Ce qu'une annonce déjà suivie, revue sur le portail, change à sa fiche (lot 15). */
export const ExplorationCheckSchema = z.object({
  outcome: ListingCheckOutcomeSchema.nullable().describe(
    'Résultat de la vérification (inchangée, mise à jour…) ; null si elle ne peut pas s’enregistrer'
  ),
  summary: z.string().describe('« Prix 219 000 € → 212 000 € »'),
  changes: z.array(ListingCheckChangeSchema),
  problem: z
    .string()
    .nullable()
    .describe('Pourquoi la vérification ne s’enregistre pas, sinon null'),
  checkId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe('La vérification enregistrée (après record_exploration)'),
})
export type ExplorationCheck = z.infer<typeof ExplorationCheckSchema>

/** Pourquoi une annonce est reconnue comme déjà écartée. */
export const ExplorationDismissalSchema = z.object({
  kind: z
    .enum(['listing', 'draft'])
    .describe('Annonce écartée de la liste, ou brouillon écarté'),
  id: z.string().uuid(),
  title: z.string(),
  match: z
    .enum(['same_url', 'duplicate'])
    .describe('Même lien, ou doublon probable (autre lien, même bien)'),
  reason: z
    .string()
    .nullable()
    .describe('La raison de l’écart, si elle a été donnée'),
  at: z.string().datetime().nullable().describe('Date de l’écart'),
  by: z.string().nullable().describe('Qui a écarté'),
})
export type ExplorationDismissal = z.infer<typeof ExplorationDismissalSchema>

/** La décision pour une annonce lue, avec ce qui la justifie. */
export const CandidateTriageSchema = z.object({
  index: z.number().int().min(0).describe('Position dans la liste envoyée'),
  url: z.string(),
  normalizedUrl: z
    .string()
    .nullable()
    .describe(
      'Le lien réduit à ce qui identifie l’annonce (schéma, hôte, chemin)'
    ),
  portal: ExplorationPortalSchema,
  title: z.string(),
  price: z.number().nullable(),
  surface: z.number().nullable(),
  rooms: z.number().int().nullable(),
  commune: z.string().nullable(),
  district: z.string().nullable(),
  outcome: ExplorationOutcomeSchema,
  why: z
    .string()
    .describe(
      'La phrase du compte rendu (« Même lien : prix 219 000 € → 212 000 €, appliqué »)'
    ),
  reasons: z
    .array(z.string())
    .describe('Raisons chiffrées de l’adéquation (vides si dans les critères)'),
  fit: ListingCriteriaFitSchema.nullable().describe(
    'Adéquation aux critères actifs, calculée comme pour une annonce (lot 14) ; null pour une annonce déjà suivie'
  ),
  listing: ExplorationListingRefSchema.nullable().describe(
    'L’annonce suivie (même lien, ou même agence et même référence pour un lien rattaché d’office) ou écartée concernée'
  ),
  draftId: z
    .string()
    .uuid()
    .nullable()
    .describe('Le brouillon concerné (déjà à valider, écarté, ou créé)'),
  alreadyPending: z
    .boolean()
    .describe('Vrai si un brouillon « À valider » existe déjà pour ce lien'),
  duplicates: z
    .array(DuplicateCandidateSchema)
    .describe('Annonces suivies qui ressemblent (autre lien) : à trancher'),
  check: ExplorationCheckSchema.nullable().describe(
    'Pour une annonce déjà suivie : la vérification lot 15 que record_exploration appliquera'
  ),
  dismissal: ExplorationDismissalSchema.nullable(),
  warnings: z
    .array(z.string())
    .describe('Ce qui manque (prix, surface, DPE) ou a été ignoré'),
})
export type CandidateTriage = z.infer<typeof CandidateTriageSchema>

/** Combien d'annonces lues par résultat. */
export const ExplorationCountsSchema = z.object({
  seen: z
    .number()
    .int()
    .min(0)
    .describe('Annonces lues (sans les doublons d’envoi)'),
  toValidate: z
    .number()
    .int()
    .min(0)
    .describe('À valider : nouvelles et doublons probables'),
  new: z.number().int().min(0),
  duplicateProbable: z.number().int().min(0),
  known: z.number().int().min(0),
  dismissed: z.number().int().min(0),
  out: z.number().int().min(0),
  attached: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      'Lot 18 : liens rattachés d’office à une annonce suivie (même agence, même référence)'
    ),
  draftsCreated: z
    .number()
    .int()
    .min(0)
    .describe('Brouillons créés (une annonce déjà à valider n’en crée pas)'),
  checksChanged: z
    .number()
    .int()
    .min(0)
    .describe('Annonces suivies dont un fait a changé (prix…)'),
  blockedPortals: z.number().int().min(0),
})
export type ExplorationCounts = z.infer<typeof ExplorationCountsSchema>

/** `triage_candidates` : trier sans rien écrire. */
export const TriageRequestSchema = z.object({
  candidates: z
    .array(ExplorationCandidateSchema)
    .min(1)
    .max(EXPLORATION_MAX_CANDIDATES)
    .describe(
      `Annonces lues sur les portails (${EXPLORATION_MAX_CANDIDATES} au plus par appel)`
    ),
})
export type TriageRequest = z.infer<typeof TriageRequestSchema>

export const TriageResultSchema = z.object({
  items: z.array(CandidateTriageSchema),
  counts: ExplorationCountsSchema,
  activeCriteria: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .describe('Les critères actifs comparés'),
  summary: z.string().describe('Le tri en une phrase'),
  persisted: z.literal(false),
})
export type TriageResult = z.infer<typeof TriageResultSchema>

// ---------------------------------------------------------------------------
// L'exploration enregistrée
// ---------------------------------------------------------------------------

export const ExplorationPortalStatusSchema = z
  .enum(['read', 'blocked', 'skipped'])
  .describe(
    'Ce que Claude a pu faire sur le portail : read (pages lues), blocked (captcha, vérification anti-robot, connexion demandée : arrêt sans contournement), skipped (non parcouru)'
  )
export type ExplorationPortalStatus = z.infer<
  typeof ExplorationPortalStatusSchema
>

export const EXPLORATION_PORTAL_STATUS_LABELS: Record<
  ExplorationPortalStatus,
  string
> = {
  read: 'lu',
  blocked: 'bloqué',
  skipped: 'non parcouru',
}

/** Le bilan d'un portail, tel que Claude le rapporte. */
export const ExplorationPortalRunSchema = z.strictObject({
  portal: ExplorationPortalSchema,
  status: ExplorationPortalStatusSchema,
  count: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .default(0)
    .describe('Annonces lues sur ce portail'),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .default(null)
    .describe(
      'Ce qui s’est passé (« vérification anti-robot : non contournée », « 2 pages de résultats »)'
    ),
  searchUrl: z
    .string()
    .url()
    .max(2000)
    .nullable()
    .default(null)
    .describe('L’URL de recherche ouverte'),
})
export type ExplorationPortalRun = z.infer<typeof ExplorationPortalRunSchema>
export type ExplorationPortalRunInput = z.input<
  typeof ExplorationPortalRunSchema
>

/** `record_exploration` : ce que Claude a lu, à trier de nouveau et à enregistrer. */
export const ExplorationRecordSchema = z.object({
  runKey: z
    .string()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .describe(
      'Identifiant unique de cette exploration, choisi par Claude (un UUID) : un second envoi avec le même runKey n’écrit rien et rend l’exploration déjà enregistrée'
    ),
  startedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Début de l’exploration, ISO 8601 ; absent = maintenant'),
  finishedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Fin de l’exploration, ISO 8601 ; absent = maintenant'),
  criteriaIds: z
    .array(z.string().uuid())
    .max(40)
    .default([])
    .describe(
      'Les critères explorés ; vide = tous les critères actifs (l’adéquation compare toujours à tous les critères actifs)'
    ),
  portals: z
    .array(ExplorationPortalRunSchema)
    .min(1)
    .max(10)
    .describe('Le bilan de chaque portail parcouru, bloqué compris'),
  candidates: z
    .array(ExplorationCandidateSchema)
    .max(EXPLORATION_MAX_CANDIDATES)
    .default([])
    .describe(
      `Toutes les annonces lues (${EXPLORATION_MAX_CANDIDATES} au plus) : le serveur les trie de nouveau`
    ),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .describe('Remarque de Claude pour le compte rendu'),
})
export type ExplorationRecord = z.infer<typeof ExplorationRecordSchema>
export type ExplorationRecordInput = z.input<typeof ExplorationRecordSchema>

/** Une exploration, sans ses lignes (liste, bandeau, brief). */
export const ExplorationSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  author: z
    .object({ id: z.string().uuid(), displayName: z.string() })
    .nullable()
    .describe('Le membre pour qui Claude a exploré'),
  channel: ActivityChannelSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  criteria: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .describe('Les critères explorés'),
  portals: z.array(ExplorationPortalRunSchema),
  counts: ExplorationCountsSchema,
  summary: z.string().describe('Le compte rendu en une phrase'),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type ExplorationSummary = z.infer<typeof ExplorationSummarySchema>

/** Une ligne du compte rendu : une annonce lue et ce qu'il en est advenu. */
export const ExplorationLineSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().min(0),
  url: z.string(),
  portal: ExplorationPortalSchema,
  title: z.string(),
  price: z.number().nullable(),
  surface: z.number().nullable(),
  rooms: z.number().int().nullable(),
  commune: z.string().nullable(),
  district: z.string().nullable(),
  outcome: ExplorationOutcomeSchema,
  why: z.string(),
  reasons: z.array(z.string()),
  level: CriteriaFitLevelSchema.nullable().describe(
    'Niveau d’adéquation au tri (null pour une annonce déjà suivie)'
  ),
  listing: ExplorationListingRefSchema.nullable(),
  draftId: z.string().uuid().nullable(),
  excerpt: z
    .string()
    .max(EXPLORATION_LINE_EXCERPT_MAX)
    .nullable()
    .describe(
      `Extrait lu (${EXPLORATION_LINE_EXCERPT_MAX} caractères au plus, téléphones et e-mails masqués)`
    ),
})
export type ExplorationLine = z.infer<typeof ExplorationLineSchema>

/** Le bilan d'un portail dans le compte rendu. */
export const ExplorationPortalBilanSchema = z.object({
  portal: ExplorationPortalSchema,
  label: z.string(),
  status: ExplorationPortalStatusSchema,
  count: z.string().describe('« 9 lues », « arrêté »'),
  note: z
    .string()
    .describe(
      '« 2 à valider · 2 suivies », « Vérification anti-robot : non contournée »'
    ),
  blocked: z.boolean(),
})
export type ExplorationPortalBilan = z.infer<
  typeof ExplorationPortalBilanSchema
>

/** Le compte rendu complet. */
export const ExplorationDetailSchema = ExplorationSummarySchema.extend({
  lines: z.array(ExplorationLineSchema),
  bilan: z.array(ExplorationPortalBilanSchema),
  outDigest: z
    .string()
    .nullable()
    .describe(
      'Les raisons des hors critères, regroupées (« 2 pièces (5), prix (3) »)'
    ),
})
export type ExplorationDetail = z.infer<typeof ExplorationDetailSchema>

export const ExplorationRecordResultSchema = z.object({
  exploration: ExplorationDetailSchema,
  replayed: z
    .boolean()
    .describe('Vrai si ce runKey était déjà enregistré : rien n’a été écrit'),
  drafts: z
    .array(z.object({ id: z.string().uuid(), title: z.string() }))
    .describe('Brouillons créés dans « À valider »'),
  checks: z
    .array(
      z.object({
        listingId: z.string().uuid(),
        title: z.string(),
        outcome: ListingCheckOutcomeSchema.nullable(),
        summary: z.string(),
        applied: z.boolean(),
        problem: z.string().nullable(),
      })
    )
    .describe('Vérifications appliquées aux annonces déjà suivies'),
  attached: z
    .array(
      z.object({
        listingId: z.string().uuid(),
        title: z.string(),
        linkId: z.string().uuid().nullable(),
        draftId: z.string().uuid().nullable(),
        summary: z.string(),
        applied: z.boolean(),
        problem: z.string().nullable(),
      })
    )
    .default([])
    .describe(
      'Lot 18 : liens rattachés d’office (même agence, même référence) ; montrés dans « À valider » avec « Ce n’est pas la même »'
    ),
  persisted: z.literal(true),
})
export type ExplorationRecordResult = z.infer<
  typeof ExplorationRecordResultSchema
>

export const ExplorationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  criteriaId: z
    .string()
    .uuid()
    .optional()
    .describe('Seulement les explorations de ce critère'),
})
export type ExplorationListQuery = z.infer<typeof ExplorationListQuerySchema>

// ---------------------------------------------------------------------------
// Le brief
// ---------------------------------------------------------------------------

/** Une ligne lisible du brief (« Prix : jusqu’à 231 000 € (220 000 € + 5 %) »). */
export const SearchBriefLineSchema = z.object({
  key: z.enum([
    'zone',
    'price',
    'surface',
    'dpe',
    'tram',
    'communes',
    'verdicts',
  ]),
  label: z.string(),
  text: z.string(),
})
export type SearchBriefLine = z.infer<typeof SearchBriefLineSchema>

/** Une recherche à ouvrir sur un portail. */
export const PortalSearchSchema = z.object({
  portal: SearchPortalSchema,
  label: z.string(),
  enabled: z.boolean().describe('Coché pour ce critère'),
  url: z
    .string()
    .url()
    .describe(
      'Le lien fabriqué sans réseau (paramètres connus) ou la page de recherche du portail'
    ),
  mode: z
    .enum(['parameters', 'manual'])
    .describe('parameters : filtres dans le lien ; manual : filtres à saisir'),
  filtersText: z
    .string()
    .describe(
      'Les filtres en une ligne (« Bordeaux, Le Bouscat · appartement · 3 pièces et plus · ≤ 231 000 € »)'
    ),
  prefilled: z.array(z.string()).describe('Les filtres déjà dans le lien'),
  toEnter: z
    .array(z.string())
    .describe('Les filtres à saisir sur la page (« filtres à saisir »)'),
  note: z.string(),
  lastRun: z
    .object({
      status: ExplorationPortalStatusSchema,
      at: z.string().datetime(),
      note: z.string().nullable(),
    })
    .nullable()
    .describe('Ce qui s’est passé à la dernière exploration'),
})
export type PortalSearch = z.infer<typeof PortalSearchSchema>

/** Les zones du brief : communes et quartiers qui recoupent le périmètre élargi de la marge. */
export const SearchBriefZoneSchema = z.object({
  commune: z.string(),
  inseeCode: z.string().nullable(),
  districts: z.array(z.string()).describe('Quartiers (ou IRIS) recoupés'),
})
export type SearchBriefZone = z.infer<typeof SearchBriefZoneSchema>

/** Les seuils réels d'un critère, marge comprise (« soit 231 000 € »). */
export const BriefThresholdsSchema = z.object({
  priceMax: z
    .number()
    .nullable()
    .describe('Prix maximal marge comprise, en euros'),
  priceMin: z
    .number()
    .nullable()
    .describe('Prix minimal marge comprise, en euros'),
  surfaceMin: z
    .number()
    .nullable()
    .describe('Surface minimale marge comprise, en m²'),
  roomsMin: z
    .number()
    .int()
    .nullable()
    .describe('Pièces minimales marge comprise'),
  dpeMax: DpeClassSchema.nullable().describe(
    'Classe DPE la plus basse acceptée, marge comprise'
  ),
  tramMeters: z
    .number()
    .nullable()
    .describe('Distance maximale au tram marge comprise, en mètres'),
  perimeterMeters: z.number().describe('Marge autour du périmètre, en mètres'),
})
export type BriefThresholds = z.infer<typeof BriefThresholdsSchema>

export const SearchBriefCriteriaSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
  perimeterType: PerimeterTypeSchema.nullable(),
  perimeterLabel: z
    .string()
    .describe('« Polygone dessiné », « Point et rayon (1,2 km) »'),
  filters: CriteriaFiltersSchema,
  tolerance: CriteriaToleranceSchema,
  thresholds: BriefThresholdsSchema,
  zones: z.array(SearchBriefZoneSchema),
  lines: z.array(SearchBriefLineSchema).describe('Le brief, ligne par ligne'),
  filtersText: z.string(),
  portals: z.array(PortalSearchSchema),
  listingCount: z
    .number()
    .int()
    .min(0)
    .describe(
      'Annonces gardées par le critère (dans, à confirmer, à la marge)'
    ),
  request: z
    .string()
    .describe('La demande à écrire dans claude.ai pour ce critère seul'),
})
export type SearchBriefCriteria = z.infer<typeof SearchBriefCriteriaSchema>

export const SearchBriefSchema = z.object({
  generatedAt: z.string().datetime(),
  criteria: z.array(SearchBriefCriteriaSchema),
  known: z.object({
    tracked: z
      .number()
      .int()
      .min(0)
      .describe(
        'Annonces suivies (tout statut sauf écartée) : revues, elles deviennent une vérification'
      ),
    dismissed: z
      .number()
      .int()
      .min(0)
      .describe('Annonces et brouillons écartés : jamais reproposés'),
    pending: z.number().int().min(0).describe('Brouillons déjà « À valider »'),
  }),
  lastExploration: ExplorationSummarySchema.nullable(),
  recentExplorations: z.array(ExplorationSummarySchema),
  request: z.string().describe('La demande à écrire dans claude.ai'),
  rules: z
    .array(z.string())
    .describe('Les règles de l’exploration, rappelées à Claude'),
  templatesAsOf: z
    .string()
    .describe('Date des modèles de recherche des portails'),
})
export type SearchBrief = z.infer<typeof SearchBriefSchema>

export const SearchBriefQuerySchema = z.object({
  criteriaId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Un seul critère (actif ou archivé) ; absent = tous les critères actifs'
    ),
})
export type SearchBriefQuery = z.infer<typeof SearchBriefQuerySchema>

/** Ce que le brief lit d'un critère (pour `domain`). */
export interface BriefCriteriaInput {
  id: string
  name: string
  active: boolean
  perimeterType: z.infer<typeof PerimeterTypeSchema> | null
  perimeterLabel: string
  filters: z.infer<typeof CriteriaFiltersSchema>
  tolerance: CriteriaTolerance
  portals: readonly SearchPortal[]
  zones: readonly SearchBriefZone[]
  listingCount: number
}
