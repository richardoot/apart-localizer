import { z } from 'zod'
import {
  CheckLevelSchema,
  DpeClassSchema,
  OpenDataStatusSchema,
  RentalVerdictSchema,
} from './enums.js'
import { PointSchema } from './geojson.js'

/**
 * Checklist réglementaire datée (lot 5, besoin L5) et risques Géorisques à
 * l'adresse (D6). Les règles vivent dans une table de référence datée et
 * sourcée (`DEFAULT_REGULATORY_RULES`, remplaçable par une ligne
 * `reference_data` de sorte `regulatory_rules`) : l'évaluation (domain) ne
 * connaît aucune date en dur.
 */

export const RegulatorySourceSchema = z.object({
  label: z.string().max(400),
  url: z.string().url().nullable(),
  consultedAt: z.string().date().describe('Date de consultation (AAAA-MM-JJ)'),
})
export type RegulatorySource = z.infer<typeof RegulatorySourceSchema>

const ruleBase = {
  key: z.string().min(1).max(60),
  label: z.string().max(200),
  source: RegulatorySourceSchema,
  note: z.string().max(1000).nullable().default(null),
}

/** Les types de diagnostics du dossier annexé au bail. */
export const DiagnosticKindSchema = z.enum([
  'dpe',
  'lead',
  'asbestos',
  'electricity',
  'gas',
  'risks',
  'noise',
])
export type DiagnosticKind = z.infer<typeof DiagnosticKindSchema>

export const RegulatoryRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    ...ruleBase,
    kind: z.literal('dpe_rental_ban'),
    dpeClasses: z.array(DpeClassSchema).min(1),
    from: z
      .string()
      .date()
      .describe(
        'Premier jour où ces classes ne sont plus décentes pour un bail'
      ),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('dpe_rent_freeze'),
    dpeClasses: z.array(DpeClassSchema).min(1),
    from: z.string().date(),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('rent_control'),
    inseeCodes: z.array(z.string().length(5)).min(1),
    from: z.string().date(),
    until: z
      .string()
      .date()
      .nullable()
      .describe('Dernier jour d’application connu ; null si sans terme'),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('rental_permit'),
    inseeCodes: z
      .array(z.string().length(5))
      .describe('Communes où des secteurs y sont soumis'),
    mapUrl: z.string().url().nullable(),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('diagnostic'),
    diagnostic: DiagnosticKindSchema,
    builtBefore: z
      .string()
      .date()
      .nullable()
      .default(null)
      .describe(
        'Exigé si le logement est construit (ou le permis délivré) avant cette date'
      ),
    installationOlderThanYears: z
      .number()
      .int()
      .nullable()
      .default(null)
      .describe('Exigé si l’installation a plus de n années'),
    validity: z.string().max(200).describe('Durée de validité exigée'),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('decency_surface'),
    minSurface: z
      .number()
      .positive()
      .describe('Surface habitable minimale en m²'),
    minVolume: z.number().positive().describe('Volume habitable minimal en m³'),
  }),
  z.object({
    ...ruleBase,
    kind: z.literal('furnished_inventory'),
  }),
])
export type RegulatoryRule = z.infer<typeof RegulatoryRuleSchema>

export const RegulatoryRulesTableSchema = z.object({
  version: z.string().max(40),
  asOf: z.string().date().describe('Date de relevé de la table'),
  label: z.string().max(300),
  rules: z.array(RegulatoryRuleSchema).min(1),
})
export type RegulatoryRulesTable = z.infer<typeof RegulatoryRulesTableSchema>

const consulted = '2026-11-03'

/**
 * La table par défaut, relevée le 3 novembre 2026. À mettre à jour à chaque
 * évolution (prolongation de l'encadrement, calendrier DPE) : changer la
 * table, sa version, sa date et la documentation ensemble.
 */
export const DEFAULT_REGULATORY_RULES: RegulatoryRulesTable = {
  version: '2026-11-03',
  asOf: consulted,
  label: 'Règles relevées le 3 novembre 2026',
  rules: [
    {
      key: 'dpe_ban_g',
      kind: 'dpe_rental_ban',
      label: 'Logement classé G non décent',
      dpeClasses: ['G'],
      from: '2025-01-01',
      source: {
        label:
          'Loi Climat et résilience du 22 août 2021 ; décret décence (critère énergétique) ; service-public.gouv.fr, fiche F2042',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2042',
        consultedAt: consulted,
      },
      note: 'S’applique aux baux signés, renouvelés ou reconduits à partir de cette date.',
    },
    {
      key: 'dpe_ban_f',
      kind: 'dpe_rental_ban',
      label: 'Logement classé F non décent',
      dpeClasses: ['F'],
      from: '2028-01-01',
      source: {
        label:
          'Loi Climat et résilience du 22 août 2021 ; service-public.gouv.fr, fiche F2042 (classes A à E de 2028 à 2033)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2042',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'dpe_ban_e',
      kind: 'dpe_rental_ban',
      label: 'Logement classé E non décent',
      dpeClasses: ['E'],
      from: '2034-01-01',
      source: {
        label:
          'Loi Climat et résilience du 22 août 2021 ; service-public.gouv.fr, fiche F2042 (classes A à D à partir de 2034)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2042',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'dpe_rent_freeze',
      kind: 'dpe_rent_freeze',
      label: 'Gel des loyers des logements F et G',
      dpeClasses: ['F', 'G'],
      from: '2022-08-24',
      source: {
        label:
          'Loi Climat et résilience, art. 159 : ni révision, ni majoration, ni réévaluation du loyer d’un logement classé F ou G',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1311',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'rent_control_bordeaux',
      kind: 'rent_control',
      label: 'Encadrement des loyers à Bordeaux',
      inseeCodes: ['33063'],
      from: '2022-07-15',
      until: '2026-11-24',
      source: {
        label:
          'Loi 3DS (expérimentation jusqu’au 24 novembre 2026) ; prolongation de deux ans votée par le Sénat le 21 octobre 2026, à adopter conforme par l’Assemblée nationale (Public Sénat, consulté le 3 novembre 2026)',
        url: 'https://www.publicsenat.fr/emission/100-senat/le-senat-prolonge-de-deux-ans-lexperimentation-de-lencadrement-des-loyers-e18',
        consultedAt: consulted,
      },
      note: 'Prolongation non définitive au 3 novembre 2026 : une mise en location après le 24 novembre 2026 reste « à vérifier ».',
    },
    {
      key: 'rental_permit_bordeaux_metropole',
      kind: 'rental_permit',
      label: 'Permis de louer (autorisation préalable de mise en location)',
      inseeCodes: ['33063'],
      mapUrl: 'https://geo.bordeaux-metropole.fr/permis_de_louer_diviser/',
      source: {
        label:
          'Ville de Bordeaux, « Le permis de louer à Bordeaux » (mis à jour le 2 juin 2026) : une partie des secteurs Victoire, Saint-Michel et Belcier ; instruit par Bordeaux Métropole ; d’autres communes de la métropole ont des secteurs (carte de Bordeaux Métropole)',
        url: 'https://www.bordeaux.fr/le-permis-de-louer-a-bordeaux',
        consultedAt: consulted,
      },
      note: 'Le secteur exact se lit sur la carte de Bordeaux Métropole : l’application ne le déduit pas de l’adresse.',
    },
    {
      key: 'diagnostic_dpe',
      kind: 'diagnostic',
      label: 'Diagnostic de performance énergétique',
      diagnostic: 'dpe',
      builtBefore: null,
      installationOlderThanYears: null,
      validity: 'dix ans, et établi après le 1er juillet 2021',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 (vérifiée le 20 février 2026)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_lead',
      kind: 'diagnostic',
      label: 'Constat de risque d’exposition au plomb (CREP)',
      diagnostic: 'lead',
      builtBefore: '1949-01-01',
      installationOlderThanYears: null,
      validity:
        'six ans pour une location (illimitée si aucune trace de plomb)',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : logement construit avant le 1er janvier 1949 ; durée de validité : notaires.fr, « Diagnostics immobiliers obligatoires pour la location » (mis à jour le 28 septembre 2026)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_asbestos',
      kind: 'diagnostic',
      label: 'État d’amiante (tenu à disposition du locataire)',
      diagnostic: 'asbestos',
      builtBefore: '1997-07-01',
      installationOlderThanYears: null,
      validity: 'pas annexé au bail, à tenir à disposition',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : fait partie du dossier, tenu à la disposition du locataire (permis de construire antérieur au 1er juillet 1997)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_electricity',
      kind: 'diagnostic',
      label: 'État de l’installation intérieure d’électricité',
      diagnostic: 'electricity',
      builtBefore: null,
      installationOlderThanYears: 15,
      validity: 'six ans pour une location',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : installation de plus de 15 ans ; durée de validité : notaires.fr, « Diagnostics immobiliers obligatoires pour la location » (mis à jour le 28 septembre 2026)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_gas',
      kind: 'diagnostic',
      label: 'État de l’installation intérieure de gaz',
      diagnostic: 'gas',
      builtBefore: null,
      installationOlderThanYears: 15,
      validity: 'six ans pour une location',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : installation de plus de 15 ans ; durée de validité : notaires.fr, « Diagnostics immobiliers obligatoires pour la location » (mis à jour le 28 septembre 2026)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_risks',
      kind: 'diagnostic',
      label:
        'État des risques (naturels, miniers, technologiques, sismiques, radon)',
      diagnostic: 'risks',
      builtBefore: null,
      installationOlderThanYears: null,
      validity: 'établi moins de six mois avant la signature du bail',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : logement dans une zone ou un périmètre à risques ; peut être établi par le bailleur ; durée de validité : notaires.fr, « Diagnostics immobiliers obligatoires pour la location » (mis à jour le 28 septembre 2026)',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'diagnostic_noise',
      kind: 'diagnostic',
      label: 'Diagnostic bruit (zone d’exposition au bruit d’un aérodrome)',
      diagnostic: 'noise',
      builtBefore: null,
      installationOlderThanYears: null,
      validity: 'à jour à la signature du bail',
      source: {
        label:
          'Service-public.gouv.fr, fiche F33463 : logement dans une zone d’exposition au bruit des aéroports (plan d’exposition au bruit) ; peut être établi par le bailleur',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463',
        consultedAt: consulted,
      },
      note: 'Le plan d’exposition au bruit de Bordeaux-Mérignac n’est pas importé : à vérifier selon l’adresse.',
    },
    {
      key: 'decency_surface',
      kind: 'decency_surface',
      label: 'Surface minimale d’un logement décent',
      minSurface: 9,
      minVolume: 20,
      source: {
        label:
          'Service-public.gouv.fr, fiche F2042 : une pièce principale d’au moins 9 m² et 2,20 m sous plafond, ou 20 m³',
        url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2042',
        consultedAt: consulted,
      },
      note: null,
    },
    {
      key: 'furnished_inventory',
      kind: 'furnished_inventory',
      label: 'Mobilier minimal d’un logement meublé',
      source: {
        label:
          'Décret n° 2015-981 du 31 juillet 2015 : liste des éléments de mobilier d’un logement meublé loué en résidence principale (analyse ANIL)',
        url: 'https://www.anil.org/documentation-experte/analyses-juridiques-jurisprudence/analyses-juridiques/analyses-juridiques-2015/liste-des-elements-de-mobilier-dun-logement-meuble/',
        consultedAt: consulted,
      },
      note: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// Géorisques
// ---------------------------------------------------------------------------

/** Un aléa du rapport « risques près de chez moi », à l'adresse et dans la commune. */
export const GeorisqueHazardSchema = z.object({
  key: z.string().describe('Clé du rapport Géorisques (inondation, radon…)'),
  label: z.string(),
  family: z.enum(['natural', 'technological']),
  present: z.boolean().describe('Aléa recensé dans la commune'),
  communeStatus: z.string().nullable(),
  addressStatus: z.string().nullable(),
  level: CheckLevelSchema.describe(
    'ok : non concerné ou faible ; warn : risque existant à l’adresse ; unknown : non connu à l’adresse'
  ),
})
export type GeorisqueHazard = z.infer<typeof GeorisqueHazardSchema>

export const GeorisquesReportSchema = z.object({
  status: OpenDataStatusSchema,
  point: PointSchema.nullable(),
  address: z.string().nullable().describe('Adresse retenue par Géorisques'),
  commune: z.string().nullable(),
  inseeCode: z.string().nullable(),
  reportUrl: z
    .string()
    .url()
    .nullable()
    .describe('Le rapport « risques près de chez moi » sur georisques.gouv.fr'),
  hazards: z
    .array(GeorisqueHazardSchema)
    .describe('Aléas recensés dans la commune'),
  fetchedAt: z.string().datetime().nullable(),
  message: z.string().nullable(),
})
export type GeorisquesReport = z.infer<typeof GeorisquesReportSchema>

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export const ComplianceCategorySchema = z.enum([
  'energy',
  'rent_control',
  'permit',
  'diagnostics',
  'decency',
  'co_ownership',
  'furnished',
  'risks',
])
export type ComplianceCategory = z.infer<typeof ComplianceCategorySchema>

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  energy: 'Performance énergétique',
  rent_control: 'Encadrement des loyers',
  permit: 'Permis de louer',
  diagnostics: 'Diagnostics du bail',
  decency: 'Décence',
  co_ownership: 'Copropriété',
  furnished: 'Meublé',
  risks: 'Risques (Géorisques)',
}

export const ComplianceItemSchema = z.object({
  key: z.string(),
  category: ComplianceCategorySchema,
  level: CheckLevelSchema.describe(
    'ok, warn (attention), bad (bloquant), unknown (à vérifier)'
  ),
  title: z.string(),
  message: z.string(),
  date: z
    .string()
    .date()
    .nullable()
    .describe('Date de la règle (entrée en vigueur, échéance) ou de la donnée'),
  source: RegulatorySourceSchema.nullable(),
  provenance: z
    .enum(['reference', 'open_data', 'listing'])
    .describe(
      'Table de référence datée, donnée ouverte (Géorisques), ou fiche de l’annonce'
    ),
})
export type ComplianceItem = z.infer<typeof ComplianceItemSchema>

export const ComplianceReportSchema = z.object({
  listingId: z.string().uuid().nullable(),
  title: z.string(),
  rentalStartDate: z
    .string()
    .date()
    .describe('Date de mise en location évaluée'),
  evaluatedAt: z.string().datetime(),
  items: z.array(ComplianceItemSchema),
  counts: z.object({
    ok: z.number().int(),
    warn: z.number().int(),
    bad: z.number().int(),
    unknown: z.number().int(),
  }),
  verdict: RentalVerdictSchema.describe(
    'Incompatible dès un bloquant, sous conditions dès un point d’attention ou à vérifier, sinon compatible'
  ),
  georisques: GeorisquesReportSchema.nullable(),
  rules: z.object({
    version: z.string(),
    asOf: z.string().date(),
    label: z.string(),
  }),
  disclaimer: z.string(),
})
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>
