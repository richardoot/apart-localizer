import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_TASKS,
  LISTING_LINK_EVIDENCE_MAX,
  ListingInputSchema,
  OfferInputSchema,
  OpinionCriterionSchema,
  OpinionInputSchema,
  OpinionScoresInputSchema,
  RentComparableInputSchema,
  ScenarioInputSchema,
  SearchCriteriaInputSchema,
  TaskInputSchema,
  VisitInputSchema,
  taskFieldForLabel,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  DpeClass,
  FieldProvenanceMap,
  ListingCheckChange,
  ListingCheckOutcome,
  ListingObserved,
  ListingQuestionField,
  ListingInput,
  ListingLinkOrigin,
  ListingPortal,
  ListingSource,
  ListingStatus,
  LocationPrecision,
  OfferChannel,
  OfferResponse,
  OpinionCriterionOrigin,
  Point,
  RenovationLevel,
  RentalDemand,
  RentComparableInput,
  ScenarioInput,
  SearchCriteriaInput,
  SellerType,
  Verdict,
} from '@apart/contracts'
import {
  compute,
  customCriterionKey,
  defaultOpinionCriteria,
  detectLinkPortal,
  effectiveObserved,
  financialsFromListing,
  linkAddedDiff,
  linkCheckDiff,
  linkKey,
  listingCheckSummary,
  matchDuplicates,
  normalizeSeller,
  opinionAfterVisit,
  opinionJournalPayload,
  opinionSnapshot,
  portalOfListingSource,
  portalWhere,
  primaryLink,
  republicationProposal,
  resolveLinkCheckOutcome,
  sanitizeEvidence,
  visibleCriterionKeys,
} from '@apart/domain'
import type {
  DuplicateRow,
  LinkState,
  OpinionLike,
  OpinionVisitLike,
  SellerFacts,
} from '@apart/domain'
import { DEMO_ACCOUNTS, DEMO_WORKSPACE_NAME } from './accounts.js'
import { buildDemoExplorations } from './exploration.js'
import type { DemoExploration, DemoExplorationDraft } from './exploration.js'
import { buildAgencyExchanges } from './agency.js'
import type { DemoAgencyRequest, DemoContact } from './agency.js'
import { DEMO_WORKSPACE_ID, demoId } from './ids.js'

/**
 * Le jeu de démonstration (`pnpm stack:up --dataset demo`), entièrement
 * FICTIF : titres, textes, adresses (« adresse fictive »), liens
 * (`exemple.invalid`) et personnes sont inventés ; les coordonnées sont
 * seulement plausibles, réparties dans Bordeaux Métropole. Rien ne vient de
 * `data/private/`.
 *
 * Construction pure et déterministe : mêmes identifiants à chaque appel, et
 * dates relatives au jour du seed (arrondies au jour), pour que les badges
 * « nouvelle », les visites à venir et « ce qui a changé » restent parlants.
 * Les valeurs passent par les schémas de `contracts` ; les indicateurs se
 * calculent par `domain`. L'écriture en base est dans `write.ts`.
 */

export type DemoHandle = (typeof DEMO_ACCOUNTS)[number]['handle']

export interface DemoMember {
  id: string
  handle: DemoHandle
  email: string
  displayName: string
  role: 'owner' | 'member'
  createdAt: string
  /** Point de départ de « ce qui a changé » et dernière visite. */
  whatsNewSince: string
}

export interface DemoTask {
  id: string
  label: string
  origin: 'default' | 'manual' | 'visit'
  done: boolean
  doneAt: string | null
  assignee: DemoHandle | null
  position: number
  createdAt: string
  createdBy: DemoHandle
  /** Lot 17 : le champ de la fiche demandé, la demande qui porte la tâche, sa réponse. */
  field?: ListingQuestionField | null
  requestedAt?: string | null
  requestId?: string | null
  answeredAt?: string | null
}

/** Lot 20 : la note d'un critère dans un avis (fictive). */
export interface DemoOpinionScore {
  key: string
  score: number | null
  word: string | null
  createdAt: string
  updatedAt: string
}

/** Un avis : note globale, phrase et (lot 20) notes par critère. */
export interface DemoOpinion {
  handle: DemoHandle
  rating: number
  text: string
  /** Création de l'avis. */
  at: string
  updatedAt: string
  /** Lot 20 : première note (critère ou globale). */
  ratedAt: string | null
  scores: DemoOpinionScore[]
}

/** Lot 20 : un critère des avis de l'espace Démo. */
export interface DemoOpinionCriterion {
  id: string
  key: string
  label: string
  hint: string
  position: number
  hidden: boolean
  origin: OpinionCriterionOrigin
  createdAt: string
}

export interface DemoOffer {
  id: string
  madeAt: string
  amount: number
  channel: OfferChannel | null
  response: OfferResponse
  counterAmount: number | null
  respondedAt: string | null
  notes: string | null
  by: DemoHandle
}

export interface DemoVisit {
  id: string
  visitedAt: string
  status: 'done' | 'planned'
  participants: DemoHandle[]
  report: string | null
  pros: string | null
  cons: string | null
  rating: number
  by: DemoHandle
  createdAt: string
  prepTaskId: string | null
}

/** Lot 15 : une vérification de l'annonce sur son portail (fictif). */
export interface DemoCheck {
  id: string
  at: string
  by: DemoHandle
  channel: 'web' | 'mcp'
  outcome: ListingCheckOutcome
  changes: ListingCheckChange[]
  summary: string
  evidence: string | null
  checkedUrl: string | null
  linkedListingId: string | null
  suggestedStatus: ListingStatus | null
  /** Lot 18 : le lien vérifié (ou ajouté). */
  linkId: string
}

/** Lot 18 : un lien de l'annonce sur un portail (fictif). */
export interface DemoLink {
  id: string
  key: string
  portal: ListingPortal
  url: string
  normalizedUrl: string
  externalId: string | null
  price: number | null
  priceAt: string | null
  firstSeenAt: string
  lastSeenOnlineAt: string | null
  lastCheckedAt: string | null
  offlineSince: string | null
  online: boolean
  origin: ListingLinkOrigin
  readSellerName: string | null
  readReference: string | null
  evidence: string | null
  addedBy: DemoHandle | null
  createdAt: string
  updatedAt: string
  /** Rattaché d'office par une exploration : le brouillon reconnu qui le porte. */
  draftId: string | null
}

export interface DemoListing {
  key: string
  id: string
  input: ListingInput
  createdAt: string
  updatedAt: string
  createdBy: DemoHandle
  channel: Extract<ActivityChannel, 'web' | 'mcp'>
  /** Prix successifs, du premier constat au prix affiché. */
  prices: Array<{ at: string; price: number }>
  statuses: Array<{
    at: string
    by: DemoHandle
    status: ListingStatus
    reason?: string
  }>
  opinions: DemoOpinion[]
  tasks: DemoTask[]
  offers: DemoOffer[]
  visits: DemoVisit[]
  rentComparables: Array<{
    id: string
    input: RentComparableInput
    by: DemoHandle
    at: string
  }>
  views: Array<{ handle: DemoHandle; seenAt: string }>
  /** Lot 15 : vérifications sur le portail, de la plus ancienne à la plus récente. */
  checks: DemoCheck[]
  lastCheckedAt: string | null
  lastSeenOnlineAt: string | null
  /** Lot 15 : l'annonce plus ancienne dont celle-ci est la republication. */
  republishedFromId: string | null
  /** Lot 18 : ses liens, le lien d'origine en tête ; la clé de sa référence. */
  links: DemoLink[]
  sellerReferenceKey: string | null
}

export interface DemoCriteria {
  id: string
  key: string
  input: SearchCriteriaInput
  by: DemoHandle
  createdAt: string
}

export interface DemoScenario {
  id: string
  input: ScenarioInput
  by: DemoHandle
  createdAt: string
}

export interface DemoDraft {
  id: string
  input: ListingInput
  receivedAt: string
  emailSubject: string
  emailFrom: string
  url: string
}

export type { DemoExploration, DemoExplorationDraft } from './exploration.js'

export interface DemoActivity {
  id: string
  at: string
  actor: DemoHandle | null
  channel: ActivityChannel
  action: string
  listingKey: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface DemoDataset {
  workspace: { id: string; name: string; createdAt: string }
  members: DemoMember[]
  assumptions: Array<{
    id: string
    label: string
    effectiveFrom: string
    values: Assumptions
  }>
  listings: DemoListing[]
  criteria: DemoCriteria[]
  scenarios: DemoScenario[]
  drafts: DemoDraft[]
  /** Le journal hors entrées dans les critères (calculées par PostGIS à l'écriture). */
  activity: DemoActivity[]
  /** Lot 16 : explorations fictives et brouillons qu'elles ont déposés. */
  explorations: DemoExploration[]
  explorationDrafts: DemoExplorationDraft[]
  /** Lot 17 : contacts des annonceurs et demandes (fictifs). */
  contacts: DemoContact[]
  agencyRequests: DemoAgencyRequest[]
  /** Lot 20 : les huit critères par défaut et un critère ajouté par l'espace. */
  opinionCriteria: DemoOpinionCriterion[]
  /** Lot 20 : avis à l'aveugle (vrai, le défaut). */
  opinionsBlind: boolean
}

// ---------------------------------------------------------------------------
// Dates : relatives au jour du seed, à l'heure près
// ---------------------------------------------------------------------------

function clock(now: Date) {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
  /** Il y a `days` jours (négatif = à venir), à `hour` heures UTC. */
  return (days: number, hour = 10, minute = 0): string =>
    new Date(
      midnight - days * 86_400_000 + (hour * 60 + minute) * 60_000
    ).toISOString()
}

const plusMinutes = (iso: string, minutes: number): string =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString()

// ---------------------------------------------------------------------------
// Les annonces
// ---------------------------------------------------------------------------

interface ListingSpec {
  key: string
  title: string
  commune: string
  inseeCode: string
  district: string
  address: string
  point: [number, number]
  precision: LocationPrecision
  source: ListingSource
  sourceLabel?: string
  /** Prix successifs : le dernier est le prix affiché. */
  prices: Array<[daysAgo: number, price: number]>
  surface: number
  rooms: number
  bedrooms: number
  floor: number | null
  floorsTotal: number | null
  elevator: boolean | null
  year: number | null
  dpe: DpeClass | null
  annualCharges: number
  propertyTax: number
  targetRent: number
  demand?: RentalDemand
  furniture?: number
  renovation?: {
    level: RenovationLevel
    months: number
    items: Array<[string, number]>
  }
  description: string
  createdBy: DemoHandle
  channel: 'web' | 'mcp'
  /** Statuts successifs après « à étudier » : [il y a N jours, statut, par, raison]. */
  statuses?: Array<[number, ListingStatus, DemoHandle, string?]>
  /** Tâches par défaut déjà cochées (indices dans DEFAULT_TASKS). */
  doneDefaults?: number[]
  /** Lot 15 : la clé de l'annonce plus ancienne dont celle-ci est la republication. */
  republishedFrom?: string
  /** Date de publication sur le portail : il y a N jours (absente sinon). */
  publishedDays?: number
}

const SPECS: ListingSpec[] = [
  {
    key: 'chartrons-t2',
    title: 'T2 lumineux près des quais, Chartrons',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'Chartrons',
    address:
      '8 rue des Tonneliers-Imaginaires, 33300 Bordeaux (adresse fictive)',
    point: [-0.5735, 44.8548],
    precision: 'exact',
    source: 'seloger',
    prices: [
      [34, 199_000],
      [12, 172_000],
    ],
    surface: 42,
    rooms: 2,
    bedrooms: 1,
    floor: 2,
    floorsTotal: 4,
    elevator: false,
    year: 1900,
    dpe: 'D',
    annualCharges: 1200,
    propertyTax: 900,
    targetRent: 800,
    demand: 'strong',
    description:
      'Exemple fictif : deux pièces traversant au deuxième étage d’un immeuble en pierre, parquet, cuisine séparée, cave.',
    createdBy: 'demo',
    channel: 'web',
    statuses: [
      [30, 'to_visit', 'demo'],
      [25, 'visited', 'demo'],
      [5, 'offer_made', 'demo'],
    ],
    doneDefaults: [0, 1, 2, 5],
  },
  {
    key: 'saint-michel-t3',
    title: 'T3 traversant sur la place du marché, Saint-Michel',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'Saint-Michel',
    address: '3 impasse de la Lanterne-Rêvée, 33800 Bordeaux (adresse fictive)',
    point: [-0.5668, 44.8335],
    precision: 'exact',
    source: 'leboncoin',
    prices: [[28, 214_000]],
    surface: 61,
    rooms: 3,
    bedrooms: 2,
    floor: 1,
    floorsTotal: 3,
    elevator: false,
    year: 1880,
    dpe: 'E',
    annualCharges: 900,
    propertyTax: 1100,
    targetRent: 880,
    demand: 'strong',
    renovation: {
      level: 'energy',
      months: 4,
      items: [
        ['Isolation des murs par l’intérieur', 9000],
        ['Fenêtres double vitrage', 7500],
        ['Chaudière à condensation', 4500],
      ],
    },
    description:
      'Exemple fictif : trois pièces sur la place, beaux volumes, simple vitrage, chauffage ancien.',
    createdBy: 'demo2',
    channel: 'web',
    statuses: [
      [26, 'to_visit', 'demo2'],
      [21, 'visited', 'demo2'],
    ],
    doneDefaults: [0, 1, 4],
  },
  {
    key: 'bastide-t2',
    title: 'T2 neuf avec balcon, Bastide',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'La Bastide',
    address: '21 allée des Platanes-Inventés, 33100 Bordeaux (adresse fictive)',
    point: [-0.5545, 44.8425],
    precision: 'exact',
    source: 'bienici',
    prices: [[6, 235_000]],
    surface: 45,
    rooms: 2,
    bedrooms: 1,
    floor: 3,
    floorsTotal: 5,
    elevator: true,
    year: 2019,
    dpe: 'A',
    annualCharges: 1500,
    propertyTax: 950,
    targetRent: 820,
    demand: 'strong',
    description:
      'Exemple fictif : résidence récente, balcon plein sud, place de parking en sous-sol.',
    createdBy: 'demo',
    channel: 'mcp',
    statuses: [[5, 'to_visit', 'demo']],
  },
  {
    key: 'cauderan-t3',
    title: 'T3 avec jardinet, Caudéran',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'Caudéran',
    address: '47 rue du Verger-Fictif, 33200 Bordeaux (adresse fictive)',
    point: [-0.6085, 44.8512],
    precision: 'street',
    source: 'pap',
    prices: [[1, 268_000]],
    surface: 68,
    rooms: 3,
    bedrooms: 2,
    floor: 0,
    floorsTotal: 2,
    elevator: false,
    year: 1965,
    dpe: 'C',
    annualCharges: 600,
    propertyTax: 1400,
    targetRent: 980,
    demand: 'medium',
    description:
      'Exemple fictif : rez-de-jardin dans une petite copropriété, jardinet de 30 m².',
    createdBy: 'demo2',
    channel: 'web',
  },
  {
    key: 'nansouty-studio',
    title: 'Studio meublé à rafraîchir, Nansouty',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'Nansouty',
    address:
      '5 rue des Hirondelles-de-Papier, 33800 Bordeaux (adresse fictive)',
    point: [-0.5715, 44.8228],
    precision: 'exact',
    source: 'leboncoin',
    prices: [[40, 98_000]],
    surface: 24,
    rooms: 1,
    bedrooms: 0,
    floor: 4,
    floorsTotal: 4,
    elevator: false,
    year: 1930,
    dpe: 'F',
    annualCharges: 700,
    propertyTax: 450,
    targetRent: 560,
    furniture: 3000,
    renovation: {
      level: 'renovation',
      months: 2,
      items: [
        ['Électricité', 4000],
        ['Salle d’eau', 6000],
      ],
    },
    description:
      'Exemple fictif : studio sous les toits, vendu meublé, salle d’eau à refaire.',
    createdBy: 'demo',
    channel: 'web',
    statuses: [
      [
        36,
        'discarded',
        'demo',
        'DPE F : location bientôt interdite, travaux trop lourds pour la surface',
      ],
    ],
  },
  {
    key: 'talence-forum-t2',
    title: 'T2 à deux pas du tram B, Talence Forum',
    commune: 'Talence',
    inseeCode: '33522',
    district: 'Forum',
    address: '12 avenue des Étudiants-Fictifs, 33400 Talence (adresse fictive)',
    point: [-0.5925, 44.8075],
    precision: 'exact',
    source: 'seloger',
    prices: [[38, 145_000]],
    surface: 44,
    rooms: 2,
    bedrooms: 1,
    floor: 1,
    floorsTotal: 4,
    elevator: true,
    year: 1972,
    dpe: 'C',
    annualCharges: 1300,
    propertyTax: 820,
    targetRent: 760,
    demand: 'strong',
    description:
      'Exemple fictif : deux pièces rénové, cuisine ouverte, à trois minutes à pied du tram.',
    createdBy: 'demo',
    channel: 'web',
    statuses: [
      [35, 'to_visit', 'demo'],
      [30, 'visited', 'demo2'],
      [20, 'offer_made', 'demo'],
      [15, 'offer_accepted', 'demo'],
    ],
    doneDefaults: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    key: 'talence-peixotto-t3',
    title: 'T3 calme près du parc Peixotto',
    commune: 'Talence',
    inseeCode: '33522',
    district: 'Peixotto',
    address: '30 rue des Glycines-Imaginaires, 33400 Talence (adresse fictive)',
    point: [-0.585, 44.802],
    precision: 'street',
    source: 'agence',
    sourceLabel: 'Agence Exemple Immobilier (fictive)',
    prices: [
      [25, 239_000],
      [8, 225_000],
    ],
    surface: 63,
    rooms: 3,
    bedrooms: 2,
    floor: 2,
    floorsTotal: 3,
    elevator: false,
    year: 1958,
    dpe: 'D',
    annualCharges: 1100,
    propertyTax: 1150,
    targetRent: 850,
    demand: 'medium',
    description:
      'Exemple fictif : trois pièces au calme, double exposition, cave et local vélos.',
    createdBy: 'demo2',
    channel: 'web',
    statuses: [
      [22, 'to_visit', 'demo2'],
      [18, 'visited', 'demo2'],
    ],
    doneDefaults: [0, 1],
  },
  {
    key: 'merignac-t2',
    title: 'T2 avec parking, Mérignac centre',
    commune: 'Mérignac',
    inseeCode: '33281',
    district: 'Centre',
    address: '9 rue des Aviateurs-Inventés, 33700 Mérignac (adresse fictive)',
    point: [-0.6455, 44.839],
    precision: 'exact',
    source: 'leboncoin',
    // Lot 16 : le prix baissé, trouvé hier par l'exploration (même lien).
    prices: [
      [4, 158_000],
      [1, 152_000],
    ],
    surface: 47,
    rooms: 2,
    bedrooms: 1,
    floor: 2,
    floorsTotal: 3,
    elevator: true,
    year: 1998,
    dpe: 'C',
    annualCharges: 1400,
    propertyTax: 980,
    targetRent: 760,
    demand: 'medium',
    description:
      'Exemple fictif : deux pièces avec place de parking privative, proche commerces.',
    createdBy: 'demo',
    channel: 'mcp',
    statuses: [[3, 'to_visit', 'demo2']],
  },
  {
    key: 'pessac-t4',
    title: 'T4 familial, Pessac centre',
    commune: 'Pessac',
    inseeCode: '33318',
    district: 'Centre',
    address: '16 chemin des Pins-Fictifs, 33600 Pessac (adresse fictive)',
    point: [-0.6315, 44.8065],
    precision: 'district',
    source: 'pap',
    prices: [
      [33, 265_000],
      [20, 255_000],
    ],
    surface: 82,
    rooms: 4,
    bedrooms: 3,
    floor: 3,
    floorsTotal: 4,
    elevator: true,
    year: 1975,
    dpe: 'E',
    annualCharges: 2200,
    propertyTax: 1500,
    targetRent: 1050,
    demand: 'medium',
    renovation: {
      level: 'refresh',
      months: 1,
      items: [
        ['Peinture', 3500],
        ['Sols', 4200],
      ],
    },
    description:
      'Exemple fictif : quatre pièces avec balcon, copropriété des années 1970, chauffage collectif.',
    createdBy: 'demo2',
    channel: 'web',
    statuses: [
      [30, 'to_visit', 'demo2'],
      [24, 'visited', 'demo'],
      [14, 'offer_made', 'demo'],
      [12, 'offer_refused', 'demo'],
    ],
    doneDefaults: [0, 1, 2],
  },
  {
    key: 'begles-t3',
    title: 'T3 refait à neuf, Bègles Terres-Neuves',
    commune: 'Bègles',
    inseeCode: '33039',
    district: 'Terres Neuves',
    address: '2 rue des Ateliers-Rêvés, 33130 Bègles (adresse fictive)',
    point: [-0.548, 44.8095],
    precision: 'exact',
    source: 'seloger',
    prices: [[1, 175_000]],
    surface: 58,
    rooms: 3,
    bedrooms: 2,
    floor: 1,
    floorsTotal: 3,
    elevator: false,
    year: 2008,
    dpe: 'B',
    annualCharges: 1250,
    propertyTax: 1050,
    targetRent: 900,
    demand: 'strong',
    description:
      'Exemple fictif : trois pièces lumineux, terrasse de 8 m², proche du futur pôle tertiaire.',
    createdBy: 'demo',
    channel: 'web',
  },
  {
    key: 'le-bouscat-t2',
    title: 'T2 de charme, Le Bouscat Ermitage',
    commune: 'Le Bouscat',
    inseeCode: '33069',
    district: 'Ermitage',
    address: '11 rue des Lilas-Fictifs, 33110 Le Bouscat (adresse fictive)',
    point: [-0.6005, 44.8655],
    precision: 'exact',
    source: 'agence',
    sourceLabel: 'Cabinet Exemple & Associés (fictif)',
    prices: [[20, 208_000]],
    surface: 46,
    rooms: 2,
    bedrooms: 1,
    floor: 1,
    floorsTotal: 2,
    elevator: false,
    year: 1932,
    dpe: 'D',
    annualCharges: 500,
    propertyTax: 1000,
    targetRent: 760,
    demand: 'strong',
    description:
      'Exemple fictif : échoppe divisée, parquet d’origine, petite cour partagée.',
    createdBy: 'demo',
    channel: 'web',
    statuses: [
      [17, 'to_visit', 'demo'],
      [12, 'visited', 'demo'],
      [3, 'offer_made', 'demo'],
    ],
    doneDefaults: [0, 1, 2],
  },
  {
    key: 'cenon-t3',
    title: 'T3 avec vue sur la ville, Cenon',
    commune: 'Cenon',
    inseeCode: '33119',
    district: 'Palmer',
    address: '40 avenue des Coteaux-Imaginaires, 33150 Cenon (adresse fictive)',
    point: [-0.5335, 44.8575],
    precision: 'district',
    source: 'bienici',
    prices: [
      [3, 145_000],
      [1, 139_000],
    ],
    surface: 64,
    rooms: 3,
    bedrooms: 2,
    floor: 6,
    floorsTotal: 8,
    elevator: true,
    year: 1968,
    dpe: 'E',
    annualCharges: 2400,
    propertyTax: 1100,
    targetRent: 790,
    demand: 'medium',
    description:
      'Exemple fictif : grand séjour avec vue dégagée, copropriété importante, ascenseur récent.',
    createdBy: 'demo2',
    channel: 'mcp',
    // Lot 15 : le même bien que « cenon-t3-origine », republié moins cher.
    republishedFrom: 'cenon-t3-origine',
    publishedDays: 3,
  },
  {
    key: 'cenon-t3-origine',
    title: 'T3 avec vue sur la ville, Cenon (première annonce)',
    commune: 'Cenon',
    inseeCode: '33119',
    district: 'Palmer',
    address: '40 avenue des Coteaux-Imaginaires, 33150 Cenon (adresse fictive)',
    point: [-0.5335, 44.8575],
    precision: 'district',
    source: 'bienici',
    prices: [
      [58, 152_000],
      [30, 149_000],
    ],
    publishedDays: 60,
    surface: 64,
    rooms: 3,
    bedrooms: 2,
    floor: 6,
    floorsTotal: 8,
    elevator: true,
    year: 1968,
    dpe: 'E',
    annualCharges: 2400,
    propertyTax: 1100,
    targetRent: 790,
    demand: 'medium',
    description:
      'Exemple fictif : la première publication du T3 de Cenon, retirée puis republiée moins cher.',
    createdBy: 'demo2',
    channel: 'web',
    statuses: [[4, 'sold_or_withdrawn', 'demo2']],
  },
  {
    key: 'villenave-t2',
    title: 'T2 en résidence récente, Villenave-d’Ornon',
    commune: 'Villenave-d’Ornon',
    inseeCode: '33550',
    district: 'Centre',
    address:
      '7 allée des Tournesols-Fictifs, 33140 Villenave-d’Ornon (adresse fictive)',
    point: [-0.5655, 44.7805],
    precision: 'exact',
    source: 'leboncoin',
    prices: [[45, 135_000]],
    surface: 43,
    rooms: 2,
    bedrooms: 1,
    floor: 2,
    floorsTotal: 3,
    elevator: true,
    year: 2015,
    dpe: 'B',
    annualCharges: 1100,
    propertyTax: 900,
    targetRent: 700,
    demand: 'medium',
    description:
      'Exemple fictif : deux pièces dans une résidence de 2015, loggia, parking.',
    createdBy: 'demo',
    channel: 'web',
    statuses: [[30, 'sold_or_withdrawn', 'demo2']],
  },
  {
    key: 'lormont-t3',
    title: 'T3 à rénover entièrement, Lormont bas',
    commune: 'Lormont',
    inseeCode: '33249',
    district: 'Bas Lormont',
    address: '19 rue du Port-Imaginaire, 33310 Lormont (adresse fictive)',
    point: [-0.5225, 44.8785],
    precision: 'street',
    source: 'pap',
    prices: [[30, 119_000]],
    surface: 62,
    rooms: 3,
    bedrooms: 2,
    floor: 0,
    floorsTotal: 2,
    elevator: false,
    year: 1900,
    dpe: 'G',
    annualCharges: 300,
    propertyTax: 800,
    targetRent: 700,
    demand: 'weak',
    renovation: {
      level: 'heavy',
      months: 8,
      items: [
        ['Toiture', 12_000],
        ['Électricité', 8000],
        ['Plomberie', 6000],
        ['Cuisine', 5000],
      ],
    },
    description:
      'Exemple fictif : maison de ville divisée, tout à refaire, toiture comprise.',
    createdBy: 'demo2',
    channel: 'web',
    statuses: [[27, 'discarded', 'demo', 'Travaux trop lourds et DPE G']],
  },
]

const OPINIONS: Record<string, Array<[DemoHandle, number, string, number]>> = {
  'chartrons-t2': [
    [
      'demo',
      4,
      'Bien placé ; la baisse de prix laisse de la marge pour négocier.',
      24,
    ],
    ['demo2', 3, 'Un peu sombre côté cour, mais le quartier est idéal.', 24],
  ],
  'saint-michel-t3': [
    [
      'demo',
      3,
      'Gros potentiel, mais l’isolation est à refaire avant de louer.',
      20,
    ],
    ['demo2', 4, 'Le quartier me plaît beaucoup, la place est vivante.', 20],
  ],
  'bastide-t2': [
    ['demo2', 4, 'Neuf, rien à prévoir ; cher au mètre carré.', 4],
  ],
  'talence-forum-t2': [
    ['demo', 5, 'Le meilleur rapport qualité-prix vu jusqu’ici.', 29],
    [
      'demo2',
      5,
      'Parfait pour commencer, le tram est au pied de l’immeuble.',
      29,
    ],
  ],
  'talence-peixotto-t3': [
    ['demo', 4, 'Calme et lumineux.', 17],
    ['demo2', 3, 'Les charges me paraissent élevées pour la taille.', 17],
  ],
  'pessac-t4': [['demo', 2, 'Trop cher pour les travaux à faire.', 23]],
  'le-bouscat-t2': [
    ['demo', 4, 'Coup de cœur pour le parquet.', 11],
    ['demo2', 4, 'Attention au bruit de la rue le matin.', 11],
  ],
  'cenon-t3': [
    ['demo', 3, 'Belle vue ; la grande copropriété est à surveiller.', 1],
  ],
  'lormont-t3': [['demo2', 1, 'Beaucoup trop de travaux pour nous.', 28]],
}

/** Lot 20 : les notes par critère d'un avis (1 à 5) et ses mots facultatifs. */
interface OpinionScoreSpec {
  scores: Record<string, number>
  words?: Record<string, string>
}

/**
 * Lot 20 : les notes par critère, fictives. Saint-Michel : deux désaccords
 * (calme, « on s'y voit ») ; Chartrons : un désaccord (luminosité) ;
 * Talence Forum et Le Bouscat : d'accord partout (« Cuisine », le critère
 * ajouté par l'espace, noté au Bouscat) ; Bastide : seul Sacha a noté, l'avis
 * de Camille est « en attente » (et celui de Sacha masqué pour Camille, à
 * l'aveugle). Les autres annonces gardent leur seule note globale.
 */
const OPINION_SCORES: Record<
  string,
  Partial<Record<DemoHandle, OpinionScoreSpec>>
> = {
  'chartrons-t2': {
    demo: {
      scores: {
        luminosity: 4,
        layout: 4,
        condition: 3,
        quiet: 4,
        outdoor: 3,
        building: 4,
        street: 5,
        feel: 4,
      },
      words: { condition: 'cuisine à refaire' },
    },
    demo2: {
      scores: {
        luminosity: 2,
        layout: 4,
        condition: 3,
        quiet: 4,
        outdoor: 3,
        building: 4,
        street: 5,
        feel: 3,
      },
      words: { luminosity: 'sombre côté cour' },
    },
  },
  'saint-michel-t3': {
    demo: {
      scores: {
        luminosity: 4,
        layout: 4,
        condition: 3,
        quiet: 2,
        outdoor: 3,
        building: 3,
        street: 3,
        feel: 2,
      },
      words: {
        quiet: 'simple vitrage, bruit le samedi',
        condition: 'isolation à refaire',
      },
    },
    demo2: {
      scores: {
        luminosity: 5,
        layout: 4,
        condition: 3,
        quiet: 4,
        outdoor: 3,
        building: 3,
        street: 4,
        feel: 4,
      },
      words: { quiet: 'côté cour, ça va', feel: 'la place est vivante' },
    },
  },
  'bastide-t2': {
    demo2: {
      scores: {
        luminosity: 5,
        layout: 4,
        condition: 5,
        quiet: 4,
        outdoor: 4,
        building: 5,
        street: 3,
        feel: 3,
        custom_cuisine: 5,
      },
      words: { condition: 'neuf, rien à prévoir' },
    },
  },
  'talence-forum-t2': {
    demo: {
      scores: {
        luminosity: 4,
        layout: 5,
        condition: 5,
        quiet: 4,
        outdoor: 3,
        building: 5,
        street: 4,
        feel: 5,
      },
      words: { outdoor: 'vis-à-vis sur la cour' },
    },
    demo2: {
      scores: {
        luminosity: 4,
        layout: 5,
        condition: 5,
        quiet: 4,
        outdoor: 3,
        building: 4,
        street: 4,
        feel: 5,
      },
      words: { street: 'le tram au pied de l’immeuble' },
    },
  },
  'le-bouscat-t2': {
    demo: {
      scores: {
        luminosity: 4,
        layout: 4,
        condition: 4,
        quiet: 3,
        outdoor: 4,
        building: 4,
        street: 3,
        feel: 5,
        custom_cuisine: 3,
      },
      words: { feel: 'coup de cœur pour le parquet' },
    },
    demo2: {
      scores: {
        luminosity: 4,
        layout: 5,
        condition: 4,
        quiet: 2,
        outdoor: 4,
        building: 3,
        street: 3,
        feel: 4,
        custom_cuisine: 3,
      },
      words: {
        quiet: 'bruit de la rue le matin',
        custom_cuisine: 'à rafraîchir',
      },
    },
  },
}

/** Lot 20 : un avis mis à jour après coup (Camille revoit l'état à Saint-Michel). */
const OPINION_UPDATES: Record<
  string,
  Array<{
    handle: DemoHandle
    days: number
    hour: number
    scores: Record<string, number>
  }>
> = {
  'saint-michel-t3': [
    { handle: 'demo', days: 18, hour: 20, scores: { condition: 2 } },
  ],
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const at = clock(now)
  const memberId = (handle: DemoHandle) => demoId(`member:${handle}`)
  const members: DemoMember[] = DEMO_ACCOUNTS.map((account, index) => ({
    id: memberId(account.handle),
    handle: account.handle,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    createdAt: at(46, 9, index),
    whatsNewSince: account.handle === 'demo' ? at(2, 20) : at(5, 21),
  }))
  const since = new Map(members.map(m => [m.handle, m.whatsNewSince]))
  const activity: DemoActivity[] = []
  const log = (
    entry: Omit<DemoActivity, 'id' | 'before' | 'after'> & {
      before?: Record<string, unknown> | null
      after?: Record<string, unknown> | null
    }
  ) => {
    activity.push({
      id: demoId(
        `activity:${activity.length}:${entry.action}:${entry.listingKey ?? '-'}`
      ),
      before: null,
      after: null,
      ...entry,
    })
  }

  // Hypothèses : une première version, puis le taux renégocié.
  const firstAssumptions = AssumptionsSchema.parse({
    ...DEFAULT_ASSUMPTIONS,
    downPayment: 30_000,
    interestRate: 0.037,
    label: 'Hypothèses de départ',
  })
  const currentAssumptions = AssumptionsSchema.parse({
    ...DEFAULT_ASSUMPTIONS,
    downPayment: 35_000,
    interestRate: 0.0345,
    currentRent: 780,
    marginalTaxRate: 0.3,
    horizonYears: 15,
    label: 'Taux renégocié',
  })
  const assumptions = [
    {
      id: demoId('assumptions:1'),
      label: 'Hypothèses de départ',
      effectiveFrom: at(45, 9),
      values: firstAssumptions,
    },
    {
      id: demoId('assumptions:2'),
      label: 'Taux renégocié',
      effectiveFrom: at(10, 18),
      values: currentAssumptions,
    },
  ]
  log({
    at: at(10, 18),
    actor: 'demo',
    channel: 'web',
    action: 'assumptions.updated',
    listingKey: null,
    before: {
      interestRate: firstAssumptions.interestRate,
      downPayment: firstAssumptions.downPayment,
      currentRent: null,
    },
    after: {
      interestRate: currentAssumptions.interestRate,
      downPayment: currentAssumptions.downPayment,
      currentRent: 780,
    },
  })

  // Lot 20 : les critères des avis. Le propriétaire ajoute « Cuisine » il y a
  // quinze jours : les huit critères par défaut s'écrivent à ce moment-là
  // (premier réglage de l'espace), le critère ajouté en dernier.
  const settingsAt = at(15, 20)
  const defaults = defaultOpinionCriteria()
  const custom = OpinionCriterionSchema.parse({
    key: customCriterionKey(
      'Cuisine',
      defaults.map(c => c.key)
    ),
    label: 'Cuisine',
    hint: 'équipée, refaite, à revoir',
    position: defaults.length,
    hidden: false,
    origin: 'custom',
  })
  const opinionCriteria: DemoOpinionCriterion[] = [...defaults, custom].map(
    c => ({
      ...OpinionCriterionSchema.parse(c),
      id: demoId(`opinion-criterion:${c.key}`),
      createdAt: settingsAt,
    })
  )
  log({
    at: settingsAt,
    actor: 'demo',
    channel: 'web',
    action: 'opinion_settings.criterion_added',
    listingKey: null,
    after: { key: custom.key, label: custom.label, hint: custom.hint },
  })

  const listings = SPECS.map(spec =>
    buildListing(spec, at, since, log, opinionCriteria)
  )
  // Lot 17 : questions aux agences (contacts, demandes, une réponse).
  const exchanges = buildAgencyExchanges(listings, members, at, log)

  // Critères : un polygone dessiné et deux points avec rayon (lot 14 : l’un avec
  // sa marge de tolérance réglée).
  const criteria: DemoCriteria[] = [
    {
      id: demoId('criteria:centre'),
      key: 'centre',
      by: 'demo',
      createdAt: at(32, 21),
      input: SearchCriteriaInputSchema.parse({
        name: 'Bordeaux centre, Chartrons et Bastide',
        filters: { priceMax: 240_000, dpeMax: 'D' },
        perimeter: {
          type: 'polygon',
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [-0.585, 44.826],
                [-0.548, 44.826],
                [-0.545, 44.845],
                [-0.56, 44.862],
                [-0.585, 44.862],
                [-0.585, 44.826],
              ],
            ],
          },
        },
      }),
    },
    {
      id: demoId('criteria:tram-b'),
      key: 'tram-b',
      by: 'demo2',
      createdAt: at(22, 20),
      input: SearchCriteriaInputSchema.parse({
        name: 'À 1,5 km du tram B à Talence',
        filters: { roomsMin: 2, priceMax: 230_000 },
        perimeter: {
          type: 'point_radius',
          longitude: -0.5906,
          latitude: 44.8083,
          radiusMeters: 1500,
        },
      }),
    },
    {
      // Lot 14 : une marge réglée (400 m, prix +8 %) ; l'annonce de Cenon,
      // placée au quartier sans adresse, y est « à confirmer ».
      id: demoId('criteria:rive-droite'),
      key: 'rive-droite',
      by: 'demo',
      createdAt: at(12, 19),
      input: SearchCriteriaInputSchema.parse({
        name: 'Rive droite près du pont de pierre, T3',
        filters: { roomsMin: 3, priceMax: 180_000 },
        perimeter: {
          type: 'point_radius',
          longitude: -0.545,
          latitude: 44.852,
          radiusMeters: 900,
        },
        tolerance: { perimeterMeters: 400, priceMaxShare: 0.08 },
      }),
    },
  ]
  for (const c of criteria) {
    log({
      at: c.createdAt,
      actor: c.by,
      channel: 'web',
      action: 'criteria.created',
      listingKey: null,
      after: {
        id: c.id,
        name: c.input.name,
        active: c.input.active,
        filters: c.input.filters,
        perimeterType: c.input.perimeter?.type ?? null,
      },
    })
  }

  const byKey = new Map(listings.map(l => [l.key, l]))
  const scenarios: DemoScenario[] = [
    {
      id: demoId('scenario:meuble'),
      by: 'demo2',
      createdAt: at(19, 21),
      input: ScenarioInputSchema.parse({
        name: 'Location meublée après travaux',
        listingId: byKey.get('saint-michel-t3')?.id ?? null,
        overrides: {
          leaseType: 'furnished',
          targetRent: 950,
          furnitureValue: 5000,
        },
        notes:
          'Exemple fictif : meublé de longue durée une fois l’isolation faite.',
      }),
    },
    {
      id: demoId('scenario:taux'),
      by: 'demo',
      createdAt: at(9, 21),
      input: ScenarioInputSchema.parse({
        name: 'Si le taux descend à 3,2 %',
        listingId: null,
        overrides: { assumptions: { interestRate: 0.032 } },
        notes: null,
      }),
    },
  ]
  for (const s of scenarios) {
    const listing = listings.find(l => l.id === s.input.listingId)
    log({
      at: s.createdAt,
      actor: s.by,
      channel: 'web',
      action: 'scenario.created',
      listingKey: listing?.key ?? null,
      after: { name: s.input.name },
    })
  }

  // Une alerte e-mail reçue, à valider (brouillon).
  const draftUrl = 'https://exemple.invalid/alerte/annonce-42'
  const drafts: DemoDraft[] = [
    {
      id: demoId('draft:1'),
      receivedAt: at(0, 7, 30),
      emailSubject: 'Nouvelles annonces pour votre recherche (exemple fictif)',
      emailFrom: 'alertes@exemple.invalid',
      url: draftUrl,
      input: ListingInputSchema.parse({
        title: 'T2 proche de la gare, 40 m² (alerte fictive)',
        source: 'leboncoin',
        url: draftUrl,
        price: 179_000,
        surface: 40,
        rooms: 2,
        location: { commune: 'Bordeaux' },
        fieldSources: {
          price: { source: 'listing', confidence: 0.6 },
          surface: { source: 'listing', confidence: 0.6 },
          rooms: { source: 'listing', confidence: 0.6 },
        },
      }),
    },
  ]
  log({
    at: at(0, 7, 31),
    actor: null,
    channel: 'system',
    action: 'draft.received',
    listingKey: null,
    after: { created: 1, subject: drafts[0]?.emailSubject },
  })

  // Lot 16 : une ancienne exploration et celle d'hier, avec leurs brouillons.
  const listingRef = (key: string) => {
    const l = byKey.get(key)
    if (!l) throw new Error(`Annonce de démo inconnue : ${key}`)
    return {
      id: l.id,
      title: l.input.title,
      status: l.input.status,
      price: l.input.price,
      surface: l.input.surface,
      commune: l.input.location.commune,
      url: l.input.url,
      sellerType: l.input.sellerType,
      sellerName: l.input.sellerName,
      sellerReference: l.input.sellerReference,
      links: l.links,
      checks: l.checks,
    }
  }
  // Lot 18 : les doublons d'une annonce lue, comparée à tous les liens et
  // au vendeur des annonces du jeu (règles de `domain`).
  const duplicateRows: DuplicateRow[] = listings.map(l => ({
    id: l.id,
    title: l.input.title,
    status: l.input.status,
    price: l.input.price,
    surface: l.input.surface,
    commune: l.input.location.commune,
    url: l.input.url,
    addressRaw: l.input.location.addressRaw,
    addressNormalized: null,
    // Les liens connus avant l'exploration (pas ceux qu'elle a rattachés).
    links: l.links
      .filter(link => link.draftId === null)
      .map(link => link.normalizedUrl),
    sellerType: l.input.sellerType,
    sellerName: l.input.sellerName,
    sellerReference: l.input.sellerReference,
    sellerReferenceKey: l.sellerReferenceKey,
  }))
  const criteriaRef = (key: string) => {
    const c = criteria.find(x => x.key === key)
    if (!c) throw new Error(`Critère de démo inconnu : ${key}`)
    return { id: c.id, name: c.input.name }
  }
  const { explorations, drafts: explorationDrafts } = buildDemoExplorations({
    at,
    listing: listingRef,
    duplicates: probe => matchDuplicates(probe, duplicateRows),
    criteria: { centre: criteriaRef('centre'), tramB: criteriaRef('tram-b') },
    log,
  })

  activity.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  return {
    workspace: {
      id: DEMO_WORKSPACE_ID,
      name: DEMO_WORKSPACE_NAME,
      createdAt: at(46, 9),
    },
    members,
    assumptions,
    listings,
    criteria,
    scenarios,
    drafts,
    activity,
    explorations,
    explorationDrafts,
    contacts: exchanges.contacts,
    agencyRequests: exchanges.agencyRequests,
    opinionCriteria,
    opinionsBlind: true,
  }
}

function buildListing(
  spec: ListingSpec,
  at: ReturnType<typeof clock>,
  since: Map<DemoHandle, string>,
  log: (
    entry: Omit<DemoActivity, 'id' | 'before' | 'after'> & {
      before?: Record<string, unknown> | null
      after?: Record<string, unknown> | null
    }
  ) => void,
  opinionCriteria: readonly DemoOpinionCriterion[]
): DemoListing {
  const id = demoId(`listing:${spec.key}`)
  const createdDays = spec.prices[0]?.[0] ?? 0
  const createdAt = at(createdDays, 9, 15)
  const price = spec.prices[spec.prices.length - 1]?.[1] ?? 0
  const other: DemoHandle = spec.createdBy === 'demo' ? 'demo2' : 'demo'
  const point: Point = { type: 'Point', coordinates: spec.point }
  const provenance = spec.channel === 'mcp' ? 'ai' : 'user'
  const fieldSources = Object.fromEntries(
    [
      'price',
      'surface',
      'rooms',
      'dpeClass',
      'annualCharges',
      'propertyTax',
      'addressRaw',
      'commune',
    ].map(field => [
      field,
      provenance === 'ai'
        ? {
            source: 'ai' as const,
            confidence: field === 'propertyTax' ? 0.55 : 0.85,
            evidence: 'Lu sur la page de l’annonce (exemple fictif)',
          }
        : { source: 'user' as const },
    ])
  )
  // Lot 18 : le vendeur saisi ou lu à la création (inconnu par défaut).
  const seller = SELLERS[spec.key]
  if (seller) {
    const keys =
      seller.type === 'private'
        ? ['sellerType']
        : ['sellerType', 'sellerName', 'sellerReference']
    for (const key of keys) {
      fieldSources[key] =
        provenance === 'ai'
          ? {
              source: 'ai' as const,
              confidence: 0.8,
              evidence: 'Lu sur la page de l’annonce (exemple fictif)',
            }
          : { source: 'user' as const }
    }
  }
  const finalStatus = spec.statuses?.[spec.statuses.length - 1]
  const input = ListingInputSchema.parse({
    source: spec.source,
    sourceLabel: spec.sourceLabel ?? null,
    url: `https://exemple.invalid/annonces/${spec.key}`,
    externalId: `demo-${spec.key}`,
    title: spec.title,
    publishedAt:
      spec.publishedDays !== undefined ? at(spec.publishedDays, 8) : null,
    description: spec.description,
    notes: 'Annonce de démonstration : toutes les données sont fictives.',
    price,
    feesPayer: spec.source === 'agence' ? 'seller' : null,
    surface: spec.surface,
    rooms: spec.rooms,
    bedrooms: spec.bedrooms,
    floor: spec.floor,
    floorsTotal: spec.floorsTotal,
    elevator: spec.elevator,
    constructionYear: spec.year,
    dpeClass: spec.dpe,
    annualCharges: spec.annualCharges,
    propertyTax: spec.propertyTax,
    furnitureValue: spec.furniture ?? null,
    location: {
      addressRaw: spec.address,
      commune: spec.commune,
      inseeCode: spec.inseeCode,
      district: spec.district,
      point,
      precision: spec.precision,
    },
    status: finalStatus?.[1] ?? 'to_study',
    discardReason:
      finalStatus?.[1] === 'discarded' ? (finalStatus[3] ?? null) : null,
    renovation: spec.renovation
      ? {
          active: true,
          level: spec.renovation.level,
          durationMonths: spec.renovation.months,
          items: spec.renovation.items.map(([label, amount]) => ({
            label,
            amount,
          })),
          notes: 'Estimation fictive, à remplacer par des devis.',
        }
      : null,
    rentalPlan: {
      targetRent: spec.targetRent,
      demand: spec.demand ?? null,
    },
    fieldSources,
    sellerType: seller?.type ?? 'unknown',
    sellerName: seller?.name ?? null,
    sellerReference: seller?.reference ?? null,
  })

  log({
    at: createdAt,
    actor: spec.createdBy,
    channel: spec.channel,
    action: 'listing.created',
    listingKey: spec.key,
    after: {
      title: spec.title,
      price: spec.prices[0]?.[1],
      status: 'to_study',
      provenance,
    },
  })

  // Prix successifs.
  const prices = spec.prices.map(([days, value], index) => ({
    at: index === 0 ? createdAt : at(days, 11),
    price: value,
  }))
  prices.forEach((p, index) => {
    if (index === 0) return
    // Lot 15 : un prix trouvé par une vérification est journalisé par elle.
    if (foundByCheck(spec, index)) return
    log({
      at: p.at,
      actor: other,
      channel: 'web',
      action: 'listing.price_changed',
      listingKey: spec.key,
      before: { price: prices[index - 1]?.price },
      after: { price: p.price },
    })
  })

  // Statuts successifs.
  let previous: ListingStatus = 'to_study'
  const statuses = (spec.statuses ?? []).map(([days, status, by, reason]) => {
    const entryAt = at(days, 19)
    log({
      at: entryAt,
      actor: by,
      channel: 'web',
      action: 'listing.status_changed',
      listingKey: spec.key,
      before: { status: previous },
      after: { status, ...(reason ? { reason } : {}) },
    })
    previous = status
    return { at: entryAt, by, status, ...(reason ? { reason } : {}) }
  })

  // Avis : note globale et phrase, et (lot 20) notes par critère pour
  // quelques annonces. Le journal garde ce que l'API garde
  // (`opinionJournalPayload` de `domain`) : notes, mots, libellés du moment,
  // « après la visite » (visite faite avec le membre, avant l'avis),
  // désaccords avec l'avis déjà noté.
  const opinions = buildOpinions(spec, at, log, opinionCriteria)

  // Tâches : celles de l'API à la création, puis quelques tâches à la main.
  const done = new Set(spec.doneDefaults ?? [])
  const tasks: DemoTask[] = DEFAULT_TASKS.map((label, position) => {
    const parsed = TaskInputSchema.parse({ label, origin: 'default' })
    return {
      id: demoId(`task:${spec.key}:default:${position}`),
      label: parsed.label,
      origin: 'default' as const,
      done: done.has(position),
      doneAt: done.has(position)
        ? at(Math.max(0, createdDays - 2 - position), 18)
        : null,
      assignee: null,
      position,
      createdAt,
      createdBy: spec.createdBy,
      field: taskFieldForLabel(label),
    }
  })
  for (const task of tasks.filter(t => t.done).slice(0, 2)) {
    log({
      at: task.doneAt as string,
      actor: other,
      channel: 'web',
      action: 'task.completed',
      listingKey: spec.key,
      before: { label: task.label, done: false },
      after: { done: true },
    })
  }
  const memberIdOf = (handle: DemoHandle) => demoId(`member:${handle}`)
  const manual = MANUAL_TASKS[spec.key] ?? []
  manual.forEach(([label, assignee, days, isDone], index) => {
    const parsed = TaskInputSchema.parse({
      label,
      assigneeId: assignee ? memberIdOf(assignee) : null,
      origin: 'manual',
    })
    const taskAt = at(days, 20)
    const by: DemoHandle = assignee === 'demo' ? 'demo2' : 'demo'
    tasks.push({
      id: demoId(`task:${spec.key}:manual:${index}`),
      label: parsed.label,
      origin: 'manual',
      done: isDone,
      doneAt: isDone ? at(Math.max(0, days - 2), 18) : null,
      assignee,
      position: DEFAULT_TASKS.length + index,
      createdAt: taskAt,
      createdBy: by,
      field: taskFieldForLabel(label),
    })
    log({
      at: taskAt,
      actor: by,
      channel: 'web',
      action: 'task.created',
      listingKey: spec.key,
      after: { label: parsed.label, assigneeId: parsed.assigneeId },
    })
  })

  // Offres.
  const offers: DemoOffer[] = (OFFERS[spec.key] ?? []).map((o, index) => {
    const parsed = OfferInputSchema.parse({
      amount: o.amount,
      channel: o.channel,
      response: 'pending',
      notes: o.notes ?? null,
    })
    const madeAt = at(o.madeDaysAgo, 18)
    log({
      at: madeAt,
      actor: 'demo',
      channel: 'web',
      action: 'offer.created',
      listingKey: spec.key,
      after: {
        amount: parsed.amount,
        channel: parsed.channel,
        response: 'pending',
      },
    })
    const respondedAt =
      o.respondedDaysAgo === undefined ? null : at(o.respondedDaysAgo, 12)
    if (respondedAt && o.response !== 'pending') {
      log({
        at: respondedAt,
        actor: 'demo2',
        channel: 'web',
        action: 'offer.updated',
        listingKey: spec.key,
        before: { response: 'pending', counterAmount: null },
        after: { response: o.response, counterAmount: o.counterAmount ?? null },
      })
    }
    return {
      id: demoId(`offer:${spec.key}:${index}`),
      madeAt,
      amount: parsed.amount,
      channel: parsed.channel,
      response: o.response,
      counterAmount: o.counterAmount ?? null,
      respondedAt,
      notes: parsed.notes,
      by: 'demo' as const,
    }
  })

  // Visites (sans photo : les photos se téléversent depuis l'application).
  const visits: DemoVisit[] = (VISITS[spec.key] ?? []).map((v, index) => {
    const visitedAt = at(v.daysAgo, v.hour ?? 18, v.minute ?? 0)
    const parsed = VisitInputSchema.parse({
      visitedAt,
      status: v.status,
      participantIds: v.participants.map(memberIdOf),
      report: v.report ?? null,
      pros: v.pros ?? null,
      cons: v.cons ?? null,
      rating: v.rating ?? 0,
      createPrepTask: v.prepTask ?? false,
    })
    // Une visite planifiée l'a été il y a deux jours ; un compte rendu s'écrit après la visite.
    const createdVisitAt =
      v.status === 'planned' ? at(2, 9) : plusMinutes(visitedAt, 90)
    let prepTaskId: string | null = null
    if (parsed.createPrepTask) {
      prepTaskId = demoId(`task:${spec.key}:visit:${index}`)
      tasks.push({
        id: prepTaskId,
        label: 'Préparer la visite : documents à demander, points à vérifier',
        origin: 'visit',
        done: false,
        doneAt: null,
        assignee: v.by,
        position: tasks.length,
        createdAt: createdVisitAt,
        createdBy: v.by,
      })
    }
    log({
      at: createdVisitAt,
      actor: v.by,
      channel: 'web',
      action: 'visit.created',
      listingKey: spec.key,
      after: {
        visitedAt: parsed.visitedAt,
        status: parsed.status,
        participantIds: parsed.participantIds,
        rating: parsed.rating,
        report: parsed.report,
      },
    })
    return {
      id: demoId(`visit:${spec.key}:${index}`),
      visitedAt: parsed.visitedAt,
      status: parsed.status,
      participants: v.participants,
      report: parsed.report ?? null,
      pros: parsed.pros ?? null,
      cons: parsed.cons ?? null,
      rating: parsed.rating,
      by: v.by,
      createdAt: createdVisitAt,
      prepTaskId,
    }
  })

  // Comparables de loyer.
  const rentComparables = (COMPARABLES[spec.key] ?? []).map(
    ([rent, surface, furnished, days], index) => {
      const parsed = RentComparableInputSchema.parse({
        rent,
        surface,
        furnished,
        rooms: surface < 30 ? 1 : surface < 50 ? 2 : 3,
        observedAt: at(days, 0).slice(0, 10),
        source: 'leboncoin',
        url: `https://exemple.invalid/location/${spec.key}-${index}`,
        address: `${spec.district}, ${spec.commune} (exemple fictif)`,
        note: null,
      })
      const comparableAt = at(days, 22)
      log({
        at: comparableAt,
        actor: 'demo2',
        channel: 'web',
        action: 'rent_comparable.created',
        listingKey: spec.key,
        after: { rent: parsed.rent, surface: parsed.surface },
      })
      return {
        id: demoId(`comparable:${spec.key}:${index}`),
        input: parsed,
        by: 'demo2' as const,
        at: comparableAt,
      }
    }
  )

  // « Vu par » : l'auteur à la saisie (sauf par Claude, qu'il n'a pas vue à
  // l'écran), l'autre membre s'il l'a ouverte avant sa dernière visite.
  const views: DemoListing['views'] = []
  if (spec.channel === 'web')
    views.push({ handle: spec.createdBy, seenAt: plusMinutes(createdAt, 1) })
  else if (createdDays >= 5)
    views.push({ handle: spec.createdBy, seenAt: at(createdDays - 1, 20) })
  const otherSince = since.get(other) ?? createdAt
  if (createdDays >= 7 && createdAt < otherSince)
    views.push({ handle: other, seenAt: at(createdDays - 1, 21) })

  // Lots 15 et 18 : liens, vérifications et liens ajoutés (règles de
  // `domain`, données fictives).
  const timeline = buildLinksAndChecks(spec, input, prices, statuses, at, log)
  const finalInput = ListingInputSchema.parse({
    ...input,
    ...timeline.seller,
    fieldSources: timeline.fieldSources,
  })

  const updatedAt =
    [
      createdAt,
      ...prices.map(p => p.at),
      ...statuses.map(s => s.at),
      ...timeline.touchedAt,
    ]
      .sort()
      .at(-1) ?? createdAt
  return {
    key: spec.key,
    id,
    input: finalInput,
    createdAt,
    updatedAt,
    createdBy: spec.createdBy,
    channel: spec.channel,
    prices,
    statuses,
    opinions,
    tasks,
    offers,
    visits,
    rentComparables,
    views,
    checks: timeline.checks,
    lastCheckedAt: timeline.lastCheckedAt,
    lastSeenOnlineAt: timeline.lastSeenOnlineAt,
    republishedFromId: spec.republishedFrom
      ? demoId(`listing:${spec.republishedFrom}`)
      : null,
    links: timeline.links,
    sellerReferenceKey: normalizeSeller(timeline.seller).sellerReferenceKey,
  }
}

/**
 * Lot 15 : les vérifications fictives d'une annonce. Chacune compare ce qui
 * est « lu » sur la page à l'état de la fiche à ce moment-là, par `domain`
 * (écarts, résultat, résumé), et va au journal (`listing.checked`). Le
 * changement de prix qu'une vérification trouve n'est pas journalisé une
 * deuxième fois.
 */
interface DemoCheckSpec {
  days: number
  hour?: number
  by: DemoHandle
  channel: 'web' | 'mcp'
  observed: ListingObserved
  outcome?: ListingCheckOutcome
  evidence?: string
  linkedKey?: string
  /** Lot 18 : le lien vérifié (clé de `LINKS`) ; le lien d'origine sinon. */
  link?: string
}

const CHECKS: Record<string, DemoCheckSpec[]> = {
  'talence-peixotto-t3': [
    {
      days: 15,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: true, price: 239_000, annualCharges: 1100 },
      evidence: 'Prix : 239 000 € — charges : 92 €/mois (exemple fictif)',
    },
    {
      days: 8,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: true, price: 225_000, annualCharges: 1100 },
      evidence:
        'Prix en baisse : 225 000 € (au lieu de 239 000 €) — exemple fictif',
    },
    {
      days: 3,
      hour: 18,
      by: 'demo',
      channel: 'web',
      observed: { online: true },
      outcome: 'unchanged',
    },
  ],
  'talence-forum-t2': [
    {
      days: 2,
      by: 'demo',
      channel: 'mcp',
      observed: {},
      outcome: 'inaccessible',
    },
  ],
  // Lot 16 : deux annonces suivies revues hier par l'exploration (même lien).
  'merignac-t2': [
    {
      days: 1,
      by: 'demo',
      channel: 'mcp',
      observed: { online: true, price: 152_000, surface: 47, rooms: 2 },
      evidence:
        'Vue sur Leboncoin pendant une exploration : Prix : 152 000 €, 47 m², 2 pièces (exemple fictif)',
    },
  ],
  'begles-t3': [
    {
      days: 1,
      by: 'demo',
      channel: 'mcp',
      observed: { online: true, price: 175_000, surface: 58, rooms: 3 },
      evidence:
        'Vue sur SeLoger pendant une exploration : Prix : 175 000 €, 58 m², 3 pièces (exemple fictif)',
    },
  ],
  // Lot 18 : un lien parmi trois plus en ligne (les autres le sont encore).
  'chartrons-t2': [
    {
      days: 5,
      hour: 9,
      by: 'demo2',
      channel: 'mcp',
      link: 'bienici',
      observed: { online: false },
      evidence: 'Cette annonce n’est plus disponible. (exemple fictif)',
    },
  ],
  // La chronologie complète : inchangée, prix, plus en ligne, republiée.
  'cenon-t3-origine': [
    {
      days: 45,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: true, price: 152_000, annualCharges: 2400 },
      evidence: 'Prix : 152 000 € — charges : 200 €/mois (exemple fictif)',
    },
    {
      days: 30,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: true, price: 149_000 },
      evidence:
        'Prix en baisse : 149 000 € (au lieu de 152 000 €) — exemple fictif',
    },
    {
      days: 4,
      hour: 9,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: false },
      evidence: 'Cette annonce n’est plus disponible. (exemple fictif)',
    },
    {
      days: 2,
      by: 'demo2',
      channel: 'mcp',
      observed: { online: false },
      linkedKey: 'cenon-t3',
      evidence:
        'Même adresse, même surface (64 m²), mêmes photos : republiée à 145 000 € (exemple fictif)',
    },
  ],
}

/** Lot 18 : le vendeur fictif de quelques annonces ; les autres restent « inconnu ». */
const SELLERS: Record<
  string,
  { type: SellerType; name?: string; reference?: string }
> = {
  'chartrons-t2': {
    type: 'agency',
    name: '[Exemple] Immobilier des Chartrons',
    reference: 'EX-2041',
  },
  'bastide-t2': {
    type: 'agency',
    name: 'Agence [Exemple]',
    reference: 'EX-1987',
  },
  'merignac-t2': {
    type: 'mandatary',
    name: '[Exemple] Réseau des conseillers',
    reference: 'EX-3310',
  },
  'cauderan-t3': { type: 'private' },
}

/**
 * Lot 18 : les autres liens d'une annonce, ajoutés après son lien d'origine,
 * avec ce qui a été lu sur leur page (fictif : identifiants impossibles
 * `0000000…`, chemins « exemple »). Chaque ajout est une vérification
 * « Lien ajouté » (écarts, prix de la fiche et vendeur par `domain`) et va
 * au journal (`listing_link.added`).
 */
interface LinkSpec {
  key: string
  portal: ListingPortal
  url: string
  externalId?: string
  days: number
  hour?: number
  by: DemoHandle
  channel: 'web' | 'mcp'
  origin: Exclude<ListingLinkOrigin, 'original' | 'email'>
  observed: ListingObserved
  evidence?: string
  /** Rattaché d'office par l'exploration d'hier : la clé de son brouillon reconnu. */
  draftKey?: string
}

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/'

const LINKS: Record<string, LinkSpec[]> = {
  // Trois portails : SeLoger d'origine, Bien'ici ajouté par Sacha (depuis
  // plus en ligne), Leboncoin trouvé par Claude 5 000 € plus cher.
  'chartrons-t2': [
    {
      key: 'bienici',
      portal: 'bienici',
      url: 'https://www.bienici.com/annonce/vente/bordeaux/appartement/exemple-121',
      days: 10,
      hour: 20,
      by: 'demo2',
      channel: 'web',
      origin: 'manual',
      observed: { online: true, price: 172_000 },
    },
    {
      key: 'leboncoin',
      portal: 'leboncoin',
      url: `${LBC}0000000121`,
      externalId: '0000000121',
      days: 3,
      hour: 10,
      by: 'demo',
      channel: 'mcp',
      origin: 'claude',
      observed: {
        online: true,
        price: 177_000,
        sellerType: 'agency',
        sellerName: '[Exemple] Immobilier des Chartrons',
        reference: 'Réf. EX-2041',
      },
      evidence:
        'Prix : 177 000 € — Réf. EX-2041 — [Exemple] Immobilier des Chartrons (exemple fictif)',
    },
  ],
  // Un particulier sur PAP et Leboncoin : le lien partagé depuis le téléphone.
  'cauderan-t3': [
    {
      key: 'leboncoin',
      portal: 'leboncoin',
      url: `${LBC}0000000122`,
      externalId: '0000000122',
      days: 1,
      hour: 18,
      by: 'demo',
      channel: 'web',
      origin: 'share',
      observed: { online: true, price: 268_000 },
    },
  ],
  // Le mandataire : même réseau, même référence sur Bien'ici, rattaché
  // d'office par l'exploration d'hier (« Ce n'est pas la même » le détache).
  'merignac-t2': [
    {
      key: 'bienici',
      portal: 'bienici',
      url: 'https://www.bienici.com/annonce/vente/merignac/appartement/exemple-112',
      days: 1,
      hour: 11,
      by: 'demo',
      channel: 'mcp',
      origin: 'exploration',
      draftKey: 'attached',
      observed: {
        online: true,
        price: 152_000,
        surface: 47,
        rooms: 2,
        sellerType: 'mandatary',
        sellerName: '[Exemple] Réseau des conseillers',
        reference: 'EX-3310',
      },
      evidence:
        'Vue sur Bien’ici pendant une exploration : 152 000 €, 47 m², 2 pièces — mandat EX-3310, [Exemple] Réseau des conseillers (exemple fictif)',
    },
  ],
}

/** Le prix `index` de l'annonce est-il trouvé par une de ses vérifications (même jour, même prix) ? */
/** L'identifiant d'un membre de démo. */
const memberIdOfHandle = (handle: DemoHandle): string =>
  demoId(`member:${handle}`)

/** Les visites d'une annonce telles que `opinionAfterVisit` les lit. */
function visitRefs(
  spec: ListingSpec,
  at: ReturnType<typeof clock>
): OpinionVisitLike[] {
  return (VISITS[spec.key] ?? []).map((v, index) => ({
    id: demoId(`visit:${spec.key}:${index}`),
    visitedAt: at(v.daysAgo, v.hour ?? 18, v.minute ?? 0),
    status: v.status,
    participantIds: v.participants.map(memberIdOfHandle),
  }))
}

/**
 * Lot 20 : les avis d'une annonce, dans l'ordre où ils ont été donnés (le
 * second une demi-heure après le premier), puis les mises à jour. Les notes
 * passent par `OpinionScoresInputSchema` ; un critère n'est noté qu'une fois
 * qu'il existe (« Cuisine » est ajouté il y a quinze jours).
 */
function buildOpinions(
  spec: ListingSpec,
  at: ReturnType<typeof clock>,
  log: (
    entry: Omit<DemoActivity, 'id' | 'before' | 'after'> & {
      before?: Record<string, unknown> | null
      after?: Record<string, unknown> | null
    }
  ) => void,
  opinionCriteria: readonly DemoOpinionCriterion[]
): DemoOpinion[] {
  const visits = visitRefs(spec, at)
  const criteriaAt = (iso: string) =>
    opinionCriteria.filter(c => c.origin === 'default' || c.createdAt <= iso)
  const opinionLike = (o: DemoOpinion): OpinionLike => ({
    memberId: memberIdOfHandle(o.handle),
    rating: o.rating,
    text: o.text,
    scores: o.scores,
  })
  const scoresOf = (
    entry: OpinionScoreSpec | undefined,
    iso: string
  ): DemoOpinionScore[] => {
    if (!entry) return []
    const known = new Set(criteriaAt(iso).map(c => c.key))
    const parsed = OpinionScoresInputSchema.parse(
      Object.fromEntries(
        Object.entries(entry.scores).map(([key, score]) => [
          key,
          { score, word: entry.words?.[key] ?? null },
        ])
      )
    )
    return Object.entries(parsed).map(([key, value]) => {
      if (!known.has(key)) {
        throw new Error(`Critère d’avis inconnu à cette date : ${key}`)
      }
      return {
        key,
        score: value?.score ?? null,
        word: value?.word ?? null,
        createdAt: iso,
        updatedAt: iso,
      }
    })
  }

  const written: DemoOpinion[] = []
  ;(OPINIONS[spec.key] ?? []).forEach(([handle, rating, text, days], i) => {
    const parsed = OpinionInputSchema.parse({ rating, text })
    const opinionAt = at(days, 21, i * 30)
    const scores = scoresOf(OPINION_SCORES[spec.key]?.[handle], opinionAt)
    const opinion: DemoOpinion = {
      handle,
      rating: parsed.rating,
      text: parsed.text,
      at: opinionAt,
      updatedAt: opinionAt,
      ratedAt:
        parsed.rating > 0 || scores.some(s => s.score !== null)
          ? opinionAt
          : null,
      scores,
    }
    const criteria = criteriaAt(opinionAt)
    const payload = opinionJournalPayload({
      before: null,
      opinion: opinionLike(opinion),
      criteria,
      visibleKeys: visibleCriterionKeys(criteria),
      afterVisit:
        opinionAfterVisit(visits, memberIdOfHandle(handle), opinionAt) !== null,
      seenBefore: [],
      others: written.map(opinionLike),
      blind: true,
    })
    log({
      at: opinionAt,
      actor: handle,
      channel: 'web',
      action: 'opinion.created',
      listingKey: spec.key,
      after: { ...payload.after },
    })
    written.push(opinion)
  })

  for (const update of OPINION_UPDATES[spec.key] ?? []) {
    const opinion = written.find(o => o.handle === update.handle)
    if (!opinion) throw new Error(`Avis de démo absent : ${spec.key}`)
    const updatedAt = at(update.days, update.hour)
    const criteria = criteriaAt(updatedAt)
    const visibleKeys = visibleCriterionKeys(criteria)
    const before = opinionSnapshot(opinionLike(opinion), visibleKeys)
    for (const [key, score] of Object.entries(update.scores)) {
      const current = opinion.scores.find(s => s.key === key)
      if (!current) throw new Error(`Note de démo absente : ${key}`)
      current.score = score
      current.updatedAt = updatedAt
    }
    opinion.updatedAt = updatedAt
    const payload = opinionJournalPayload({
      before,
      opinion: opinionLike(opinion),
      criteria,
      visibleKeys,
      afterVisit:
        opinionAfterVisit(
          visits,
          memberIdOfHandle(update.handle),
          updatedAt
        ) !== null,
      seenBefore: [],
      others: written.filter(o => o !== opinion).map(opinionLike),
      blind: true,
    })
    log({
      at: updatedAt,
      actor: update.handle,
      channel: 'web',
      action: 'opinion.updated',
      listingKey: spec.key,
      before: { ...payload.before },
      after: { ...payload.after },
    })
  }
  return written
}

function foundByCheck(spec: ListingSpec, index: number): boolean {
  const entry = spec.prices[index]
  if (!entry || index === 0) return false
  return (CHECKS[spec.key] ?? []).some(
    c => c.observed.price === entry[1] && c.days === entry[0]
  )
}

interface LinkTimeline {
  links: DemoLink[]
  checks: DemoCheck[]
  lastCheckedAt: string | null
  lastSeenOnlineAt: string | null
  seller: SellerFacts
  fieldSources: FieldProvenanceMap
  /** Les instants où une écriture a changé la fiche (`updatedAt`). */
  touchedAt: string[]
}

const linkStateOf = (l: DemoLink): LinkState => ({
  id: l.id,
  portal: l.portal,
  url: l.url,
  normalizedUrl: l.normalizedUrl,
  externalId: l.externalId,
  price: l.price,
  priceAt: l.priceAt,
  online: l.online,
  offlineSince: l.offlineSince,
  lastSeenOnlineAt: l.lastSeenOnlineAt,
  lastCheckedAt: l.lastCheckedAt,
  createdAt: l.createdAt,
  origin: l.origin,
  readSellerName: l.readSellerName,
  readReference: l.readReference,
})

/**
 * Lots 15 et 18 : la vie des liens d'une annonce, dans l'ordre : son lien
 * d'origine (qui suit les changements de prix saisis), les vérifications de
 * `CHECKS` (chacune sur un lien, comparée à la fiche et à ses liens de ce
 * moment-là par `domain` : écarts, résultat, résumé) et les liens ajoutés
 * de `LINKS`. Le prix de la fiche ne change que par ce que `domain` décide,
 * et il doit retomber sur les prix de la fiche (`prices`), sinon le jeu est
 * incohérent. Une vérification qui trouve un changement de prix ne le
 * journalise pas une deuxième fois.
 */
function buildLinksAndChecks(
  spec: ListingSpec,
  input: ListingInput,
  prices: Array<{ at: string; price: number }>,
  statuses: Array<{ at: string; status: ListingStatus }>,
  at: ReturnType<typeof clock>,
  log: (
    entry: Omit<DemoActivity, 'id' | 'before' | 'after'> & {
      before?: Record<string, unknown> | null
      after?: Record<string, unknown> | null
    }
  ) => void
): LinkTimeline {
  const createdAt = prices[0]?.at ?? at(0)
  const url = input.url as string
  let links: DemoLink[] = [
    {
      id: demoId(`link:${spec.key}:original`),
      key: 'original',
      portal: portalOfListingSource(input.source, input.sourceLabel, url),
      url,
      normalizedUrl: linkKey(url) as string,
      externalId: input.externalId,
      price: prices[0]?.price ?? input.price,
      priceAt: createdAt,
      firstSeenAt: createdAt,
      lastSeenOnlineAt: null,
      lastCheckedAt: null,
      offlineSince: null,
      online: true,
      origin: 'original',
      readSellerName: null,
      readReference: null,
      evidence: null,
      addedBy: spec.createdBy,
      createdAt,
      updatedAt: createdAt,
      draftId: null,
    },
  ]
  let seller: SellerFacts = {
    sellerType: input.sellerType,
    sellerName: input.sellerName,
    sellerReference: input.sellerReference,
  }
  let fieldSources: FieldProvenanceMap = { ...input.fieldSources }
  let fichePrice = prices[0]?.price ?? input.price
  let lastCheckedAt: string | null = null
  let lastSeenOnlineAt: string | null = null
  const checks: DemoCheck[] = []
  const touchedAt: string[] = []

  /** Recopie l'état des liens rendu par `domain`. */
  const merge = (after: readonly LinkState[], when: string): void => {
    links = links.map(l => {
      const s = after.find(x => x.id === l.id)
      if (!s) return l
      const next: DemoLink = {
        ...l,
        url: s.url,
        normalizedUrl: s.normalizedUrl,
        price: s.price,
        priceAt: s.priceAt,
        online: s.online,
        offlineSince: s.offlineSince,
        lastSeenOnlineAt: s.lastSeenOnlineAt,
        readSellerName: s.readSellerName ?? null,
        readReference: s.readReference ?? null,
      }
      return JSON.stringify(next) === JSON.stringify(l)
        ? l
        : { ...next, updatedAt: when }
    })
  }
  const checkedLink = (id: string, when: string): void => {
    links = links.map(l =>
      l.id === id ? { ...l, lastCheckedAt: when, updatedAt: when } : l
    )
  }
  /** Les faits et le vendeur lus deviennent « lus dans l'annonce », avec d'où. */
  const applyRead = (
    patch: object,
    sellerPatch: Partial<SellerFacts>,
    portal: ListingPortal,
    channel: 'web' | 'mcp',
    when: string
  ): void => {
    if (Object.keys(sellerPatch).length > 0) {
      const next = normalizeSeller({ ...seller, ...sellerPatch })
      seller = {
        sellerType: next.sellerType,
        sellerName: next.sellerName,
        sellerReference: next.sellerReference,
      }
    }
    const keys = [...Object.keys(patch), ...Object.keys(sellerPatch)]
    if (keys.length === 0) return
    const evidence = `Lue ${portalWhere(portal)}${channel === 'mcp' ? ' par Claude' : ''}`
    fieldSources = {
      ...fieldSources,
      ...Object.fromEntries(
        keys.map(key => [
          key,
          { source: 'listing' as const, recordedAt: when, evidence },
        ])
      ),
    }
    touchedAt.push(when)
  }
  const priceFound = (to: number, when: string): void => {
    if (!prices.some(p => p.at === when && p.price === to)) {
      throw new Error(
        `Jeu de démo incohérent : ${spec.key} passe à ${to} € le ${when}, absent de ses prix`
      )
    }
    fichePrice = to
  }

  type Event =
    | { at: string; order: 0; kind: 'price'; price: number }
    | {
        at: string
        order: 1
        kind: 'check'
        check: DemoCheckSpec
        index: number
      }
    | { at: string; order: 2; kind: 'link'; link: LinkSpec }
  const events: Event[] = [
    ...prices.flatMap((p, index): Event[] =>
      index === 0 || foundByCheck(spec, index)
        ? []
        : [{ at: p.at, order: 0, kind: 'price', price: p.price }]
    ),
    ...(CHECKS[spec.key] ?? []).map((check, index): Event => ({
      at: at(check.days, check.hour ?? 11),
      order: 1,
      kind: 'check',
      check,
      index,
    })),
    ...(LINKS[spec.key] ?? []).map((link): Event => ({
      at: at(link.days, link.hour ?? 10),
      order: 2,
      kind: 'link',
      link,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)

  for (const event of events) {
    const status =
      statuses.filter(s => s.at < event.at).at(-1)?.status ??
      ('to_study' as const)
    const stored = { ...input, price: fichePrice, status }
    const states = links.map(linkStateOf)
    const priceSource = fieldSources.price?.source ?? null

    // Un prix saisi : le lien principal le suit (comme la migration du lot 18).
    if (event.kind === 'price') {
      fichePrice = event.price
      const primary = primaryLink(states)
      links = links.map(l =>
        l.id === primary?.id
          ? { ...l, price: event.price, priceAt: event.at, updatedAt: event.at }
          : l
      )
      continue
    }

    if (event.kind === 'check') {
      const c = event.check
      const checkAt = event.at
      const link = links.find(l => l.key === (c.link ?? 'original'))
      if (!link) {
        throw new Error(`Lien de démo inconnu : ${spec.key} / ${c.link}`)
      }
      const observed = effectiveObserved(c.observed, c.outcome)
      const diff = linkCheckDiff({
        stored,
        priceSource,
        seller,
        links: states,
        linkId: link.id,
        observed,
        now: checkAt,
      })
      const resolution = resolveLinkCheckOutcome({
        declared: c.outcome,
        observed,
        diff,
        linked: c.linkedKey !== undefined,
      })
      if (!resolution.ok) {
        throw new Error(
          `Vérification fictive incohérente : ${resolution.problem}`
        )
      }
      const linked = c.linkedKey
        ? SPECS.find(x => x.key === c.linkedKey)
        : undefined
      let changes = resolution.applyFacts ? diff.changes : []
      let suggestedStatus = resolution.applyFacts ? diff.suggestedStatus : null
      // La publication d'origine est la plus ancienne des deux (ajoutée plus tôt).
      const linkedIsOrigin =
        linked !== undefined &&
        (linked.prices[0]?.[0] ?? 0) > (spec.prices[0]?.[0] ?? 0)
      if (linked) {
        const statusOf = (s: ListingSpec, current: ListingStatus | undefined) =>
          current ??
          (s.statuses ?? [])
            .filter(([days]) => at(days, 19) <= checkAt)
            .at(-1)?.[1] ??
          'to_study'
        const origin = linkedIsOrigin ? linked : spec
        const successor = linkedIsOrigin ? spec : linked
        const proposal = republicationProposal(
          {
            title: origin.title,
            status: statusOf(
              origin,
              linkedIsOrigin ? undefined : stored.status
            ),
          },
          { title: successor.title }
        )
        changes = [
          ...changes.filter(
            x => !(x.field === 'status' && x.disposition === 'proposed')
          ),
          ...(proposal ? [proposal] : []),
        ]
        suggestedStatus = proposal ? 'sold_or_withdrawn' : null
      }
      const summary = listingCheckSummary(
        resolution.outcome,
        changes,
        linked
          ? {
              title: linked.title,
              role: linkedIsOrigin ? 'predecessor' : 'successor',
            }
          : null
      )
      if (resolution.applyFacts) {
        if (diff.price) priceFound(diff.price.to, checkAt)
        merge(diff.linksAfter, checkAt)
        applyRead(diff.patch, diff.sellerPatch, link.portal, c.channel, checkAt)
      }
      checkedLink(link.id, checkAt)
      lastCheckedAt = checkAt
      if (resolution.seenOnline) lastSeenOnlineAt = checkAt
      const id = demoId(`check:${spec.key}:${event.index}`)
      const linkedListingId = linked ? demoId(`listing:${linked.key}`) : null
      const applied = changes.filter(x => x.disposition === 'applied')
      log({
        at: checkAt,
        actor: c.by,
        channel: c.channel,
        action: 'listing.checked',
        listingKey: spec.key,
        before: applied.length
          ? {
              facts: Object.fromEntries(applied.map(x => [x.field, x.before])),
            }
          : null,
        after: {
          checkId: id,
          outcome: resolution.outcome,
          summary,
          ...(applied.length
            ? {
                facts: Object.fromEntries(applied.map(x => [x.field, x.after])),
              }
            : {}),
          ...(suggestedStatus ? { suggestedStatus } : {}),
          ...(linkedListingId ? { linkedListingId } : {}),
          linkId: link.id,
          portal: link.portal,
        },
      })
      checks.push({
        id,
        at: checkAt,
        by: c.by,
        channel: c.channel,
        outcome: resolution.outcome,
        changes,
        summary,
        evidence: sanitizeEvidence(c.evidence),
        checkedUrl: link.url,
        linkedListingId,
        suggestedStatus,
        linkId: link.id,
      })
      continue
    }

    // Un lien ajouté, avec ce qui a été lu sur sa page.
    const l = event.link
    const addAt = event.at
    const id = demoId(`link:${spec.key}:${l.key}`)
    const portal = detectLinkPortal(l.url, l.portal)
    const initial: LinkState = {
      id,
      portal,
      url: l.url,
      normalizedUrl: linkKey(l.url) as string,
      externalId: l.externalId ?? null,
      price: null,
      priceAt: null,
      online: l.observed.online !== false,
      offlineSince: l.observed.online === false ? addAt : null,
      lastSeenOnlineAt: null,
      lastCheckedAt: null,
      createdAt: addAt,
      origin: l.origin,
    }
    const diff = linkAddedDiff({
      stored,
      priceSource,
      seller,
      links: states,
      link: initial,
      observed: l.observed,
      now: addAt,
    })
    const summary = listingCheckSummary('link_added', diff.changes)
    const checked =
      l.observed.online !== undefined || l.observed.price !== undefined
    const evidence = sanitizeEvidence(l.evidence, LISTING_LINK_EVIDENCE_MAX)
    const draftId = l.draftKey
      ? demoId(`exploration-draft:${l.draftKey}`)
      : null
    if (diff.price) priceFound(diff.price.to, addAt)
    links.push({
      ...initial,
      key: l.key,
      externalId: l.externalId ?? null,
      firstSeenAt: addAt,
      readSellerName: null,
      readReference: null,
      evidence,
      addedBy: l.by,
      updatedAt: addAt,
      draftId,
    })
    merge(diff.linksAfter, addAt)
    if (checked) {
      checkedLink(id, addAt)
      lastCheckedAt = addAt
    }
    if (l.observed.online === true) lastSeenOnlineAt = addAt
    applyRead(diff.patch, diff.sellerPatch, portal, l.channel, addAt)
    touchedAt.push(addAt)
    const checkId = demoId(`check:${spec.key}:link:${l.key}`)
    checks.push({
      id: checkId,
      at: addAt,
      by: l.by,
      channel: l.channel,
      outcome: 'link_added',
      changes: diff.changes,
      summary,
      evidence,
      checkedUrl: l.url,
      linkedListingId: null,
      suggestedStatus: diff.suggestedStatus,
      linkId: id,
    })
    const facts = diff.changes.filter(
      c => c.disposition === 'applied' && c.field !== 'link'
    )
    log({
      at: addAt,
      actor: l.by,
      channel: l.channel,
      action: 'listing_link.added',
      listingKey: spec.key,
      before: facts.length
        ? { facts: Object.fromEntries(facts.map(c => [c.field, c.before])) }
        : null,
      after: {
        linkId: id,
        portal,
        url: l.url,
        origin: l.origin,
        auto: l.draftKey !== undefined,
        ...(draftId ? { draftId } : {}),
        checkId,
        summary,
        ...(l.observed.price !== undefined
          ? { linkPrice: l.observed.price }
          : {}),
        ...(facts.length
          ? { facts: Object.fromEntries(facts.map(c => [c.field, c.after])) }
          : {}),
      },
    })
  }

  if (fichePrice !== input.price) {
    throw new Error(
      `Jeu de démo incohérent : ${spec.key} finit à ${fichePrice} € au lieu de ${input.price} €`
    )
  }
  return {
    links,
    checks,
    lastCheckedAt,
    lastSeenOnlineAt,
    seller,
    fieldSources,
    touchedAt,
  }
}

const MANUAL_TASKS: Record<
  string,
  Array<[string, DemoHandle | null, number, boolean]>
> = {
  'chartrons-t2': [
    ['Relancer l’agence sur la contre-visite', 'demo2', 4, false],
  ],
  'saint-michel-t3': [
    ['Faire chiffrer l’isolation par deux artisans', 'demo', 19, false],
  ],
  'pessac-t4': [['Demander le diagnostic amiante', null, 25, true]],
  'le-bouscat-t2': [
    ['Préparer le dossier de financement pour la banque', 'demo2', 2, false],
  ],
}

const OFFERS: Record<
  string,
  Array<{
    amount: number
    channel: OfferChannel
    madeDaysAgo: number
    response: OfferResponse
    respondedDaysAgo?: number
    counterAmount?: number
    notes?: string
  }>
> = {
  'chartrons-t2': [
    {
      amount: 165_000,
      channel: 'agency',
      madeDaysAgo: 5,
      response: 'pending',
      notes: 'Offre au prix cible, sous réserve du prêt.',
    },
  ],
  'talence-forum-t2': [
    {
      amount: 136_000,
      channel: 'email',
      madeDaysAgo: 20,
      response: 'counter_offer',
      respondedDaysAgo: 18,
      counterAmount: 141_000,
    },
    {
      amount: 139_000,
      channel: 'email',
      madeDaysAgo: 17,
      response: 'accepted',
      respondedDaysAgo: 15,
    },
  ],
  'pessac-t4': [
    {
      amount: 228_000,
      channel: 'phone',
      madeDaysAgo: 14,
      response: 'refused',
      respondedDaysAgo: 12,
      notes: 'Le vendeur ne descend pas sous 245 000 €.',
    },
  ],
  'le-bouscat-t2': [
    {
      amount: 195_000,
      channel: 'agency',
      madeDaysAgo: 3,
      response: 'counter_offer',
      respondedDaysAgo: 1,
      counterAmount: 202_000,
    },
  ],
}

const VISITS: Record<
  string,
  Array<{
    daysAgo: number
    hour?: number
    minute?: number
    status: 'done' | 'planned'
    participants: DemoHandle[]
    by: DemoHandle
    report?: string
    pros?: string
    cons?: string
    rating?: number
    prepTask?: boolean
  }>
> = {
  'chartrons-t2': [
    {
      daysAgo: 25,
      status: 'done',
      participants: ['demo', 'demo2'],
      by: 'demo',
      report:
        'Visite avec l’agent : conforme aux photos, parties communes propres.',
      pros: 'Emplacement, hauteur sous plafond',
      cons: 'Cuisine à refaire, pas d’ascenseur',
      rating: 4,
    },
  ],
  'saint-michel-t3': [
    {
      daysAgo: 21,
      status: 'done',
      participants: ['demo', 'demo2'],
      by: 'demo2',
      report: 'Beaux volumes ; simple vitrage et chaudière ancienne.',
      pros: 'Place, luminosité',
      cons: 'Isolation, bruit le samedi',
      rating: 3,
    },
  ],
  'bastide-t2': [
    {
      daysAgo: -3,
      hour: 18,
      minute: 30,
      status: 'planned',
      participants: ['demo', 'demo2'],
      by: 'demo',
    },
  ],
  'talence-forum-t2': [
    {
      daysAgo: 30,
      status: 'done',
      participants: ['demo', 'demo2'],
      by: 'demo2',
      report: 'Très bon état, copropriété bien tenue.',
      pros: 'Tram, état',
      cons: 'Vis-à-vis',
      rating: 5,
    },
  ],
  'talence-peixotto-t3': [
    {
      daysAgo: 18,
      status: 'done',
      participants: ['demo2'],
      by: 'demo2',
      report: 'Calme, double exposition ; charges à vérifier.',
      pros: 'Calme, cave',
      cons: 'Charges',
      rating: 4,
    },
  ],
  'merignac-t2': [
    {
      daysAgo: -1,
      hour: 12,
      minute: 30,
      status: 'planned',
      participants: ['demo2'],
      by: 'demo2',
      prepTask: true,
    },
  ],
  'pessac-t4': [
    {
      daysAgo: 24,
      status: 'done',
      participants: ['demo'],
      by: 'demo',
      report: 'Grand, mais travaux sous-estimés dans l’annonce.',
      pros: 'Surface, balcon',
      cons: 'Sols, peinture, chauffage collectif',
      rating: 2,
    },
  ],
  'le-bouscat-t2': [
    {
      daysAgo: 12,
      status: 'done',
      participants: ['demo', 'demo2'],
      by: 'demo',
      report: 'Charme de l’ancien, cour agréable.',
      pros: 'Parquet, cour',
      cons: 'Rue passante',
      rating: 4,
    },
  ],
}

const COMPARABLES: Record<
  string,
  Array<[rent: number, surface: number, furnished: boolean, daysAgo: number]>
> = {
  'chartrons-t2': [
    [780, 43, false, 22],
    [820, 45, true, 22],
    [740, 40, false, 21],
  ],
  'talence-forum-t2': [
    [700, 42, false, 33],
    [735, 45, false, 33],
    [690, 40, false, 32],
  ],
  'saint-michel-t3': [
    [900, 60, false, 20],
    [860, 58, false, 20],
  ],
}

// ---------------------------------------------------------------------------
// Indicateurs, par `domain`
// ---------------------------------------------------------------------------

/** Les hypothèses en vigueur du jeu (la version la plus récente). */
export function currentAssumptions(dataset: DemoDataset): Assumptions {
  const latest = [...dataset.assumptions]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .at(-1)
  if (!latest) throw new Error('jeu de démo sans hypothèses')
  return latest.values
}

/** Le verdict et les indicateurs d'une annonce du jeu, calculés comme l'API (`domain`). */
export function demoMetrics(
  listing: DemoListing,
  assumptions: Assumptions,
  at: Date = new Date()
) {
  return compute(
    financialsFromListing(listing.input, undefined, at),
    assumptions
  )
}

export type DemoVerdict = Verdict
