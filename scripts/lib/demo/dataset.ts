import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_TASKS,
  ListingInputSchema,
  OfferInputSchema,
  OpinionInputSchema,
  RentComparableInputSchema,
  ScenarioInputSchema,
  SearchCriteriaInputSchema,
  TaskInputSchema,
  VisitInputSchema,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  DpeClass,
  LeaseType,
  ListingInput,
  ListingSource,
  ListingStatus,
  LocationPrecision,
  OfferChannel,
  OfferResponse,
  Point,
  RenovationLevel,
  RentalDemand,
  RentComparableInput,
  ScenarioInput,
  SearchCriteriaInput,
  Verdict,
} from '@apart/contracts'
import { compute, financialsFromListing } from '@apart/domain'
import { DEMO_ACCOUNTS, DEMO_WORKSPACE_NAME } from './accounts.js'
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
  opinions: Array<{
    handle: DemoHandle
    rating: number
    text: string
    at: string
  }>
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
  leaseType?: LeaseType
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
    leaseType: 'furnished',
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
    prices: [[4, 158_000]],
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

  const listings = SPECS.map(spec => buildListing(spec, at, since, log))

  // Critères : un polygone dessiné et un point avec rayon.
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
  ) => void
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
  const finalStatus = spec.statuses?.[spec.statuses.length - 1]
  const input = ListingInputSchema.parse({
    source: spec.source,
    sourceLabel: spec.sourceLabel ?? null,
    url: `https://exemple.invalid/annonces/${spec.key}`,
    externalId: `demo-${spec.key}`,
    title: spec.title,
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
      year: 2028,
      leaseType: spec.leaseType ?? 'unfurnished',
      targetRent: spec.targetRent,
      demand: spec.demand ?? null,
    },
    fieldSources,
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

  // Avis.
  const opinions = (OPINIONS[spec.key] ?? []).map(
    ([handle, rating, text, days]) => {
      const parsed = OpinionInputSchema.parse({ rating, text })
      const opinionAt = at(days, 21)
      log({
        at: opinionAt,
        actor: handle,
        channel: 'web',
        action: 'opinion.created',
        listingKey: spec.key,
        after: { rating: parsed.rating, text: parsed.text },
      })
      return { handle, rating: parsed.rating, text: parsed.text, at: opinionAt }
    }
  )

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

  const updatedAt =
    [createdAt, ...prices.map(p => p.at), ...statuses.map(s => s.at)]
      .sort()
      .at(-1) ?? createdAt
  return {
    key: spec.key,
    id,
    input,
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
