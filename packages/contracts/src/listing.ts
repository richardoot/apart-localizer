import { z } from 'zod'
import {
  DpeClassSchema,
  FeesPayerSchema,
  ListingSourceSchema,
  ListingStatusSchema,
  LocationPrecisionSchema,
} from './enums.js'
import { PointSchema } from './geojson.js'
import { RenovationInputSchema, RenovationSchema } from './renovation.js'
import { RentalPlanInputSchema, RentalPlanSchema } from './rental-plan.js'
import { FieldProvenanceMapSchema } from './sourced.js'
import { AssumptionsOverrideSchema } from './assumptions.js'
import { withoutDefaults } from './zod-utils.js'

const euros = (what: string) =>
  z.number().min(0).nullable().default(null).describe(`${what}, en euros`)

const nullableText = (max: number, what: string) =>
  z.string().max(max).nullable().default(null).describe(what)

const nullableBool = (what: string) =>
  z.boolean().nullable().default(null).describe(what)

/**
 * Localisation d'une annonce. L'adresse saisie est celle de l'annonce ; les
 * champs normalisés et le point viennent du géocodage.
 */
export const ListingLocationInputSchema = z.object({
  addressRaw: nullableText(
    300,
    "Adresse telle qu'elle apparaît dans l'annonce ou saisie"
  ),
  addressNormalized: nullableText(300, 'Adresse normalisée par le géocodeur'),
  banId: nullableText(64, 'Identifiant Base Adresse Nationale'),
  commune: nullableText(120, 'Commune'),
  inseeCode: nullableText(5, 'Code INSEE de la commune'),
  district: nullableText(200, 'Quartier ou arrêt de tram le plus proche'),
  point: PointSchema.nullable()
    .default(null)
    .describe('Point géographique WGS 84 ; null si non géocodé'),
  precision: LocationPrecisionSchema.nullable()
    .default(null)
    .describe('Précision du point ; null si non géocodé'),
})
export type ListingLocationInput = z.infer<typeof ListingLocationInputSchema>

/** Caractéristiques du bien, toutes facultatives : une annonce n'en donne jamais la totalité. */
export const ListingPropertyInputSchema = z.object({
  price: z.number().min(0).describe('Prix affiché FAI en euros'),
  feesAmount: euros("Honoraires d'agence en euros"),
  feesPercent: z
    .number()
    .min(0)
    .max(0.3)
    .nullable()
    .default(null)
    .describe("Honoraires d'agence en fraction du prix (0,05 = 5 %)"),
  feesPayer: FeesPayerSchema.nullable().default(null),
  surface: z
    .number()
    .positive()
    .nullable()
    .default(null)
    .describe('Surface Carrez en m² (surface de référence des calculs)'),
  surfaceTotal: z
    .number()
    .positive()
    .nullable()
    .default(null)
    .describe(
      'Surface totale au sol en m², si différente de la surface Carrez'
    ),
  rooms: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe('Nombre de pièces principales'),
  bedrooms: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe('Nombre de chambres'),
  floor: z
    .number()
    .int()
    .min(-2)
    .nullable()
    .default(null)
    .describe('Étage du bien (0 = rez-de-chaussée)'),
  floorsTotal: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe("Nombre d'étages de l'immeuble"),
  floorLabel: nullableText(
    120,
    'Étage en texte libre tel que lu (« 3e sur 5, ascenseur »)'
  ),
  elevator: nullableBool('Ascenseur'),
  constructionYear: z
    .number()
    .int()
    .min(1000)
    .max(2100)
    .nullable()
    .default(null)
    .describe('Année de construction'),
  constructionPeriod: nullableText(
    60,
    'Époque de construction (« avant 1946 », « 1971-1990 »...)'
  ),
  dpeClass: DpeClassSchema.nullable().default(null),
  dpeConsumption: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Consommation énergie primaire en kWh/m²/an'),
  gesClass: DpeClassSchema.nullable()
    .default(null)
    .describe('Classe GES, de A à G'),
  dpeDate: z
    .string()
    .date()
    .nullable()
    .default(null)
    .describe(
      "Date du DPE (AAAA-MM-JJ) ; un DPE antérieur au 1er juillet 2021 n'est plus valable"
    ),
  heatingType: nullableText(
    80,
    'Type de chauffage (gaz, électrique, pompe à chaleur...)'
  ),
  heatingCollective: nullableBool('Chauffage collectif'),
  outdoor: nullableText(120, 'Extérieur : balcon, terrasse, jardin'),
  parking: nullableText(120, 'Stationnement : place, garage, box'),
  cellar: nullableBool('Cave'),
  orientation: nullableText(60, 'Orientation'),
  condition: nullableText(120, 'État général déclaré'),
  annualCharges: euros(
    'Charges de copropriété annuelles, total avant répartition'
  ),
  nonRecoverableChargesMonthly: euros(
    'Part des charges non récupérable sur le locataire, en euros par mois ; estimée à 25 % des charges annuelles / 12 si absente'
  ),
  lotsCount: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe('Nombre de lots de la copropriété'),
  proceedings: nullableText(1000, 'Procédures en cours dans la copropriété'),
  votedWorks: nullableText(1000, 'Travaux votés et leur prise en charge'),
  syndic: nullableText(120, 'Syndic'),
  propertyTax: euros(
    'Taxe foncière annuelle ; estimée à un mois de loyer si absente'
  ),
  furnitureValue: euros('Mobilier à acheter pour louer meublé'),
})
export type ListingPropertyInput = z.infer<typeof ListingPropertyInputSchema>

/** Identité de l'annonce. */
export const ListingIdentityInputSchema = z.object({
  source: ListingSourceSchema.default('autre'),
  sourceLabel: nullableText(
    200,
    "Précision sur la source (nom de l'agence, texte libre)"
  ),
  url: z
    .string()
    .url()
    .max(2000)
    .nullable()
    .default(null)
    .describe("Lien vers l'annonce"),
  externalId: nullableText(120, "Identifiant de l'annonce chez la source"),
  title: z.string().min(1).max(300).describe("Titre court de l'annonce"),
  publishedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe('Date de publication constatée, ISO 8601'),
  sourceUpdatedAt: z
    .string()
    .datetime()
    .nullable()
    .default(null)
    .describe('Dernière mise à jour constatée sur la source, ISO 8601'),
  description: nullableText(20_000, "Description brute de l'annonce"),
  notes: nullableText(10_000, 'Notes libres des membres'),
})

/**
 * Entrée de création : tout ce qu'un membre, l'IA ou le MCP peuvent fournir.
 * Les sous-objets travaux et phase 2 sont facultatifs.
 */
export const ListingInputSchema = ListingIdentityInputSchema.extend({
  ...ListingPropertyInputSchema.shape,
  location: ListingLocationInputSchema.default(() =>
    ListingLocationInputSchema.parse({})
  ),
  status: ListingStatusSchema.default('to_study'),
  discardReason: nullableText(500, "Raison d'écartement"),
  renovation: RenovationInputSchema.nullable().default(null),
  rentalPlan: RentalPlanInputSchema.nullable().default(null),
  assumptionsOverride: AssumptionsOverrideSchema.nullable().default(null),
  fieldSources: FieldProvenanceMapSchema.default({}),
  sourceText: z
    .string()
    .max(50_000)
    .nullable()
    .default(null)
    .describe("Texte source collé ou lu par l'IA, conservé pour vérification"),
})
export type ListingInput = z.infer<typeof ListingInputSchema>
/** Forme acceptée en entrée, avant les valeurs par défaut. */
export type ListingInputRaw = z.input<typeof ListingInputSchema>

/** Mise à jour partielle : tout champ absent est laissé tel quel. */
export const ListingUpdateSchema = z
  .object(withoutDefaults(ListingInputSchema.shape))
  .partial()
export type ListingUpdate = z.infer<typeof ListingUpdateSchema>

/** Garde-fous optimistes d'une mise à jour : « je crois que l'annonce est dans cet état ». */
export const ListingUpdateGuardsSchema = z.object({
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      "Garde-fou : `updatedAt` lu avant la modification ; refus si l'annonce a changé depuis"
    ),
  expectedPrice: z
    .number()
    .min(0)
    .optional()
    .describe('Garde-fou : prix affiché attendu en euros ; refus si différent'),
})
export type ListingUpdateGuards = z.infer<typeof ListingUpdateGuardsSchema>

/** Le corps d'un `PATCH /listings/:id` : le patch et ses garde-fous. */
export const ListingPatchSchema = ListingUpdateSchema.extend(
  ListingUpdateGuardsSchema.shape
)
export type ListingPatch = z.infer<typeof ListingPatchSchema>

/** Sépare le patch de ses garde-fous. */
export function splitListingPatch(patch: ListingPatch): {
  update: ListingUpdate
  guards: ListingUpdateGuards
} {
  const { expectedUpdatedAt, expectedPrice, ...update } = patch
  const guards: ListingUpdateGuards = {}
  if (expectedUpdatedAt !== undefined)
    guards.expectedUpdatedAt = expectedUpdatedAt
  if (expectedPrice !== undefined) guards.expectedPrice = expectedPrice
  return { update, guards }
}

export const ListingStatusChangeSchema = z.object({
  status: ListingStatusSchema,
  reason: z
    .string()
    .max(500)
    .nullable()
    .default(null)
    .describe('Raison du changement (obligatoire pour écarter)'),
  expectedStatus: ListingStatusSchema.optional().describe(
    'Garde-fou optimiste : statut attendu avant le changement ; refus si différent'
  ),
})
export type ListingStatusChange = z.infer<typeof ListingStatusChangeSchema>

/** « Vu par » un membre. */
export const ListingViewSchema = z.object({
  memberId: z.string().uuid(),
  seenAt: z.string().datetime(),
})
export type ListingView = z.infer<typeof ListingViewSchema>

/** Annonce enregistrée, telle que l'API la renvoie (sans les calculs). */
export const ListingSchema = ListingInputSchema.omit({
  sourceText: true,
}).extend({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  renovation: RenovationSchema.nullable(),
  rentalPlan: RentalPlanSchema.nullable(),
  discardedAt: z.string().datetime().nullable(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  views: z.array(ListingViewSchema).default([]),
})
export type Listing = z.infer<typeof ListingSchema>
