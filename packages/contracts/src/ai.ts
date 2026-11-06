import { z } from 'zod'
import {
  DpeClassSchema,
  FeesPayerSchema,
  ListingSourceSchema,
  ObservedSellerTypeSchema,
  RenovationLevelSchema,
} from './enums.js'
import { ListingInputSchema } from './listing.js'
import type { ListingInput } from './listing.js'
import type { FieldProvenanceMap } from './sourced.js'
import { DuplicateCandidateSchema } from './duplicates.js'

/**
 * Extraction assistée par IA : ce que le client envoie (texte collé, captures),
 * ce que le modèle doit rendre (une valeur, une confiance et un extrait par
 * champ), et ce que l'API répond (fiche pré-remplie, champs manquants,
 * doublons, coût). Aucun appel réseau ici : seulement les formes.
 */

export const AI_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const
export type AiImageMediaType = (typeof AI_IMAGE_MEDIA_TYPES)[number]

/** Plafond absolu du nombre de captures par analyse ; `AI_MAX_IMAGES` peut l'abaisser. */
export const AI_MAX_IMAGES_HARD = 8
/** Taille maximale d'une capture décodée (limite de l'API Claude : 5 Mo). */
export const AI_MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Longueur maximale du texte collé, alignée sur `sourceText`. */
export const AI_MAX_TEXT_CHARS = 50_000

/** Taille décodée d'une chaîne base64, sans la décoder. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

export const ExtractionImageSchema = z
  .object({
    mediaType: z.enum(AI_IMAGE_MEDIA_TYPES).describe('Type MIME de la capture'),
    data: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Base64 attendu, sans préfixe data:')
      .describe("Contenu de l'image en base64, sans préfixe « data: »"),
  })
  .refine(image => base64Bytes(image.data) <= AI_MAX_IMAGE_BYTES, {
    message: `Chaque capture fait au plus ${AI_MAX_IMAGE_BYTES / 1024 / 1024} Mo`,
    path: ['data'],
  })
export type ExtractionImage = z.infer<typeof ExtractionImageSchema>

export const ExtractionQualitySchema = z
  .enum(['precise', 'fast'])
  .describe(
    '« precise » : modèle par défaut (AI_MODEL) ; « fast » : modèle économique (AI_MODEL_BULK) pour une relecture rapide'
  )
export type ExtractionQuality = z.infer<typeof ExtractionQualitySchema>

/** Entrée de `POST /listings/extract` et de l'outil MCP `extract_listing`. */
export const ExtractionRequestSchema = z
  .object({
    text: z
      .string()
      .max(AI_MAX_TEXT_CHARS)
      .nullable()
      .default(null)
      .describe(
        "Texte de l'annonce collé tel quel (page du portail, mail d'agence)"
      ),
    url: z
      .string()
      .url()
      .max(2000)
      .nullable()
      .default(null)
      .describe("URL de la page d'annonce, si connue"),
    images: z
      .array(ExtractionImageSchema)
      .max(AI_MAX_IMAGES_HARD)
      .default([])
      .describe("Captures d'écran de l'annonce (jpeg, png, gif, webp)"),
    quality: ExtractionQualitySchema.default('precise'),
  })
  .refine(
    request =>
      (request.text !== null && request.text.trim().length > 0) ||
      request.images.length > 0,
    {
      message: 'Donnez le texte de l’annonce ou au moins une capture',
      path: ['text'],
    }
  )
export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>
export type ExtractionRequestInput = z.input<typeof ExtractionRequestSchema>

// ---------------------------------------------------------------------------
// Sortie structurée du modèle
// ---------------------------------------------------------------------------

/**
 * Un champ lu par le modèle : la valeur (null si l'annonce ne la donne pas),
 * la confiance, et l'extrait exact qui la justifie. Les contraintes fines
 * (bornes, formats) ne sont pas ici : la sortie structurée ne les supporte
 * pas toutes ; elles s'appliquent ensuite par `ListingInputSchema`.
 */
export function aiField<T extends z.ZodType>(value: T, what: string) {
  return z.object({
    value: value
      .nullable()
      .describe(`${what} ; null si l'annonce ne le dit pas`),
    confidence: z
      .number()
      .describe(
        'Confiance de 0 à 1 : 1 = écrit noir sur blanc, 0,5 = déduit, 0,2 = supposé'
      ),
    evidence: z
      .string()
      .nullable()
      .describe(
        "Extrait exact et court de l'annonce qui justifie la valeur ; null si déduit"
      ),
  })
}
export type AiField<T> = {
  value: T | null
  confidence: number
  evidence: string | null
}

const text = (what: string) => aiField(z.string(), what)
const num = (what: string) => aiField(z.number(), what)
const int = (what: string) => aiField(z.number().int(), what)
const bool = (what: string) => aiField(z.boolean(), what)

/**
 * La fiche telle que le modèle la rend. Un objet par champ ; pas de
 * sous-objet facultatif : la sortie structurée exige toutes les clés.
 */
export const AiListingExtractionSchema = z.object({
  title: text("Titre court de l'annonce (type de bien, commune, atout)"),
  url: text("URL de l'annonce si elle apparaît dans le texte"),
  portal: aiField(
    ListingSourceSchema,
    'Portail ou canal : seloger, leboncoin, pap, bienici, agence (site ou mail d’agence), autre'
  ),
  sellerType: aiField(
    ObservedSellerTypeSchema,
    "Qui vend : agency (agence immobilière), mandatary (mandataire : conseiller immobilier indépendant d'un réseau, « conseiller indépendant », « agent commercial »), private (particulier : « particulier », « de particulier à particulier », « sans frais d'agence ») ; null si l'annonce ne le dit pas : ne devine pas"
  ),
  agencyName: text(
    "Nom de l'agence, ou du réseau pour un mandataire, tel qu'écrit ; jamais le nom d'une personne (le conseiller ou l'interlocuteur n'est pas lu ici) ; null pour un particulier"
  ),
  agencyReference: text(
    "Référence de l'annonce chez l'agence ou le mandataire, sans le préfixe : « Réf. EX-2041 » → « EX-2041 », « Référence : 2041 », « Mandat n° 2041 » → « 2041 » ; null pour un particulier ou si absente"
  ),
  externalId: text(
    "Identifiant de l'annonce sur le portail (numéro de l'annonce Leboncoin, SeLoger…), s'il est affiché ; pas la référence de l'agence"
  ),
  price: num('Prix affiché en euros (prix de vente, honoraires inclus si FAI)'),
  feesIncluded: bool(
    'Vrai si le prix affiché inclut les honoraires d’agence (FAI, « honoraires inclus », « charge acquéreur ») ; faux si « honoraires à charge vendeur » ou « net vendeur »'
  ),
  feesAmount: num("Montant des honoraires d'agence en euros, s'il est écrit"),
  feesPercent: num(
    "Honoraires d'agence en fraction du prix (0,05 pour 5 %), s'ils sont écrits en pourcentage"
  ),
  feesPayer: aiField(
    FeesPayerSchema,
    'Qui paie les honoraires : buyer (acquéreur, prix FAI) ou seller (vendeur)'
  ),
  surface: num(
    'Surface habitable ou Carrez en m² (la surface de référence des calculs)'
  ),
  surfaceTotal: num(
    'Surface totale au sol en m² si distincte de la surface Carrez'
  ),
  rooms: int('Nombre de pièces principales (T2 = 2, T3 = 3)'),
  bedrooms: int('Nombre de chambres'),
  floor: int('Étage du bien (0 = rez-de-chaussée, 1 = premier...)'),
  floorsTotal: int("Nombre d'étages de l'immeuble"),
  floorLabel: text(
    'Étage tel qu’écrit (« 3e étage sur 5 avec ascenseur », « dernier étage »)'
  ),
  elevator: bool('Ascenseur'),
  constructionYear: int('Année de construction, si donnée précisément'),
  constructionPeriod: text(
    'Époque de construction si l’année n’est pas donnée (« avant 1949 », « années 70 », « récent »)'
  ),
  dpeClass: aiField(DpeClassSchema, 'Classe DPE (énergie), de A à G'),
  dpeConsumption: num('Consommation d’énergie primaire du DPE en kWh/m²/an'),
  gesClass: aiField(DpeClassSchema, 'Classe GES (climat), de A à G'),
  dpeDate: text(
    'Date du DPE au format AAAA-MM-JJ (AAAA-MM-01 si seul le mois est connu)'
  ),
  heatingType: text(
    'Type de chauffage (gaz, électrique, pompe à chaleur, fioul, urbain...)'
  ),
  heatingCollective: bool('Chauffage collectif (vrai) ou individuel (faux)'),
  outdoor: text('Extérieur : balcon, terrasse, jardin, loggia, avec surface'),
  parking: text('Stationnement : place, garage, box, parking collectif'),
  cellar: bool('Cave'),
  orientation: text('Orientation (sud, sud-ouest, traversant...)'),
  condition: text(
    'État général déclaré (« rénové », « à rafraîchir », « travaux à prévoir »)'
  ),
  annualCharges: num(
    'Charges de copropriété annuelles en euros ; si l’annonce donne un montant mensuel, multiplier par 12 et le dire dans evidence'
  ),
  nonRecoverableChargesMonthly: num(
    'Part des charges non récupérable sur un locataire, en euros par mois, si elle est donnée'
  ),
  lotsCount: int('Nombre de lots de la copropriété'),
  proceedings: text(
    'Procédures en cours dans la copropriété (« aucune procédure en cours » compte)'
  ),
  votedWorks: text('Travaux votés en copropriété et leur prise en charge'),
  syndic: text('Nom du syndic'),
  propertyTax: num('Taxe foncière annuelle en euros'),
  addressRaw: text(
    "Adresse telle qu'elle apparaît (numéro, rue), sans la commune ni le code postal"
  ),
  postalCode: text('Code postal à cinq chiffres'),
  commune: text('Commune (« Talence », « Bordeaux »), sans arrondissement'),
  district: text(
    'Quartier ou secteur cité, du plus large au plus fin, séparés par une virgule (« Bordeaux Sud, Victoire », « Saint-Genès ») ; un arrêt de tram seulement s’il n’y a pas de quartier (« tram B Peixotto ») ; il sert à placer le repère quand l’adresse n’a pas de numéro'
  ),
  worksMentioned: bool(
    "Vrai si l'annonce évoque des travaux à prévoir ou un bien à rafraîchir ; faux si elle dit « aucun travaux » ou « rénové »"
  ),
  worksLevel: aiField(
    RenovationLevelSchema,
    'Ampleur des travaux évoqués : refresh (rafraîchissement), renovation, heavy (lourde), energy (énergétique)'
  ),
  worksNotes: text('Ce que l’annonce dit des travaux (phrase courte)'),
  description: text(
    "Description de l'annonce, texte d'origine condensé à l'essentiel (2 000 caractères au plus)"
  ),
  publishedAt: text('Date de publication au format AAAA-MM-JJ si visible'),
  sourceUpdatedAt: text(
    'Date de dernière mise à jour de l’annonce au format AAAA-MM-JJ si visible'
  ),
  remarks: z
    .array(z.string())
    .describe(
      'Ambiguïtés et incohérences à signaler au lecteur (« charges mensuelles ou annuelles non précisé », « surface loi Carrez non indiquée », « prix affiché hors honoraires »)'
    ),
})
export type AiListingExtraction = z.infer<typeof AiListingExtractionSchema>

// ---------------------------------------------------------------------------
// Champs indispensables et champs manquants
// ---------------------------------------------------------------------------

export const MissingFieldReasonSchema = z
  .enum(['missing', 'doubtful'])
  .describe('Absent de l’annonce, ou lu avec une confiance trop faible')
export type MissingFieldReason = z.infer<typeof MissingFieldReasonSchema>

export interface RequiredListingField {
  /** Chemin dans `ListingInput` (`location.addressRaw`, `rentalPlan.targetRent`). */
  field: string
  /** Clé de provenance dans `fieldSources` (aplatie : `addressRaw`, `rentalPlan`). */
  provenanceKey: string
  label: string
  /** Libellé de la tâche créée si le champ manque après une extraction IA. */
  taskLabel: string
}

/**
 * Les champs sans lesquels l'évaluation n'est pas fiable. Chaque champ
 * manquant après une extraction IA devient une tâche ; les libellés
 * identiques à la checklist par défaut (charges, taxe foncière) ne sont pas
 * dupliqués.
 */
export const REQUIRED_LISTING_FIELDS: readonly RequiredListingField[] = [
  {
    field: 'location.addressRaw',
    provenanceKey: 'addressRaw',
    label: 'Adresse exacte',
    taskLabel: "Demander l'adresse exacte du bien",
  },
  {
    field: 'surface',
    provenanceKey: 'surface',
    label: 'Surface Carrez',
    taskLabel: 'Demander la surface loi Carrez',
  },
  {
    field: 'annualCharges',
    provenanceKey: 'annualCharges',
    label: 'Charges de copropriété annuelles',
    taskLabel:
      'Demander le montant des charges de copropriété annuelles (budget prévisionnel)',
  },
  {
    field: 'propertyTax',
    provenanceKey: 'propertyTax',
    label: 'Taxe foncière',
    taskLabel: 'Demander le montant de la taxe foncière',
  },
  {
    field: 'dpeClass',
    provenanceKey: 'dpeClass',
    label: 'DPE',
    taskLabel: 'Demander le DPE (classe, consommation, date du diagnostic)',
  },
  {
    field: 'floor',
    provenanceKey: 'floor',
    label: 'Étage',
    taskLabel: "Demander l'étage et la présence d'un ascenseur",
  },
  {
    field: 'constructionYear',
    provenanceKey: 'constructionYear',
    label: 'Année de construction',
    taskLabel: "Demander l'année ou l'époque de construction",
  },
  {
    field: 'rentalPlan.targetRent',
    provenanceKey: 'rentalPlan',
    label: 'Loyer visé',
    taskLabel: 'Fixer le loyer visé (phase 2) à partir du marché locatif',
  },
]

/** Sous cette confiance, une valeur lue par l'IA est « douteuse ». */
export const AI_DOUBTFUL_CONFIDENCE = 0.6

export const MissingFieldSchema = z.object({
  field: z.string().describe("Chemin du champ dans l'annonce"),
  label: z.string(),
  reason: MissingFieldReasonSchema,
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confiance de la valeur douteuse, null si absente'),
  taskLabel: z.string(),
})
export type MissingField = z.infer<typeof MissingFieldSchema>

function valueAt(input: ListingInput, path: string): unknown {
  let current: unknown = input
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Les champs indispensables qui manquent (null) ou qu'on ne peut pas
 * croire (lus par l'IA sous `doubtfulBelow`), dans l'ordre de la liste.
 * Pure : le web l'applique à la fiche pré-remplie, l'API à la création.
 */
export function missingListingFields(
  input: ListingInput,
  fieldSources: FieldProvenanceMap = input.fieldSources,
  doubtfulBelow = AI_DOUBTFUL_CONFIDENCE
): MissingField[] {
  const result: MissingField[] = []
  for (const required of REQUIRED_LISTING_FIELDS) {
    const value = valueAt(input, required.field)
    if (value === null || value === undefined || value === '') {
      result.push({
        field: required.field,
        label: required.label,
        reason: 'missing',
        confidence: null,
        taskLabel: required.taskLabel,
      })
      continue
    }
    const provenance = fieldSources[required.provenanceKey]
    if (
      provenance?.source === 'ai' &&
      provenance.confidence !== undefined &&
      provenance.confidence < doubtfulBelow
    ) {
      result.push({
        field: required.field,
        label: required.label,
        reason: 'doubtful',
        confidence: provenance.confidence,
        taskLabel: required.taskLabel,
      })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Réponse de l'extraction
// ---------------------------------------------------------------------------

export const ExtractionUsageSchema = z.object({
  model: z.string().describe('Modèle qui a répondu'),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadInputTokens: z.number().int().min(0),
  cacheCreationInputTokens: z.number().int().min(0),
  estimatedCostUsd: z
    .number()
    .min(0)
    .nullable()
    .describe(
      'Coût estimé en dollars selon la grille du modèle ; null si inconnue'
    ),
  durationMs: z.number().int().min(0),
})
export type ExtractionUsage = z.infer<typeof ExtractionUsageSchema>

/** Réponse de `POST /listings/extract` : rien n'est enregistré. */
export const ExtractionResultSchema = z.object({
  listing: ListingInputSchema.describe(
    'La fiche pré-remplie, provenance « ai » par champ dans fieldSources, à valider avant POST /listings'
  ),
  missingFields: z.array(MissingFieldSchema),
  duplicates: z.array(DuplicateCandidateSchema),
  warnings: z
    .array(z.string())
    .describe('Remarques du modèle et valeurs écartées par la validation'),
  geocoded: z
    .boolean()
    .describe("Vrai si l'adresse extraite a reçu un point par le géocodeur"),
  usage: ExtractionUsageSchema,
  persisted: z.literal(false),
})
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>
