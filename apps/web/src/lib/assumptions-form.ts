import {
  AssumptionsSchema,
  DEFAULT_NOTARY_SCALE,
  FURNISHED_RENTAL_KIND_LABELS,
  LEASE_TYPE_LABELS,
  TARGET_CRITERION_LABELS,
  TAX_REGIME_LABELS,
} from '@apart/contracts'
import type {
  Assumptions,
  FurnishedRentalKind,
  LeaseType,
  NotaryMode,
  NotaryScale,
  TargetCriterion,
  TaxRegime,
} from '@apart/contracts'
import {
  formatDay,
  formatEuros,
  formatNumber,
  fractionToPercentInput,
  parseNumberInput,
  percentToFraction,
  toFrenchInput,
} from './format'

/**
 * Le formulaire de la page Hypothèses (lot 13) : des champs texte en
 * pourcentages et en euros, convertis en hypothèses validées par le contrat.
 * Conversion, validation et suivi des modifications seulement, aucun calcul :
 * les repères affichés à côté des champs viennent de `@apart/domain`.
 * La conversion est celle du formulaire d'avant le lot 13, à l'identique.
 */

export interface BandForm {
  upTo: string
  ratePercent: string
}

export interface NotaryScaleForm {
  departmentalRatePercent: string
  communalRatePercent: string
  collectionFeeRatePercent: string
  bands: BandForm[]
  emolumentVatRatePercent: string
  securityContributionRatePercent: string
  securityContributionMinimum: string
  disbursements: string
  label: string
}

export interface AssumptionsFormModel {
  downPayment: string
  interestRatePercent: string
  durationYears: string
  insuranceRatePercent: string
  notaryRatePercent: string
  notaryMode: NotaryMode
  scale: NotaryScaleForm
  vacancyMonths: string
  fixedCostsAnnual: string
  grossYieldThresholdPercent: string
  netYieldThresholdPercent: string
  maxMonthlyEffort: string
  targetCriteria: TargetCriterion[]
  negotiableDiscountPercent: string
  tightDiscountPercent: string
  rentalYear: string
  /** Lot 19 : le type de location de la phase 2, pour tout l'espace. */
  leaseType: LeaseType
  /** Lot 5 : phase 1, fiscalité, horizon. */
  currentRent: string
  maintenanceAnnual: string
  purchaseDate: string
  rentalStartDate: string
  marginalTaxPercent: string
  taxRegime: TaxRegime | ''
  furnishedRentalKind: FurnishedRentalKind
  horizonYears: string
  appreciationPercent: string
  rentIndexationPercent: string
  resaleCostsPercent: string
  discountPercent: string
  /** Nom facultatif de la version à enregistrer ; pas une hypothèse. */
  label: string
}

export const TMI_CHOICES = ['0', '11', '30', '41', '45'] as const
export const TAX_REGIMES = Object.keys(TAX_REGIME_LABELS) as TaxRegime[]
export const FURNISHED_KINDS = Object.keys(
  FURNISHED_RENTAL_KIND_LABELS
) as FurnishedRentalKind[]
/** Lot 19 : vide, meublé, colocation. */
export const LEASE_TYPES = Object.keys(LEASE_TYPE_LABELS) as LeaseType[]

/**
 * Les critères du prix cible que la page laisse cocher, dans l'ordre des
 * lignes. « Marché (DVF) » n'y est pas, comme avant le lot 13 : il se règle
 * par le MCP et une valeur reçue est conservée telle quelle.
 */
export const SELECTABLE_CRITERIA: readonly TargetCriterion[] = [
  'gross_yield',
  'effort',
  'net_yield',
  'rent_x220',
]

/** Préfixe du chemin d'un critère du prix cible (`targetCriteria.effort`). */
const CRITERIA_KEY_PREFIX = 'targetCriteria.'

/** Un taux en pourcentage pour un champ, à la française (« 3,65 »). */
const percentInput = (fraction: number | null | undefined): string =>
  toFrenchInput(fractionToPercentInput(fraction))

/** Un montant en euros pour un champ (« 40 000 »). */
const amountInput = (value: number): string =>
  toFrenchInput(String(value), true)

const optionalAmount = (value: number | null): string =>
  value === null ? '' : amountInput(value)

/**
 * Le barème vers le formulaire. Les nombres sont écrits à la française, sans
 * autre arrondi qu'avant le lot 13 : relus, ils donnent les mêmes valeurs.
 */
export function scaleFormOf(scale: NotaryScale): NotaryScaleForm {
  return {
    departmentalRatePercent: percentInput(scale.departmentalRate),
    communalRatePercent: percentInput(scale.communalRate),
    collectionFeeRatePercent: percentInput(scale.collectionFeeRate),
    bands: scale.emolumentBands.map(band => ({
      upTo: band.upTo === null ? '' : amountInput(band.upTo),
      ratePercent: percentInput(band.rate),
    })),
    emolumentVatRatePercent: percentInput(scale.emolumentVatRate),
    securityContributionRatePercent: percentInput(
      scale.securityContributionRate
    ),
    securityContributionMinimum: amountInput(scale.securityContributionMinimum),
    disbursements: amountInput(scale.disbursements),
    label: scale.label,
  }
}

/** Les hypothèses en vigueur vers le formulaire (taux en pourcentages). */
export function formFromValues(values: Assumptions): AssumptionsFormModel {
  return {
    downPayment: amountInput(values.downPayment),
    interestRatePercent: percentInput(values.interestRate),
    durationYears: String(values.durationYears),
    insuranceRatePercent: percentInput(values.insuranceRate),
    notaryRatePercent: percentInput(values.notaryRate),
    notaryMode: values.notaryMode,
    scale: scaleFormOf(values.notaryScale),
    vacancyMonths: toFrenchInput(String(values.vacancyMonths)),
    fixedCostsAnnual: amountInput(values.fixedCostsAnnual),
    grossYieldThresholdPercent: percentInput(values.grossYieldThreshold),
    netYieldThresholdPercent: percentInput(values.netYieldThreshold),
    maxMonthlyEffort: amountInput(values.maxMonthlyEffort),
    targetCriteria: [...values.targetCriteria],
    negotiableDiscountPercent: percentInput(values.negotiableDiscount),
    tightDiscountPercent: percentInput(values.tightDiscount),
    rentalYear: String(values.rentalYear),
    leaseType: values.leaseType,
    currentRent: optionalAmount(values.currentRent),
    maintenanceAnnual: optionalAmount(values.maintenanceAnnual),
    purchaseDate: values.purchaseDate ?? '',
    rentalStartDate: values.rentalStartDate ?? '',
    // La valeur d'une option de la liste (« 30 ») : pas de virgule.
    marginalTaxPercent:
      values.marginalTaxRate === null
        ? ''
        : fractionToPercentInput(values.marginalTaxRate),
    taxRegime: values.taxRegime ?? '',
    furnishedRentalKind: values.furnishedRentalKind,
    horizonYears: String(values.horizonYears),
    appreciationPercent: percentInput(values.appreciationRate),
    rentIndexationPercent: percentInput(values.rentIndexationRate),
    resaleCostsPercent: percentInput(values.resaleCostsRate),
    discountPercent: percentInput(values.discountRate),
    label: '',
  }
}

/** Le barème saisi, nombres lus ou `null` quand un champ est vide ou illisible. */
export interface NotaryScaleDraft {
  departmentalRate: number | null
  communalRate: number | null
  collectionFeeRate: number | null
  emolumentBands: { upTo: number | null; rate: number | null }[]
  emolumentVatRate: number | null
  securityContributionRate: number | null
  securityContributionMinimum: number | null
  disbursements: number | null
  label: string
}

/** La saisie lue, champ par champ : nombres en fractions et en euros, `null` si vide ou illisible. */
export interface AssumptionsDraft {
  downPayment: number | null
  interestRate: number | null
  durationYears: number | null
  insuranceRate: number | null
  notaryRate: number | null
  notaryMode: NotaryMode
  notaryScale: NotaryScaleDraft
  vacancyMonths: number | null
  fixedCostsAnnual: number | null
  grossYieldThreshold: number | null
  netYieldThreshold: number | null
  maxMonthlyEffort: number | null
  targetCriteria: TargetCriterion[]
  negotiableDiscount: number | null
  tightDiscount: number | null
  rentalYear: number | null
  leaseType: LeaseType
  currentRent: number | null
  maintenanceAnnual: number | null
  purchaseDate: string | null
  rentalStartDate: string | null
  marginalTaxRate: number | null
  taxRegime: TaxRegime | null
  furnishedRentalKind: FurnishedRentalKind
  horizonYears: number | null
  appreciationRate: number | null
  rentIndexationRate: number | null
  resaleCostsRate: number | null
  discountRate: number | null
}

/** Le formulaire lu, sans validation : ce que les repères et les résumés affichent pendant la saisie. */
export function draftFromForm(model: AssumptionsFormModel): AssumptionsDraft {
  return {
    downPayment: parseNumberInput(model.downPayment),
    interestRate: percentToFraction(model.interestRatePercent),
    durationYears: parseNumberInput(model.durationYears),
    insuranceRate: percentToFraction(model.insuranceRatePercent),
    notaryRate: percentToFraction(model.notaryRatePercent),
    notaryMode: model.notaryMode,
    notaryScale: {
      departmentalRate: percentToFraction(model.scale.departmentalRatePercent),
      communalRate: percentToFraction(model.scale.communalRatePercent),
      collectionFeeRate: percentToFraction(
        model.scale.collectionFeeRatePercent
      ),
      emolumentBands: model.scale.bands.map(band => ({
        upTo: band.upTo.trim() === '' ? null : parseNumberInput(band.upTo),
        rate: percentToFraction(band.ratePercent),
      })),
      emolumentVatRate: percentToFraction(model.scale.emolumentVatRatePercent),
      securityContributionRate: percentToFraction(
        model.scale.securityContributionRatePercent
      ),
      securityContributionMinimum: parseNumberInput(
        model.scale.securityContributionMinimum
      ),
      disbursements: parseNumberInput(model.scale.disbursements),
      label: model.scale.label.trim(),
    },
    vacancyMonths: parseNumberInput(model.vacancyMonths),
    fixedCostsAnnual: parseNumberInput(model.fixedCostsAnnual),
    grossYieldThreshold: percentToFraction(model.grossYieldThresholdPercent),
    netYieldThreshold: percentToFraction(model.netYieldThresholdPercent),
    maxMonthlyEffort: parseNumberInput(model.maxMonthlyEffort),
    targetCriteria: model.targetCriteria,
    negotiableDiscount: percentToFraction(model.negotiableDiscountPercent),
    tightDiscount: percentToFraction(model.tightDiscountPercent),
    rentalYear: parseNumberInput(model.rentalYear),
    leaseType: model.leaseType,
    currentRent:
      model.currentRent.trim() === ''
        ? null
        : parseNumberInput(model.currentRent),
    maintenanceAnnual:
      model.maintenanceAnnual.trim() === ''
        ? null
        : parseNumberInput(model.maintenanceAnnual),
    purchaseDate: model.purchaseDate || null,
    rentalStartDate: model.rentalStartDate || null,
    marginalTaxRate:
      model.marginalTaxPercent === ''
        ? null
        : percentToFraction(model.marginalTaxPercent),
    taxRegime: model.taxRegime || null,
    furnishedRentalKind: model.furnishedRentalKind,
    horizonYears: parseNumberInput(model.horizonYears),
    appreciationRate: percentToFraction(model.appreciationPercent),
    rentIndexationRate: percentToFraction(model.rentIndexationPercent),
    resaleCostsRate: percentToFraction(model.resaleCostsPercent),
    discountRate:
      model.discountPercent.trim() === ''
        ? null
        : percentToFraction(model.discountPercent),
  }
}

/** Coche ou décoche un critère du prix cible ; un critère coché passe en fin de liste. */
export function toggleCriterion(
  list: readonly TargetCriterion[],
  criterion: TargetCriterion,
  checked: boolean
): TargetCriterion[] {
  const current = list.filter(c => c !== criterion)
  return checked ? [...current, criterion] : current
}

// ---------------------------------------------------------------------------
// Sections, champs et suivi des modifications.

export type SectionId =
  'financement' | 'criteres' | 'calendrier' | 'notaire' | 'fiscalite'

/** Les parties repliables d'une section : un champ modifié ou en erreur s'y trouve. */
export type PanelId = 'negotiation' | 'scaleDetail' | 'taxation' | 'rentalYear'

export interface SectionSpec {
  id: SectionId
  index: number
  /** Titre court : sommaire et en-tête d'accordéon sur mobile. */
  shortTitle: string
  /** Titre de la section sur ordinateur, en question. */
  question: string
  /** La phrase « Sert à : … ». */
  purpose: string
}

export const ASSUMPTIONS_SECTIONS: readonly SectionSpec[] = [
  {
    id: 'financement',
    index: 1,
    shortTitle: 'Financement',
    question: "Comment finances-tu l'achat ?",
    purpose: 'Sert à : mensualité, coût du crédit, effort mensuel, prix cible.',
  },
  {
    id: 'criteres',
    index: 2,
    shortTitle: 'Bonne affaire',
    question: "Qu'est-ce qu'une bonne affaire pour toi ?",
    purpose:
      'Sert à : verdict de chaque annonce et prix cible. Les seuils cochés « prix cible » fixent le prix à négocier : le plus exigeant l’emporte.',
  },
  {
    id: 'calendrier',
    index: 3,
    shortTitle: 'Calendrier et location',
    question: 'Quel est ton calendrier ?',
    purpose:
      "Sert à : coût d'occupation pendant que tu y habites (phase 1), puis loyers encaissés, rendement net et effort une fois loué (phase 2).",
  },
  {
    id: 'notaire',
    index: 4,
    shortTitle: 'Frais de notaire',
    question: 'Frais de notaire',
    purpose:
      'Sert à : coût tout compris de chaque annonce. Rarement modifiés : le barème par défaut est daté et sourcé.',
  },
  {
    id: 'fiscalite',
    index: 5,
    shortTitle: 'Fiscalité et revente',
    question: 'Fiscalité et revente',
    purpose:
      'Sert à : onglet « Budget » de la fiche (impôt, projection, TRI, VAN). Estimations, pas un conseil fiscal.',
  },
]

export type FieldKind =
  | 'euros'
  | 'eurosPerMonth'
  | 'eurosPerYear'
  | 'percent'
  | 'percentPerYear'
  | 'years'
  | 'months'
  | 'year'
  | 'date'
  | 'text'
  | 'choice'
  | 'criterion'

export interface FieldSpec {
  /** Chemin dans le formulaire (`scale.bands.1.ratePercent`, `targetCriteria.effort`). */
  key: string
  /** Libellé dans la liste des modifications et des erreurs. */
  label: string
  section: SectionId
  panel?: PanelId
  kind: FieldKind
  /** Chemin dans les hypothèses, pour rattacher une erreur du contrat au champ. */
  valueKey?: string
  /** Ce que vaut un champ vide, en clair. */
  empty?: string
  /** Libellés des choix d'une liste. */
  choices?: Record<string, string>
}

const TMI_LABELS: Record<string, string> = Object.fromEntries(
  TMI_CHOICES.map(t => [t, `${t} %`])
)

export const NOTARY_MODE_LABELS: Record<NotaryMode, string> = {
  scale: 'Barème officiel',
  rate: 'Taux forfaitaire',
}

const STATIC_FIELDS: readonly FieldSpec[] = [
  // Financement
  {
    key: 'downPayment',
    label: 'Apport',
    section: 'financement',
    kind: 'euros',
    valueKey: 'downPayment',
  },
  {
    key: 'interestRatePercent',
    label: 'Taux du crédit',
    section: 'financement',
    kind: 'percent',
    valueKey: 'interestRate',
  },
  {
    key: 'durationYears',
    label: 'Durée du crédit',
    section: 'financement',
    kind: 'years',
    valueKey: 'durationYears',
  },
  {
    key: 'insuranceRatePercent',
    label: 'Assurance emprunteur',
    section: 'financement',
    kind: 'percent',
    valueKey: 'insuranceRate',
  },
  // Bonne affaire
  {
    key: 'grossYieldThresholdPercent',
    label: 'Rendement brut minimum',
    section: 'criteres',
    kind: 'percent',
    valueKey: 'grossYieldThreshold',
  },
  {
    key: 'maxMonthlyEffort',
    label: 'Effort mensuel maximum',
    section: 'criteres',
    kind: 'eurosPerMonth',
    valueKey: 'maxMonthlyEffort',
  },
  {
    key: 'netYieldThresholdPercent',
    label: 'Rendement net minimum',
    section: 'criteres',
    kind: 'percent',
    valueKey: 'netYieldThreshold',
    empty: 'non utilisé',
  },
  ...SELECTABLE_CRITERIA.map((criterion): FieldSpec => ({
    key: `${CRITERIA_KEY_PREFIX}${criterion}`,
    label: `Prix cible : ${TARGET_CRITERION_LABELS[criterion].toLowerCase()}`,
    section: 'criteres',
    kind: 'criterion',
  })),
  {
    key: 'negotiableDiscountPercent',
    label: 'Décote négociable',
    section: 'criteres',
    panel: 'negotiation',
    kind: 'percent',
    valueKey: 'negotiableDiscount',
  },
  {
    key: 'tightDiscountPercent',
    label: 'Décote tendue',
    section: 'criteres',
    panel: 'negotiation',
    kind: 'percent',
    valueKey: 'tightDiscount',
  },
  // Calendrier et location
  {
    key: 'purchaseDate',
    label: "Date d'achat prévue",
    section: 'calendrier',
    kind: 'date',
    valueKey: 'purchaseDate',
    empty: 'date du calcul',
  },
  {
    key: 'currentRent',
    label: 'Loyer actuel du foyer',
    section: 'calendrier',
    kind: 'eurosPerMonth',
    valueKey: 'currentRent',
    empty: 'non renseigné',
  },
  {
    key: 'maintenanceAnnual',
    label: 'Entretien (phase 1)',
    section: 'calendrier',
    kind: 'eurosPerYear',
    valueKey: 'maintenanceAnnual',
    empty: 'non renseigné',
  },
  {
    key: 'rentalStartDate',
    label: 'Date de mise en location',
    section: 'calendrier',
    kind: 'date',
    valueKey: 'rentalStartDate',
    empty: "1er janvier de l'année par défaut",
  },
  {
    key: 'rentalYear',
    label: 'Année de mise en location par défaut',
    section: 'calendrier',
    panel: 'rentalYear',
    kind: 'year',
    valueKey: 'rentalYear',
  },
  {
    key: 'leaseType',
    label: 'Type de location (phase 2)',
    section: 'calendrier',
    kind: 'choice',
    valueKey: 'leaseType',
    choices: LEASE_TYPE_LABELS,
  },
  {
    key: 'vacancyMonths',
    label: 'Vacance locative',
    section: 'calendrier',
    kind: 'months',
    valueKey: 'vacancyMonths',
  },
  {
    key: 'fixedCostsAnnual',
    label: 'Frais fixes du bailleur',
    section: 'calendrier',
    kind: 'eurosPerYear',
    valueKey: 'fixedCostsAnnual',
  },
  // Frais de notaire
  {
    key: 'notaryMode',
    label: 'Mode de calcul des frais de notaire',
    section: 'notaire',
    kind: 'choice',
    valueKey: 'notaryMode',
    choices: NOTARY_MODE_LABELS,
  },
  {
    key: 'notaryRatePercent',
    label: 'Taux forfaitaire de notaire',
    section: 'notaire',
    kind: 'percent',
    valueKey: 'notaryRate',
  },
  {
    key: 'scale.departmentalRatePercent',
    label: 'Barème : droit départemental',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'percent',
    valueKey: 'notaryScale.departmentalRate',
  },
  {
    key: 'scale.communalRatePercent',
    label: 'Barème : taxe communale',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'percent',
    valueKey: 'notaryScale.communalRate',
  },
  {
    key: 'scale.collectionFeeRatePercent',
    label: "Barème : frais d'assiette",
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'percent',
    valueKey: 'notaryScale.collectionFeeRate',
  },
  {
    key: 'scale.emolumentVatRatePercent',
    label: 'Barème : TVA sur émoluments',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'percent',
    valueKey: 'notaryScale.emolumentVatRate',
  },
  {
    key: 'scale.securityContributionRatePercent',
    label: 'Barème : contribution de sécurité immobilière',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'percent',
    valueKey: 'notaryScale.securityContributionRate',
  },
  {
    key: 'scale.securityContributionMinimum',
    label: 'Barème : minimum de la contribution de sécurité',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'euros',
    valueKey: 'notaryScale.securityContributionMinimum',
  },
  {
    key: 'scale.disbursements',
    label: 'Barème : débours et formalités',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'euros',
    valueKey: 'notaryScale.disbursements',
  },
  {
    key: 'scale.label',
    label: 'Barème : origine des valeurs',
    section: 'notaire',
    panel: 'scaleDetail',
    kind: 'text',
    valueKey: 'notaryScale.label',
  },
  // Fiscalité et revente
  {
    key: 'marginalTaxPercent',
    label: "Tranche marginale d'imposition",
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'choice',
    valueKey: 'marginalTaxRate',
    choices: { '': 'non renseignée', ...TMI_LABELS },
  },
  {
    key: 'taxRegime',
    label: 'Régime fiscal visé',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'choice',
    valueKey: 'taxRegime',
    choices: { '': 'selon le bail (micro)', ...TAX_REGIME_LABELS },
  },
  {
    key: 'furnishedRentalKind',
    label: 'Location meublée',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'choice',
    valueKey: 'furnishedRentalKind',
    choices: FURNISHED_RENTAL_KIND_LABELS,
  },
  {
    key: 'horizonYears',
    label: 'Revente dans',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'years',
    valueKey: 'horizonYears',
  },
  {
    key: 'appreciationPercent',
    label: 'Valeur du bien',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'percentPerYear',
    valueKey: 'appreciationRate',
  },
  {
    key: 'rentIndexationPercent',
    label: 'Hausse des loyers et charges',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'percentPerYear',
    valueKey: 'rentIndexationRate',
  },
  {
    key: 'resaleCostsPercent',
    label: 'Frais de revente',
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'percent',
    valueKey: 'resaleCostsRate',
  },
  {
    key: 'discountPercent',
    label: "Taux d'actualisation (VAN)",
    section: 'fiscalite',
    panel: 'taxation',
    kind: 'percent',
    valueKey: 'discountRate',
    empty: 'taux du crédit',
  },
]

function bandFields(count: number): FieldSpec[] {
  return Array.from({ length: count }, (_, i) => [
    {
      key: `scale.bands.${i}.upTo`,
      label: `Barème : tranche ${i + 1}, borne`,
      section: 'notaire' as const,
      panel: 'scaleDetail' as const,
      kind: 'euros' as const,
      valueKey: `notaryScale.emolumentBands.${i}.upTo`,
      empty: 'sans limite',
    },
    {
      key: `scale.bands.${i}.ratePercent`,
      label: `Barème : tranche ${i + 1}, taux`,
      section: 'notaire' as const,
      panel: 'scaleDetail' as const,
      kind: 'percent' as const,
      valueKey: `notaryScale.emolumentBands.${i}.rate`,
    },
  ]).flat()
}

/** Identifiants des champs dans la page (ceux d'avant le lot 13, gardés). */
const INPUT_IDS: Record<string, string> = {
  downPayment: 'h-down',
  interestRatePercent: 'h-rate',
  durationYears: 'h-years',
  insuranceRatePercent: 'h-insurance',
  grossYieldThresholdPercent: 'h-yield',
  maxMonthlyEffort: 'h-effort',
  netYieldThresholdPercent: 'h-net-yield',
  negotiableDiscountPercent: 'h-negotiable',
  tightDiscountPercent: 'h-tight',
  purchaseDate: 'h-purchase',
  currentRent: 'h-current-rent',
  maintenanceAnnual: 'h-maintenance',
  rentalStartDate: 'h-rental-start',
  rentalYear: 'h-year',
  leaseType: 'h-lease-type',
  vacancyMonths: 'h-vacancy',
  fixedCostsAnnual: 'h-fixed',
  notaryMode: 'h-notary-mode-scale',
  notaryRatePercent: 'h-notary',
  'scale.departmentalRatePercent': 'h-dept',
  'scale.communalRatePercent': 'h-communal',
  'scale.collectionFeeRatePercent': 'h-collection',
  'scale.emolumentVatRatePercent': 'h-vat',
  'scale.securityContributionRatePercent': 'h-csi',
  'scale.securityContributionMinimum': 'h-csi-min',
  'scale.disbursements': 'h-disbursements',
  'scale.label': 'h-scale-label',
  marginalTaxPercent: 'h-tmi',
  taxRegime: 'h-regime',
  furnishedRentalKind: 'h-furnished-kind',
  horizonYears: 'h-horizon',
  appreciationPercent: 'h-appreciation',
  rentIndexationPercent: 'h-irl',
  resaleCostsPercent: 'h-resale',
  discountPercent: 'h-discount',
  targetCriteria: 'h-crit-gross_yield',
}

/** L'identifiant du champ d'un chemin du formulaire, pour le relier et y porter le focus. */
export function fieldInputId(key: string): string {
  const band = /^scale\.bands\.(\d+)\.(upTo|ratePercent)$/.exec(key)
  if (band) return `h-band-${band[1]}-${band[2] === 'upTo' ? 'up' : 'rate'}`
  if (key.startsWith(CRITERIA_KEY_PREFIX))
    return `h-crit-${key.slice(CRITERIA_KEY_PREFIX.length)}`
  return INPUT_IDS[key] ?? `h-${key.replace(/\W+/g, '-')}`
}

/** Tous les champs suivis du formulaire, tranches du barème comprises. */
export function fieldSpecs(bandCount: number): FieldSpec[] {
  return [...STATIC_FIELDS, ...bandFields(bandCount)]
}

/** La valeur d'un champ par son chemin ; un critère vaut coché ou non. */
export function readField(
  model: AssumptionsFormModel,
  key: string
): string | boolean {
  if (key.startsWith(CRITERIA_KEY_PREFIX)) {
    return model.targetCriteria.includes(
      key.slice(CRITERIA_KEY_PREFIX.length) as TargetCriterion
    )
  }
  let node: unknown = model
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return ''
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : ''
}

/** Écrit un champ par son chemin (rebase sur une nouvelle version). */
export function writeField(
  model: AssumptionsFormModel,
  key: string,
  value: string | boolean
): void {
  if (key.startsWith(CRITERIA_KEY_PREFIX)) {
    const criterion = key.slice(CRITERIA_KEY_PREFIX.length) as TargetCriterion
    model.targetCriteria = toggleCriterion(
      model.targetCriteria,
      criterion,
      value === true
    )
    return
  }
  const parts = key.split('.')
  const last = parts.pop()
  let node: unknown = model
  for (const part of parts) {
    if (node === null || typeof node !== 'object') return
    node = (node as Record<string, unknown>)[part]
  }
  if (last && node !== null && typeof node === 'object' && last in node) {
    ;(node as Record<string, unknown>)[last] = value
  }
}

const NUMERIC_KINDS: ReadonlySet<FieldKind> = new Set([
  'euros',
  'eurosPerMonth',
  'eurosPerYear',
  'percent',
  'percentPerYear',
  'years',
  'months',
  'year',
])

/** Même nombre saisi : « 3,65 » vaut « 3.65 », « 40 000 » vaut « 40000 » ; deux saisies illisibles se comparent en texte. */
function sameNumberInput(a: string, b: string): boolean {
  const x = parseNumberInput(a)
  const y = parseNumberInput(b)
  if (x !== null || y !== null) return x === y
  return a.trim() === b.trim()
}

/** Même valeur pour ce champ, selon sa nature (nombre, texte, choix, critère). */
export function sameFieldValue(
  spec: FieldSpec,
  a: string | boolean,
  b: string | boolean
): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b
  if (NUMERIC_KINDS.has(spec.kind)) return sameNumberInput(a, b)
  return spec.kind === 'text' ? a.trim() === b.trim() : a === b
}

const UNIT_SUFFIX: Partial<Record<FieldKind, string>> = {
  euros: '€',
  eurosPerMonth: '€/mois',
  eurosPerYear: '€/an',
  percent: '%',
  percentPerYear: '%/an',
  years: 'ans',
  months: 'mois',
}

/** Une valeur saisie relue en clair, avec son unité : « 35 000 € », « 3,65 % », « coché ». */
export function formatFieldValue(
  spec: FieldSpec,
  raw: string | boolean
): string {
  if (typeof raw === 'boolean') return raw ? 'retenu' : 'non retenu'
  if (spec.kind === 'choice') return spec.choices?.[raw] ?? raw
  if (raw.trim() === '') return spec.empty ?? 'vide'
  if (spec.kind === 'date') return formatDay(raw)
  if (spec.kind === 'text') return `« ${raw.trim()} »`
  const value = parseNumberInput(raw)
  if (value === null) return `« ${raw.trim()} »`
  if (spec.kind === 'euros') return formatEuros(value)
  if (spec.kind === 'year') return String(value)
  const unit = UNIT_SUFFIX[spec.kind]
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
}

export interface FieldChange {
  key: string
  label: string
  section: SectionId
  panel?: PanelId
  /** La valeur en vigueur, en clair : « modifié · avant … ». */
  before: string
}

/**
 * Les champs qui diffèrent du formulaire chargé (hypothèses en vigueur), dans
 * l'ordre de la page. Le nom de la version n'est pas une modification.
 */
export function formChanges(
  initial: AssumptionsFormModel,
  current: AssumptionsFormModel
): FieldChange[] {
  const bands = Math.max(initial.scale.bands.length, current.scale.bands.length)
  return fieldSpecs(bands)
    .filter(
      spec =>
        !sameFieldValue(
          spec,
          readField(initial, spec.key),
          readField(current, spec.key)
        )
    )
    .map(spec => ({
      key: spec.key,
      label: spec.label,
      section: spec.section,
      ...(spec.panel ? { panel: spec.panel } : {}),
      before: formatFieldValue(spec, readField(initial, spec.key)),
    }))
}

/**
 * Une nouvelle version arrive pendant la saisie (enregistrée ici ou par un
 * autre membre) : les champs modifiés gardent la saisie, les autres prennent
 * les nouvelles valeurs. Rien de la version reçue n'est écrasé sans avoir été
 * touché.
 */
export function rebaseForm(
  oldInitial: AssumptionsFormModel,
  current: AssumptionsFormModel,
  newInitial: AssumptionsFormModel
): AssumptionsFormModel {
  const next = structuredClone(newInitial)
  for (const change of formChanges(oldInitial, current)) {
    writeField(next, change.key, readField(current, change.key))
  }
  next.label = current.label
  return next
}

/** Le barème saisi a les valeurs du barème par défaut (`DEFAULT_NOTARY_SCALE`), origine mise à part. */
export function isDefaultScale(scale: NotaryScaleForm): boolean {
  const reference = scaleFormOf(DEFAULT_NOTARY_SCALE)
  if (reference.bands.length !== scale.bands.length) return false
  const numbers = (s: NotaryScaleForm): string[] => [
    s.departmentalRatePercent,
    s.communalRatePercent,
    s.collectionFeeRatePercent,
    s.emolumentVatRatePercent,
    s.securityContributionRatePercent,
    s.securityContributionMinimum,
    s.disbursements,
    ...s.bands.flatMap(band => [band.upTo, band.ratePercent]),
  ]
  const expected = numbers(reference)
  return numbers(scale).every((value, i) =>
    sameNumberInput(value, expected[i] ?? '')
  )
}

// ---------------------------------------------------------------------------
// Validation.

/** Message d'erreur par champ (chemin du formulaire), en français. */
export type FieldErrors = Record<string, string>

/** Erreur sans champ propre : aucun critère retenu pour le prix cible. */
export const CRITERIA_ERROR_KEY = 'targetCriteria'

export type FormResult =
  { values: Assumptions; errors: null } | { values: null; errors: FieldErrors }

interface ContractIssue {
  code: string
  path: readonly PropertyKey[]
  message: string
  minimum?: number | bigint
  maximum?: number | bigint
  inclusive?: boolean
  expected?: string
}

function bound(value: number, spec: FieldSpec | undefined): string {
  switch (spec?.kind) {
    case 'percent':
    case 'percentPerYear':
      return `${formatNumber(value * 100)} %`
    case 'euros':
    case 'eurosPerMonth':
    case 'eurosPerYear':
      return formatEuros(value)
    case 'years':
      return `${value} ans`
    case 'months':
      return `${formatNumber(value)} mois`
    default:
      return formatNumber(value)
  }
}

function issueMessage(
  issue: ContractIssue,
  spec: FieldSpec | undefined
): string {
  switch (issue.code) {
    case 'too_small':
      return issue.inclusive === false
        ? `doit être supérieur à ${bound(Number(issue.minimum), spec)}`
        : `${bound(Number(issue.minimum), spec)} au minimum`
    case 'too_big':
      return `${bound(Number(issue.maximum), spec)} au maximum`
    case 'invalid_type':
      return issue.expected === 'int'
        ? 'nombre entier attendu'
        : 'nombre attendu'
    case 'invalid_format':
      return 'date invalide'
    case 'invalid_value':
      return 'choix invalide'
    default:
      return issue.message
  }
}

/** Le libellé d'un champ pour la liste des erreurs. */
export function fieldLabel(key: string, bandCount: number): string {
  if (key === CRITERIA_ERROR_KEY) return 'Critères du prix cible'
  return fieldSpecs(bandCount).find(spec => spec.key === key)?.label ?? key
}

/** La section d'un champ (erreur ou modification) et sa partie repliable. */
export function fieldLocation(
  key: string,
  bandCount: number
): { section: SectionId; panel?: PanelId } {
  if (key === CRITERIA_ERROR_KEY) return { section: 'criteres' }
  const spec = fieldSpecs(bandCount).find(s => s.key === key)
  return spec
    ? { section: spec.section, ...(spec.panel ? { panel: spec.panel } : {}) }
    : { section: 'financement' }
}

/**
 * Le formulaire vers des hypothèses complètes, validées par le contrat, avec
 * les deux règles du formulaire d'avant (seuil net exigé s'il est retenu,
 * décote tendue au moins égale à la négociable). Les champs que la page ne
 * montre pas (marges du verdict, paramètres fiscaux) restent ceux de `base`.
 */
export function valuesFromForm(
  model: AssumptionsFormModel,
  base: Assumptions
): FormResult {
  const candidate = { ...base, ...draftFromForm(model) }
  const parsed = AssumptionsSchema.safeParse(candidate)
  const specs = fieldSpecs(model.scale.bands.length)
  if (!parsed.success) {
    const errors: FieldErrors = {}
    for (const issue of parsed.error.issues as ContractIssue[]) {
      const path = issue.path.map(String).join('.')
      const spec = specs.find(s => s.valueKey === path)
      const key =
        spec?.key ?? (path === 'targetCriteria' ? CRITERIA_ERROR_KEY : path)
      if (errors[key]) continue
      errors[key] =
        key === CRITERIA_ERROR_KEY
          ? 'retiens au moins un critère pour le prix cible'
          : issueMessage(issue, spec)
    }
    return { values: null, errors }
  }
  const errors: FieldErrors = {}
  if (
    parsed.data.targetCriteria.includes('net_yield') &&
    parsed.data.netYieldThreshold === null
  ) {
    errors.netYieldThresholdPercent =
      'saisis un seuil pour retenir ce critère dans le prix cible'
  }
  if (parsed.data.tightDiscount < parsed.data.negotiableDiscount) {
    errors.tightDiscountPercent =
      'doit être au moins égale à la décote « négociable »'
  }
  return Object.keys(errors).length
    ? { values: null, errors }
    : { values: parsed.data, errors: null }
}
