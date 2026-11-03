import { z } from 'zod'
import {
  AssumptionsSchema,
  DEFAULT_TASKS,
  ListingInputSchema,
} from '@apart/contracts'
import type {
  Assumptions,
  DpeClass,
  FieldProvenanceMap,
  LeaseType,
  ListingInput,
  ListingSource,
  ListingStatus,
  RenovationLevel,
  RentControl,
  RentalDemand,
  TaskOrigin,
  TriState,
} from '@apart/contracts'

/**
 * Correspondance entre l'export de l'artefact Claude « Comparateur d'annonces
 * locatives » et le modèle d'apart-localizer. Fonctions pures : le script
 * d'import les enchaîne, les tests les exercent sur des enregistrements
 * synthétiques.
 */

/** Un nombre tel que l'artefact le stockait : nombre, chaîne « 62,5 », vide ou absent. */
const looseNumber = z.preprocess(value => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}, z.number().nullable())

const looseString = z.preprocess(
  value => (value === undefined || value === null ? null : String(value)),
  z.string().nullable()
)

const looseDate = z.preprocess(value => {
  if (typeof value !== 'string' || value === '') return null
  return Number.isNaN(Date.parse(value)) ? null : value
}, z.string().nullable())

export const ArtifactOpinionSchema = z.object({
  note: looseNumber.default(null),
  texte: looseString.default(null),
  date: looseDate.default(null),
})

export const ArtifactTodoSchema = z.object({
  id: looseString.default(null),
  t: z.string(),
  done: z.boolean().default(false),
})

export const ArtifactRenovationItemSchema = z.object({
  id: looseString.default(null),
  lib: looseString.default(null),
  montant: looseNumber.default(null),
})

/** Un enregistrement de la collection `annonces`, tel qu'exporté. Tout est facultatif. */
export const ArtifactListingSchema = z
  .object({
    titre: looseString.default(null),
    url: looseString.default(null),
    adresse: looseString.default(null),
    commune: looseString.default(null),
    quartier: looseString.default(null),
    statut: looseString.default(null),
    prix: looseNumber.default(null),
    surface: looseNumber.default(null),
    pieces: looseNumber.default(null),
    etage: looseString.default(null),
    dpe: looseString.default(null),
    annee: looseNumber.default(null),
    loyer: looseNumber.default(null),
    chargesAn: looseNumber.default(null),
    copro: looseNumber.default(null),
    tf: looseNumber.default(null),
    mobilier: looseNumber.default(null),
    notes: looseString.default(null),
    note: looseString.default(null),
    source: looseString.default(null),
    travaux: looseNumber.default(null),
    trav_actif: z.boolean().nullable().default(null),
    trav_niveau: looseString.default(null),
    trav_duree: looseNumber.default(null),
    trav_notes: looseString.default(null),
    trav_postes: z.array(ArtifactRenovationItemSchema).default([]),
    p2_annee: looseNumber.default(null),
    p2_type: looseString.default(null),
    p2_encadre: looseString.default(null),
    p2_plafond: looseNumber.default(null),
    p2_marche: looseNumber.default(null),
    p2_demande: looseString.default(null),
    p2_reglement: looseString.default(null),
    p2_decence: looseString.default(null),
    p2_permis: looseString.default(null),
    p2_notes: looseString.default(null),
    avis: z.record(z.string(), ArtifactOpinionSchema).default({}),
    todos: z.array(ArtifactTodoSchema).default([]),
    vue: z.boolean().nullable().default(null),
    vueLe: looseDate.default(null),
    ajouteLe: looseDate.default(null),
    modifieLe: looseDate.default(null),
  })
  .passthrough()
export type ArtifactListing = z.infer<typeof ArtifactListingSchema>

/** `reglages/financement.json` : pourcentages et montants. */
export const ArtifactFinancingSchema = z.object({
  apport: z.number(),
  taux: z.number(),
  duree: z.number(),
  assur: z.number(),
  notaire: z.number(),
  vacance: z.number(),
  frais: z.number(),
  seuilRdt: z.number(),
  seuilEffort: z.number(),
})
export type ArtifactFinancing = z.infer<typeof ArtifactFinancingSchema>

/** Les pourcentages de l'artefact deviennent des fractions. */
export function mapAssumptions(financing: ArtifactFinancing): Assumptions {
  return AssumptionsSchema.parse({
    downPayment: financing.apport,
    interestRate: financing.taux / 100,
    durationYears: financing.duree,
    insuranceRate: financing.assur / 100,
    notaryRate: financing.notaire / 100,
    vacancyMonths: financing.vacance,
    fixedCostsAnnual: financing.frais,
    grossYieldThreshold: financing.seuilRdt / 100,
    maxMonthlyEffort: financing.seuilEffort,
  })
}

const STATUS: Record<string, ListingStatus> = {
  etudier: 'to_study',
  avisiter: 'to_visit',
  visite: 'visited',
  offre: 'offer_made',
  ecarte: 'discarded',
}

const RENOVATION_LEVEL: Record<string, RenovationLevel> = {
  rafraichissement: 'refresh',
  renovation: 'renovation',
  lourde: 'heavy',
  energie: 'energy',
}

const LEASE_TYPE: Record<string, LeaseType> = {
  vide: 'unfurnished',
  meuble: 'furnished',
  colocation: 'shared',
}

const RENT_CONTROL: Record<string, RentControl> = {
  auto: 'auto',
  oui: 'yes',
  non: 'no',
}
const DEMAND: Record<string, RentalDemand> = {
  forte: 'strong',
  moyenne: 'medium',
  faible: 'weak',
}
const TRI_STATE: Record<string, TriState> = { oui: 'yes', non: 'no' }
const DPE = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F', 'G'])

/** Le portail, déduit de l'URL. */
export function sourceFromUrl(url: string | null): ListingSource {
  if (!url) return 'autre'
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'autre'
  }
  if (host.includes('leboncoin')) return 'leboncoin'
  if (host.includes('seloger')) return 'seloger'
  if (host.includes('bienici') || host.includes('bien-ici')) return 'bienici'
  if (host.includes('pap.fr')) return 'pap'
  return 'agence'
}

export interface FloorInfo {
  floor: number | null
  floorsTotal: number | null
  elevator: boolean | null
}

/** « 3e sur 5, sans ascenseur » → étage 3, 5 niveaux, pas d'ascenseur. */
export function parseFloor(label: string | null): FloorInfo {
  if (!label) return { floor: null, floorsTotal: null, elevator: null }
  const text = label.toLowerCase()
  let floor: number | null = null
  if (/\b(rdc|rez-de-chauss)/.test(text)) floor = 0
  else {
    const match = /(\d+)\s*(?:er|e|ème|eme)\b/.exec(text)
    if (match?.[1]) floor = Number.parseInt(match[1], 10)
  }
  const total = /sur\s+(\d+)/.exec(text)
  const floorsTotal = total?.[1] ? Number.parseInt(total[1], 10) : null
  const elevator = /sans\s+ascenseur/.test(text)
    ? false
    : /ascenseur/.test(text)
      ? true
      : null
  return { floor, floorsTotal, elevator }
}

/** Une URL http(s) valide, ou rien. */
export function validUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

export interface MappedOpinion {
  handle: string
  rating: number
  text: string
  date: string | null
}

export interface MappedTask {
  label: string
  done: boolean
  origin: TaskOrigin
}

export interface MappedListing {
  /** Identifiant stable : le nom du fichier d'export. */
  externalId: string
  input: ListingInput
  opinions: MappedOpinion[]
  tasks: MappedTask[]
  /** Le drapeau global « vue » de l'artefact ne concernait que Richard. */
  seenByRichardAt: string | null
  createdAt: string | null
  updatedAt: string | null
  /** Faux quand l'annonce n'a pas d'adresse exacte : une tâche le rappelle. */
  hasExactAddress: boolean
}

/** Tout champ non nul reçoit la provenance « user » : l'artefact était saisi à la main. */
function provenanceOf(fields: Record<string, unknown>): FieldProvenanceMap {
  const map: FieldProvenanceMap = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) map[key] = { source: 'user' }
  }
  return map
}

export function mapListing(externalId: string, raw: unknown): MappedListing {
  const a = ArtifactListingSchema.parse(raw)
  const floorInfo = parseFloor(a.etage)
  const url = validUrl(a.url)
  const hasExactAddress = Boolean(a.adresse && a.adresse.trim() !== '')
  const notes = [a.notes, a.note]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join('\n\n')
  const dpeClass = a.dpe && DPE.has(a.dpe) ? (a.dpe as DpeClass) : null

  const renovationActive =
    a.trav_actif === true || (a.trav_actif === null && (a.travaux ?? 0) > 0)
  const renovationItems =
    a.trav_postes.length > 0
      ? a.trav_postes.map(item => ({
          label: item.lib?.trim() || 'Poste',
          amount: item.montant,
        }))
      : a.trav_actif === null && (a.travaux ?? 0) > 0
        ? [{ label: 'Travaux (montant global)', amount: a.travaux }]
        : []

  const property = {
    price: a.prix ?? 0,
    surface: a.surface && a.surface > 0 ? a.surface : null,
    rooms: a.pieces !== null ? Math.round(a.pieces) : null,
    floor: floorInfo.floor,
    floorsTotal: floorInfo.floorsTotal,
    floorLabel: a.etage,
    elevator: floorInfo.elevator,
    constructionYear: a.annee !== null ? Math.round(a.annee) : null,
    dpeClass,
    annualCharges: a.chargesAn,
    nonRecoverableChargesMonthly: a.copro,
    propertyTax: a.tf,
    furnitureValue: a.mobilier,
  }

  const input = ListingInputSchema.parse({
    source: sourceFromUrl(url),
    sourceLabel: a.source,
    url,
    externalId,
    title: a.titre?.trim() || `Annonce ${externalId}`,
    notes: notes || null,
    ...property,
    location: {
      addressRaw: a.adresse,
      commune: a.commune,
      district: a.quartier,
    },
    status: STATUS[a.statut ?? ''] ?? 'to_study',
    renovation:
      renovationActive || renovationItems.length > 0 || a.trav_notes
        ? {
            active: renovationActive,
            level: RENOVATION_LEVEL[a.trav_niveau ?? ''] ?? null,
            durationMonths:
              a.trav_duree !== null ? Math.round(a.trav_duree) : null,
            items: renovationItems,
            notes: a.trav_notes,
          }
        : null,
    rentalPlan: {
      year: a.p2_annee !== null ? Math.round(a.p2_annee) : null,
      leaseType: LEASE_TYPE[a.p2_type ?? ''] ?? 'unfurnished',
      rentControl: RENT_CONTROL[a.p2_encadre ?? ''] ?? 'auto',
      referenceRentPerM2: a.p2_plafond,
      targetRent: a.loyer,
      marketRent: a.p2_marche,
      demand: DEMAND[a.p2_demande ?? ''] ?? null,
      coOwnershipAllowsRental: TRI_STATE[a.p2_reglement ?? ''] ?? 'unknown',
      decencyCompliant: TRI_STATE[a.p2_decence ?? ''] ?? 'unknown',
      rentalPermitRequired: TRI_STATE[a.p2_permis ?? ''] ?? 'unknown',
      notes: a.p2_notes,
    },
    fieldSources: provenanceOf({
      ...property,
      targetRent: a.loyer,
      commune: a.commune,
      addressRaw: a.adresse,
    }),
  })

  const defaults = new Set<string>(DEFAULT_TASKS)
  const tasks: MappedTask[] = a.todos.map(todo => ({
    label: todo.t,
    done: todo.done,
    origin: defaults.has(todo.t) ? 'default' : 'manual',
  }))
  if (!hasExactAddress) {
    tasks.push({
      label: "Demander l'adresse exacte du bien",
      done: false,
      origin: 'missing_field',
    })
  }

  const opinions: MappedOpinion[] = Object.entries(a.avis)
    .filter(
      ([, opinion]) =>
        (opinion.note ?? 0) > 0 || (opinion.texte ?? '').trim() !== ''
    )
    .map(([handle, opinion]) => ({
      handle,
      rating: Math.min(5, Math.max(0, Math.round(opinion.note ?? 0))),
      text: opinion.texte?.trim() ?? '',
      date: opinion.date,
    }))

  return {
    externalId,
    input,
    opinions,
    tasks,
    seenByRichardAt: a.vue ? (a.vueLe ?? a.ajouteLe) : null,
    createdAt: a.ajouteLe,
    updatedAt: a.modifieLe ?? a.ajouteLe,
    hasExactAddress,
  }
}

/** La requête de géocodage d'une annonce : l'adresse nettoyée, complétée par la commune. */
export function geocodeQuery(input: ListingInput): string | null {
  const address = input.location.addressRaw
    ?.replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const commune = input.location.commune?.trim()
  if (address) {
    const mentionsCommune =
      commune !== undefined &&
      address.toLowerCase().includes(commune.toLowerCase())
    return mentionsCommune || !commune ? address : `${address}, ${commune}`
  }
  return commune || null
}
