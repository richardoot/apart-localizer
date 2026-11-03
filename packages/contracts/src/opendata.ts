import { z } from 'zod'
import {
  CheckLevelSchema,
  DpeClassSchema,
  DpeSearchStatusSchema,
  LocationPrecisionSchema,
  OpenDataStatusSchema,
  TransitModeSchema,
} from './enums.js'
import { PointSchema, PositionSchema } from './geojson.js'

/**
 * Données ouvertes (lot 4, besoins D1 à D7, L2, L3, N4) : arrêts TBM, DPE de
 * l'ADEME, loyers de référence de l'encadrement à Bordeaux, ventes DVF. Les
 * montants sont en euros, les surfaces en m², les loyers de référence en
 * euros par m² de surface habitable et par mois, les distances en mètres.
 */

/** Les 28 communes de Bordeaux Métropole (code INSEE, nom), périmètre des imports. */
export const BORDEAUX_METROPOLE_COMMUNES: readonly {
  inseeCode: string
  name: string
}[] = [
  { inseeCode: '33003', name: 'Ambarès-et-Lagrave' },
  { inseeCode: '33004', name: 'Ambès' },
  { inseeCode: '33013', name: 'Artigues-près-Bordeaux' },
  { inseeCode: '33032', name: 'Bassens' },
  { inseeCode: '33039', name: 'Bègles' },
  { inseeCode: '33056', name: 'Blanquefort' },
  { inseeCode: '33063', name: 'Bordeaux' },
  { inseeCode: '33065', name: 'Bouliac' },
  { inseeCode: '33069', name: 'Le Bouscat' },
  { inseeCode: '33075', name: 'Bruges' },
  { inseeCode: '33096', name: 'Carbon-Blanc' },
  { inseeCode: '33119', name: 'Cenon' },
  { inseeCode: '33162', name: 'Eysines' },
  { inseeCode: '33167', name: 'Floirac' },
  { inseeCode: '33192', name: 'Gradignan' },
  { inseeCode: '33200', name: 'Le Haillan' },
  { inseeCode: '33249', name: 'Lormont' },
  { inseeCode: '33273', name: 'Martignas-sur-Jalle' },
  { inseeCode: '33281', name: 'Mérignac' },
  { inseeCode: '33312', name: 'Parempuyre' },
  { inseeCode: '33318', name: 'Pessac' },
  { inseeCode: '33376', name: 'Saint-Aubin-de-Médoc' },
  { inseeCode: '33434', name: 'Saint-Louis-de-Montferrand' },
  { inseeCode: '33449', name: 'Saint-Médard-en-Jalles' },
  { inseeCode: '33487', name: 'Saint-Vincent-de-Paul' },
  { inseeCode: '33519', name: 'Le Taillan-Médoc' },
  { inseeCode: '33522', name: 'Talence' },
  { inseeCode: '33550', name: "Villenave-d'Ornon" },
]

/** La commune de Bordeaux : seule commune encadrée de la métropole. */
export const BORDEAUX_INSEE_CODE = '33063'

// ---------------------------------------------------------------------------
// Arrêts de transport (TBM)
// ---------------------------------------------------------------------------

export const NearestStopSchema = z.object({
  name: z.string().describe("Nom de l'arrêt"),
  mode: TransitModeSchema,
  lines: z
    .array(z.string())
    .describe('Lignes qui desservent l’arrêt (A, B… ou Lianes 1…)'),
  distanceMeters: z
    .number()
    .min(0)
    .describe("Distance à vol d'oiseau en mètres"),
  point: PointSchema,
})
export type NearestStop = z.infer<typeof NearestStopSchema>

export const TransitContextSchema = z.object({
  nearestTram: NearestStopSchema.nullable().describe(
    'Arrêt de tram le plus proche (2 km au plus), sinon null'
  ),
  nearestStop: NearestStopSchema.nullable().describe(
    'Arrêt le plus proche tous modes confondus (2 km au plus)'
  ),
})
export type TransitContext = z.infer<typeof TransitContextSchema>

// ---------------------------------------------------------------------------
// Encadrement des loyers (Bordeaux)
// ---------------------------------------------------------------------------

export const RentEpochSchema = z
  .enum(['before_1946', '1946_1970', '1971_1990', 'after_1990'])
  .describe(
    "Époque de construction de l'arrêté : avant 1946, 1946-1970, 1971-1990, après 1990"
  )
export type RentEpoch = z.infer<typeof RentEpochSchema>

export const RENT_EPOCH_LABELS: Record<RentEpoch, string> = {
  before_1946: 'Avant 1946',
  '1946_1970': '1946-1970',
  '1971_1990': '1971-1990',
  after_1990: 'Après 1990',
}

/** Une ligne de l'arrêté : zone × pièces × époque × meublé. */
export const RentReferenceRowSchema = z.object({
  zone: z.number().int().min(1).describe('Zone (secteur géographique)'),
  rooms: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe('Nombre de pièces principales ; 4 = « 4 et plus »'),
  epoch: RentEpochSchema,
  furnished: z.boolean().describe('Location meublée'),
  referenceRent: z
    .number()
    .positive()
    .describe('Loyer de référence en €/m²/mois'),
  upperRent: z
    .number()
    .positive()
    .describe('Loyer de référence majoré (plafond) en €/m²/mois'),
  lowerRent: z
    .number()
    .positive()
    .describe('Loyer de référence minoré en €/m²/mois'),
})
export type RentReferenceRow = z.infer<typeof RentReferenceRowSchema>

/** Un arrêté préfectoral importé, tel que rangé dans `ReferenceData` (sorte `rent_reference`). */
export const RentReferenceTableSchema = z.object({
  territory: z.string().describe('Territoire (bordeaux)'),
  inseeCodes: z
    .array(z.string().length(5))
    .describe('Communes couvertes par l’arrêté (codes INSEE)'),
  housingType: z
    .literal('apartment')
    .describe('Type de logement de la table (appartements)'),
  decreeDate: z.string().date().describe("Date de l'arrêté préfectoral"),
  validFrom: z
    .string()
    .date()
    .describe('Premier jour d’application (baux signés ou renouvelés)'),
  validUntil: z
    .string()
    .date()
    .nullable()
    .describe(
      'Dernier jour d’application connu (fin de l’expérimentation sauf prolongation), null si inconnu'
    ),
  source: z.object({
    url: z.string().url().nullable(),
    file: z.string(),
    sha256: z.string(),
    importedAt: z.string().datetime(),
    crossCheck: z
      .string()
      .nullable()
      .default(null)
      .describe('Résultat du contrôle croisé avec une seconde source'),
  }),
  rows: z.array(RentReferenceRowSchema).min(1),
})
export type RentReferenceTable = z.infer<typeof RentReferenceTableSchema>

export const RentControlZoneSchema = z.object({
  zone: z.number().int().min(1),
  label: z.string().describe('Libellé du secteur (IRIS)'),
  irisCode: z.string(),
  inseeCode: z.string(),
})
export type RentControlZone = z.infer<typeof RentControlZoneSchema>

export const RentControlLookupSchema = z.object({
  status: OpenDataStatusSchema,
  applicable: z
    .boolean()
    .describe('La commune est soumise à l’encadrement (Bordeaux seule)'),
  zone: RentControlZoneSchema.nullable(),
  rooms: z.number().int().min(1).max(4).nullable(),
  epoch: RentEpochSchema.nullable(),
  furnished: z.boolean().nullable(),
  row: RentReferenceRowSchema.nullable().describe(
    'La ligne de l’arrêté retenue'
  ),
  referenceRentPerM2: z
    .number()
    .nullable()
    .describe('Loyer de référence majoré retenu en €/m²/mois (le plafond)'),
  monthlyCap: z
    .number()
    .nullable()
    .describe('Plafond mensuel hors charges = majoré × surface, en euros'),
  decree: z
    .object({
      decreeDate: z.string().date(),
      validFrom: z.string().date(),
      validUntil: z.string().date().nullable(),
      sourceUrl: z.string().nullable(),
    })
    .nullable(),
  reasons: z
    .array(z.string())
    .describe('Pourquoi le plafond est à vérifier ou sans objet'),
  notes: z.array(z.string()).describe('Remarques (validité, complément)'),
})
export type RentControlLookup = z.infer<typeof RentControlLookupSchema>

// ---------------------------------------------------------------------------
// DPE (observatoire ADEME)
// ---------------------------------------------------------------------------

export const DpeCandidateSchema = z.object({
  number: z.string().describe('Numéro du DPE (13 caractères)'),
  issuedAt: z.string().date().describe("Date d'établissement"),
  validUntil: z.string().date().nullable().describe('Fin de validité'),
  dpeClass: DpeClassSchema,
  gesClass: DpeClassSchema.nullable(),
  consumption: z
    .number()
    .nullable()
    .describe('Consommation 5 usages en énergie primaire, kWh/m²/an'),
  emissions: z
    .number()
    .nullable()
    .describe('Émissions de GES 5 usages, kg CO₂/m²/an'),
  surface: z.number().nullable().describe('Surface habitable du logement, m²'),
  floor: z.number().int().nullable().describe('Étage'),
  address: z.string().nullable().describe('Adresse BAN du DPE'),
  complement: z
    .string()
    .nullable()
    .describe('Complément d’adresse du logement (porte, bâtiment)'),
  banId: z.string().nullable(),
  buildingType: z.string().nullable().describe('appartement, maison, immeuble'),
  matchScore: z
    .number()
    .min(0)
    .max(1)
    .describe('Ressemblance avec l’annonce (surface, étage), de 0 à 1'),
})
export type DpeCandidate = z.infer<typeof DpeCandidateSchema>

export const DpeSearchResultSchema = z.object({
  status: DpeSearchStatusSchema,
  method: z
    .enum(['ban_id', 'commune_surface', 'none'])
    .describe(
      'Recherche par identifiant BAN (adresse exacte), sinon par commune et surface'
    ),
  query: z.record(z.string(), z.string()).describe('Critères envoyés'),
  candidates: z
    .array(DpeCandidateSchema)
    .describe('Candidats, du plus ressemblant au moins ressemblant'),
  total: z.number().int().min(0).describe('DPE trouvés à la source'),
  searchedAt: z.string().datetime(),
  message: z.string().nullable(),
})
export type DpeSearchResult = z.infer<typeof DpeSearchResultSchema>

export const DpeVerifyRequestSchema = z.object({
  number: z
    .string()
    .min(5)
    .max(20)
    .describe('Numéro du DPE retenu parmi les candidats'),
  expectedUpdatedAt: z
    .string()
    .datetime()
    .optional()
    .describe("Garde-fou : `updatedAt` de l'annonce lu avant"),
})
export type DpeVerifyRequest = z.infer<typeof DpeVerifyRequestSchema>

export const DpeValiditySchema = z.object({
  level: CheckLevelSchema,
  messages: z.array(z.string()),
  auditRequired: z
    .boolean()
    .nullable()
    .describe(
      'Audit énergétique obligatoire à la vente (F et G depuis 2023, E depuis 2025) ; null si DPE inconnu'
    ),
})
export type DpeValidity = z.infer<typeof DpeValiditySchema>

// ---------------------------------------------------------------------------
// DVF (ventes d'appartements, Bordeaux Métropole)
// ---------------------------------------------------------------------------

/** Nombre minimal de ventes pour qu'un prix médian au m² soit retenu. */
export const MARKET_MIN_COMPARABLES = 5
/** Tolérance sur la surface des comparables (±25 %). */
export const MARKET_SURFACE_TOLERANCE = 0.25
/** Profondeur des comparables, en années. */
export const MARKET_YEARS = 3
/** Rayons essayés dans l'ordre jusqu'à réunir assez de ventes, en mètres. */
export const MARKET_RADII = [500, 1000, 2000] as const

export const DvfComparableSchema = z.object({
  id: z.string(),
  mutationDate: z.string().date().describe('Date de la vente'),
  price: z.number().describe('Valeur foncière en euros'),
  surface: z.number().describe('Surface réelle bâtie en m²'),
  pricePerM2: z.number().describe('Prix au m² en euros'),
  rooms: z.number().int().nullable(),
  address: z.string().nullable(),
  commune: z.string().nullable(),
  distanceMeters: z.number().min(0),
  point: PointSchema.nullable(),
})
export type DvfComparable = z.infer<typeof DvfComparableSchema>

export const MarketStatsSchema = z.object({
  count: z.number().int().min(0),
  medianPricePerM2: z.number().describe('Prix médian au m² en euros'),
  p25PricePerM2: z.number().describe('Premier quartile en €/m²'),
  p75PricePerM2: z.number().describe('Troisième quartile en €/m²'),
  minPricePerM2: z.number(),
  maxPricePerM2: z.number(),
  dispersion: z
    .number()
    .describe('Écart interquartile rapporté à la médiane (0,2 = ±10 %)'),
})
export type MarketStats = z.infer<typeof MarketStatsSchema>

export const MarketContextSchema = z.object({
  status: OpenDataStatusSchema,
  point: PointSchema.nullable(),
  radiusMeters: z.number().int().nullable(),
  surface: z.number().nullable().describe('Surface de référence en m²'),
  surfaceRange: z
    .tuple([z.number(), z.number()])
    .nullable()
    .describe('Surfaces retenues (±25 %)'),
  period: z.object({ from: z.string().date(), to: z.string().date() }),
  stats: MarketStatsSchema.nullable(),
  comparables: z
    .array(DvfComparableSchema)
    .describe('Ventes retenues, de la plus récente à la plus ancienne'),
  marketPrice: z
    .number()
    .nullable()
    .describe('Prix de marché estimé = médiane au m² × surface (estimé)'),
  listingPricePerM2: z.number().nullable(),
  gapToMarket: z
    .number()
    .nullable()
    .describe(
      'Écart du prix au m² affiché à la médiane, fraction (0,08 = 8 % au-dessus)'
    ),
  reasons: z.array(z.string()),
  dataYears: z.array(z.number().int()).describe('Années DVF présentes en base'),
})
export type MarketContext = z.infer<typeof MarketContextSchema>

// ---------------------------------------------------------------------------
// Contexte d'une annonce et instantané enregistré
// ---------------------------------------------------------------------------

/**
 * Ce qui est enregistré sur l'annonce après un enrichissement : le prix
 * médian DVF retenu (il nourrit le critère « marché » du prix cible, partout
 * le même), le dernier résultat de recherche DPE, l'état du plafond
 * d'encadrement et l'arrêt de tram le plus proche.
 */
export const ListingOpenDataContextSchema = z.object({
  market: z
    .object({
      medianPricePerM2: z.number().nullable(),
      count: z.number().int().min(0),
      radiusMeters: z.number().int().nullable(),
      computedAt: z.string().datetime(),
    })
    .nullable()
    .default(null),
  dpe: DpeSearchResultSchema.nullable().default(null),
  rentControl: z
    .object({
      status: OpenDataStatusSchema,
      zone: z.number().int().nullable(),
      referenceRentPerM2: z.number().nullable(),
      decreeDate: z.string().date().nullable(),
      validUntil: z
        .string()
        .date()
        .nullable()
        .default(null)
        .describe(
          'Dernier jour d’application de l’arrêté : un plafond posé d’office ne vaut plus après'
        ),
      reasons: z.array(z.string()),
      computedAt: z.string().datetime(),
    })
    .nullable()
    .default(null),
  transit: z
    .object({
      nearestTram: NearestStopSchema.nullable(),
      computedAt: z.string().datetime(),
    })
    .nullable()
    .default(null),
})
export type ListingOpenDataContext = z.infer<
  typeof ListingOpenDataContextSchema
>

/** Le bloc « Contexte » d'une fiche : desserte, DPE, encadrement, marché. */
export const ListingContextSchema = z.object({
  listingId: z.string().uuid(),
  point: PointSchema.nullable(),
  precision: LocationPrecisionSchema.nullable(),
  transit: TransitContextSchema,
  rentControl: RentControlLookupSchema,
  dpe: z.object({
    verified: z
      .boolean()
      .describe('Le DPE de la fiche vient de l’ADEME (provenance open_data)'),
    validity: DpeValiditySchema,
    search: DpeSearchResultSchema.nullable(),
  }),
  market: MarketContextSchema,
  computedAt: z.string().datetime(),
})
export type ListingContext = z.infer<typeof ListingContextSchema>

/** `get_market_context` : pour une annonce, une adresse ou un point. */
export const MarketContextRequestSchema = z
  .object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe('Annonce enregistrée (son point, sa surface, ses pièces)'),
    address: z
      .string()
      .min(3)
      .max(300)
      .optional()
      .describe('Adresse à géocoder (sans annonce)'),
    point: PointSchema.optional().describe('Point GeoJSON [lng, lat]'),
    surface: z
      .number()
      .positive()
      .max(1000)
      .optional()
      .describe('Surface en m² pour les comparables (±25 %) et le plafond'),
    rooms: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Pièces principales, pour le loyer de référence'),
    constructionYear: z
      .number()
      .int()
      .min(1000)
      .max(2100)
      .optional()
      .describe('Année de construction, pour le loyer de référence'),
    furnished: z
      .boolean()
      .optional()
      .describe('Location meublée (défaut : vide)'),
    radiusMeters: z
      .number()
      .int()
      .min(100)
      .max(5000)
      .optional()
      .describe(
        'Rayon des comparables en mètres ; absent = 500, élargi à 1 000 puis 2 000 m faute de ventes'
      ),
  })
  .refine(
    value =>
      value.listingId !== undefined ||
      value.address !== undefined ||
      value.point !== undefined,
    { message: 'Donnez listingId, address ou point' }
  )
export type MarketContextRequest = z.infer<typeof MarketContextRequestSchema>

export const MarketContextReportSchema = z.object({
  location: z.object({
    point: PointSchema.nullable(),
    label: z.string().nullable(),
    precision: LocationPrecisionSchema.nullable(),
    commune: z.string().nullable(),
    inseeCode: z.string().nullable(),
  }),
  market: MarketContextSchema,
  rentControl: RentControlLookupSchema,
  transit: TransitContextSchema,
})
export type MarketContextReport = z.infer<typeof MarketContextReportSchema>

// ---------------------------------------------------------------------------
// Couches de carte (GeoJSON)
// ---------------------------------------------------------------------------

/** Une couche de carte : points ou polygones, propriétés à plat. */
export const LayerFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      id: z.union([z.string(), z.number()]).optional(),
      geometry: z.union([
        PointSchema,
        z.object({
          type: z.literal('Polygon'),
          coordinates: z.array(z.array(PositionSchema)),
        }),
        z.object({
          type: z.literal('MultiPolygon'),
          coordinates: z.array(z.array(z.array(PositionSchema))),
        }),
      ]),
      properties: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
      ),
    })
  ),
})
export type LayerFeatureCollection = z.infer<
  typeof LayerFeatureCollectionSchema
>

/** Une emprise de carte [ouest, sud, est, nord] en degrés. */
export const BboxQuerySchema = z.object({
  bbox: z
    .preprocess(
      value =>
        typeof value === 'string'
          ? value.split(',').map(part => Number(part.trim()))
          : value,
      z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ])
    )
    .optional()
    .describe('Emprise ouest,sud,est,nord en degrés'),
})
export type BboxQuery = z.infer<typeof BboxQuerySchema>
