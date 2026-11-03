import { z } from 'zod'

/**
 * Fiscalité locative estimée (lot 5, besoins E6 et E7) : régimes, paramètres
 * datés et sourcés. Les formules vivent dans `packages/domain` (`tax.ts`,
 * `capital-gains.ts`) et ne connaissent aucun taux en dur : elles lisent ces
 * paramètres, versionnés avec les hypothèses (`Assumptions.taxParameters`).
 * Tout résultat est une estimation, jamais un conseil fiscal.
 */

const fraction = (what: string) =>
  z.number().min(0).max(1).describe(`${what}, en fraction (0,3 = 30 %)`)

const euros = (what: string) => z.number().min(0).describe(`${what}, en euros`)

export const TaxRegimeSchema = z
  .enum(['micro_foncier', 'reel_foncier', 'micro_bic', 'lmnp_reel'])
  .describe(
    'Régime fiscal des loyers : micro-foncier ou réel (location vide), micro-BIC ou réel LMNP (location meublée)'
  )
export type TaxRegime = z.infer<typeof TaxRegimeSchema>

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  micro_foncier: 'Micro-foncier',
  reel_foncier: 'Réel foncier',
  micro_bic: 'LMNP micro-BIC',
  lmnp_reel: 'LMNP réel',
}

/** Les régimes possibles selon le bail : vide (revenus fonciers) ou meublé (BIC). */
export const TAX_REGIMES_UNFURNISHED: readonly TaxRegime[] = [
  'micro_foncier',
  'reel_foncier',
]
export const TAX_REGIMES_FURNISHED: readonly TaxRegime[] = [
  'micro_bic',
  'lmnp_reel',
]

export const FurnishedRentalKindSchema = z
  .enum(['long_term', 'tourism_classified', 'tourism_unclassified'])
  .describe(
    'Nature de la location meublée pour le micro-BIC : meublé de longue durée (bail d’habitation), meublé de tourisme classé, meublé de tourisme non classé'
  )
export type FurnishedRentalKind = z.infer<typeof FurnishedRentalKindSchema>

export const FURNISHED_RENTAL_KIND_LABELS: Record<FurnishedRentalKind, string> =
  {
    long_term: 'Meublé de longue durée',
    tourism_classified: 'Meublé de tourisme classé',
    tourism_unclassified: 'Meublé de tourisme non classé',
  }

/** Une source consultée : libellé, adresse, date de consultation. */
export const DatedSourceSchema = z.object({
  topic: z.string().max(120).describe('Paramètre ou règle concerné'),
  label: z.string().max(400).describe('Texte, article ou page consultée'),
  url: z.string().url().nullable().describe('Adresse consultée'),
  consultedAt: z.string().date().describe('Date de consultation (AAAA-MM-JJ)'),
})
export type DatedSource = z.infer<typeof DatedSourceSchema>

const microRegime = (what: string) =>
  z
    .object({
      allowanceRate: fraction(`Abattement forfaitaire du ${what}`),
      receiptsCeiling: euros(`Plafond de recettes annuelles du ${what}`),
    })
    .describe(what)

/** Un composant amortissable du bâti en LMNP réel (part de la valeur hors terrain, durée). */
export const DepreciationComponentSchema = z.object({
  label: z.string().max(80),
  share: fraction('Part de la valeur du bâti hors terrain'),
  years: z.number().int().min(1).max(100).describe('Durée d’amortissement'),
})
export type DepreciationComponent = z.infer<typeof DepreciationComponentSchema>

/** Une tranche d'abattement pour durée de détention (plus-value immobilière). */
export const HoldingAllowanceBandSchema = z.object({
  fromYear: z
    .number()
    .int()
    .min(1)
    .describe('Première année de détention (révolue) de la tranche'),
  toYear: z.number().int().min(1).describe('Dernière année de la tranche'),
  ratePerYear: fraction('Abattement par année de détention dans la tranche'),
})
export type HoldingAllowanceBand = z.infer<typeof HoldingAllowanceBandSchema>

/** Une tranche de la surtaxe sur les plus-values élevées (CGI, art. 1609 nonies G). */
export const SurtaxBracketSchema = z.object({
  from: euros(
    'Plus-value imposable à partir de laquelle la tranche s’applique'
  ),
  to: z
    .number()
    .positive()
    .nullable()
    .describe('Fin de la tranche en euros ; null = sans limite'),
  rate: fraction('Taux appliqué à toute la plus-value imposable'),
  smoothing: z
    .number()
    .min(0)
    .describe(
      'Coefficient de lissage : surtaxe = taux × PV − (fin de tranche − PV) × coefficient ; 0 sans lissage'
    ),
})
export type SurtaxBracket = z.infer<typeof SurtaxBracketSchema>

/**
 * Les paramètres fiscaux d'une estimation, datés et sourcés. Modifiables dans
 * les hypothèses : un paramètre en cours de réforme se règle sans toucher au
 * code.
 */
export const TaxParametersSchema = z.object({
  asOf: z.string().date().describe('Date de relevé des valeurs'),
  label: z.string().max(300).describe('Origine des valeurs, pour l’affichage'),
  socialContributions: z.object({
    landIncomeRate: fraction(
      'Prélèvements sociaux sur les revenus fonciers (location vide)'
    ),
    furnishedIncomeRate: fraction(
      'Prélèvements sociaux sur les revenus de location meublée non professionnelle (BIC)'
    ),
    capitalGainsRate: fraction(
      'Prélèvements sociaux sur les plus-values immobilières des particuliers'
    ),
  }),
  microFoncier: microRegime('micro-foncier'),
  realLand: z.object({
    managementFeePerUnit: euros(
      'Frais de gestion forfaitaires déductibles par local et par an (réel foncier)'
    ),
    globalDeficitCap: euros(
      'Déficit foncier imputable chaque année sur le revenu global (hors intérêts d’emprunt)'
    ),
    deficitCarryForwardYears: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe(
        'Durée de report du déficit foncier sur les revenus fonciers, en années'
      ),
  }),
  microBic: z.object({
    minimumAllowance: euros('Abattement minimal du micro-BIC'),
    longTerm: microRegime('micro-BIC, meublé de longue durée'),
    tourismClassified: microRegime('micro-BIC, meublé de tourisme classé'),
    tourismUnclassified: microRegime(
      'micro-BIC, meublé de tourisme non classé'
    ),
  }),
  lmnpReal: z.object({
    landShare: fraction(
      'Part du terrain dans la valeur du bien, non amortissable (estimation usuelle)'
    ),
    components: z
      .array(DepreciationComponentSchema)
      .min(1)
      .describe('Composants du bâti hors terrain, parts dont la somme vaut 1'),
    furnitureYears: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe('Durée d’amortissement du mobilier'),
    worksYears: z
      .number()
      .int()
      .min(1)
      .max(50)
      .describe('Durée d’amortissement des travaux faits avant la location'),
    deficitCarryForwardYears: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe(
        'Durée de report du déficit BIC non professionnel, en années (amortissements différés : sans limite)'
      ),
  }),
  capitalGains: z.object({
    incomeTaxRate: fraction('Taux d’impôt sur le revenu de la plus-value'),
    acquisitionCostsFlatRate: fraction(
      'Forfait de frais d’acquisition, en fraction du prix d’achat (à défaut des frais réels)'
    ),
    worksFlatRate: fraction(
      'Forfait de travaux, en fraction du prix d’achat (à défaut des travaux réels)'
    ),
    worksFlatMinYears: z
      .number()
      .int()
      .min(0)
      .describe('Détention minimale (années révolues) pour le forfait travaux'),
    incomeTaxAllowances: z
      .array(HoldingAllowanceBandSchema)
      .describe('Abattements pour durée de détention, impôt sur le revenu'),
    socialAllowances: z
      .array(HoldingAllowanceBandSchema)
      .describe('Abattements pour durée de détention, prélèvements sociaux'),
    surtaxBrackets: z
      .array(SurtaxBracketSchema)
      .describe('Surtaxe sur les plus-values imposables élevées'),
    mainResidenceExemption: z
      .boolean()
      .describe(
        'Exonération de la résidence principale (le bien doit l’être au jour de la cession)'
      ),
    reintegrateLmnpDepreciation: z
      .boolean()
      .describe(
        'Les amortissements déduits en LMNP réel diminuent le prix d’acquisition (loi de finances pour 2025)'
      ),
  }),
  sources: z.array(DatedSourceSchema).default([]),
  uncertainties: z
    .array(z.string().max(600))
    .default([])
    .describe(
      'Paramètres incertains ou en cours de réforme à la date de relevé'
    ),
})
export type TaxParameters = z.infer<typeof TaxParametersSchema>

/**
 * Paramètres par défaut, relevés le 3 novembre 2026 (voir le modèle de
 * calcul § 7 et l'ADR 0012). Les durées d'amortissement par composant et la
 * part du terrain sont des pratiques comptables usuelles, pas des valeurs
 * légales : à valider avec un expert-comptable.
 */
export const DEFAULT_TAX_PARAMETERS: TaxParameters = {
  asOf: '2026-11-03',
  label:
    'Paramètres relevés le 3 novembre 2026 (LF 2025, LFSS 2026, LF 2026) ; estimation, pas un conseil fiscal',
  socialContributions: {
    landIncomeRate: 0.172,
    furnishedIncomeRate: 0.186,
    capitalGainsRate: 0.172,
  },
  microFoncier: { allowanceRate: 0.3, receiptsCeiling: 15_000 },
  realLand: {
    managementFeePerUnit: 20,
    globalDeficitCap: 10_700,
    deficitCarryForwardYears: 10,
  },
  microBic: {
    minimumAllowance: 305,
    longTerm: { allowanceRate: 0.5, receiptsCeiling: 83_600 },
    tourismClassified: { allowanceRate: 0.5, receiptsCeiling: 83_600 },
    tourismUnclassified: { allowanceRate: 0.3, receiptsCeiling: 15_000 },
  },
  lmnpReal: {
    landShare: 0.15,
    components: [
      { label: 'Gros œuvre', share: 0.55, years: 50 },
      { label: 'Façade, toiture, étanchéité', share: 0.15, years: 25 },
      { label: 'Installations techniques', share: 0.15, years: 20 },
      { label: 'Agencements intérieurs', share: 0.15, years: 12 },
    ],
    furnitureYears: 7,
    worksYears: 15,
    deficitCarryForwardYears: 10,
  },
  capitalGains: {
    incomeTaxRate: 0.19,
    acquisitionCostsFlatRate: 0.075,
    worksFlatRate: 0.15,
    worksFlatMinYears: 5,
    incomeTaxAllowances: [
      { fromYear: 6, toYear: 21, ratePerYear: 0.06 },
      { fromYear: 22, toYear: 22, ratePerYear: 0.04 },
    ],
    socialAllowances: [
      { fromYear: 6, toYear: 21, ratePerYear: 0.0165 },
      { fromYear: 22, toYear: 22, ratePerYear: 0.016 },
      { fromYear: 23, toYear: 30, ratePerYear: 0.09 },
    ],
    surtaxBrackets: [
      { from: 50_000, to: 60_000, rate: 0.02, smoothing: 0.05 },
      { from: 60_000, to: 100_000, rate: 0.02, smoothing: 0 },
      { from: 100_000, to: 110_000, rate: 0.03, smoothing: 0.1 },
      { from: 110_000, to: 150_000, rate: 0.03, smoothing: 0 },
      { from: 150_000, to: 160_000, rate: 0.04, smoothing: 0.15 },
      { from: 160_000, to: 200_000, rate: 0.04, smoothing: 0 },
      { from: 200_000, to: 210_000, rate: 0.05, smoothing: 0.2 },
      { from: 210_000, to: 250_000, rate: 0.05, smoothing: 0 },
      { from: 250_000, to: 260_000, rate: 0.06, smoothing: 0.25 },
      { from: 260_000, to: null, rate: 0.06, smoothing: 0 },
    ],
    mainResidenceExemption: true,
    reintegrateLmnpDepreciation: true,
  },
  sources: [
    {
      topic: 'Plus-value immobilière',
      label:
        'Service-public.gouv.fr, fiche F10864 (vérifiée le 15 avril 2026) : 19 % + 17,2 %, abattements, forfaits 7,5 % et 15 %, surtaxe au-delà de 50 000 €, exonération de la résidence principale',
      url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10864',
      consultedAt: '2026-11-03',
    },
    {
      topic: 'Micro-BIC',
      label:
        'Seuils 2026 à 2028 (revalorisation triennale, arrêté du 27 janvier 2026) : meublé de longue durée et de tourisme classé 50 % jusqu’à 83 600 €, tourisme non classé 30 % jusqu’à 15 000 € (loi n° 2024-1039 du 19 novembre 2024) ; relevé sur weblex.fr et entreprendre.service-public.gouv.fr (actualité A18813 du 26 février 2026)',
      url: 'https://entreprendre.service-public.gouv.fr/actualites/A18813',
      consultedAt: '2026-11-03',
    },
    {
      topic: 'Prélèvements sociaux',
      label:
        'LFSS pour 2026 (loi n° 2025-1403 du 30 décembre 2025, CSS art. L. 136-8) : CSG relevée de 1,4 point sur les revenus du patrimoine, 18,6 % sur les BIC de location meublée non professionnelle dès les revenus 2025 ; revenus fonciers et plus-values immobilières maintenus à 17,2 % (synthèses de cabinets, doctrine BOFiP non encore publiée au relevé)',
      url: 'https://www.hagnere-patrimoine.fr/guides-patrimoine/comment-payer-moins-impots/lfss-2026-article-12-prelevements-sociaux',
      consultedAt: '2026-11-03',
    },
    {
      topic: 'Déficit foncier',
      label:
        'CGI art. 156 I 3° : 10 700 € par an sur le revenu global hors intérêts, report de 10 ans ; 21 400 € pour les travaux de rénovation énergétique (sortie des classes E, F, G vers A à D) payés jusqu’au 31 décembre 2027 (prolongation par la loi de finances pour 2026), non appliqué par défaut',
      url: 'https://www.weblex.fr/weblex-actualite/coup-de-pouce-fiscal-pour-la-renovation-energetique-on-joue-les-prolongations',
      consultedAt: '2026-11-03',
    },
    {
      topic: 'LMNP : amortissements à la revente',
      label:
        'Loi de finances pour 2025 (n° 2025-127 du 14 février 2025) : les amortissements déduits sont réintégrés dans la plus-value pour les cessions depuis le 15 février 2025, quelle que soit la date de mise en location (réponse ministérielle n° 10097, JO AN du 24 mars 2026) ; mobilier exclu, résidences de services exceptées',
      url: 'https://www.legifiscal.fr/actualites-fiscales/4461--value-immobiliere-lmnp-amortissements-anterieurs-2025-egalement-reintegrer.html',
      consultedAt: '2026-11-03',
    },
    {
      topic: 'Micro-foncier',
      label:
        'CGI art. 32 : abattement de 30 % si les revenus fonciers bruts du foyer ne dépassent pas 15 000 € (relevé sur l’ANIL, fiche « Location vide »)',
      url: 'https://www.anil.org/votre-projet/vous-etes-proprietaire/bailleur/location-vide/',
      consultedAt: '2026-11-03',
    },
  ],
  uncertainties: [
    'Prélèvements sociaux à 18,6 % sur les BIC LMNP : relevé dans des synthèses de la LFSS 2026, commentaires BOFiP non publiés au 3 novembre 2026.',
    'Seuil micro-BIC de 83 600 € pour les revenus 2026 à 2028 : relevé dans des synthèses (le seuil de 2025 était 77 700 €) ; impots.gouv.fr ne l’affiche pas encore en clair.',
    'Durées d’amortissement par composant et part du terrain : pratiques comptables usuelles, pas des valeurs légales.',
    'Le dispositif « Jeanbrun » (amortissement en location nue, loi de finances pour 2026) n’est pas modélisé : il exige une location dans les douze mois suivant l’acquisition, incompatible avec une phase 1 en résidence principale.',
  ],
}
